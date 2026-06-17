-- ============================================================================
-- Rufesto PRODUCTION baseline — PART 3 (run AFTER _prod_baseline_part2.sql)
-- Functions, views, matviews, indexes, triggers, RLS+policies, realtime, grants
-- ============================================================================

-- ============================ 6. FUNCTIONS =================================
CREATE OR REPLACE FUNCTION public.is_staff_of(p_restaurant_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $function$
  SELECT EXISTS (SELECT 1 FROM staff WHERE restaurant_id = p_restaurant_id AND user_id = auth.uid() AND is_active = true);
$function$;

CREATE OR REPLACE FUNCTION public.is_manager_of(p_restaurant_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $function$
  SELECT EXISTS (SELECT 1 FROM staff WHERE restaurant_id = p_restaurant_id AND user_id = auth.uid() AND role IN ('admin','manager') AND is_active = true);
$function$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $function$
  SELECT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'platform_admin');
$function$;

CREATE OR REPLACE FUNCTION public.staff_role_at(p_restaurant_id uuid)
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $function$
  SELECT role::TEXT FROM staff WHERE restaurant_id = p_restaurant_id AND user_id = auth.uid() AND is_active = true LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.is_restaurant_open(p_restaurant_id uuid)
 RETURNS boolean LANGUAGE plpgsql AS $function$
DECLARE v_open TIME; v_close TIME; v_closed BOOLEAN;
BEGIN
  SELECT open_time, close_time, is_closed INTO v_open, v_close, v_closed
  FROM operating_hours WHERE restaurant_id = p_restaurant_id AND day_of_week = EXTRACT(DOW FROM now())::INT;
  IF NOT FOUND OR v_closed THEN RETURN false; END IF;
  RETURN now()::TIME BETWEEN v_open AND v_close;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  INSERT INTO public.users (id, name, email, phone, age, phone_verified)
  VALUES (NEW.id, COALESCE(NULLIF(NEW.raw_user_meta_data->>'name',''),'New User'), NEW.email,
    NULLIF(NEW.raw_user_meta_data->>'phone',''),
    CASE WHEN NEW.raw_user_meta_data->>'age' IS NOT NULL THEN (NEW.raw_user_meta_data->>'age')::integer ELSE NULL END,
    FALSE)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, email = EXCLUDED.email, phone = COALESCE(EXCLUDED.phone, public.users.phone);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_customer_profile()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
BEGIN
  IF NEW.role = 'customer' THEN
    INSERT INTO customer_profiles (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
    INSERT INTO loyalty_accounts (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_restaurant_defaults()
 RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN INSERT INTO restaurant_settings (restaurant_id) VALUES (NEW.id); RETURN NEW; END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_flag_customer()
 RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.unpaid_count >= 2 OR NEW.no_show_count >= 3 THEN
    NEW.is_flagged = true;
    NEW.flag_reason = CASE WHEN NEW.unpaid_count >= 2 THEN 'Multiple unpaid orders' ELSE 'Repeated no-shows' END;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_loyalty_tier()
 RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  NEW.tier = CASE WHEN NEW.points_earned >= 10000 THEN 'platinum' WHEN NEW.points_earned >= 5000 THEN 'gold' WHEN NEW.points_earned >= 1000 THEN 'silver' ELSE 'bronze' END;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.award_review_points()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  INSERT INTO loyalty_accounts (user_id, points, points_earned) VALUES (NEW.user_id, 10, 10)
  ON CONFLICT (user_id) DO UPDATE SET points = loyalty_accounts.points + 10, points_earned = loyalty_accounts.points_earned + 10, updated_at = now();
  INSERT INTO loyalty_transactions (user_id, delta, reason) VALUES (NEW.user_id, 10, 'review_posted');
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.redeem_credits(p_points integer, p_order_id uuid DEFAULT NULL::uuid)
 RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_uid uuid := auth.uid(); v_updated int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF p_points IS NULL OR p_points <= 0 THEN RAISE EXCEPTION 'invalid points amount'; END IF;
  UPDATE loyalty_accounts SET points = points - p_points, points_spent = points_spent + p_points, updated_at = now()
   WHERE user_id = v_uid AND points >= p_points;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN RAISE EXCEPTION 'insufficient credits'; END IF;
  INSERT INTO loyalty_transactions (user_id, delta, reason, order_id) VALUES (v_uid, -p_points, 'redeemed', p_order_id);
  RETURN round(p_points * 0.01, 2);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_dish_rating()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE v_dish_id UUID := COALESCE(NEW.dish_id, OLD.dish_id);
BEGIN
  UPDATE dishes SET avg_rating = (SELECT ROUND(AVG(rating)::NUMERIC,2) FROM reviews WHERE dish_id = v_dish_id),
    review_count = (SELECT COUNT(*) FROM reviews WHERE dish_id = v_dish_id) WHERE id = v_dish_id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_dish_available()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE v_available BOOLEAN; v_name TEXT; v_price NUMERIC;
BEGIN
  SELECT available, name, price INTO v_available, v_name, v_price FROM dishes WHERE id = NEW.dish_id;
  IF NOT v_available THEN RAISE EXCEPTION 'Dish "%" is currently unavailable', v_name; END IF;
  IF NEW.unit_price = 0 OR NEW.unit_price IS NULL THEN NEW.unit_price := v_price; END IF;
  NEW.line_total := NEW.unit_price * NEW.quantity;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalculate_order_total()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE v_order_id UUID := COALESCE(NEW.order_id, OLD.order_id); v_subtotal NUMERIC; v_tax_rate NUMERIC; v_svc_rate NUMERIC; v_restaurant_id UUID;
BEGIN
  SELECT restaurant_id INTO v_restaurant_id FROM orders WHERE id = v_order_id;
  SELECT COALESCE(tax_rate,18), COALESCE(service_charge,0) INTO v_tax_rate, v_svc_rate FROM restaurant_settings WHERE restaurant_id = v_restaurant_id;
  SELECT COALESCE(SUM(line_total),0) INTO v_subtotal FROM order_items WHERE order_id = v_order_id AND status != 'cancelled';
  UPDATE orders SET subtotal = v_subtotal, tax_amount = ROUND(v_subtotal * v_tax_rate / 100, 2),
    service_charge = ROUND(v_subtotal * v_svc_rate / 100, 2), total_amount = ROUND(v_subtotal * (1 + v_tax_rate/100 + v_svc_rate/100), 2)
  WHERE id = v_order_id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_kds_ticket()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE v_restaurant_id UUID; v_prep_time INT; v_station TEXT; v_category dish_category;
BEGIN
  SELECT restaurant_id INTO v_restaurant_id FROM orders WHERE id = NEW.order_id;
  SELECT prep_time_min, category INTO v_prep_time, v_category FROM dishes WHERE id = NEW.dish_id;
  v_station := CASE v_category WHEN 'alcoholic' THEN 'bar' WHEN 'beverage' THEN 'bar' WHEN 'dessert' THEN 'pastry' WHEN 'starter' THEN 'cold_line' WHEN 'salad' THEN 'cold_line' ELSE 'hot_line' END;
  INSERT INTO kds_tickets (order_item_id, restaurant_id, station, estimated_ready)
  VALUES (NEW.id, v_restaurant_id, v_station, CASE WHEN v_prep_time IS NOT NULL THEN now() + (v_prep_time || ' minutes')::INTERVAL ELSE NULL END);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.deduct_stock_fifo(p_ingredient_id uuid, p_qty numeric, p_reason stock_reason DEFAULT 'order_deduction'::stock_reason, p_order_item_id uuid DEFAULT NULL::uuid)
 RETURNS boolean LANGUAGE plpgsql AS $function$
DECLARE v_remaining NUMERIC := p_qty; v_batch RECORD; v_deduct NUMERIC; v_new_balance NUMERIC;
BEGIN
  SELECT stock_qty INTO v_new_balance FROM ingredients WHERE id = p_ingredient_id FOR UPDATE;
  IF v_new_balance < p_qty THEN RETURN FALSE; END IF;
  FOR v_batch IN SELECT id, remaining_qty FROM ingredient_batches WHERE ingredient_id = p_ingredient_id AND NOT is_depleted AND NOT is_expired ORDER BY received_at ASC FOR UPDATE LOOP
    EXIT WHEN v_remaining <= 0;
    v_deduct := LEAST(v_batch.remaining_qty, v_remaining);
    UPDATE ingredient_batches SET remaining_qty = remaining_qty - v_deduct, is_depleted = (remaining_qty - v_deduct <= 0) WHERE id = v_batch.id;
    v_remaining := v_remaining - v_deduct;
  END LOOP;
  UPDATE ingredients SET stock_qty = stock_qty - p_qty, updated_at = now() WHERE id = p_ingredient_id;
  INSERT INTO stock_log (ingredient_id, changed_by, delta, balance_after, reason, order_item_id)
  VALUES (p_ingredient_id, NULL, -p_qty, v_new_balance - p_qty, p_reason, p_order_item_id);
  RETURN TRUE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_kds_status_change()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE v_dish_id UUID; v_quantity INT; v_ingredient RECORD; v_success BOOLEAN;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.id::TEXT));
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status = 'preparing' AND OLD.status = 'new' THEN NEW.started_at = now(); END IF;
  IF NEW.status = 'done' AND OLD.status != 'done' THEN
    NEW.completed_at = now();
    SELECT dish_id, quantity INTO v_dish_id, v_quantity FROM order_items WHERE id = NEW.order_item_id;
    FOR v_ingredient IN SELECT ingredient_id, quantity * v_quantity AS total_qty FROM dish_ingredients WHERE dish_id = v_dish_id LOOP
      v_success := deduct_stock_fifo(v_ingredient.ingredient_id, v_ingredient.total_qty, 'order_deduction'::stock_reason, NEW.order_item_id);
      IF NOT v_success THEN
        INSERT INTO stock_alerts (restaurant_id, ingredient_id, alert_type, message)
        SELECT i.restaurant_id, i.id, 'out_of_stock', format('"%s" ran out during order fulfillment', i.name) FROM ingredients i WHERE i.id = v_ingredient.ingredient_id;
      END IF;
    END LOOP;
    UPDATE order_items SET status = 'ready' WHERE id = NEW.order_item_id;
    UPDATE orders o SET status = 'ready' WHERE o.id = (SELECT order_id FROM order_items WHERE id = NEW.order_item_id)
      AND NOT EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.status NOT IN ('ready','served','cancelled'));
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_table_state_machine()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE valid_transitions TEXT[][] := ARRAY[ARRAY['free','reserved'],ARRAY['free','occupied'],ARRAY['reserved','occupied'],ARRAY['reserved','free'],ARRAY['occupied','ordering'],ARRAY['occupied','free'],ARRAY['ordering','awaiting_payment'],ARRAY['ordering','ordering'],ARRAY['awaiting_payment','cleared'],ARRAY['awaiting_payment','ordering'],ARRAY['cleared','free'],ARRAY['free','maintenance'],ARRAY['maintenance','free']];
  transition TEXT[]; is_valid BOOLEAN := false;
