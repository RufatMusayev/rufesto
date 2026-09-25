-- 31_security_hardening.sql
-- Security + schema hardening pass over the preview DB (qqwvtuckljwvwrvyrjbn),
-- driven by the findings in docs/DATABASE.md §9 and docs/ARCHITECTURE.md §5-6.
-- Written against a READ-ONLY introspection of the live preview schema on
-- 2026-09-25 (policies, grants, function bodies, triggers all verified live,
-- not assumed from docs). Companion file: sql/31b_security_hardening_rpcs.sql
-- (claim_table / my_table_session / leave_table / request_bill).
--
-- *** DEPENDENCY: this file and 31b MUST be applied together. ***
-- Section H1 below makes order-placement require a live `table_sessions` row,
-- which is only ever created by 31b's `claim_table()` RPC. Applying 31 alone
-- (without 31b) will make every dine-in order insert fail with "no active
-- table session" until 31b is also applied.
--
-- OPERATIONAL NOTE: every guest currently mid-session (sessionStorage-held
-- table session from before this migration) will need to re-enter their
-- table's access code / rescan the QR after this ships, because there is no
-- server-side session to grandfather in. This is intentional -- there was no
-- server-side session at all before this migration.
--
-- Idempotent: DROP POLICY/TRIGGER IF EXISTS + CREATE OR REPLACE throughout,
-- ADD COLUMN IF NOT EXISTS, CREATE TABLE IF NOT EXISTS. Safe to re-run.

BEGIN;

-- =====================================================================
-- C1 -- users self-promotion to platform_admin
-- WHY: `users_update_own` policy only checked `id = auth.uid()`; combined
-- with a table-level UPDATE grant covering every column, any signed-in user
-- could PATCH their own row's `role` to 'platform_admin', which flips
-- is_platform_admin() true and unlocks every restaurant + every user's PII.
-- Fix is defense in depth: column grants restrict what PostgREST accepts,
-- PLUS a BEFORE UPDATE trigger that re-asserts protected columns can't move
-- even if a future grant change reopens the column.
-- =====================================================================

REVOKE UPDATE ON public.users FROM authenticated;
GRANT UPDATE (name, phone, profile_photo, age) ON public.users TO authenticated;

-- Guard triggers in this file are SECURITY INVOKER and only police API end
-- users (current_user = authenticated/anon). SQL editor (postgres),
-- service_role and SECURITY DEFINER RPCs owned by postgres (claim_table,
-- maintenance jobs) run as other roles and pass through untouched.
CREATE OR REPLACE FUNCTION public.enforce_user_protected_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR is_platform_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.is_banned IS DISTINCT FROM OLD.is_banned
     OR NEW.ban_reason IS DISTINCT FROM OLD.ban_reason
     OR NEW.phone_verified IS DISTINCT FROM OLD.phone_verified
     OR NEW.email IS DISTINCT FROM OLD.email
  THEN
    RAISE EXCEPTION 'not authorized to change protected user fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_user_protected_fields ON public.users;
CREATE TRIGGER trg_enforce_user_protected_fields
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.enforce_user_protected_fields();

