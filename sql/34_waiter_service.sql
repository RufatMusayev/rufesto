-- 34_waiter_service.sql  (apply after 33_table_bill.sql)
-- Call the waiter + waiter surface:
--  * service_requests + call_waiter() (approved session, one call per guest
--    per 2 minutes, at most 3 open per table), handled by staff through
--    ack_service_request() / resolve_service_request();
--  * table_service (which waiter took which table), take_table() /
--    release_table(), waiter_overview() for the dashboard's waiter view.
-- A table going free/cleared closes its requests and frees its waiter.
--
-- Idempotent: CREATE ... IF NOT EXISTS, CREATE OR REPLACE, DROP ... IF EXISTS.

BEGIN;

-- ---------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.table_service (
  table_id          uuid PRIMARY KEY REFERENCES public.tables(id) ON DELETE CASCADE,
  restaurant_id     uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  assigned_staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  assigned_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.service_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id    uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  table_id         uuid NOT NULL REFERENCES public.tables(id) ON DELETE CASCADE,
  session_id       uuid REFERENCES public.table_sessions(id) ON DELETE SET NULL,
  user_id          uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('assist', 'water', 'cutlery', 'clean')),
  status           text NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open', 'acknowledged', 'done', 'cancelled')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  acknowledged_by  uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  acknowledged_at  timestamptz,
  resolved_at      timestamptz
);

CREATE INDEX IF NOT EXISTS service_requests_restaurant_status
  ON public.service_requests (restaurant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS service_requests_table_created
  ON public.service_requests (table_id, created_at DESC);

ALTER TABLE public.table_service    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS table_service_staff_read ON public.table_service;
CREATE POLICY table_service_staff_read ON public.table_service
  FOR SELECT USING (public.is_staff_of(restaurant_id));

DROP POLICY IF EXISTS service_requests_staff_read ON public.service_requests;
CREATE POLICY service_requests_staff_read ON public.service_requests
  FOR SELECT USING (public.is_staff_of(restaurant_id));

DROP POLICY IF EXISTS service_requests_own_read ON public.service_requests;
CREATE POLICY service_requests_own_read ON public.service_requests
  FOR SELECT USING (user_id = auth.uid());

-- Read-only from the browser; every write goes through the RPCs below.
REVOKE ALL ON public.table_service, public.service_requests FROM anon, authenticated;
GRANT SELECT ON public.table_service, public.service_requests TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                  WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
                    AND tablename = 'service_requests') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.service_requests;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                  WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
                    AND tablename = 'table_service') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.table_service;
  END IF;
END $$;

-- The party ending also closes its requests and frees its waiter.
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
    UPDATE public.service_requests
       SET status = 'cancelled', resolved_at = now()
     WHERE table_id = NEW.id AND status IN ('open', 'acknowledged');
    DELETE FROM public.table_service WHERE table_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.end_table_party() FROM anon, authenticated, PUBLIC;

