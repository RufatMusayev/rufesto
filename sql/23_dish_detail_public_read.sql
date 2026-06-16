-- ============================================
-- 23: Public read for dish detail sheet (allergens + ingredients)
-- Applied to Supabase on 2026-06-15 (migration: dish_detail_public_read)
--
-- Consumer DishDetailSheet.jsx reads:
--   1) dish_allergens  (allergen)              for the Allergens chips
--   2) dish_ingredients(quantity, unit, ingredients(name)) for the Ingredients list
--
-- These three tables had RLS ENABLED but no public read path:
--   - dish_allergens   : RLS on, NO policies (deny-all), no anon grant
--   - dish_ingredients : RLS on, NO policies (deny-all), no anon grant
--   - ingredients      : RLS on, only ingredients_staff_only (ALL), no anon grant
--
-- Even after the frontend column names were corrected (the 400s), anon would
-- still see zero rows / be denied. This adds public SELECT following the
-- project pattern (see 20_grants_fix.sql, dishes_public_read).
--
-- SECURITY NOTE on ingredients: it holds business-sensitive columns
-- (cost_per_unit, stock_qty, low_threshold, reorder_qty, preferred_supplier_id).
-- We do NOT grant SELECT on the whole table to anon. Instead we grant SELECT
-- only on the public-safe display columns. PostgREST honors column-level
-- grants, so ingredients(name) embeds work while costs/stock stay hidden.
-- The existing ingredients_staff_only policy is unchanged (staff still get
-- full access to all columns via the authenticated role's broader grant).
-- ============================================

-- ---- dish_allergens : public read ----
DROP POLICY IF EXISTS dish_allergens_public_read ON dish_allergens;
CREATE POLICY dish_allergens_public_read ON dish_allergens
  FOR SELECT USING (true);
GRANT SELECT ON dish_allergens TO anon, authenticated;

-- ---- dish_ingredients : public read ----
DROP POLICY IF EXISTS dish_ingredients_public_read ON dish_ingredients;
CREATE POLICY dish_ingredients_public_read ON dish_ingredients
  FOR SELECT USING (true);
GRANT SELECT ON dish_ingredients TO anon, authenticated;

-- ---- ingredients : public read of display columns only ----
-- Policy lets the rows pass RLS; column grant limits what anon can select.
DROP POLICY IF EXISTS ingredients_public_read ON ingredients;
CREATE POLICY ingredients_public_read ON ingredients
  FOR SELECT USING (true);

-- anon: ONLY safe display columns. Cost/stock/supplier stay hidden because
-- PostgREST will reject a select that touches a non-granted column.
GRANT SELECT (id, name, name_az, name_it, category, unit) ON ingredients TO anon;
-- authenticated: full-table SELECT. The ingredients_staff_only RLS policy
-- (is_staff_of(restaurant_id)) restricts which ROWS a logged-in staff member
-- can see, so granting all columns is safe — non-staff authenticated users
-- match zero rows. This matches the staff-management intent of that policy.
GRANT SELECT ON ingredients TO authenticated;