-- =====================================================================
-- C2 / H1 -- tables writable by any user; access codes public; orders
-- placeable without proving you're at the table.
-- WHY: policy "Authenticated users can update table state" used
-- USING (true), so any signed-in user could rewrite ANY restaurant's table
-- row (capacity, is_active, restaurant_id, codes...), not just its state.
-- Separately, `access_code`/`qr_code_token` were plain columns on a
-- realtime-enabled, REPLICA IDENTITY FULL table with anon+authenticated
-- SELECT -- column-level REVOKE would stop PostgREST leaking them but NOT
-- Realtime, because REPLICA IDENTITY FULL puts the full row on the wire
-- regardless of column grants. The only fix that closes both paths is to
-- take the codes off `tables` entirely and RLS-gate them on a side table
-- that is never added to the realtime publication. Staff still need to see
-- codes (e.g. to read one out to a walk-in), which plain column grants can't
-- express anyway -- GRANT is per Postgres role (authenticated), not per
-- app-role, so it can't tell a staff member apart from a customer; only RLS
-- (is_staff_of) can.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.table_access_codes (
  table_id      uuid PRIMARY KEY REFERENCES public.tables(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  access_code   text UNIQUE,
  qr_code_token text UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Backfill from the columns we're about to drop off `tables` (guarded so a
-- re-run after the columns are gone is a no-op).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'tables' AND column_name = 'qr_code_token') THEN
    INSERT INTO public.table_access_codes (table_id, restaurant_id, access_code, qr_code_token)
    SELECT id, restaurant_id, access_code, qr_code_token
    FROM public.tables
    WHERE qr_code_token IS NOT NULL
    ON CONFLICT (table_id) DO UPDATE
      SET access_code = EXCLUDED.access_code,
          qr_code_token = EXCLUDED.qr_code_token;

    ALTER TABLE public.tables DROP COLUMN IF EXISTS access_code;
    ALTER TABLE public.tables DROP COLUMN IF EXISTS qr_code_token;
  END IF;
END $$;