BEGIN
  IF OLD.state = NEW.state THEN RETURN NEW; END IF;
  FOREACH transition SLICE 1 IN ARRAY valid_transitions LOOP
    IF transition[1] = OLD.state::TEXT AND transition[2] = NEW.state::TEXT THEN is_valid := true; EXIT; END IF;
  END LOOP;
  IF NOT is_valid THEN RAISE EXCEPTION 'Invalid table state transition: % -> %', OLD.state, NEW.state; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_table_state_change()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
BEGIN
  IF OLD.state IS DISTINCT FROM NEW.state THEN
    INSERT INTO table_state_log (table_id, old_state, new_state, changed_by)
    VALUES (NEW.id, OLD.state, NEW.state, NULLIF(current_setting('app.current_user_id', true), '')::UUID);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_table_on_order_change()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
BEGIN
  IF NEW.status = 'submitted' AND OLD.status = 'open' THEN
    NEW.submitted_at = now();
    UPDATE tables SET state = 'ordering' WHERE id = NEW.table_id AND state = 'occupied';
  ELSIF NEW.status = 'paid' THEN
    NEW.completed_at = now();
    UPDATE tables SET state = 'cleared' WHERE id = NEW.table_id;
    UPDATE customer_profiles SET total_visits = total_visits + 1, total_spent = total_spent + NEW.total_amount WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_table_on_booking_change()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
BEGIN
  IF NEW.status = 'confirmed' AND OLD.status != 'confirmed' THEN
    UPDATE tables SET state = 'reserved' WHERE id = NEW.table_id AND state = 'free';
  ELSIF NEW.status = 'seated' AND OLD.status != 'seated' THEN
    UPDATE tables SET state = 'occupied' WHERE id = NEW.table_id; NEW.seated_at = now();
  ELSIF NEW.status IN ('completed') THEN
    NEW.completed_at = now();
  ELSIF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    NEW.cancelled_at = now();
    UPDATE tables t SET state = 'free' WHERE t.id = NEW.table_id AND t.state = 'reserved'
      AND NOT EXISTS (SELECT 1 FROM bookings b2 WHERE b2.table_id = NEW.table_id AND b2.id != NEW.id AND b2.status IN ('confirmed','pending') AND b2.reserved_until > now());
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_booking_time()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE v_open TIME; v_close TIME; v_is_closed BOOLEAN; v_special BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM special_closures WHERE restaurant_id = NEW.restaurant_id AND closed_date = NEW.reserved_from::DATE) INTO v_special;
  IF v_special THEN RAISE EXCEPTION 'Restaurant is closed on %', NEW.reserved_from::DATE; END IF;
  SELECT open_time, close_time, is_closed INTO v_open, v_close, v_is_closed FROM operating_hours WHERE restaurant_id = NEW.restaurant_id AND day_of_week = EXTRACT(DOW FROM NEW.reserved_from)::INT;
  IF NOT FOUND OR v_is_closed THEN RAISE EXCEPTION 'Restaurant is closed on that day'; END IF;
  IF NEW.reserved_from::TIME < v_open OR NEW.reserved_until::TIME > v_close THEN
    RAISE EXCEPTION 'Booking time (% - %) is outside operating hours (% - %)', NEW.reserved_from::TIME, NEW.reserved_until::TIME, v_open, v_close;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_party_size_vs_capacity()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE v_capacity INT;
BEGIN
  SELECT capacity INTO v_capacity FROM tables WHERE id = NEW.table_id;
  IF NEW.party_size > v_capacity THEN RAISE EXCEPTION 'Party size (%) exceeds table capacity (%)', NEW.party_size, v_capacity; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_waitlist_on_cancel()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE v_waitlist_entry RECORD;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    SELECT * INTO v_waitlist_entry FROM waitlist WHERE restaurant_id = NEW.restaurant_id AND status = 'waiting'
      AND tstzrange(preferred_from, preferred_until) && tstzrange(NEW.reserved_from, NEW.reserved_until) ORDER BY created_at ASC LIMIT 1;
    IF FOUND THEN
      UPDATE waitlist SET status = 'notified', notified_at = now() WHERE id = v_waitlist_entry.id;
      INSERT INTO notifications (user_id, type, payload)
      VALUES (v_waitlist_entry.user_id, 'waitlist_available', json_build_object('restaurant_id', NEW.restaurant_id, 'available_from', NEW.reserved_from, 'available_until', NEW.reserved_until)::TEXT);
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_cancel_expired_bookings()
 RETURNS integer LANGUAGE plpgsql AS $function$
DECLARE cancelled_count INT;
BEGIN
  UPDATE bookings b SET status = 'cancelled', cancelled_at = now(), cancel_reason = 'Auto-cancelled: not confirmed in time'
  FROM restaurant_settings rs WHERE b.restaurant_id = rs.restaurant_id AND b.status = 'pending' AND b.created_at < now() - (rs.auto_cancel_minutes || ' minutes')::INTERVAL;
  GET DIAGNOSTICS cancelled_count = ROW_COUNT;
  UPDATE tables t SET state = 'free' WHERE state = 'reserved'
    AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.table_id = t.id AND b.status IN ('confirmed','pending') AND b.reserved_until > now());
  RETURN cancelled_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_no_shows()
 RETURNS integer LANGUAGE plpgsql AS $function$
DECLARE no_show_count INT;
BEGIN
  UPDATE bookings SET status = 'no_show' WHERE status = 'confirmed' AND reserved_until < now() - INTERVAL '30 minutes';
  GET DIAGNOSTICS no_show_count = ROW_COUNT;
  UPDATE customer_profiles cp SET no_show_count = no_show_count + 1 FROM bookings b WHERE b.user_id = cp.user_id AND b.status = 'no_show' AND b.updated_at > now() - INTERVAL '1 minute';
  RETURN no_show_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_available_tables(p_restaurant_id uuid, p_from timestamp with time zone, p_until timestamp with time zone, p_party_size integer)
 RETURNS TABLE(table_id uuid, table_number text, capacity integer, section text, is_outdoor boolean) LANGUAGE plpgsql AS $function$
