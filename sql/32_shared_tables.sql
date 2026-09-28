-- 32_shared_tables.sql
-- Shared tables: several guests at one table, each ordering from their own
-- phone. The first guest seated becomes the host; later guests wait as
-- 'pending' until the host approves them (restaurant_settings.group_join_approval,
-- default on -- set it to false to go back to "anyone with the code joins").
--
-- Also:
--  * a table going free/cleared ends every open session on it, so a new
--    party never inherits sessions left behind by the previous one;
--  * paying one guest's order no longer clears the whole table while others
--    still have unpaid orders (and no longer fails when the table is in
--    'ordering');
--  * orders and request_bill require an *approved* (active) session.
--
-- leave_table / table_party / respond_join_request live in 32b (apply after
-- this file); the table bill is 33, call-waiter and the waiter view are 34.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE, DROP ... IF EXISTS.

BEGIN;

-- ---------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------

ALTER TABLE public.restaurant_settings
  ADD COLUMN IF NOT EXISTS group_join_approval boolean NOT NULL DEFAULT true;

ALTER TABLE public.table_sessions
  ADD COLUMN IF NOT EXISTS is_host boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status  text    NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'table_sessions_status_check'
  ) THEN
    ALTER TABLE public.table_sessions
      ADD CONSTRAINT table_sessions_status_check
      CHECK (status IN ('active', 'pending', 'declined'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS table_sessions_open_by_table
  ON public.table_sessions (table_id) WHERE ended_at IS NULL;

-- Sessions already open when this ships: the earliest one per table hosts.
UPDATE public.table_sessions ts
   SET is_host = true
 WHERE ts.ended_at IS NULL
   AND ts.status = 'active'
   AND ts.id = (
     SELECT x.id FROM public.table_sessions x
      WHERE x.table_id = ts.table_id AND x.ended_at IS NULL AND x.status = 'active'
      ORDER BY x.started_at LIMIT 1
   );

-- Orders need an approved session (pending guests can browse, not order).
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
           AND ts.status = 'active'
      )
    )
  );

-- ---------------------------------------------------------------------
-- Table goes free/cleared -> the party is over: end its sessions.
-- (service_requests / table_service cleanup is added in 33.)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.end_table_party()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.state IN ('free', 'cleared') AND OLD.state IS DISTINCT FROM NEW.state THEN
    UPDATE public.table_sessions
       SET ended_at = now()
     WHERE table_id = NEW.id AND ended_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.end_table_party() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_end_table_party ON public.tables;
CREATE TRIGGER trg_end_table_party
  AFTER UPDATE OF state ON public.tables
  FOR EACH ROW EXECUTE FUNCTION public.end_table_party();

-- ---------------------------------------------------------------------
-- Paid order: clear the table only when nothing else is outstanding,
-- stepping through the state machine instead of jumping to 'cleared'.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_table_on_order_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_state       table_state;
  v_party_start timestamptz;
BEGIN
  IF NEW.status = 'submitted' AND OLD.status = 'open' THEN
    NEW.submitted_at = now();
    UPDATE public.tables SET state = 'ordering' WHERE id = NEW.table_id AND state = 'occupied';

  ELSIF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    NEW.completed_at = now();

    -- Clear the table once the bill was asked for and the current party
    -- owes nothing more. Only this party's orders count (older unpaid ones
    -- left by earlier guests don't); with nobody seated, clear as before.
    SELECT MIN(started_at) INTO v_party_start
    FROM public.table_sessions
    WHERE table_id = NEW.table_id AND ended_at IS NULL;

    SELECT state INTO v_state FROM public.tables WHERE id = NEW.table_id FOR UPDATE;

    IF v_state = 'awaiting_payment' AND (v_party_start IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.orders o
       WHERE o.table_id = NEW.table_id
         AND o.id <> NEW.id
         AND o.status NOT IN ('paid', 'cancelled', 'refunded')
         AND o.placed_at >= v_party_start
    )) THEN
      UPDATE public.tables SET state = 'cleared' WHERE id = NEW.table_id;
    END IF;

    UPDATE public.customer_profiles
       SET total_visits = total_visits + 1,
           total_spent  = total_spent + NEW.total_amount
     WHERE user_id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------