-- Caller's active staff row at the restaurant, for front-of-house roles.
CREATE OR REPLACE FUNCTION public._floor_staff_id(p_restaurant_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id FROM public.staff
   WHERE restaurant_id = p_restaurant_id AND user_id = auth.uid() AND is_active
     AND role IN ('admin', 'manager', 'waiter', 'host', 'cashier')
   ORDER BY joined_at
   LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public._floor_staff_id(uuid) FROM anon, authenticated, PUBLIC;

-- ---------------------------------------------------------------------
-- call_waiter(p_table_id, p_kind) -> jsonb { id, created_at }
-- One call per guest per 2 minutes, at most 3 open calls per table.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.call_waiter(p_table_id uuid, p_kind text DEFAULT 'assist')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid           uuid := auth.uid();
  v_session_id    uuid;
  v_restaurant_id uuid;
  v_table_number  text;
  v_assigned      uuid;
  v_req           public.service_requests%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('assist', 'water', 'cutlery', 'clean') THEN
    RAISE EXCEPTION 'invalid_kind';
  END IF;

  v_session_id := public._active_session_id(p_table_id);
  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'no_session';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('call_waiter:' || p_table_id::text));

  IF EXISTS (
    SELECT 1 FROM public.service_requests
     WHERE table_id = p_table_id AND user_id = v_uid
       AND created_at > now() - interval '2 minutes'
  ) THEN
    RAISE EXCEPTION 'too_soon';
  END IF;

  IF (SELECT COUNT(*) FROM public.service_requests
       WHERE table_id = p_table_id AND status IN ('open', 'acknowledged')) >= 3 THEN
    RAISE EXCEPTION 'too_many_open';
  END IF;

  SELECT restaurant_id, table_number INTO v_restaurant_id, v_table_number
  FROM public.tables WHERE id = p_table_id;

  INSERT INTO public.service_requests (restaurant_id, table_id, session_id, user_id, kind)
  VALUES (v_restaurant_id, p_table_id, v_session_id, v_uid, p_kind)
  RETURNING * INTO v_req;

  -- The table's waiter if one took it, otherwise every floor-staff member.
  SELECT assigned_staff_id INTO v_assigned FROM public.table_service WHERE table_id = p_table_id;

  INSERT INTO public.notifications (user_id, type, payload)
  SELECT s.user_id,
         'waiter_called',
         jsonb_build_object(
           'request_id', v_req.id,
           'table_id', p_table_id,
           'table_number', v_table_number,
           'restaurant_id', v_restaurant_id,
           'kind', p_kind
         )::text
  FROM public.staff s
  WHERE s.restaurant_id = v_restaurant_id AND s.is_active
    AND CASE WHEN v_assigned IS NOT NULL
             THEN s.id = v_assigned
             ELSE s.role IN ('admin', 'manager', 'waiter', 'host') END;

  RETURN jsonb_build_object('id', v_req.id, 'created_at', v_req.created_at);
END;
$$;