BEGIN
  RETURN QUERY SELECT t.id, t.table_number, t.capacity, s.name, COALESCE(s.is_outdoor, false)
  FROM tables t LEFT JOIN sections s ON s.id = t.section_id
  WHERE t.restaurant_id = p_restaurant_id AND t.is_active = true AND t.capacity >= p_party_size
    AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.table_id = t.id AND b.status NOT IN ('cancelled') AND tstzrange(b.reserved_from, b.reserved_until, '[)') && tstzrange(p_from, p_until, '[)'))
  ORDER BY t.capacity ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_restaurant_dashboard(p_restaurant_id uuid)
 RETURNS jsonb LANGUAGE plpgsql AS $function$
DECLARE v_result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'today_revenue', COALESCE((SELECT total_revenue FROM daily_revenue WHERE restaurant_id = p_restaurant_id AND revenue_date = CURRENT_DATE), 0),
    'today_orders', COALESCE((SELECT total_orders FROM daily_revenue WHERE restaurant_id = p_restaurant_id AND revenue_date = CURRENT_DATE), 0),
    'active_tables', (SELECT COUNT(*) FROM tables WHERE restaurant_id = p_restaurant_id AND state IN ('occupied','ordering','awaiting_payment')),
    'free_tables', (SELECT COUNT(*) FROM tables WHERE restaurant_id = p_restaurant_id AND state = 'free'),
    'pending_tickets', (SELECT COUNT(*) FROM kds_tickets kt JOIN order_items oi ON oi.id = kt.order_item_id JOIN orders o ON o.id = oi.order_id WHERE o.restaurant_id = p_restaurant_id AND kt.status IN ('new','preparing')),
    'low_stock_items', (SELECT COUNT(*) FROM ingredients WHERE restaurant_id = p_restaurant_id AND stock_qty <= low_threshold),
    'is_open', is_restaurant_open(p_restaurant_id)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.track_campaign(p_campaign_id uuid, p_event text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF p_event = 'impression' THEN UPDATE ad_campaigns SET impressions = impressions + 1 WHERE id = p_campaign_id AND status = 'active';
  ELSIF p_event = 'click' THEN UPDATE ad_campaigns SET clicks = clicks + 1 WHERE id = p_campaign_id AND status = 'active';
  ELSE RAISE EXCEPTION 'invalid event type'; END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_ad_spend()
 RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.spent > NEW.budget THEN RAISE EXCEPTION 'Ad spend (%) cannot exceed budget (%)', NEW.spent, NEW.budget; END IF;
  IF NEW.spent >= NEW.budget AND OLD.spent < OLD.budget THEN NEW.status = 'completed'; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_dish_price_change()
 RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF OLD.price IS DISTINCT FROM NEW.price THEN
    INSERT INTO dish_price_history (dish_id, old_price, new_price, changed_by)
    VALUES (NEW.id, OLD.price, NEW.price, NULLIF(current_setting('app.current_user_id', true), '')::UUID);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.recalculate_dish_allergens(p_dish_id uuid)
 RETURNS void LANGUAGE plpgsql AS $function$
BEGIN
  DELETE FROM dish_allergens WHERE dish_id = p_dish_id;
  INSERT INTO dish_allergens (dish_id, allergen, from_ingredient)
  SELECT DISTINCT di.dish_id, unnest(i.allergens), i.id FROM dish_ingredients di JOIN ingredients i ON i.id = di.ingredient_id
  WHERE di.dish_id = p_dish_id AND i.allergens IS NOT NULL AND array_length(i.allergens, 1) > 0 ON CONFLICT DO NOTHING;
  UPDATE dishes d SET
    is_vegan = NOT EXISTS (SELECT 1 FROM dish_ingredients di JOIN ingredients i ON i.id = di.ingredient_id WHERE di.dish_id = p_dish_id AND i.category IN ('meat','seafood','dairy')),
    is_vegetarian = NOT EXISTS (SELECT 1 FROM dish_ingredients di JOIN ingredients i ON i.id = di.ingredient_id WHERE di.dish_id = p_dish_id AND i.category IN ('meat','seafood'))
  WHERE d.id = p_dish_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_recalculate_allergens_fn()
 RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN PERFORM recalculate_dish_allergens(COALESCE(NEW.dish_id, OLD.dish_id)); RETURN NEW; END;
$function$;

CREATE OR REPLACE FUNCTION public.snapshot_recipe_version()
 RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE v_version INT; v_snapshot JSONB;
BEGIN
  SELECT COALESCE(MAX(version_number),0) + 1 INTO v_version FROM recipe_versions WHERE dish_id = COALESCE(NEW.dish_id, OLD.dish_id);
  SELECT jsonb_agg(jsonb_build_object('ingredient_id', di.ingredient_id, 'name', i.name, 'quantity', di.quantity, 'unit', di.unit, 'is_optional', di.is_optional)) INTO v_snapshot
  FROM dish_ingredients di JOIN ingredients i ON i.id = di.ingredient_id WHERE di.dish_id = COALESCE(NEW.dish_id, OLD.dish_id);
  INSERT INTO recipe_versions (dish_id, version_number, recipe_snapshot) VALUES (COALESCE(NEW.dish_id, OLD.dish_id), v_version, COALESCE(v_snapshot, '[]'::jsonb));
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_stock_threshold()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE v_restaurant_id UUID;
BEGIN
  SELECT restaurant_id INTO v_restaurant_id FROM ingredients WHERE id = NEW.id;
  IF NEW.stock_qty = 0 AND OLD.stock_qty > 0 THEN
    INSERT INTO stock_alerts (restaurant_id, ingredient_id, alert_type, message) VALUES (v_restaurant_id, NEW.id, 'out_of_stock', format('"%s" is out of stock', NEW.name));
  ELSIF NEW.stock_qty <= NEW.low_threshold AND OLD.stock_qty > NEW.low_threshold THEN
    INSERT INTO stock_alerts (restaurant_id, ingredient_id, alert_type, message) VALUES (v_restaurant_id, NEW.id, 'low_stock', format('"%s" is low: %.2f %s remaining', NEW.name, NEW.stock_qty, NEW.unit));
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.deduct_waste_from_stock()
 RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN PERFORM deduct_stock_fifo(NEW.ingredient_id, NEW.quantity, 'waste'::stock_reason); RETURN NEW; END;
$function$;

CREATE OR REPLACE FUNCTION public.expire_batches()
 RETURNS integer LANGUAGE plpgsql AS $function$
DECLARE expired_count INT;
BEGIN
  UPDATE ingredient_batches SET is_expired = true WHERE expiry_date < CURRENT_DATE AND NOT is_expired AND NOT is_depleted;
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  UPDATE ingredients i SET stock_qty = (SELECT COALESCE(SUM(remaining_qty),0) FROM ingredient_batches b WHERE b.ingredient_id = i.id AND NOT b.is_depleted AND NOT b.is_expired)
  WHERE id IN (SELECT DISTINCT ingredient_id FROM ingredient_batches WHERE expiry_date < CURRENT_DATE AND is_expired = true);
  RETURN expired_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
 RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('invoice_number_seq')::TEXT, 5, '0');
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.prevent_order_modification_after_start()
 RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE v_any_preparing BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM kds_tickets kt JOIN order_items oi ON oi.id = kt.order_item_id WHERE oi.order_id = COALESCE(NEW.order_id, OLD.order_id) AND kt.status IN ('preparing','ready','done')) INTO v_any_preparing;
  IF v_any_preparing AND TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Cannot remove item - kitchen has already started preparing this order'; END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_otp_rate_limit()
 RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE recent_count INT;
BEGIN
  SELECT COUNT(*) INTO recent_count FROM otp_log WHERE phone = NEW.phone AND attempted_at > now() - INTERVAL '10 minutes';
  IF recent_count >= 5 THEN RAISE EXCEPTION 'Too many OTP attempts for %. Try again later.', NEW.phone; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.check_overtime()
 RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE v_scheduled_minutes INT;
