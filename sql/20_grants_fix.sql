-- ============================================
-- 20: Table-level grants fix
-- Applied to Supabase on 2026-06-10 (migration: table_grants_fix)
-- Root cause: tables created after the initial module run (likes, user_follows,
-- saved_dishes from sql/13-17, plus ad_campaigns, loyalty_*, dish_photos) had RLS
-- policies but NO table-level GRANTs for anon/authenticated. PostgREST returned
-- 403 'permission denied' on every request — likes/follows/saves looked broken
-- in the consumer app. RLS still scopes rows; grants only open the tables.
-- ============================================

-- likes: public counts readable by all; write own (RLS enforces user_id)
GRANT SELECT ON likes TO anon, authenticated;
GRANT INSERT, DELETE ON likes TO authenticated;

-- saved_dishes: own rows only via RLS; UPDATE needed for upsert on_conflict
GRANT SELECT, INSERT, UPDATE, DELETE ON saved_dishes TO authenticated;

-- user_follows: own rows only via RLS
GRANT SELECT, INSERT, DELETE ON user_follows TO authenticated;

-- ad_campaigns: anon sees active (RLS), staff manage own (RLS)
GRANT SELECT ON ad_campaigns TO anon;
GRANT SELECT, INSERT, UPDATE ON ad_campaigns TO authenticated;

-- loyalty: read own; all writes go through SECURITY DEFINER functions
GRANT SELECT ON loyalty_accounts TO authenticated;
GRANT SELECT ON loyalty_transactions TO authenticated;

-- dish_photos: public gallery read, staff write (RLS scopes)
GRANT SELECT ON dish_photos TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON dish_photos TO authenticated;