-- claim_table(p_code) -- same signature and return keys as 31b, plus
-- session_id, session_status ('active' | 'pending') and is_host.
-- ---------------------------------------------------------------------

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
  v_session          public.table_sessions%ROWTYPE;
  v_host_user        uuid;
  v_approval         boolean;
  v_booked_now       boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_code IS NULL OR btrim(p_code) = '' THEN
    RAISE EXCEPTION 'invalid_code';
  END IF;

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

  -- Nobody is seated at a free/cleared/reserved table: any session still
  -- open there was left behind by an earlier party.
  IF v_state IN ('free', 'cleared', 'reserved') THEN
    UPDATE public.table_sessions
       SET ended_at = now()
     WHERE table_id = v_table_id AND ended_at IS NULL;
  END IF;

  SELECT id INTO v_booking_id
  FROM public.bookings
  WHERE table_id = v_table_id
    AND user_id = v_uid
    AND status IN ('pending', 'confirmed')
    AND (reserved_from AT TIME ZONE 'Asia/Baku')::date = (now() AT TIME ZONE 'Asia/Baku')::date
  ORDER BY reserved_from
  LIMIT 1;

  IF v_booking_id IS NOT NULL THEN
    -- Only a staff-confirmed booking for right now lets the caller skip the
    -- host's approval at a table someone else is already sitting at.
    SELECT status = 'confirmed'
           AND now() >= reserved_from - interval '30 minutes'
           AND now() <  reserved_until
      INTO v_booked_now
    FROM public.bookings WHERE id = v_booking_id;

    UPDATE public.bookings SET status = 'seated' WHERE id = v_booking_id;
    SELECT state INTO v_state FROM public.tables WHERE id = v_table_id;
  END IF;

  IF v_state IN ('free', 'cleared') THEN
    IF v_state = 'cleared' THEN
      UPDATE public.tables SET state = 'free' WHERE id = v_table_id;
    END IF;
    UPDATE public.tables SET state = 'occupied' WHERE id = v_table_id;
  ELSIF v_state = 'reserved' THEN
    IF v_booking_id IS NULL AND NOT EXISTS (
      SELECT 1 FROM public.bookings b
      WHERE b.table_id = v_table_id AND b.user_id = v_uid AND b.status = 'confirmed'
    ) THEN
      RAISE EXCEPTION 'table_reserved';
    END IF;
    UPDATE public.tables SET state = 'occupied' WHERE id = v_table_id;
  ELSIF v_state IN ('occupied', 'ordering', 'awaiting_payment') THEN
    NULL; -- a party is here; the caller joins it (maybe as pending, below)
  ELSE
    RAISE EXCEPTION 'invalid_code';
  END IF;

  SELECT * INTO v_session
  FROM public.table_sessions
  WHERE table_id = v_table_id AND user_id = v_uid AND ended_at IS NULL
  ORDER BY started_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT user_id INTO v_host_user
    FROM public.table_sessions
    WHERE table_id = v_table_id AND ended_at IS NULL AND status = 'active'
    ORDER BY is_host DESC, started_at
    LIMIT 1;

    SELECT COALESCE(rs.group_join_approval, true) INTO v_approval
    FROM public.restaurants r
    LEFT JOIN public.restaurant_settings rs ON rs.restaurant_id = r.id
    WHERE r.id = v_restaurant_id;
    v_approval := COALESCE(v_approval, true);

    IF v_host_user IS NULL THEN
      INSERT INTO public.table_sessions (table_id, user_id, restaurant_id, is_host, status)
      VALUES (v_table_id, v_uid, v_restaurant_id, true, 'active')
      RETURNING * INTO v_session;
    ELSIF v_approval AND NOT COALESCE(v_booked_now, false) THEN
      -- A guest the host just turned down can't re-ask straight away.
      IF EXISTS (
        SELECT 1 FROM public.table_sessions
         WHERE table_id = v_table_id AND user_id = v_uid
           AND status = 'declined' AND ended_at > now() - interval '10 minutes'
      ) THEN
        RAISE EXCEPTION 'join_declined';
      END IF;

      -- Keep the host's queue (and notifications) bounded.
      IF (SELECT COUNT(*) FROM public.table_sessions
           WHERE table_id = v_table_id AND ended_at IS NULL AND status = 'pending') >= 4 THEN
        RAISE EXCEPTION 'too_many_requests';
      END IF;

      INSERT INTO public.table_sessions (table_id, user_id, restaurant_id, is_host, status)
      VALUES (v_table_id, v_uid, v_restaurant_id, false, 'pending')
      RETURNING * INTO v_session;

      INSERT INTO public.notifications (user_id, type, payload)
      VALUES (
        v_host_user,
        'join_request',
        jsonb_build_object(
          'table_id', v_table_id,
          'restaurant_id', v_restaurant_id,
          'session_id', v_session.id,
          'name', (SELECT split_part(u.name, ' ', 1) FROM public.users u WHERE u.id = v_uid)
        )::text
      );
    ELSE
      INSERT INTO public.table_sessions (table_id, user_id, restaurant_id, is_host, status)
      VALUES (v_table_id, v_uid, v_restaurant_id, false, 'active')
      RETURNING * INTO v_session;
    END IF;
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
    'restaurant_name', v_restaurant_name,
    'session_id', v_session.id,
    'session_status', v_session.status,
    'is_host', v_session.is_host
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_table(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_table(text) FROM anon, PUBLIC;

-- ---------------------------------------------------------------------
-- my_table_session() -- adds session_id, session_status, is_host.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.my_table_session()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid              uuid := auth.uid();
  v_session          public.table_sessions%ROWTYPE;
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

  SELECT * INTO v_session
  FROM public.table_sessions ts
  WHERE ts.user_id = v_uid AND ts.ended_at IS NULL
  ORDER BY ts.started_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT t.table_number, t.capacity, t.state, r.slug, r.name
    INTO v_table_number, v_capacity, v_state, v_restaurant_slug, v_restaurant_name
  FROM public.tables t
  JOIN public.restaurants r ON r.id = t.restaurant_id
  WHERE t.id = v_session.table_id;

  SELECT id INTO v_booking_id
  FROM public.bookings
  WHERE table_id = v_session.table_id AND user_id = v_uid AND status = 'seated'
  ORDER BY seated_at DESC NULLS LAST
  LIMIT 1;

  RETURN jsonb_build_object(
    'table_id', v_session.table_id,
    'restaurant_id', v_session.restaurant_id,
    'table_number', v_table_number,
    'capacity', v_capacity,
    'state', v_state,
    'booking_id', v_booking_id,
    'restaurant_slug', v_restaurant_slug,
    'restaurant_name', v_restaurant_name,
    'session_id', v_session.id,
    'session_status', v_session.status,
    'is_host', v_session.is_host
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.my_table_session() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.my_table_session() FROM anon, PUBLIC;

COMMIT;