BEGIN
  IF NEW.clock_out IS NOT NULL AND NEW.clock_in IS NOT NULL THEN
    SELECT EXTRACT(EPOCH FROM (scheduled_end - scheduled_start))::INT / 60 INTO v_scheduled_minutes FROM shifts WHERE id = NEW.shift_id;
    IF NEW.worked_minutes > v_scheduled_minutes + 15 THEN NEW.is_overtime = true; NEW.overtime_minutes = NEW.worked_minutes - v_scheduled_minutes; END IF;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_salary_change()
 RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF OLD.base_salary IS DISTINCT FROM NEW.base_salary THEN
    INSERT INTO salary_history (employee_id, old_salary, new_salary, reason) VALUES (NEW.id, OLD.base_salary, NEW.base_salary, 'salary_update');
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_po_total()
 RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  UPDATE purchase_orders SET total_amount = (SELECT COALESCE(SUM(total_price),0) FROM po_items WHERE purchase_order_id = COALESCE(NEW.purchase_order_id, OLD.purchase_order_id))
  WHERE id = COALESCE(NEW.purchase_order_id, OLD.purchase_order_id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_delivery_qty()
 RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE v_ordered NUMERIC; v_received NUMERIC;
BEGIN
  IF NEW.po_item_id IS NOT NULL THEN
    SELECT ordered_qty, received_qty INTO v_ordered, v_received FROM po_items WHERE id = NEW.po_item_id;
    IF (v_received + NEW.received_qty) > (v_ordered * 1.1) THEN RAISE EXCEPTION 'Delivery qty (%) exceeds ordered qty (%) by more than 10%%', v_received + NEW.received_qty, v_ordered; END IF;
    UPDATE po_items SET received_qty = received_qty + NEW.received_qty WHERE id = NEW.po_item_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.log_supplier_price_change()
 RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF OLD.unit_price IS DISTINCT FROM NEW.unit_price THEN
    INSERT INTO supplier_price_history (supplier_catalog_id, old_price, new_price) VALUES (NEW.id, OLD.unit_price, NEW.unit_price);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_supplier_rating()
 RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  UPDATE suppliers SET rating = (SELECT AVG((quality_rating + timeliness_rating) / 2.0) FROM supplier_reviews WHERE supplier_id = NEW.supplier_id) WHERE id = NEW.supplier_id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_refund_amount()
 RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE v_paid_amount NUMERIC; v_already_refunded NUMERIC;
BEGIN
  SELECT amount INTO v_paid_amount FROM payments WHERE id = NEW.payment_id;
  SELECT COALESCE(SUM(amount),0) INTO v_already_refunded FROM refunds WHERE payment_id = NEW.payment_id AND status != 'failed';
  IF (v_already_refunded + NEW.amount) > v_paid_amount THEN RAISE EXCEPTION 'Refund amount (%) exceeds available amount (% - % already refunded)', NEW.amount, v_paid_amount, v_already_refunded; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_payment_on_refund()
 RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.status = 'processed' AND OLD.status != 'processed' THEN
    UPDATE payments SET refund_amount = refund_amount + NEW.amount, refunded_at = now(),
      status = CASE WHEN refund_amount + NEW.amount >= amount THEN 'refunded'::payment_status ELSE 'partially_refunded'::payment_status END
    WHERE id = NEW.payment_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_split_total()
 RETURNS trigger LANGUAGE plpgsql AS $function$
DECLARE v_split_total NUMERIC; v_order_total NUMERIC;
BEGIN
  SELECT COALESCE(SUM(amount),0) INTO v_split_total FROM payment_splits WHERE order_id = NEW.order_id;
  SELECT total_amount INTO v_order_total FROM orders WHERE id = NEW.order_id;
  IF v_split_total > v_order_total THEN RAISE EXCEPTION 'Split total (%) exceeds order total (%)', v_split_total, v_order_total; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE PROCEDURE public.refresh_analytics()
 LANGUAGE plpgsql AS $procedure$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY daily_revenue;
  REFRESH MATERIALIZED VIEW CONCURRENTLY popular_dishes;
  REFRESH MATERIALIZED VIEW CONCURRENTLY food_cost_analysis;
  REFRESH MATERIALIZED VIEW CONCURRENTLY employee_hours_monthly;
  REFRESH MATERIALIZED VIEW CONCURRENTLY waste_cost_monthly;
END;
$procedure$;

-- ============================ 7. VIEWS =====================================
CREATE OR REPLACE VIEW public.customer_order_history AS
 SELECT o.user_id, o.id AS order_id, r.name AS restaurant_name, r.slug AS restaurant_slug, t.table_number, o.status, o.total_amount, o.placed_at,
    count(oi.id) AS item_count, array_agg(d.name ORDER BY d.name) AS dishes_ordered
   FROM ((((orders o JOIN restaurants r ON ((r.id = o.restaurant_id))) JOIN tables t ON ((t.id = o.table_id))) JOIN order_items oi ON ((oi.order_id = o.id))) JOIN dishes d ON ((d.id = oi.dish_id)))
  GROUP BY o.id, o.user_id, r.name, r.slug, t.table_number, o.status, o.total_amount, o.placed_at;

CREATE OR REPLACE VIEW public.kds_queue AS
 SELECT kt.id AS ticket_id, kt.status, kt.station, kt.priority, kt.estimated_ready, kt.started_at,
    ((EXTRACT(epoch FROM (now() - o.submitted_at)))::integer / 60) AS waiting_minutes,
    CASE WHEN (kt.estimated_ready < now()) THEN true ELSE false END AS is_overdue,
    o.id AS order_id, t.table_number, s.name AS section_name, d.name AS dish_name, oi.quantity, oi.special_request
   FROM (((((kds_tickets kt JOIN order_items oi ON ((oi.id = kt.order_item_id))) JOIN orders o ON ((o.id = oi.order_id))) JOIN tables t ON ((t.id = o.table_id))) LEFT JOIN sections s ON ((s.id = t.section_id))) JOIN dishes d ON ((d.id = oi.dish_id)))
  WHERE (kt.status = ANY (ARRAY['new'::ticket_status,'preparing'::ticket_status])) ORDER BY kt.priority DESC, o.submitted_at;

CREATE OR REPLACE VIEW public.menu_with_stock AS
 SELECT d.id, d.restaurant_id, d.name, d.price, d.category, d.available, d.is_vegan, d.is_vegetarian, d.is_gluten_free, d.avg_rating, d.review_count, d.is_featured,
    min(CASE WHEN (i.low_threshold > (0)::numeric) THEN ((i.stock_qty / i.low_threshold) * (100)::numeric) ELSE (100)::numeric END) AS stock_health_pct,
    bool_or((i.stock_qty <= i.low_threshold)) AS any_ingredient_low,
    ARRAY( SELECT DISTINCT da.allergen FROM dish_allergens da WHERE (da.dish_id = d.id)) AS allergens
   FROM ((dishes d LEFT JOIN dish_ingredients di ON ((di.dish_id = d.id))) LEFT JOIN ingredients i ON ((i.id = di.ingredient_id))) GROUP BY d.id;

CREATE OR REPLACE VIEW public.table_availability AS
 SELECT t.id, t.restaurant_id, t.table_number, t.capacity, t.state, s.name AS section, s.is_outdoor, s.is_smoking,
    b.id AS current_booking_id, b.user_id AS booked_by, b.reserved_from, b.reserved_until, b.party_size,
    ( SELECT min(b2.reserved_until) AS min FROM bookings b2 WHERE ((b2.table_id = t.id) AND (b2.status = ANY (ARRAY['confirmed'::booking_status,'pending'::booking_status])) AND (b2.reserved_until > now()))) AS next_free_at
   FROM ((tables t LEFT JOIN sections s ON ((s.id = t.section_id))) LEFT JOIN bookings b ON (((b.table_id = t.id) AND (b.status = ANY (ARRAY['confirmed'::booking_status,'pending'::booking_status])) AND (b.reserved_from <= now()) AND (b.reserved_until >= now()))))
  WHERE (t.is_active = true);

-- ============================ 8. MATERIALIZED VIEWS ========================
CREATE MATERIALIZED VIEW public.daily_revenue AS
 SELECT o.restaurant_id, (date_trunc('day'::text, o.placed_at))::date AS revenue_date, count(DISTINCT o.id) AS total_orders, count(DISTINCT o.user_id) AS unique_customers,
    sum(o.subtotal) AS gross_revenue, sum(o.tax_amount) AS tax_collected, sum(o.service_charge) AS service_charges, sum(o.total_amount) AS total_revenue,
    sum(p.tip_amount) AS tips_collected, avg(o.total_amount) AS avg_order_value,
    sum(CASE WHEN (p.method = 'cash'::payment_method) THEN p.amount ELSE (0)::numeric END) AS cash_revenue,
    sum(CASE WHEN (p.method = ANY (ARRAY['card'::payment_method,'apple_pay'::payment_method,'google_pay'::payment_method])) THEN p.amount ELSE (0)::numeric END) AS digital_revenue
   FROM (orders o LEFT JOIN payments p ON (((p.order_id = o.id) AND (p.status = 'paid'::payment_status)))) WHERE (o.status = 'paid'::order_status)
  GROUP BY o.restaurant_id, ((date_trunc('day'::text, o.placed_at))::date);

CREATE MATERIALIZED VIEW public.employee_hours_monthly AS
 SELECT a.employee_id, e.restaurant_id, (date_trunc('month'::text, sh.scheduled_start))::date AS month, count(a.id) AS shifts_worked, sum(a.worked_minutes) AS total_minutes, sum(a.overtime_minutes) AS overtime_minutes,
    count(CASE WHEN (a.status = 'absent'::text) THEN 1 ELSE NULL::integer END) AS absences, count(CASE WHEN (a.status = 'late'::text) THEN 1 ELSE NULL::integer END) AS late_arrivals
   FROM ((attendance a JOIN shifts sh ON ((sh.id = a.shift_id))) JOIN employees e ON ((e.id = a.employee_id))) WHERE (a.status = ANY (ARRAY['present'::text,'late'::text,'half_day'::text]))
  GROUP BY a.employee_id, e.restaurant_id, ((date_trunc('month'::text, sh.scheduled_start))::date);

CREATE MATERIALIZED VIEW public.food_cost_analysis AS
 SELECT d.id AS dish_id, d.restaurant_id, d.name AS dish_name, d.price AS selling_price, sum((di.quantity * COALESCE(i.cost_per_unit, (0)::numeric))) AS ingredient_cost,
    CASE WHEN (d.price > (0)::numeric) THEN round(((sum((di.quantity * COALESCE(i.cost_per_unit, (0)::numeric))) / d.price) * (100)::numeric), 2) ELSE (0)::numeric END AS food_cost_pct,
    CASE WHEN ((d.price > (0)::numeric) AND (((sum((di.quantity * COALESCE(i.cost_per_unit, (0)::numeric))) / d.price) * (100)::numeric) > (40)::numeric)) THEN 'high_cost'::text
         WHEN ((d.price > (0)::numeric) AND (((sum((di.quantity * COALESCE(i.cost_per_unit, (0)::numeric))) / d.price) * (100)::numeric) < (20)::numeric)) THEN 'high_margin'::text ELSE 'healthy'::text END AS cost_flag
   FROM ((dishes d JOIN dish_ingredients di ON ((di.dish_id = d.id))) JOIN ingredients i ON ((i.id = di.ingredient_id))) GROUP BY d.id, d.restaurant_id, d.name, d.price;

CREATE MATERIALIZED VIEW public.popular_dishes AS
 SELECT oi.dish_id, d.restaurant_id, d.name, d.category, d.price, d.avg_rating, count(oi.id) AS times_ordered, sum(oi.quantity) AS total_qty_sold, sum(oi.line_total) AS total_revenue, avg(oi.quantity) AS avg_qty_per_order,
    (date_trunc('month'::text, o.placed_at))::date AS month
   FROM ((order_items oi JOIN orders o ON ((o.id = oi.order_id))) JOIN dishes d ON ((d.id = oi.dish_id))) WHERE (o.status = ANY (ARRAY['paid'::order_status,'served'::order_status]))
  GROUP BY oi.dish_id, d.restaurant_id, d.name, d.category, d.price, d.avg_rating, ((date_trunc('month'::text, o.placed_at))::date);

CREATE MATERIALIZED VIEW public.waste_cost_monthly AS
 SELECT wl.restaurant_id, wl.waste_type, (date_trunc('month'::text, wl.recorded_at))::date AS month, count(*) AS incident_count, sum(wl.estimated_cost) AS total_cost, array_agg(DISTINCT i.name) AS top_wasted_ingredients
   FROM (waste_log wl JOIN ingredients i ON ((i.id = wl.ingredient_id))) GROUP BY wl.restaurant_id, wl.waste_type, ((date_trunc('month'::text, wl.recorded_at))::date);

-- ============================ 9. INDEXES ===================================
CREATE INDEX idx_attendance_employee ON public.attendance USING btree (employee_id);
CREATE INDEX idx_batches_expiry ON public.ingredient_batches USING btree (expiry_date) WHERE (NOT is_depleted);
CREATE INDEX idx_batches_fifo ON public.ingredient_batches USING btree (ingredient_id, received_at) WHERE (NOT is_depleted);
CREATE INDEX idx_batches_ingredient ON public.ingredient_batches USING btree (ingredient_id);
CREATE INDEX idx_bookings_restaurant ON public.bookings USING btree (restaurant_id, reserved_from);
CREATE INDEX idx_bookings_status ON public.bookings USING btree (status);
CREATE INDEX idx_bookings_table ON public.bookings USING btree (table_id, reserved_from);
CREATE INDEX idx_bookings_user ON public.bookings USING btree (user_id);
CREATE INDEX idx_customer_flagged ON public.customer_profiles USING btree (is_flagged) WHERE (is_flagged = true);
CREATE INDEX idx_deliveries_po ON public.deliveries USING btree (purchase_order_id);
CREATE INDEX idx_delivery_items_delivery ON public.delivery_items USING btree (delivery_id);
CREATE INDEX idx_dish_ingredients_dish ON public.dish_ingredients USING btree (dish_id);
CREATE INDEX idx_dish_ingredients_ingredient ON public.dish_ingredients USING btree (ingredient_id);
CREATE INDEX idx_dishes_available ON public.dishes USING btree (restaurant_id, available);
CREATE INDEX idx_dishes_category ON public.dishes USING btree (restaurant_id, category);
CREATE INDEX idx_dishes_featured ON public.dishes USING btree (restaurant_id, is_featured);
CREATE INDEX idx_dishes_name_trgm ON public.dishes USING gin (name gin_trgm_ops);
CREATE INDEX idx_dishes_restaurant ON public.dishes USING btree (restaurant_id);
CREATE INDEX idx_employees_department ON public.employees USING btree (department_id);
CREATE INDEX idx_employees_restaurant ON public.employees USING btree (restaurant_id);
CREATE INDEX idx_employees_status ON public.employees USING btree (status);
CREATE INDEX idx_expenses_category ON public.expenses USING btree (restaurant_id, category);
CREATE INDEX idx_expenses_restaurant ON public.expenses USING btree (restaurant_id, expense_date DESC);
CREATE INDEX idx_kds_priority ON public.kds_tickets USING btree (restaurant_id, priority DESC, id);
CREATE INDEX idx_kds_restaurant ON public.kds_tickets USING btree (restaurant_id, status);
CREATE INDEX idx_kds_status ON public.kds_tickets USING btree (status);
CREATE INDEX idx_leave_requests_employee ON public.leave_requests USING btree (employee_id);
CREATE INDEX idx_leave_requests_status ON public.leave_requests USING btree (status);
CREATE INDEX idx_likes_target ON public.likes USING btree (target_type, target_id);
CREATE INDEX idx_likes_user ON public.likes USING btree (user_id);
CREATE INDEX idx_notifications_user ON public.notifications USING btree (user_id, read);
CREATE INDEX idx_order_items_dish ON public.order_items USING btree (dish_id);
CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id);
CREATE INDEX idx_orders_placed ON public.orders USING btree (placed_at DESC);
CREATE INDEX idx_orders_restaurant ON public.orders USING btree (restaurant_id);
CREATE INDEX idx_orders_status ON public.orders USING btree (status);
CREATE INDEX idx_orders_table ON public.orders USING btree (table_id, status);
CREATE INDEX idx_orders_user ON public.orders USING btree (user_id);
CREATE INDEX idx_otp_log_phone_time ON public.otp_log USING btree (phone, attempted_at);
CREATE INDEX idx_payments_order ON public.payments USING btree (order_id);
CREATE INDEX idx_payments_provider_ref ON public.payments USING btree (provider_ref) WHERE (provider_ref IS NOT NULL);
CREATE INDEX idx_payments_status ON public.payments USING btree (status);
CREATE INDEX idx_payments_user ON public.payments USING btree (user_id);
CREATE INDEX idx_po_restaurant ON public.purchase_orders USING btree (restaurant_id);
CREATE INDEX idx_po_status ON public.purchase_orders USING btree (status);
CREATE INDEX idx_po_supplier ON public.purchase_orders USING btree (supplier_id);
CREATE INDEX idx_restaurants_owner ON public.restaurants USING btree (owner_id);
CREATE INDEX idx_restaurants_slug ON public.restaurants USING btree (slug);
CREATE INDEX idx_restaurants_status ON public.restaurants USING btree (status);
CREATE INDEX idx_review_comments_review ON public.review_comments USING btree (review_id, created_at);
CREATE INDEX idx_reviews_dish ON public.reviews USING btree (dish_id);
CREATE INDEX idx_reviews_rating ON public.reviews USING btree (dish_id, rating);
CREATE INDEX idx_reviews_user ON public.reviews USING btree (user_id);
CREATE INDEX idx_saved_dishes_dish ON public.saved_dishes USING btree (dish_id);
CREATE INDEX idx_saved_dishes_user ON public.saved_dishes USING btree (user_id);
CREATE INDEX idx_sections_restaurant ON public.sections USING btree (restaurant_id);
CREATE INDEX idx_shifts_employee ON public.shifts USING btree (employee_id);
CREATE INDEX idx_shifts_restaurant_date ON public.shifts USING btree (restaurant_id, scheduled_start);
CREATE INDEX idx_shifts_status ON public.shifts USING btree (status);
CREATE INDEX idx_stock_log_date ON public.stock_log USING btree (logged_at);
CREATE INDEX idx_stock_log_ingredient ON public.stock_log USING btree (ingredient_id, logged_at DESC);
CREATE INDEX idx_stock_log_reason ON public.stock_log USING btree (reason);
CREATE INDEX idx_suppliers_name_trgm ON public.suppliers USING gin (name gin_trgm_ops);
CREATE INDEX idx_tables_qr_token ON public.tables USING btree (qr_code_token);
CREATE INDEX idx_tables_restaurant ON public.tables USING btree (restaurant_id);
CREATE INDEX idx_tables_state ON public.tables USING btree (restaurant_id, state);
CREATE INDEX idx_user_follows_restaurant ON public.user_follows USING btree (restaurant_id);
CREATE INDEX idx_user_follows_user ON public.user_follows USING btree (user_id);
CREATE INDEX idx_user_sessions_expires ON public.user_sessions USING btree (expires_at);
CREATE INDEX idx_user_sessions_user ON public.user_sessions USING btree (user_id);
CREATE INDEX idx_users_phone ON public.users USING btree (phone);
CREATE INDEX idx_users_phone_verified ON public.users USING btree (phone_verified);
CREATE INDEX idx_users_role ON public.users USING btree (role);
CREATE INDEX idx_waitlist_restaurant ON public.waitlist USING btree (restaurant_id, preferred_from);
CREATE INDEX idx_waitlist_status ON public.waitlist USING btree (status);
CREATE INDEX idx_waste_log_restaurant ON public.waste_log USING btree (restaurant_id, recorded_at DESC);
CREATE INDEX idx_waste_log_type ON public.waste_log USING btree (waste_type);
CREATE UNIQUE INDEX idx_dish_primary_photo ON public.dish_photos USING btree (dish_id) WHERE (is_primary = true);
CREATE UNIQUE INDEX tables_access_code_key ON public.tables USING btree (access_code) WHERE (access_code IS NOT NULL);
-- matview unique indexes (required for REFRESH CONCURRENTLY)
CREATE UNIQUE INDEX idx_daily_revenue ON public.daily_revenue USING btree (restaurant_id, revenue_date);
CREATE UNIQUE INDEX idx_emp_hours_monthly ON public.employee_hours_monthly USING btree (employee_id, month);
CREATE UNIQUE INDEX idx_food_cost_analysis ON public.food_cost_analysis USING btree (dish_id);
CREATE UNIQUE INDEX idx_popular_dishes ON public.popular_dishes USING btree (dish_id, month);
CREATE INDEX idx_popular_dishes_revenue ON public.popular_dishes USING btree (restaurant_id, total_revenue DESC);
CREATE UNIQUE INDEX idx_waste_cost_monthly ON public.waste_cost_monthly USING btree (restaurant_id, waste_type, month);

