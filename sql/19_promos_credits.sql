-- ============================================
-- 19: Resto-Credits + Promo/Ads system
-- Applied to Supabase on 2026-06-10 (migration: promos_and_resto_credits)
-- Credits economy: +10 pts per posted review, 100 pts = 1 manat at redemption.
-- ============================================

-- 1. Creative fields for feed display
ALTER TABLE ad_campaigns
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS dish_id uuid REFERENCES dishes(id) ON DELETE SET NULL;

-- 2. RLS: ad_campaigns
DROP POLICY IF EXISTS ad_campaigns_public_read ON ad_campaigns;
CREATE POLICY ad_campaigns_public_read ON ad_campaigns
  FOR SELECT USING (status = 'active' AND now() BETWEEN starts_at AND ends_at);

DROP POLICY IF EXISTS ad_campaigns_staff_all ON ad_campaigns;
CREATE POLICY ad_campaigns_staff_all ON ad_campaigns
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM staff s
    WHERE s.user_id = auth.uid()
      AND s.restaurant_id = ad_campaigns.restaurant_id
      AND s.is_active
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM staff s
    WHERE s.user_id = auth.uid()
      AND s.restaurant_id = ad_campaigns.restaurant_id
      AND s.is_active
  ));

-- 3. RLS: loyalty (read own; writes only via SECURITY DEFINER functions)
DROP POLICY IF EXISTS loyalty_accounts_own_read ON loyalty_accounts;
CREATE POLICY loyalty_accounts_own_read ON loyalty_accounts
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS loyalty_transactions_own_read ON loyalty_transactions;
CREATE POLICY loyalty_transactions_own_read ON loyalty_transactions
  FOR SELECT USING (user_id = auth.uid());

-- 4. Award +10 credits per posted review
CREATE OR REPLACE FUNCTION award_review_points() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO loyalty_accounts (user_id, points, points_earned)
  VALUES (NEW.user_id, 10, 10)
  ON CONFLICT (user_id) DO UPDATE
    SET points = loyalty_accounts.points + 10,
        points_earned = loyalty_accounts.points_earned + 10,
        updated_at = now();
  INSERT INTO loyalty_transactions (user_id, delta, reason)
  VALUES (NEW.user_id, 10, 'review_posted');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_award_review_points ON reviews;
CREATE TRIGGER trg_award_review_points
  AFTER INSERT ON reviews
  FOR EACH ROW EXECUTE FUNCTION award_review_points();

-- 5. Redeem credits: 100 pts = 1 manat. Atomic, balance-guarded.
CREATE OR REPLACE FUNCTION redeem_credits(p_points int, p_order_id uuid DEFAULT NULL)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_updated int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF p_points IS NULL OR p_points <= 0 THEN
    RAISE EXCEPTION 'invalid points amount';
  END IF;
  UPDATE loyalty_accounts
     SET points = points - p_points,
         points_spent = points_spent + p_points,
         updated_at = now()
   WHERE user_id = v_uid AND points >= p_points;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'insufficient credits';
  END IF;
  INSERT INTO loyalty_transactions (user_id, delta, reason, order_id)
  VALUES (v_uid, -p_points, 'redeemed', p_order_id);
  RETURN round(p_points * 0.01, 2);
END $$;

REVOKE ALL ON FUNCTION redeem_credits(int, uuid) FROM public;
GRANT EXECUTE ON FUNCTION redeem_credits(int, uuid) TO authenticated;

-- 6. Impression/click tracking (anon-safe, active campaigns only)
CREATE OR REPLACE FUNCTION track_campaign(p_campaign_id uuid, p_event text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_event = 'impression' THEN
    UPDATE ad_campaigns SET impressions = impressions + 1
    WHERE id = p_campaign_id AND status = 'active';
  ELSIF p_event = 'click' THEN
    UPDATE ad_campaigns SET clicks = clicks + 1
    WHERE id = p_campaign_id AND status = 'active';
  ELSE
    RAISE EXCEPTION 'invalid event type';
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION track_campaign(uuid, text) TO anon, authenticated;

-- 7. Seed: one active campaign per restaurant (demo content)
INSERT INTO ad_campaigns (restaurant_id, name, type, budget, starts_at, ends_at, status, title, description, dish_id)
SELECT r.id,
       'Launch promo — ' || r.name,
       'feed_placement',
       100,
       now() - interval '1 day',
       now() + interval '30 days',
       'active',
       'Chef''s pick at ' || r.name,
       'Promoted dish — tap to see details and reviews.',
       (SELECT d.id FROM dishes d
         WHERE d.restaurant_id = r.id AND d.available
         ORDER BY d.avg_rating DESC NULLS LAST, d.created_at
         LIMIT 1)
FROM restaurants r
WHERE NOT EXISTS (SELECT 1 FROM ad_campaigns);
