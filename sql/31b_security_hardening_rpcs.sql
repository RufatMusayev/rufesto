-- 31b_security_hardening_rpcs.sql
-- Companion to sql/31_security_hardening.sql -- MUST be applied together
-- with (and after) that file. Adds the four dine-in RPCs that the C2/H1 fix
-- in 31 requires: table access codes were moved off `tables` onto the
-- staff-only `table_access_codes` table, and orders now require a live
-- `table_sessions` row, so the client can no longer "sit down" or "pay" by
-- writing to `tables`/`payments` directly -- it must go through these.
--
-- Signatures are fixed by agreement with the frontend agents, who are coding
-- against them now: names, params and return shapes below must not change.
-- All four: SECURITY DEFINER, search_path pinned, EXECUTE granted to
-- authenticated only (not anon -- the app requires sign-in before sitting
-- down), plain-text RAISE EXCEPTION messages exactly as listed per function.
--
-- Idempotent: CREATE OR REPLACE + explicit GRANT/REVOKE. Safe to re-run.

BEGIN;

-- =====================================================================
-- claim_table(p_code text) -> jsonb
-- Replaces the client directly querying `tables` by access_code/qr_code_token
-- (TablePage.jsx ~129-131, QRSheet.jsx ~68-70) and then writing
-- `tables.state` itself (CartContext.jsx:96, TablePage.jsx:61). Both of those
-- call sites break once this ships -- see migration report.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.claim_table(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid              uuid := auth.uid();
  v_table_id         uuid;
  v_restaurant_id    uuid;
  v_table_number     text;
  v_capacity         int;
  v_state            table_state;
  v_booking_id       uuid;
  v_restaurant_slug  text;
  v_restaurant_name  text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_code IS NULL OR btrim(p_code) = '' THEN
    RAISE EXCEPTION 'invalid_code';
  END IF;

  -- Row-lock the target table for the rest of this transaction so two
  -- concurrent claim_table() calls on the same table can't race.
  SELECT t.id, t.restaurant_id, t.table_number, t.capacity, t.state
    INTO v_table_id, v_restaurant_id, v_table_number, v_capacity, v_state
  FROM public.table_access_codes tac
  JOIN public.tables t ON t.id = tac.table_id
  WHERE t.is_active
    AND (
      (tac.access_code IS NOT NULL AND upper(btrim(tac.access_code)) = upper(btrim(p_code)))
      OR tac.qr_code_token = p_code
    )
  FOR UPDATE OF t;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_code';
  END IF;

  -- Caller can only be at one table at a time: end their session(s) elsewhere.
  UPDATE public.table_sessions
     SET ended_at = now()
   WHERE user_id = v_uid AND ended_at IS NULL AND table_id <> v_table_id;

  -- Seat a same-day pending/confirmed booking for this table+caller, if any
  -- (reasonable window: booked for today). This flips the booking to
  -- 'seated', which trg_sync_table_on_booking (unchanged) moves the table to
  -- 'occupied' for us and stamps seated_at.
  SELECT id INTO v_booking_id
  FROM public.bookings
  WHERE table_id = v_table_id
    AND user_id = v_uid
    AND status IN ('pending', 'confirmed')
    AND (reserved_from AT TIME ZONE 'Asia/Baku')::date = (now() AT TIME ZONE 'Asia/Baku')::date
  ORDER BY reserved_from
  LIMIT 1;

  IF v_booking_id IS NOT NULL THEN
    -- Runs as the function owner, so the customer-only booking guard
    -- (enforce_booking_customer_update, sql/31) lets this through.
    UPDATE public.bookings SET status = 'seated' WHERE id = v_booking_id;
    SELECT state INTO v_state FROM public.tables WHERE id = v_table_id;
  END IF;

  -- Drive the table into a joinable state, respecting the existing state
  -- machine (trg_table_state_machine) rather than bypassing it.
  IF v_state IN ('free', 'cleared') THEN
    IF v_state = 'cleared' THEN
      UPDATE public.tables SET state = 'free' WHERE id = v_table_id; -- cleared -> free
    END IF;
    UPDATE public.tables SET state = 'occupied' WHERE id = v_table_id; -- free -> occupied
  ELSIF v_state = 'reserved' THEN
    IF v_booking_id IS NULL AND NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.table_id = v_table_id AND b.user_id = v_uid AND b.status = 'confirmed'
    ) THEN
      RAISE EXCEPTION 'table_reserved';
    END IF;
    UPDATE public.tables SET state = 'occupied' WHERE id = v_table_id; -- reserved -> occupied
  ELSIF v_state IN ('occupied', 'ordering', 'awaiting_payment') THEN
    NULL; -- table already in use for a live session; caller just joins it
  ELSE
    RAISE EXCEPTION 'invalid_code'; -- e.g. maintenance: not joinable
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.table_sessions
    WHERE table_id = v_table_id AND user_id = v_uid AND ended_at IS NULL
  ) THEN
    INSERT INTO public.table_sessions (table_id, user_id, restaurant_id)
    VALUES (v_table_id, v_uid, v_restaurant_id);
  END IF;

  SELECT t.state, r.slug, r.name
    INTO v_state, v_restaurant_slug, v_restaurant_name
  FROM public.tables t
  JOIN public.restaurants r ON r.id = t.restaurant_id
  WHERE t.id = v_table_id;

  RETURN jsonb_build_object(
    'table_id', v_table_id,
    'restaurant_id', v_restaurant_id,
    'table_number', v_table_number,
    'capacity', v_capacity,
    'state', v_state,
    'booking_id', v_booking_id,
    'restaurant_slug', v_restaurant_slug,
    'restaurant_name', v_restaurant_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_table(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_table(text) FROM anon, PUBLIC;

-- =====================================================================
-- my_table_session() -> jsonb | null
-- =====================================================================

CREATE OR REPLACE FUNCTION public.my_table_session()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid              uuid := auth.uid();
  v_table_id         uuid;
  v_restaurant_id    uuid;
  v_table_number     text;
  v_capacity         int;
  v_state            table_state;
  v_booking_id       uuid;
  v_restaurant_slug  text;
  v_restaurant_name  text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT ts.table_id INTO v_table_id
  FROM public.table_sessions ts
  WHERE ts.user_id = v_uid AND ts.ended_at IS NULL
  ORDER BY ts.started_at DESC
  LIMIT 1;

  IF v_table_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT t.restaurant_id, t.table_number, t.capacity, t.state, r.slug, r.name
    INTO v_restaurant_id, v_table_number, v_capacity, v_state, v_restaurant_slug, v_restaurant_name
  FROM public.tables t
  JOIN public.restaurants r ON r.id = t.restaurant_id
  WHERE t.id = v_table_id;

  SELECT id INTO v_booking_id
  FROM public.bookings
  WHERE table_id = v_table_id AND user_id = v_uid AND status = 'seated'
  ORDER BY seated_at DESC NULLS LAST
  LIMIT 1;

  RETURN jsonb_build_object(
    'table_id', v_table_id,
    'restaurant_id', v_restaurant_id,
    'table_number', v_table_number,
    'capacity', v_capacity,
    'state', v_state,
    'booking_id', v_booking_id,
    'restaurant_slug', v_restaurant_slug,
    'restaurant_name', v_restaurant_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.my_table_session() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.my_table_session() FROM anon, PUBLIC;

-- =====================================================================
-- leave_table(p_table_id uuid) -> void
-- NOTE / judgment call: the state machine (trg_table_state_machine, sql/02
-- + 31) only allows reaching 'cleared' from 'awaiting_payment', and there is
-- no transition out of 'ordering' at all. So this can only literally do what
-- the task spec says ("set state 'cleared'") when the table is currently
-- 'awaiting_payment'. For 'occupied'/'reserved' (never ordered, or a
-- reservation that never converted) it goes to 'free' instead, which is the
-- closest valid "nobody's here" state. For 'ordering' (cart started but
-- never submitted) there is no valid target at all in the existing machine,
-- so the table state is left untouched -- the session still ends, staff can
-- clear it manually. Flagged in the migration report; happy to add an
-- 'ordering'->'free' transition in a follow-up if Rufat wants this covered.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.leave_table(p_table_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_state table_state;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_table_id::text));

  UPDATE public.table_sessions
     SET ended_at = now()
   WHERE table_id = p_table_id AND user_id = v_uid AND ended_at IS NULL;

  IF EXISTS (
    SELECT 1 FROM public.table_sessions
    WHERE table_id = p_table_id AND ended_at IS NULL
  ) THEN
    RETURN; -- someone else is still seated here
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.orders
    WHERE table_id = p_table_id AND status NOT IN ('paid', 'cancelled')
  ) THEN
    RETURN; -- unpaid orders outstanding; leave the table state to staff/payment flow
  END IF;

  SELECT state INTO v_state FROM public.tables WHERE id = p_table_id;

  IF v_state = 'awaiting_payment' THEN
    UPDATE public.tables SET state = 'cleared' WHERE id = p_table_id;
  ELSIF v_state IN ('occupied', 'reserved') THEN
    UPDATE public.tables SET state = 'free' WHERE id = p_table_id;
  END IF;
  -- v_state IN ('ordering','free','maintenance'): no-op, see note above.
END;
$$;

GRANT EXECUTE ON FUNCTION public.leave_table(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.leave_table(uuid) FROM anon, PUBLIC;

-- =====================================================================
-- request_bill(p_table_id uuid, p_method text) -> jsonb {amount_due, order_ids}
-- Replaces PaymentSheet.jsx's direct `supabase.from('payments').insert(...)`
-- (which fails today anyway -- no grant, and 'completed' isn't a valid
-- payment_status) and its instant fake "success" for digital methods.
-- Every method now creates 'pending' payment rows and puts the table into
-- 'awaiting_payment'; staff mark orders paid from the dashboard (the
-- existing sync_table_on_order_change trigger frees the table on 'paid').
-- This is a real behavior change from the current mock PaymentSheet flow --
-- flagged in the migration report.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.request_bill(p_table_id uuid, p_method text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid           uuid := auth.uid();
  v_restaurant_id uuid;
  v_pg_method     payment_method;
  v_order         RECORD;
  v_discount      numeric;
  v_amount_due    numeric;
  v_total_due     numeric := 0;
  v_order_ids     uuid[] := ARRAY[]::uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_method NOT IN ('card', 'apple', 'google', 'cash', 'reception') THEN
    RAISE EXCEPTION 'invalid_method';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.table_sessions
    WHERE table_id = p_table_id AND user_id = v_uid AND ended_at IS NULL
  ) THEN
    RAISE EXCEPTION 'no_session';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_table_id::text));

  SELECT restaurant_id INTO v_restaurant_id FROM public.tables WHERE id = p_table_id;

  v_pg_method := CASE p_method
    WHEN 'card' THEN 'card'::payment_method
    WHEN 'apple' THEN 'apple_pay'::payment_method
    WHEN 'google' THEN 'google_pay'::payment_method
    WHEN 'cash' THEN 'cash'::payment_method
    WHEN 'reception' THEN 'reception'::payment_method
  END;

  FOR v_order IN
    SELECT id, total_amount
    FROM public.orders
    WHERE table_id = p_table_id AND user_id = v_uid AND status NOT IN ('paid', 'cancelled')
    FOR UPDATE
  LOOP
    v_order_ids := array_append(v_order_ids, v_order.id);

    -- Points already redeemed against this order via redeem_credits() are
    -- recorded in loyalty_transactions (reason='redeemed', order_id=...);
    -- redeem_credits itself never writes a discount onto orders.total_amount,
    -- so we reconstruct it here using the same 0.01 AZN/point rate.
    SELECT COALESCE(SUM(-delta), 0) * 0.01 INTO v_discount
    FROM public.loyalty_transactions
    WHERE order_id = v_order.id AND reason = 'redeemed';

    v_amount_due := GREATEST(v_order.total_amount - COALESCE(v_discount, 0), 0);
    v_total_due := v_total_due + v_amount_due;

    -- A repeated request (guest taps again, or switches method) updates the
    -- existing pending row instead of stacking duplicates.
    IF v_amount_due > 0 THEN
      UPDATE public.payments
         SET method = v_pg_method, amount = v_amount_due
       WHERE order_id = v_order.id AND status = 'pending';
      IF NOT FOUND THEN
        INSERT INTO public.payments (order_id, user_id, method, amount, status)
        VALUES (v_order.id, v_uid, v_pg_method, v_amount_due, 'pending');
      END IF;
    END IF;
    -- amount_due = 0 (fully covered by credits): no payment row inserted --
    -- payments.amount has a CHECK (amount > 0). The order is still included
    -- in order_ids/amount_due; staff will need to mark it paid manually
    -- since there's nothing for the payments table to represent here.
  END LOOP;

  IF array_length(v_order_ids, 1) IS NOT NULL THEN
    UPDATE public.tables SET state = 'awaiting_payment' WHERE id = p_table_id;

    INSERT INTO public.notifications (user_id, type, payload)
    SELECT s.user_id,
           'bill_requested',
           jsonb_build_object(
             'table_id', p_table_id,
             'restaurant_id', v_restaurant_id,
             'amount_due', v_total_due,
             'method', p_method,
             'order_ids', v_order_ids
           )::text
    FROM public.staff s
    WHERE s.restaurant_id = v_restaurant_id AND s.is_active;
  END IF;

  RETURN jsonb_build_object('amount_due', v_total_due, 'order_ids', v_order_ids);
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_bill(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.request_bill(uuid, text) FROM anon, PUBLIC;

COMMIT;