-- ============================ 10. TRIGGERS =================================
CREATE TRIGGER trg_auto_flag_customer BEFORE UPDATE ON public.customer_profiles FOR EACH ROW EXECUTE FUNCTION auto_flag_customer();
CREATE TRIGGER trg_award_review_points AFTER INSERT ON public.reviews FOR EACH ROW EXECUTE FUNCTION award_review_points();
CREATE TRIGGER trg_bookings_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_check_dish_available BEFORE INSERT ON public.order_items FOR EACH ROW EXECUTE FUNCTION check_dish_available();
CREATE TRIGGER trg_check_overtime BEFORE INSERT OR UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION check_overtime();
CREATE TRIGGER trg_check_party_size BEFORE INSERT OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION check_party_size_vs_capacity();
CREATE TRIGGER trg_check_stock_threshold AFTER UPDATE OF stock_qty ON public.ingredients FOR EACH ROW EXECUTE FUNCTION check_stock_threshold();
CREATE TRIGGER trg_create_customer_profile AFTER INSERT ON public.users FOR EACH ROW EXECUTE FUNCTION create_customer_profile();
CREATE TRIGGER trg_create_kds_ticket AFTER INSERT ON public.order_items FOR EACH ROW EXECUTE FUNCTION create_kds_ticket();
CREATE TRIGGER trg_create_restaurant_defaults AFTER INSERT ON public.restaurants FOR EACH ROW EXECUTE FUNCTION create_restaurant_defaults();
CREATE TRIGGER trg_customer_profiles_updated_at BEFORE UPDATE ON public.customer_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_deduct_waste AFTER INSERT ON public.waste_log FOR EACH ROW EXECUTE FUNCTION deduct_waste_from_stock();
CREATE TRIGGER trg_dishes_updated_at BEFORE UPDATE ON public.dishes FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_employees_updated_at BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_generate_invoice_number BEFORE INSERT ON public.invoices FOR EACH ROW EXECUTE FUNCTION generate_invoice_number();
CREATE TRIGGER trg_ingredients_updated_at BEFORE UPDATE ON public.ingredients FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_kds_status_change BEFORE UPDATE OF status ON public.kds_tickets FOR EACH ROW EXECUTE FUNCTION handle_kds_status_change();
CREATE TRIGGER trg_log_dish_price AFTER UPDATE OF price ON public.dishes FOR EACH ROW EXECUTE FUNCTION log_dish_price_change();
CREATE TRIGGER trg_log_salary_change AFTER UPDATE OF base_salary ON public.employees FOR EACH ROW EXECUTE FUNCTION log_salary_change();
CREATE TRIGGER trg_log_supplier_price AFTER UPDATE OF unit_price ON public.supplier_catalog FOR EACH ROW EXECUTE FUNCTION log_supplier_price_change();
CREATE TRIGGER trg_log_table_state AFTER UPDATE OF state ON public.tables FOR EACH ROW EXECUTE FUNCTION log_table_state_change();
CREATE TRIGGER trg_loyalty_updated_at BEFORE UPDATE ON public.loyalty_accounts FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_notify_waitlist AFTER UPDATE OF status ON public.bookings FOR EACH ROW EXECUTE FUNCTION notify_waitlist_on_cancel();
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_otp_rate_limit BEFORE INSERT ON public.otp_log FOR EACH ROW EXECUTE FUNCTION check_otp_rate_limit();
CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_po_updated_at BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_prevent_order_modification BEFORE DELETE ON public.order_items FOR EACH ROW EXECUTE FUNCTION prevent_order_modification_after_start();
CREATE TRIGGER trg_recalculate_allergens AFTER INSERT OR DELETE OR UPDATE ON public.dish_ingredients FOR EACH ROW EXECUTE FUNCTION trg_recalculate_allergens_fn();
CREATE TRIGGER trg_recalculate_order_total AFTER INSERT OR DELETE OR UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION recalculate_order_total();
CREATE TRIGGER trg_restaurant_settings_updated_at BEFORE UPDATE ON public.restaurant_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_restaurants_updated_at BEFORE UPDATE ON public.restaurants FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_snapshot_recipe AFTER INSERT OR DELETE OR UPDATE ON public.dish_ingredients FOR EACH ROW EXECUTE FUNCTION snapshot_recipe_version();
CREATE TRIGGER trg_supplier_catalog_updated_at BEFORE UPDATE ON public.supplier_catalog FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_sync_table_on_booking BEFORE UPDATE OF status ON public.bookings FOR EACH ROW EXECUTE FUNCTION sync_table_on_booking_change();
CREATE TRIGGER trg_sync_table_on_order BEFORE UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION sync_table_on_order_change();
CREATE TRIGGER trg_table_state_machine BEFORE UPDATE OF state ON public.tables FOR EACH ROW EXECUTE FUNCTION enforce_table_state_machine();
CREATE TRIGGER trg_tables_updated_at BEFORE UPDATE ON public.tables FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_update_dish_rating AFTER INSERT OR DELETE OR UPDATE ON public.reviews FOR EACH ROW EXECUTE FUNCTION update_dish_rating();
CREATE TRIGGER trg_update_loyalty_tier BEFORE UPDATE ON public.loyalty_accounts FOR EACH ROW EXECUTE FUNCTION update_loyalty_tier();
CREATE TRIGGER trg_update_payment_on_refund AFTER UPDATE OF status ON public.refunds FOR EACH ROW EXECUTE FUNCTION update_payment_on_refund();
CREATE TRIGGER trg_update_po_total AFTER INSERT OR DELETE OR UPDATE ON public.po_items FOR EACH ROW EXECUTE FUNCTION update_po_total();
CREATE TRIGGER trg_update_supplier_rating AFTER INSERT OR UPDATE ON public.supplier_reviews FOR EACH ROW EXECUTE FUNCTION update_supplier_rating();
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_validate_ad_spend BEFORE UPDATE OF spent ON public.ad_campaigns FOR EACH ROW EXECUTE FUNCTION validate_ad_spend();
CREATE TRIGGER trg_validate_booking_time BEFORE INSERT OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION validate_booking_time();
CREATE TRIGGER trg_validate_delivery_qty BEFORE INSERT ON public.delivery_items FOR EACH ROW EXECUTE FUNCTION validate_delivery_qty();
CREATE TRIGGER trg_validate_refund BEFORE INSERT ON public.refunds FOR EACH ROW EXECUTE FUNCTION validate_refund_amount();
CREATE TRIGGER trg_validate_split_total AFTER INSERT OR UPDATE ON public.payment_splits FOR EACH ROW EXECUTE FUNCTION validate_split_total();
-- auth signup trigger (creates public.users row on auth signup)
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