GRANT EXECUTE ON FUNCTION public.call_waiter(uuid, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.call_waiter(uuid, text) FROM anon, PUBLIC;

-- ---------------------------------------------------------------------
-- Staff side
-- ---------------------------------------------------------------------

-- take_table(p_table_id): the caller becomes this table's waiter.
CREATE OR REPLACE FUNCTION public.take_table(p_table_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_restaurant_id uuid;
  v_staff_id      uuid;
BEGIN
  SELECT restaurant_id INTO v_restaurant_id FROM public.tables WHERE id = p_table_id;
  v_staff_id := public._floor_staff_id(v_restaurant_id);
  IF v_restaurant_id IS NULL OR v_staff_id IS NULL THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  INSERT INTO public.table_service (table_id, restaurant_id, assigned_staff_id)
  VALUES (p_table_id, v_restaurant_id, v_staff_id)
  ON CONFLICT (table_id) DO UPDATE
    SET assigned_staff_id = EXCLUDED.assigned_staff_id, assigned_at = now();

  RETURN jsonb_build_object('table_id', p_table_id, 'assigned_staff_id', v_staff_id);
END;
$$;

-- release_table(p_table_id): drop the assignment (own table, or a manager).
CREATE OR REPLACE FUNCTION public.release_table(p_table_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_restaurant_id uuid;
  v_staff_id      uuid;
BEGIN
  SELECT restaurant_id INTO v_restaurant_id FROM public.tables WHERE id = p_table_id;
  v_staff_id := public._floor_staff_id(v_restaurant_id);
  IF v_restaurant_id IS NULL OR v_staff_id IS NULL THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  DELETE FROM public.table_service
   WHERE table_id = p_table_id
     AND (assigned_staff_id = v_staff_id OR public.is_manager_of(v_restaurant_id));
END;
$$;

-- ack_service_request(p_id): "on my way". Takes the table if nobody has.
CREATE OR REPLACE FUNCTION public.ack_service_request(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req      public.service_requests%ROWTYPE;
  v_staff_id uuid;
BEGIN
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  v_staff_id := public._floor_staff_id(v_req.restaurant_id);
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;
  IF v_req.status <> 'open' THEN
    RAISE EXCEPTION 'not_open';
  END IF;

  UPDATE public.service_requests
     SET status = 'acknowledged', acknowledged_by = v_staff_id, acknowledged_at = now()
   WHERE id = p_id;

  INSERT INTO public.table_service (table_id, restaurant_id, assigned_staff_id)
  VALUES (v_req.table_id, v_req.restaurant_id, v_staff_id)
  ON CONFLICT (table_id) DO NOTHING;

  RETURN jsonb_build_object('id', p_id, 'status', 'acknowledged');
END;
$$;

-- resolve_service_request(p_id): done.
CREATE OR REPLACE FUNCTION public.resolve_service_request(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_req      public.service_requests%ROWTYPE;
  v_staff_id uuid;
BEGIN
  SELECT * INTO v_req FROM public.service_requests WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  v_staff_id := public._floor_staff_id(v_req.restaurant_id);
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;
  IF v_req.status NOT IN ('open', 'acknowledged') THEN
    RAISE EXCEPTION 'not_open';
  END IF;

  UPDATE public.service_requests
     SET status = 'done', resolved_at = now(),
         acknowledged_by = COALESCE(acknowledged_by, v_staff_id),
         acknowledged_at = COALESCE(acknowledged_at, now())
   WHERE id = p_id;

  RETURN jsonb_build_object('id', p_id, 'status', 'done');
END;
$$;

-- waiter_overview(p_restaurant_id) -> jsonb: every active table with its
-- party, waiter, open calls and outstanding amount. Front-of-house only.
CREATE OR REPLACE FUNCTION public.waiter_overview(p_restaurant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_staff_id uuid := public._floor_staff_id(p_restaurant_id);
BEGIN
  IF v_staff_id IS NULL THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  RETURN jsonb_build_object(
    'me', v_staff_id,
    'tables', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'table_id', t.id,
               'table_number', t.table_number,
               'section', s.name,
               'state', t.state,
               'capacity', t.capacity,
               'guests', (SELECT COUNT(*) FROM public.table_sessions ts
                           WHERE ts.table_id = t.id AND ts.ended_at IS NULL AND ts.status = 'active'),
               'pending_guests', (SELECT COUNT(*) FROM public.table_sessions ts
                           WHERE ts.table_id = t.id AND ts.ended_at IS NULL AND ts.status = 'pending'),
               'assigned_staff_id', tsv.assigned_staff_id,
               'assigned_name', (SELECT split_part(u.name, ' ', 1)
                                   FROM public.staff st JOIN public.users u ON u.id = st.user_id
                                  WHERE st.id = tsv.assigned_staff_id),
               'is_mine', tsv.assigned_staff_id = v_staff_id,
               'outstanding', (SELECT COALESCE(round(SUM(o.total_amount), 2), 0)
                                 FROM public.orders o
                                WHERE o.table_id = t.id
                                  AND o.status NOT IN ('paid', 'cancelled', 'refunded')
                                  AND o.placed_at >= (
                                    SELECT MIN(ts.started_at) FROM public.table_sessions ts
                                     WHERE ts.table_id = t.id AND ts.ended_at IS NULL)),
               'requests', COALESCE((
                  SELECT jsonb_agg(jsonb_build_object(
                           'id', sr.id,
                           'kind', sr.kind,
                           'status', sr.status,
                           'created_at', sr.created_at,
                           'acknowledged_by', sr.acknowledged_by
                         ) ORDER BY sr.created_at)
                    FROM public.service_requests sr
                   WHERE sr.table_id = t.id AND sr.status IN ('open', 'acknowledged')
               ), '[]'::jsonb)
             ) ORDER BY t.table_number)
      FROM public.tables t
      LEFT JOIN public.sections s ON s.id = t.section_id
      LEFT JOIN public.table_service tsv ON tsv.table_id = t.id
      WHERE t.restaurant_id = p_restaurant_id AND t.is_active
    ), '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.take_table(uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_table(uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.ack_service_request(uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_service_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.waiter_overview(uuid)         TO authenticated;
REVOKE EXECUTE ON FUNCTION public.take_table(uuid)              FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.release_table(uuid)           FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ack_service_request(uuid)     FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_service_request(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.waiter_overview(uuid)         FROM anon, PUBLIC;

COMMIT;
