-- 32b_shared_tables_rpcs.sql  (apply together with, and after, 32_shared_tables.sql)
-- Shared-table RPCs: leave_table (hands the host role on), table_party (who is
-- at the table), respond_join_request (host approves / declines a pending guest).
--
-- Idempotent: CREATE OR REPLACE + explicit GRANT/REVOKE.

BEGIN;

-- ---------------------------------------------------------------------
-- leave_table(p_table_id) -- hands the host role on; if no approved guest
-- is left, pending requests are dropped and the table is released.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.leave_table(p_table_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_state       table_state;
  v_next        uuid;
  v_party_start timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_table_id::text));

  SELECT MIN(started_at) INTO v_party_start
  FROM public.table_sessions
  WHERE table_id = p_table_id AND ended_at IS NULL;

  UPDATE public.table_sessions
     SET ended_at = now(), is_host = false
   WHERE table_id = p_table_id AND user_id = v_uid AND ended_at IS NULL;

  IF NOT EXISTS (
    SELECT 1 FROM public.table_sessions
     WHERE table_id = p_table_id AND ended_at IS NULL AND status = 'active' AND is_host
  ) THEN
    SELECT id INTO v_next
    FROM public.table_sessions
    WHERE table_id = p_table_id AND ended_at IS NULL AND status = 'active'
    ORDER BY started_at
    LIMIT 1;

    IF v_next IS NOT NULL THEN
      UPDATE public.table_sessions SET is_host = true WHERE id = v_next;
    ELSE
      -- Nobody approved is left to let pending guests in.
      UPDATE public.table_sessions
         SET ended_at = now()
       WHERE table_id = p_table_id AND ended_at IS NULL AND status = 'pending';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.table_sessions
    WHERE table_id = p_table_id AND ended_at IS NULL
  ) THEN
    RETURN;
  END IF;

  -- This party still owes money: leave the table state to staff/payment.
  IF EXISTS (
    SELECT 1 FROM public.orders
    WHERE table_id = p_table_id AND status NOT IN ('paid', 'cancelled', 'refunded')
      AND placed_at >= COALESCE(v_party_start, now())
  ) THEN
    RETURN;
  END IF;

  SELECT state INTO v_state FROM public.tables WHERE id = p_table_id;

  IF v_state = 'awaiting_payment' THEN
    UPDATE public.tables SET state = 'cleared' WHERE id = p_table_id;
  ELSIF v_state IN ('occupied', 'reserved') THEN
    UPDATE public.tables SET state = 'free' WHERE id = p_table_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.leave_table(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.leave_table(uuid) FROM anon, PUBLIC;

-- ---------------------------------------------------------------------
-- table_party(p_table_id) -> jsonb
-- Who is at the table (first names only). A pending guest only learns
-- their own status and the host's first name.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.table_party(p_table_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_me    public.table_sessions%ROWTYPE;
  v_host  text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_me
  FROM public.table_sessions
  WHERE table_id = p_table_id AND user_id = v_uid AND ended_at IS NULL
  ORDER BY started_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_session';
  END IF;

  SELECT split_part(u.name, ' ', 1) INTO v_host
  FROM public.table_sessions ts
  JOIN public.users u ON u.id = ts.user_id
  WHERE ts.table_id = p_table_id AND ts.ended_at IS NULL AND ts.is_host
  LIMIT 1;

  IF v_me.status <> 'active' THEN
    RETURN jsonb_build_object(
      'session_id', v_me.id,
      'status', v_me.status,
      'is_host', false,
      'host_name', v_host,
      'members', '[]'::jsonb
    );
  END IF;

  RETURN jsonb_build_object(
    'session_id', v_me.id,
    'status', v_me.status,
    'is_host', v_me.is_host,
    'host_name', v_host,
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'session_id', ts.id,
               'name', split_part(u.name, ' ', 1),
               'is_host', ts.is_host,
               'status', ts.status,
               'is_me', ts.user_id = v_uid
             ) ORDER BY ts.is_host DESC, ts.started_at)
      FROM public.table_sessions ts
      JOIN public.users u ON u.id = ts.user_id
      WHERE ts.table_id = p_table_id AND ts.ended_at IS NULL
        AND (ts.status = 'active' OR v_me.is_host)  -- only the host sees who's waiting
    ), '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.table_party(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.table_party(uuid) FROM anon, PUBLIC;

-- ---------------------------------------------------------------------
-- respond_join_request(p_session_id, p_approve) -> jsonb -- host only.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.respond_join_request(p_session_id uuid, p_approve boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_target  public.table_sessions%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_target FROM public.table_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND OR v_target.ended_at IS NOT NULL OR v_target.status <> 'pending' THEN
    RAISE EXCEPTION 'no_request';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.table_sessions
     WHERE table_id = v_target.table_id AND user_id = v_uid
       AND ended_at IS NULL AND status = 'active' AND is_host
  ) THEN
    RAISE EXCEPTION 'not_host';
  END IF;

  IF p_approve THEN
    UPDATE public.table_sessions SET status = 'active' WHERE id = p_session_id;
  ELSE
    UPDATE public.table_sessions SET status = 'declined', ended_at = now() WHERE id = p_session_id;
  END IF;

  INSERT INTO public.notifications (user_id, type, payload)
  VALUES (
    v_target.user_id,
    CASE WHEN p_approve THEN 'join_approved' ELSE 'join_declined' END,
    jsonb_build_object('table_id', v_target.table_id, 'restaurant_id', v_target.restaurant_id)::text
  );

  RETURN jsonb_build_object('session_id', p_session_id,
                            'status', CASE WHEN p_approve THEN 'active' ELSE 'declined' END);
END;
$$;

GRANT EXECUTE ON FUNCTION public.respond_join_request(uuid, boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.respond_join_request(uuid, boolean) FROM anon, PUBLIC;

COMMIT;