-- ============================ 11. RLS + POLICIES ===========================
ALTER TABLE public.ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dish_allergens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dish_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dish_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dish_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredient_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kds_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operating_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_dishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.special_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.table_state_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tip_distribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waste_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert feedback" ON public.feedback AS PERMISSIVE FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Authenticated users can insert notifications" ON public.notifications AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() IS NOT NULL));
CREATE POLICY "Authenticated users can update table state" ON public.tables AS PERMISSIVE FOR UPDATE TO public USING (true) WITH CHECK ((state = ANY (ARRAY['occupied'::table_state,'ordering'::table_state,'awaiting_payment'::table_state,'cleared'::table_state])));
CREATE POLICY "Staff can view feedback" ON public.feedback AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1 FROM staff WHERE (staff.user_id = auth.uid()))));
CREATE POLICY "Users can delete own follows" ON public.user_follows AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can delete own likes" ON public.likes AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can insert own follows" ON public.user_follows AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can insert own likes" ON public.likes AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can insert own payments" ON public.payments AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can insert own reviews" ON public.reviews AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = auth.uid()));
CREATE POLICY "Users can save dishes" ON public.saved_dishes AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY "Users can unsave dishes" ON public.saved_dishes AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view all likes" ON public.likes AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY "Users can view own follows" ON public.user_follows AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY "Users can view own payments" ON public.payments AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY "Users can view own saved dishes" ON public.saved_dishes AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = user_id));
CREATE POLICY ad_campaigns_public_read ON public.ad_campaigns AS PERMISSIVE FOR SELECT TO public USING (((status = 'active'::text) AND ((now() >= starts_at) AND (now() <= ends_at))));
CREATE POLICY ad_campaigns_staff_all ON public.ad_campaigns AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1 FROM staff s WHERE ((s.user_id = auth.uid()) AND (s.restaurant_id = ad_campaigns.restaurant_id) AND s.is_active)))) WITH CHECK ((EXISTS ( SELECT 1 FROM staff s WHERE ((s.user_id = auth.uid()) AND (s.restaurant_id = ad_campaigns.restaurant_id) AND s.is_active))));
CREATE POLICY bookings_customer_cancel ON public.bookings AS PERMISSIVE FOR UPDATE TO public USING (((user_id = auth.uid()) AND (status = ANY (ARRAY['pending'::booking_status,'confirmed'::booking_status]))));
CREATE POLICY bookings_customer_create ON public.bookings AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = auth.uid()));
CREATE POLICY bookings_customer_read ON public.bookings AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY bookings_staff_read ON public.bookings AS PERMISSIVE FOR SELECT TO public USING (is_staff_of(restaurant_id));
CREATE POLICY bookings_staff_update ON public.bookings AS PERMISSIVE FOR UPDATE TO public USING (is_staff_of(restaurant_id));
CREATE POLICY customer_profiles_own ON public.customer_profiles AS PERMISSIVE FOR ALL TO public USING ((user_id = auth.uid()));
CREATE POLICY dish_allergens_public_read ON public.dish_allergens AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY dish_ingredients_public_read ON public.dish_ingredients AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY dish_photos_public_read ON public.dish_photos AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY dish_photos_staff_write ON public.dish_photos AS PERMISSIVE FOR ALL TO public USING (is_manager_of(( SELECT dishes.restaurant_id FROM dishes WHERE (dishes.id = dish_photos.dish_id))));
CREATE POLICY dishes_public_read ON public.dishes AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY dishes_staff_read ON public.dishes AS PERMISSIVE FOR SELECT TO public USING (is_staff_of(restaurant_id));
CREATE POLICY dishes_staff_write ON public.dishes AS PERMISSIVE FOR ALL TO public USING (is_manager_of(restaurant_id));
CREATE POLICY employees_manager_read ON public.employees AS PERMISSIVE FOR SELECT TO public USING (is_manager_of(restaurant_id));
CREATE POLICY employees_manager_write ON public.employees AS PERMISSIVE FOR ALL TO public USING (is_manager_of(restaurant_id));
CREATE POLICY employees_self_read ON public.employees AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY expenses_manager_only ON public.expenses AS PERMISSIVE FOR ALL TO public USING (is_manager_of(restaurant_id));
CREATE POLICY ingredients_public_read ON public.ingredients AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY ingredients_staff_only ON public.ingredients AS PERMISSIVE FOR ALL TO public USING (is_staff_of(restaurant_id));
CREATE POLICY kds_kitchen_read ON public.kds_tickets AS PERMISSIVE FOR SELECT TO public USING (is_staff_of(restaurant_id));
CREATE POLICY kds_kitchen_update ON public.kds_tickets AS PERMISSIVE FOR UPDATE TO public USING (is_staff_of(restaurant_id));
CREATE POLICY loyalty_accounts_own_read ON public.loyalty_accounts AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY loyalty_transactions_own_read ON public.loyalty_transactions AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY menu_sections_public_read ON public.menu_sections AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY menus_public_read ON public.menus AS PERMISSIVE FOR SELECT TO public USING ((is_active = true));
CREATE POLICY notifications_own ON public.notifications AS PERMISSIVE FOR ALL TO public USING ((user_id = auth.uid()));
CREATE POLICY notifications_own_read ON public.notifications AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY operating_hours_public_read ON public.operating_hours AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY order_items_customer_create ON public.order_items AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1 FROM orders WHERE ((orders.id = order_items.order_id) AND (orders.user_id = auth.uid())))));
CREATE POLICY order_items_customer_read ON public.order_items AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1 FROM orders WHERE ((orders.id = order_items.order_id) AND (orders.user_id = auth.uid())))));
CREATE POLICY order_items_staff_read ON public.order_items AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1 FROM orders o WHERE ((o.id = order_items.order_id) AND is_staff_of(o.restaurant_id)))));
CREATE POLICY orders_customer_create ON public.orders AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = auth.uid()));
CREATE POLICY orders_customer_read ON public.orders AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY orders_staff_read ON public.orders AS PERMISSIVE FOR SELECT TO public USING (is_staff_of(restaurant_id));
CREATE POLICY orders_staff_update ON public.orders AS PERMISSIVE FOR UPDATE TO public USING (is_staff_of(restaurant_id));
CREATE POLICY payments_customer_read ON public.payments AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY payments_staff_read ON public.payments AS PERMISSIVE FOR SELECT TO public USING (is_staff_of(( SELECT orders.restaurant_id FROM orders WHERE (orders.id = payments.order_id))));
CREATE POLICY payroll_manager_only ON public.payroll_runs AS PERMISSIVE FOR ALL TO public USING (is_manager_of(restaurant_id));
CREATE POLICY po_manager_only ON public.purchase_orders AS PERMISSIVE FOR ALL TO public USING (is_manager_of(restaurant_id));
CREATE POLICY refunds_manager_only ON public.refunds AS PERMISSIVE FOR ALL TO public USING (is_manager_of(( SELECT orders.restaurant_id FROM orders WHERE (orders.id = refunds.order_id))));
CREATE POLICY restaurants_admin_all ON public.restaurants AS PERMISSIVE FOR ALL TO public USING (is_platform_admin());
CREATE POLICY restaurants_owner_update ON public.restaurants AS PERMISSIVE FOR UPDATE TO public USING ((owner_id = auth.uid()));
CREATE POLICY restaurants_public_read ON public.restaurants AS PERMISSIVE FOR SELECT TO public USING ((status = 'active'::text));
CREATE POLICY review_comments_delete ON public.review_comments AS PERMISSIVE FOR DELETE TO public USING ((auth.uid() = user_id));
CREATE POLICY review_comments_insert ON public.review_comments AS PERMISSIVE FOR INSERT TO public WITH CHECK ((auth.uid() = user_id));
CREATE POLICY review_comments_select ON public.review_comments AS PERMISSIVE FOR SELECT TO public USING ((is_flagged = false));
CREATE POLICY reviews_customer_update ON public.reviews AS PERMISSIVE FOR UPDATE TO public USING ((user_id = auth.uid()));
CREATE POLICY reviews_customer_write ON public.reviews AS PERMISSIVE FOR INSERT TO public WITH CHECK ((user_id = auth.uid()));
CREATE POLICY reviews_public_read ON public.reviews AS PERMISSIVE FOR SELECT TO public USING ((NOT is_flagged));
CREATE POLICY salary_history_manager_only ON public.salary_history AS PERMISSIVE FOR SELECT TO public USING (is_manager_of(( SELECT employees.restaurant_id FROM employees WHERE (employees.id = salary_history.employee_id))));
CREATE POLICY sections_public_read ON public.sections AS PERMISSIVE FOR SELECT TO public USING (true);
CREATE POLICY staff_read_own ON public.staff AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));
CREATE POLICY stock_log_staff_only ON public.stock_log AS PERMISSIVE FOR SELECT TO public USING (is_staff_of(( SELECT ingredients.restaurant_id FROM ingredients WHERE (ingredients.id = stock_log.ingredient_id))));
CREATE POLICY supplier_catalog_manager ON public.supplier_catalog AS PERMISSIVE FOR ALL TO public USING ((is_platform_admin() OR (auth.uid() IS NOT NULL)));
CREATE POLICY suppliers_staff_read ON public.suppliers AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));
CREATE POLICY tables_public_read ON public.tables AS PERMISSIVE FOR SELECT TO public USING ((is_active = true));
CREATE POLICY tables_staff_update ON public.tables AS PERMISSIVE FOR UPDATE TO public USING (is_staff_of(restaurant_id));
CREATE POLICY users_read_own ON public.users AS PERMISSIVE FOR SELECT TO public USING (((id = auth.uid()) OR is_platform_admin()));
CREATE POLICY users_update_own ON public.users AS PERMISSIVE FOR UPDATE TO public USING ((id = auth.uid()));