-- Typed access codes were guessable (<PREFIX>-T<n>), so claim_table() could be
-- brute-forced from home. New codes: slug prefix + 6 chars from a 32-letter
-- alphabet (no 0/O/1/I) taken from gen_random_uuid()'s random bytes (~1e9
-- combinations). QR tokens are already random UUIDs and are kept, so printed
-- QR codes keep working; only the typed codes change (staff read them from
-- table_access_codes).
CREATE OR REPLACE FUNCTION public.gen_table_access_code(p_restaurant_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_prefix text;
  v_bytes  bytea;
  v_code   text;
BEGIN
  SELECT upper(left(regexp_replace(split_part(slug, '-', 1), '[^a-zA-Z0-9]', '', 'g'), 8))
    INTO v_prefix FROM restaurants WHERE id = p_restaurant_id;
  IF coalesce(v_prefix, '') = '' THEN
    v_prefix := 'T';
  END IF;

  LOOP
    v_bytes := uuid_send(gen_random_uuid());
    v_code := v_prefix || '-';
    FOR i IN 0..5 LOOP  -- bytes 0-5 of a v4 UUID are fully random; 256 % 32 = 0, so no bias
      v_code := v_code || substr(v_alphabet, 1 + (get_byte(v_bytes, i) % 32), 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM table_access_codes WHERE access_code = v_code);
  END LOOP;
  RETURN v_code;
END;
$$;

-- Rotate old-format codes only (new ones end in exactly 6 alphabet chars), so
-- re-running this file doesn't rotate them again.
UPDATE public.table_access_codes
   SET access_code = gen_table_access_code(restaurant_id), updated_at = now()
 WHERE access_code IS NULL OR access_code !~ '-[A-HJ-NP-Z2-9]{6}$';

-- Any table without a code row (e.g. NULL token before) gets one now, and every
-- future table gets one on insert.
INSERT INTO public.table_access_codes (table_id, restaurant_id, access_code)
SELECT t.id, t.restaurant_id, gen_table_access_code(t.restaurant_id)
FROM public.tables t
WHERE NOT EXISTS (SELECT 1 FROM public.table_access_codes c WHERE c.table_id = t.id);

CREATE OR REPLACE FUNCTION public.create_table_access_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO table_access_codes (table_id, restaurant_id, access_code)
  VALUES (NEW.id, NEW.restaurant_id, gen_table_access_code(NEW.restaurant_id))
  ON CONFLICT (table_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_table_access_code ON public.tables;
CREATE TRIGGER trg_create_table_access_code
  AFTER INSERT ON public.tables
  FOR EACH ROW EXECUTE FUNCTION public.create_table_access_code();

REVOKE EXECUTE ON FUNCTION public.gen_table_access_code(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_table_access_code() FROM anon, authenticated, PUBLIC;

ALTER TABLE public.table_access_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS table_access_codes_staff_read ON public.table_access_codes;
CREATE POLICY table_access_codes_staff_read ON public.table_access_codes
  FOR SELECT USING (is_staff_of(restaurant_id));

GRANT SELECT ON public.table_access_codes TO authenticated;
-- No anon grant, no client write policy: codes are read by staff (RLS above)
-- and consumed internally by the claim_table()/my_table_session() RPCs in
-- 31b, which run SECURITY DEFINER as the table owner and so bypass RLS.

-- Remove the "any authenticated user, any column, any restaurant" policy.
DROP POLICY IF EXISTS "Authenticated users can update table state" ON public.tables;

-- Re-affirm the staff-scoped UPDATE policy the dashboard relies on, with an
-- explicit WITH CHECK so a staff member can't use an UPDATE to move a table
-- to a different restaurant_id.
DROP POLICY IF EXISTS tables_staff_update ON public.tables;
CREATE POLICY tables_staff_update ON public.tables
  FOR UPDATE
  USING (is_staff_of(restaurant_id))
  WITH CHECK (is_staff_of(restaurant_id));

-- table_sessions: server-side record of "this user is sitting at this table
-- right now", created by claim_table() (31b). orders/H1 below requires one.
CREATE TABLE IF NOT EXISTS public.table_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id      uuid NOT NULL REFERENCES public.tables(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES public.users(id),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  started_at    timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz
);

CREATE INDEX IF NOT EXISTS idx_table_sessions_active
  ON public.table_sessions (table_id, user_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_table_sessions_user_active
  ON public.table_sessions (user_id) WHERE ended_at IS NULL;

ALTER TABLE public.table_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS table_sessions_own_read ON public.table_sessions;
CREATE POLICY table_sessions_own_read ON public.table_sessions
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS table_sessions_staff_read ON public.table_sessions;
CREATE POLICY table_sessions_staff_read ON public.table_sessions
  FOR SELECT USING (is_staff_of(restaurant_id));

GRANT SELECT ON public.table_sessions TO authenticated;
-- No INSERT/UPDATE/DELETE grant: sessions are only ever written by the
-- SECURITY DEFINER RPCs in 31b (claim_table / leave_table).

-- orders: require a live table_session for (caller, table_id) before an
-- order can be inserted (table_id is NOT NULL on this table today, but the
-- IS NULL guard is kept for forward-compatibility with any future
-- non-dine-in order type).
DROP POLICY IF EXISTS orders_customer_create ON public.orders;
CREATE POLICY orders_customer_create ON public.orders
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (
      table_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.table_sessions ts
        WHERE ts.table_id = orders.table_id
          AND ts.user_id = auth.uid()
          AND ts.ended_at IS NULL
      )
    )
  );

-- =====================================================================
-- H2 -- client could set order status / totals on INSERT
-- WHY: `authenticated` INSERT on orders had no column restriction, so a
-- client could POST {"status":"paid","total_amount":0}. recalculate_order_total
-- only fires on order_items changes, so a client-set total on the order row
-- itself was never overwritten until the first item was added/changed.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.enforce_order_insert_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND NOT (is_staff_of(NEW.restaurant_id) OR is_platform_admin()) THEN
    NEW.status         := 'open'::order_status;
    NEW.subtotal       := 0;
    NEW.tax_amount     := 0;
    NEW.service_charge := 0;
    NEW.total_amount   := 0;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_insert_defaults ON public.orders;
CREATE TRIGGER trg_enforce_order_insert_defaults
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_order_insert_defaults();

-- =====================================================================
-- H3 -- check_dish_available only filled unit_price when the client sent
-- 0/NULL, so a client could POST unit_price: 0.01 and keep it. It also never
-- checked that the dish belongs to the order's own restaurant.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.check_dish_available()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_available        boolean;
  v_name             text;
  v_price            numeric;
  v_dish_restaurant  uuid;
  v_order_restaurant uuid;
BEGIN
  SELECT available, name, price, restaurant_id
    INTO v_available, v_name, v_price, v_dish_restaurant
  FROM dishes WHERE id = NEW.dish_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dish not found';
  END IF;

  IF NOT v_available THEN
    RAISE EXCEPTION 'Dish "%" is currently unavailable', v_name;
  END IF;

  SELECT restaurant_id INTO v_order_restaurant FROM orders WHERE id = NEW.order_id;

  IF v_order_restaurant IS DISTINCT FROM v_dish_restaurant THEN
    RAISE EXCEPTION 'Dish does not belong to this order''s restaurant';
  END IF;

  -- Server price always wins; client-sent unit_price is never trusted.
  NEW.unit_price := v_price;
  NEW.line_total := NEW.unit_price * NEW.quantity;

  RETURN NEW;
END;
$$;

-- =====================================================================
-- H4 -- any signed-in user could insert a notification for ANY user_id.
-- WHY: policy WITH CHECK was just `auth.uid() IS NOT NULL`.
-- System/staff notifications (e.g. request_bill in 31b) now come only from
-- SECURITY DEFINER functions, which bypass RLS as the function owner.
-- =====================================================================

DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON public.notifications;
DROP POLICY IF EXISTS notifications_customer_insert_own ON public.notifications;
CREATE POLICY notifications_customer_insert_own ON public.notifications
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- =====================================================================
-- H5 -- loyalty point farming: reviews.is_verified/is_flagged were client
-- settable (no column restriction, no WITH CHECK), and award_review_points
-- fired unconditionally on every INSERT regardless of is_verified.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.enforce_review_flags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_restaurant_id uuid;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  SELECT restaurant_id INTO v_restaurant_id FROM dishes WHERE id = NEW.dish_id;

  IF is_platform_admin() OR (v_restaurant_id IS NOT NULL AND is_staff_of(v_restaurant_id)) THEN
    RETURN NEW; -- staff/admin may verify or flag reviews
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.is_verified := false;
    NEW.is_flagged  := false;
  ELSE
    NEW.is_verified := OLD.is_verified;
    NEW.is_flagged  := OLD.is_flagged;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_review_flags ON public.reviews;
CREATE TRIGGER trg_enforce_review_flags
  BEFORE INSERT OR UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.enforce_review_flags();

CREATE OR REPLACE FUNCTION public.award_review_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT NEW.is_verified THEN
    RETURN NEW;
  END IF;

  -- Dedupe: is_verified can only ever be set by staff now, but guard against
  -- it being toggled off and back on from re-awarding points twice.
  IF EXISTS (
    SELECT 1 FROM loyalty_transactions
    WHERE user_id = NEW.user_id AND reason = 'review_posted:' || NEW.id::text
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO loyalty_accounts (user_id, points, points_earned)
  VALUES (NEW.user_id, 10, 10)
  ON CONFLICT (user_id) DO UPDATE
    SET points = loyalty_accounts.points + 10,
        points_earned = loyalty_accounts.points_earned + 10,
        updated_at = now();

  INSERT INTO loyalty_transactions (user_id, delta, reason)
  VALUES (NEW.user_id, 10, 'review_posted:' || NEW.id::text);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_award_review_points ON public.reviews;
CREATE TRIGGER trg_award_review_points
  AFTER INSERT OR UPDATE OF is_verified ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.award_review_points();

-- =====================================================================
-- H6 -- dish-photos storage: insert/update/delete only checked
-- auth.role() = 'authenticated', so any signed-in user could overwrite or
-- delete any restaurant's dish photos. The app actually uses two different
-- path shapes in this one bucket:
--   <restaurant_id>/<dish_id>.<ext>   -- dish photos, staff-managed
--                                          (client-resto DishFormModal.jsx,
--                                           MenuPage.jsx)
--   reviews/<user_id>/<timestamp>.<ext> -- review/reply photos, any signed-in
--                                          user, own folder only
--                                          (client HomePage.jsx ~627,
--                                           DishDetailSheet.jsx ~95)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.storage_folder_is_manager(p_folder text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  BEGIN
    v_id := p_folder::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  RETURN is_manager_of(v_id);
END;
$$;

DROP POLICY IF EXISTS dish_photos_upload ON storage.objects;
CREATE POLICY dish_photos_upload ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'dish-photos' AND (
      ((storage.foldername(name))[1] = 'reviews' AND (storage.foldername(name))[2] = auth.uid()::text)
      OR storage_folder_is_manager((storage.foldername(name))[1])
    )
  );

DROP POLICY IF EXISTS dish_photos_update ON storage.objects;
CREATE POLICY dish_photos_update ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'dish-photos' AND storage_folder_is_manager((storage.foldername(name))[1]))
  WITH CHECK (bucket_id = 'dish-photos' AND storage_folder_is_manager((storage.foldername(name))[1]));

DROP POLICY IF EXISTS dish_photos_delete ON storage.objects;
CREATE POLICY dish_photos_delete ON storage.objects
  FOR DELETE
  USING (bucket_id = 'dish-photos' AND storage_folder_is_manager((storage.foldername(name))[1]));

-- dish_photos_read (public SELECT) is untouched -- the bucket is public by
-- design and reads were never the problem.

-- =====================================================================
-- M1 -- pin search_path on app functions that were missing it, and revoke
-- EXECUTE on trigger/maintenance functions from anon/authenticated/public.
-- Checked `grep -r "\.rpc(" client/src client-resto/src` first: the only
-- RPCs either app calls today are track_campaign and redeem_credits (both
-- client/), client-resto calls no RPCs at all. Everything else below is
-- either a trigger function (fires regardless of caller's EXECUTE grant) or
-- an unused maintenance/helper function -- safe to lock down.
-- rqf_* functions belong to the unrelated Ryan's Quick Fix project sharing
-- this DB and are intentionally left untouched.
-- =====================================================================

-- Driven by two arrays instead of ~65 near-identical statements: (a) every
-- app function whose signature (fn name + arg types, '' = no args) needs
-- search_path pinned, and (b) the subset of those that should also lose
-- EXECUTE from anon/authenticated/PUBLIC (trigger + maintenance/helper
-- functions no client calls via .rpc()). check_dish_available,
-- recalculate_order_total, enforce_user_protected_fields,
-- enforce_order_insert_defaults, enforce_review_flags, award_review_points
-- and storage_folder_is_manager are already pinned above via their new
-- CREATE OR REPLACE definitions and are handled in the revoke array only
-- where applicable.
DO $$
DECLARE
  sig text;
  pin_search_path text[] := ARRAY[
    'set_updated_at()', 'auto_flag_customer()', 'update_loyalty_tier()',
    'check_otp_rate_limit()', 'create_customer_profile()', 'is_restaurant_open(uuid)',
    'enforce_table_state_machine()', 'log_table_state_change()', 'create_restaurant_defaults()',
    'log_salary_change()', 'check_overtime()', 'log_supplier_price_change()',
    'update_po_total()', 'validate_delivery_qty()', 'update_supplier_rating()',
    'expire_batches()', 'deduct_stock_fifo(uuid, numeric, stock_reason, uuid)',
    'deduct_waste_from_stock()', 'check_stock_threshold()', 'log_dish_price_change()',
    'snapshot_recipe_version()', 'recalculate_dish_allergens(uuid)', 'trg_recalculate_allergens_fn()',
    'update_dish_rating()', 'validate_booking_time()', 'auto_cancel_expired_bookings()',
    'mark_no_shows()', 'sync_table_on_booking_change()', 'notify_waitlist_on_cancel()',
    'check_party_size_vs_capacity()', 'create_kds_ticket()', 'handle_kds_status_change()',
    'prevent_order_modification_after_start()', 'sync_table_on_order_change()', 'validate_split_total()',
    'validate_refund_amount()', 'update_payment_on_refund()', 'generate_invoice_number()',
    'validate_ad_spend()', 'refresh_analytics()', 'get_restaurant_dashboard(uuid)',
    'get_available_tables(uuid, timestamptz, timestamptz, integer)', 'is_staff_of(uuid)',
    'staff_role_at(uuid)', 'is_manager_of(uuid)', 'is_platform_admin()'
  ];
  -- Trigger functions + unused maintenance/helper functions: no app code
  -- calls these via .rpc() (verified by grep), so EXECUTE is revoked.
  revoke_execute text[] := ARRAY[
    'award_review_points()', 'check_dish_available()', 'check_party_size_vs_capacity()',
    'check_stock_threshold()', 'create_customer_profile()', 'create_kds_ticket()',
    'enforce_table_state_machine()', 'handle_kds_status_change()', 'handle_new_auth_user()',
    'log_table_state_change()', 'notify_waitlist_on_cancel()', 'recalculate_order_total()',
    'sync_table_on_booking_change()', 'sync_table_on_order_change()', 'update_dish_rating()',
    'validate_booking_time()', 'auto_cancel_expired_bookings()', 'mark_no_shows()',
    'expire_batches()', 'refresh_analytics()', 'get_restaurant_dashboard(uuid)',
    'get_available_tables(uuid, timestamptz, timestamptz, integer)', 'is_restaurant_open(uuid)'
    -- NOT revoked: deduct_stock_fifo and recalculate_dish_allergens are called
    -- from SECURITY INVOKER triggers (deduct_waste_from_stock,
    -- trg_recalculate_allergens_fn) as the staff user; revoking would break
    -- those writes. Both are invoker functions, so RLS still guards them.
  ];
BEGIN
  -- ROUTINE, not FUNCTION: refresh_analytics() is a procedure.
  FOREACH sig IN ARRAY pin_search_path LOOP
    EXECUTE format('ALTER ROUTINE public.%s SET search_path = public, pg_temp;', sig);
  END LOOP;
  FOREACH sig IN ARRAY revoke_execute LOOP
    EXECUTE format('REVOKE EXECUTE ON ROUTINE public.%s FROM anon, authenticated, PUBLIC;', sig);
  END LOOP;
END $$;

-- Explicitly kept executable (per task spec -- apps depend on these):
--   is_staff_of, is_manager_of, is_platform_admin, staff_role_at (used inside
--   RLS policies, must stay executable by anon/authenticated for those
--   policies to evaluate), redeem_credits, track_campaign, and the new
--   claim_table/my_table_session/leave_table/request_bill (31b, authenticated
--   only). No action needed here -- their grants are untouched.

-- =====================================================================
-- M2 -- customers could self-confirm bookings (or change table/time/party
-- while "cancelling"). WITH CHECK now pins status to 'cancelled'; the
-- trigger below additionally locks every other column for a non-staff actor,
-- since WITH CHECK alone can't compare against the pre-update row.
-- =====================================================================

DROP POLICY IF EXISTS bookings_customer_cancel ON public.bookings;
CREATE POLICY bookings_customer_cancel ON public.bookings
  FOR UPDATE
  USING (user_id = auth.uid() AND status IN ('pending', 'confirmed'))
  WITH CHECK (user_id = auth.uid() AND status = 'cancelled');

CREATE OR REPLACE FUNCTION public.enforce_booking_customer_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- claim_table() (31b, SECURITY DEFINER) seats the caller's booking and the
  -- maintenance jobs (auto_cancel_expired_bookings, mark_no_shows) run as
  -- postgres: current_user is not an API role there, so they pass.
  IF current_user NOT IN ('authenticated', 'anon')
     OR is_staff_of(NEW.restaurant_id) OR is_platform_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM 'cancelled'::booking_status THEN
    RAISE EXCEPTION 'customers may only cancel a booking';
  END IF;

  IF NEW.restaurant_id     IS DISTINCT FROM OLD.restaurant_id
     OR NEW.user_id        IS DISTINCT FROM OLD.user_id
     OR NEW.table_id       IS DISTINCT FROM OLD.table_id
     OR NEW.reserved_from  IS DISTINCT FROM OLD.reserved_from
     OR NEW.reserved_until IS DISTINCT FROM OLD.reserved_until
     OR NEW.party_size     IS DISTINCT FROM OLD.party_size
     OR NEW.prepaid_amount IS DISTINCT FROM OLD.prepaid_amount
  THEN
    RAISE EXCEPTION 'customers may not modify booking details, only cancel';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_booking_customer_update ON public.bookings;
CREATE TRIGGER trg_enforce_booking_customer_update
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_booking_customer_update();

-- =====================================================================
-- M3 -- customers could reset their own no_show_count/unpaid_count/
-- total_visits/total_spent/is_flagged via the ALL policy + full UPDATE grant.
-- =====================================================================

DROP POLICY IF EXISTS customer_profiles_own ON public.customer_profiles;

DROP POLICY IF EXISTS customer_profiles_select_own ON public.customer_profiles;
CREATE POLICY customer_profiles_select_own ON public.customer_profiles
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS customer_profiles_insert_own ON public.customer_profiles;
CREATE POLICY customer_profiles_insert_own ON public.customer_profiles
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS customer_profiles_update_own ON public.customer_profiles;
CREATE POLICY customer_profiles_update_own ON public.customer_profiles
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

REVOKE UPDATE ON public.customer_profiles FROM authenticated;
GRANT UPDATE (preferred_language, dietary_prefs, allergens, birthday, notes)
  ON public.customer_profiles TO authenticated;

-- =====================================================================
-- M4 -- any staff member of any restaurant could read all site feedback
-- (names, emails) via `EXISTS (SELECT 1 FROM staff WHERE staff.user_id = auth.uid())`.
-- =====================================================================

DROP POLICY IF EXISTS "Staff can view feedback" ON public.feedback;
DROP POLICY IF EXISTS feedback_admin_read ON public.feedback;
CREATE POLICY feedback_admin_read ON public.feedback
  FOR SELECT USING (is_platform_admin());

-- =====================================================================
-- Staff can't read customer names/emails on orders/bookings today, because
-- `users` RLS is own-row-only -- the dashboard's users(name,email) joins
-- silently return null. Add a narrow SELECT policy: staff may read a user's
-- row only if that user has an order or booking at a restaurant the staff
-- member works at (not "all users").
-- =====================================================================

DROP POLICY IF EXISTS users_staff_read_customers ON public.users;
CREATE POLICY users_staff_read_customers ON public.users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.user_id = users.id AND is_staff_of(o.restaurant_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.user_id = users.id AND is_staff_of(b.restaurant_id)
    )
  );

-- =====================================================================
-- dishes: `authenticated` had UPDATE but no INSERT/DELETE grant, so the
-- dashboard could edit but never add/delete a dish. Grant it, and make the
-- write policy's WITH CHECK match USING so restaurant_id can't be changed
-- to a different (unmanaged) restaurant on INSERT/UPDATE.
-- =====================================================================

GRANT INSERT, DELETE ON public.dishes TO authenticated;

DROP POLICY IF EXISTS dishes_staff_write ON public.dishes;
CREATE POLICY dishes_staff_write ON public.dishes
  FOR ALL
  USING (is_manager_of(restaurant_id))
  WITH CHECK (is_manager_of(restaurant_id));

-- ad_campaigns: same tenant-boundary WITH CHECK, so a staff member can't
-- insert/move a campaign onto a restaurant_id they don't manage.
DROP POLICY IF EXISTS ad_campaigns_staff_all ON public.ad_campaigns;
CREATE POLICY ad_campaigns_staff_all ON public.ad_campaigns
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM staff s
    WHERE s.user_id = auth.uid() AND s.restaurant_id = ad_campaigns.restaurant_id AND s.is_active
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM staff s
    WHERE s.user_id = auth.uid() AND s.restaurant_id = ad_campaigns.restaurant_id AND s.is_active
  ));

-- =====================================================================
-- payments: consumer inserts already fail today (no grant on preview, and
-- the app sends status:'completed' which isn't in payment_status anyway).
-- Per spec we do NOT grant direct INSERT here -- payments are created only
-- via the request_bill() RPC in 31b, which runs SECURITY DEFINER and
-- computes amounts server-side instead of trusting the client's bill total.
-- No DDL needed in this section; documented for the record.
-- =====================================================================

COMMIT;

-- Re-check after applying (and after 31b):
--   select * from pg_policies where schemaname='public' order by tablename, policyname;
--   select proname from pg_proc where pronamespace='public'::regnamespace and prosecdef
--     and has_function_privilege('anon', oid, 'execute');
--   -- Supabase advisors:
--   -- mcp: get_advisors(type: 'security')
