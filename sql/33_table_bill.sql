-- 33_table_bill.sql  (apply after 32_shared_tables.sql)
-- Table-wide bill for shared tables: table_bill() shows every guest's
-- orders with pay-own / split-equal / one-pays-all amounts, and
-- request_table_bill() tells staff how the table wants to pay. Money still
-- changes hands offline (cash / card terminal) -- no payment provider yet.
-- request_bill keeps its contract but now needs an approved session.
--
-- Idempotent: CREATE OR REPLACE + explicit GRANT/REVOKE.

BEGIN;

-- ---------------------------------------------------------------------
-- Helpers (internal)
-- ---------------------------------------------------------------------

-- Caller's approved, open session at the table, or NULL.
CREATE OR REPLACE FUNCTION public._active_session_id(p_table_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id FROM public.table_sessions
   WHERE table_id = p_table_id AND user_id = auth.uid()
     AND ended_at IS NULL AND status = 'active'
   ORDER BY started_at DESC
   LIMIT 1;
$$;

-- Outstanding orders of the current party at a table: placed since the
-- earliest open approved session started, not paid/cancelled/refunded.
CREATE OR REPLACE FUNCTION public._party_orders(p_table_id uuid)
RETURNS TABLE (order_id uuid, user_id uuid, amount_due numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT o.id, o.user_id,
         GREATEST(o.total_amount - COALESCE((
           SELECT SUM(-lt.delta) * 0.01 FROM public.loyalty_transactions lt
            WHERE lt.order_id = o.id AND lt.reason = 'redeemed'), 0), 0)
    FROM public.orders o
   WHERE o.table_id = p_table_id
     AND o.status NOT IN ('paid', 'cancelled', 'refunded')
     AND o.placed_at >= (
       SELECT MIN(ts.started_at) FROM public.table_sessions ts
        WHERE ts.table_id = p_table_id AND ts.ended_at IS NULL AND ts.status = 'active'
     );
$$;

REVOKE EXECUTE ON FUNCTION public._active_session_id(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public._party_orders(uuid)      FROM anon, authenticated, PUBLIC;

-- ---------------------------------------------------------------------
-- request_bill -- unchanged contract; now needs an approved session.
-- ---------------------------------------------------------------------

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
  v_state         table_state;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_method NOT IN ('card', 'apple', 'google', 'cash', 'reception') THEN
    RAISE EXCEPTION 'invalid_method';
  END IF;

  IF public._active_session_id(p_table_id) IS NULL THEN
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
    WHERE table_id = p_table_id AND user_id = v_uid AND status NOT IN ('paid', 'cancelled', 'refunded')
    FOR UPDATE
  LOOP
    v_order_ids := array_append(v_order_ids, v_order.id);

    SELECT COALESCE(SUM(-delta), 0) * 0.01 INTO v_discount
    FROM public.loyalty_transactions
    WHERE order_id = v_order.id AND reason = 'redeemed';

    v_amount_due := GREATEST(v_order.total_amount - COALESCE(v_discount, 0), 0);
    v_total_due := v_total_due + v_amount_due;

    IF v_amount_due > 0 THEN
      UPDATE public.payments
         SET method = v_pg_method, amount = v_amount_due, user_id = v_uid
       WHERE order_id = v_order.id AND status = 'pending';
      IF NOT FOUND THEN
        INSERT INTO public.payments (order_id, user_id, method, amount, status)
        VALUES (v_order.id, v_uid, v_pg_method, v_amount_due, 'pending');
      END IF;
    END IF;
  END LOOP;

  IF array_length(v_order_ids, 1) IS NOT NULL THEN
    SELECT state INTO v_state FROM public.tables WHERE id = p_table_id;
    IF v_state = 'occupied' THEN
      UPDATE public.tables SET state = 'ordering' WHERE id = p_table_id;
      v_state := 'ordering';
    END IF;
    IF v_state = 'ordering' THEN
      UPDATE public.tables SET state = 'awaiting_payment' WHERE id = p_table_id;
    END IF;

    INSERT INTO public.notifications (user_id, type, payload)
    SELECT s.user_id,
           'bill_requested',
           jsonb_build_object(
             'table_id', p_table_id,
             'restaurant_id', v_restaurant_id,
             'amount_due', v_total_due,
             'method', p_method,
             'mode', 'own',
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

-- ---------------------------------------------------------------------
-- table_bill(p_table_id) -> jsonb
-- { table_number, member_count, table_total, equal_share, my_own,
--   people: [{ name, is_me, is_host, amount_due,
--              items: [{ dish_id, name, name_i18n, quantity, line_total }] }] }
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.table_bill(p_table_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_members      int;
  v_total        numeric;
  v_mine         numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF public._active_session_id(p_table_id) IS NULL THEN
    RAISE EXCEPTION 'no_session';
  END IF;

  SELECT COUNT(DISTINCT user_id) INTO v_members
  FROM public.table_sessions
  WHERE table_id = p_table_id AND ended_at IS NULL AND status = 'active';

  SELECT COALESCE(SUM(amount_due), 0),
         COALESCE(SUM(amount_due) FILTER (WHERE user_id = v_uid), 0)
    INTO v_total, v_mine
  FROM public._party_orders(p_table_id);

  RETURN jsonb_build_object(
    'table_number', (SELECT table_number FROM public.tables WHERE id = p_table_id),
    'member_count', v_members,
    'table_total',  round(v_total, 2),
    'equal_share',  CASE WHEN v_members > 0 THEN round(v_total / v_members, 2) ELSE 0 END,
    'my_own',       round(v_mine, 2),
    'people', COALESCE((
      SELECT jsonb_agg(p ORDER BY (p->>'is_me')::boolean DESC, p->>'name')
      FROM (
        SELECT jsonb_build_object(
                 'name', split_part(u.name, ' ', 1),
                 'is_me', po.user_id = v_uid,
                 'is_host', EXISTS (
                   SELECT 1 FROM public.table_sessions ts
                    WHERE ts.table_id = p_table_id AND ts.user_id = po.user_id
                      AND ts.ended_at IS NULL AND ts.is_host),
                 'amount_due', round(SUM(po.amount_due), 2),
                 'items', (
                   SELECT COALESCE(jsonb_agg(jsonb_build_object(
                            'dish_id', d.id,
                            'name', d.name,
                            'name_i18n', d.name_i18n,
                            'quantity', oi.quantity,
                            'line_total', oi.line_total
                          ) ORDER BY oi.created_at), '[]'::jsonb)
                   FROM public.order_items oi
                   JOIN public.dishes d ON d.id = oi.dish_id
                   WHERE oi.order_id IN (
                     SELECT x.order_id FROM public._party_orders(p_table_id) x
                      WHERE x.user_id = po.user_id)
                 )
               ) AS p
        FROM public._party_orders(p_table_id) po
        JOIN public.users u ON u.id = po.user_id
        GROUP BY po.user_id, u.name
      ) people
    ), '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.table_bill(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.table_bill(uuid) FROM anon, PUBLIC;

-- ---------------------------------------------------------------------
-- request_table_bill(p_table_id, p_method, p_mode) -> jsonb
--   own   : same as request_bill (caller's orders only)
--   equal : bill every party order; staff sees "N ways, X each"
--   all   : caller pays every party order (payments.user_id = caller)
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.request_table_bill(p_table_id uuid, p_method text, p_mode text)
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
  v_total_due     numeric := 0;
  v_order_ids     uuid[] := ARRAY[]::uuid[];
  v_members       int;
  v_state         table_state;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_mode = 'own' THEN
    RETURN public.request_bill(p_table_id, p_method) || jsonb_build_object('mode', 'own');
  END IF;

  IF p_mode IS NULL OR p_mode NOT IN ('equal', 'all') THEN
    RAISE EXCEPTION 'invalid_mode';
  END IF;

  IF p_method NOT IN ('card', 'apple', 'google', 'cash', 'reception') THEN
    RAISE EXCEPTION 'invalid_method';
  END IF;

  IF public._active_session_id(p_table_id) IS NULL THEN
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

  SELECT COUNT(DISTINCT user_id) INTO v_members
  FROM public.table_sessions
  WHERE table_id = p_table_id AND ended_at IS NULL AND status = 'active';

  FOR v_order IN
    SELECT po.order_id, po.user_id, po.amount_due
    FROM public._party_orders(p_table_id) po
    JOIN public.orders o ON o.id = po.order_id
    FOR UPDATE OF o
  LOOP
    v_order_ids := array_append(v_order_ids, v_order.order_id);
    v_total_due := v_total_due + v_order.amount_due;

    IF v_order.amount_due > 0 THEN
      UPDATE public.payments
         SET method = v_pg_method, amount = v_order.amount_due,
             user_id = CASE WHEN p_mode = 'all' THEN v_uid ELSE v_order.user_id END
       WHERE order_id = v_order.order_id AND status = 'pending';
      IF NOT FOUND THEN
        INSERT INTO public.payments (order_id, user_id, method, amount, status)
        VALUES (v_order.order_id,
                CASE WHEN p_mode = 'all' THEN v_uid ELSE v_order.user_id END,
                v_pg_method, v_order.amount_due, 'pending');
      END IF;
    END IF;
  END LOOP;

  IF array_length(v_order_ids, 1) IS NOT NULL THEN
    SELECT state INTO v_state FROM public.tables WHERE id = p_table_id;
    IF v_state = 'occupied' THEN
      UPDATE public.tables SET state = 'ordering' WHERE id = p_table_id;
      v_state := 'ordering';
    END IF;
    IF v_state = 'ordering' THEN
      UPDATE public.tables SET state = 'awaiting_payment' WHERE id = p_table_id;
    END IF;

    INSERT INTO public.notifications (user_id, type, payload)
    SELECT s.user_id,
           'bill_requested',
           jsonb_build_object(
             'table_id', p_table_id,
             'restaurant_id', v_restaurant_id,
             'amount_due', round(v_total_due, 2),
             'method', p_method,
             'mode', p_mode,
             'people', v_members,
             'share', CASE WHEN p_mode = 'equal' AND v_members > 0
                           THEN round(v_total_due / v_members, 2) END,
             'payer', CASE WHEN p_mode = 'all'
                           THEN (SELECT split_part(u.name, ' ', 1) FROM public.users u WHERE u.id = v_uid) END,
             'order_ids', v_order_ids
           )::text
    FROM public.staff s
    WHERE s.restaurant_id = v_restaurant_id AND s.is_active;
  END IF;

  RETURN jsonb_build_object(
    'amount_due', round(v_total_due, 2),
    'order_ids', v_order_ids,
    'mode', p_mode,
    'people', v_members,
    'share', CASE WHEN p_mode = 'equal' AND v_members > 0
                  THEN round(v_total_due / v_members, 2) END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_table_bill(uuid, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.request_table_bill(uuid, text, text) FROM anon, PUBLIC;

COMMIT;