-- ============================ 12. REALTIME PUBLICATION =====================
ALTER PUBLICATION supabase_realtime ADD TABLE public.kds_tickets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tables;

-- ============================ 13. GRANTS ===================================
-- table grants
GRANT INSERT ON public.feedback TO anon;
GRANT SELECT ON public.ad_campaigns TO anon;
GRANT SELECT ON public.dish_allergens TO anon;
GRANT SELECT ON public.dish_ingredients TO anon;
GRANT SELECT ON public.dish_photos TO anon;
GRANT SELECT ON public.dishes TO anon;
GRANT SELECT ON public.likes TO anon;
GRANT SELECT ON public.menu_sections TO anon;
GRANT SELECT ON public.menus TO anon;
GRANT SELECT ON public.operating_hours TO anon;
GRANT SELECT ON public.restaurants TO anon;
GRANT SELECT ON public.review_comments TO anon;
GRANT SELECT ON public.reviews TO anon;
GRANT SELECT ON public.sections TO anon;
GRANT SELECT ON public.special_closures TO anon;
GRANT SELECT ON public.staff TO anon;
GRANT SELECT ON public.tables TO anon;
GRANT SELECT ON public.user_follows TO anon;
GRANT SELECT ON public.users TO anon;
GRANT DELETE, INSERT, SELECT ON public.likes TO authenticated;
GRANT DELETE, INSERT, SELECT ON public.review_comments TO authenticated;
GRANT DELETE, INSERT, SELECT ON public.user_follows TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.dish_photos TO authenticated;
GRANT DELETE, INSERT, SELECT, UPDATE ON public.saved_dishes TO authenticated;
GRANT INSERT, SELECT ON public.feedback TO authenticated;
GRANT INSERT, SELECT, UPDATE ON public.ad_campaigns TO authenticated;
GRANT INSERT, SELECT, UPDATE ON public.bookings TO authenticated;
GRANT INSERT, SELECT, UPDATE ON public.customer_profiles TO authenticated;
GRANT INSERT, SELECT, UPDATE ON public.notifications TO authenticated;
GRANT INSERT, SELECT, UPDATE ON public.order_items TO authenticated;
GRANT INSERT, SELECT, UPDATE ON public.orders TO authenticated;
GRANT INSERT, SELECT, UPDATE ON public.reviews TO authenticated;
GRANT INSERT, SELECT, UPDATE ON public.users TO authenticated;
GRANT SELECT ON public.dish_allergens TO authenticated;
GRANT SELECT ON public.dish_ingredients TO authenticated;
GRANT SELECT ON public.ingredients TO authenticated;
GRANT SELECT ON public.loyalty_accounts TO authenticated;
GRANT SELECT ON public.loyalty_transactions TO authenticated;
GRANT SELECT ON public.menu_sections TO authenticated;
GRANT SELECT ON public.menus TO authenticated;
GRANT SELECT ON public.operating_hours TO authenticated;
GRANT SELECT ON public.restaurants TO authenticated;
GRANT SELECT ON public.sections TO authenticated;
GRANT SELECT ON public.special_closures TO authenticated;
GRANT SELECT ON public.staff TO authenticated;
GRANT SELECT ON public.waitlist TO authenticated;
GRANT SELECT, UPDATE ON public.dishes TO authenticated;
GRANT SELECT, UPDATE ON public.kds_tickets TO authenticated;
GRANT SELECT, UPDATE ON public.tables TO authenticated;
-- function execute grants (RPCs used by the app)
GRANT EXECUTE ON FUNCTION public.track_campaign(p_campaign_id uuid, p_event text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.redeem_credits(p_points integer, p_order_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_restaurant_dashboard(p_restaurant_id uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_available_tables(p_restaurant_id uuid, p_from timestamp with time zone, p_until timestamp with time zone, p_party_size integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_restaurant_open(p_restaurant_id uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff_of(p_restaurant_id uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_manager_of(p_restaurant_id uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.staff_role_at(p_restaurant_id uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.deduct_stock_fifo(p_ingredient_id uuid, p_qty numeric, p_reason stock_reason, p_order_item_id uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalculate_dish_allergens(p_dish_id uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auto_cancel_expired_bookings() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_no_shows() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.expire_batches() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_analytics() TO anon, authenticated, service_role;

-- ============================ 14. POST-APPLY ===============================
-- After data exists, refresh analytics matviews once (they start empty):
--   CALL public.refresh_analytics();
-- Done. Verify object counts match preview (67 tables, ~90 policies, ~50 funcs).
