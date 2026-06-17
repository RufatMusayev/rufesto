-- ============================================================================
-- Rufesto PRODUCTION baseline schema  (clone of preview qqwvtuckljwvwrvyrjbn)
-- Target: prod Supabase project bjohnoaezfmrgunvjixt (rufesto.com / r_rufesto)
-- HOW TO APPLY: prod Supabase Dashboard -> SQL Editor -> paste this whole file
--   -> Run.  No MCP / no DB password needed.  NO seed data (fresh real launch).
-- Generated 2026-06-17 from live preview DDL, dependency-ordered.
-- ============================================================================

-- ============================ 1. EXTENSIONS =================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- ============================ 2. SEQUENCES ==================================
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq;

-- ============================ 3. ENUM TYPES =================================
CREATE TYPE public.allergen_type AS ENUM ('gluten','crustaceans','eggs','fish','peanuts','soybeans','milk','nuts','celery','mustard','sesame','sulphites','lupin','molluscs');
CREATE TYPE public.booking_status AS ENUM ('pending','confirmed','seated','completed','cancelled','no_show');
CREATE TYPE public.dish_category AS ENUM ('starter','soup','salad','main','side','dessert','beverage','alcoholic','kids');
CREATE TYPE public.employment_status AS ENUM ('active','on_leave','terminated','probation');
CREATE TYPE public.order_status AS ENUM ('open','submitted','preparing','ready','served','paid','cancelled','refunded');
CREATE TYPE public.payment_method AS ENUM ('apple_pay','google_pay','card','cash','reception');
CREATE TYPE public.payment_status AS ENUM ('pending','paid','failed','refunded','partially_refunded');
CREATE TYPE public.po_status AS ENUM ('draft','sent','partially_received','received','cancelled');
CREATE TYPE public.shift_status AS ENUM ('scheduled','in_progress','completed','missed','cancelled');
CREATE TYPE public.staff_role AS ENUM ('admin','manager','kitchen','waiter','cashier','host');
CREATE TYPE public.stock_reason AS ENUM ('order_deduction','manual_entry','delivery','waste','spoilage','correction','prep_use','theft');
CREATE TYPE public.table_state AS ENUM ('free','reserved','occupied','ordering','awaiting_payment','cleared','maintenance');
CREATE TYPE public.ticket_status AS ENUM ('new','preparing','ready','done','cancelled');
CREATE TYPE public.user_role AS ENUM ('customer','restaurant_owner','platform_admin');

-- ============================ 4. TABLES =====================================
CREATE TABLE IF NOT EXISTS public.users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  phone_verified boolean NOT NULL DEFAULT false,
  email text,
  profile_photo text,
  role user_role NOT NULL DEFAULT 'customer'::user_role,
  is_banned boolean NOT NULL DEFAULT false,
  ban_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  age integer
);
CREATE TABLE IF NOT EXISTS public.customer_profiles (
  user_id uuid NOT NULL,
  preferred_language text NOT NULL DEFAULT 'az'::text,
  dietary_prefs text[],
  allergens allergen_type[],
  birthday date,
  notes text,
  no_show_count integer NOT NULL DEFAULT 0,
  unpaid_count integer NOT NULL DEFAULT 0,
  total_visits integer NOT NULL DEFAULT 0,
  total_spent numeric(12,2) NOT NULL DEFAULT 0,
  is_flagged boolean NOT NULL DEFAULT false,
  flag_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.loyalty_accounts (
  user_id uuid NOT NULL,
  points integer NOT NULL DEFAULT 0,
  tier text NOT NULL DEFAULT 'bronze'::text,
  points_earned integer NOT NULL DEFAULT 0,
  points_spent integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  delta integer NOT NULL,
  reason text NOT NULL,
  order_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.otp_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  verified boolean NOT NULL DEFAULT false,
  ip_address text
);
CREATE TABLE IF NOT EXISTS public.user_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_info text,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + '30 days'::interval),
  revoked boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.restaurants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  address text NOT NULL,
  city text NOT NULL DEFAULT 'Baku'::text,
  country text NOT NULL DEFAULT 'AZ'::text,
  phone text,
  email text,
  website text,
  cuisine_type text NOT NULL,
  cover_photo text,
  logo text,
  description text,
  seating_capacity integer,
  status text NOT NULL DEFAULT 'active'::text,
  owner_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  latitude double precision,
  longitude double precision
);
CREATE TABLE IF NOT EXISTS public.operating_hours (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  day_of_week integer NOT NULL,
  open_time time without time zone NOT NULL,
  close_time time without time zone NOT NULL,
  is_closed boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.special_closures (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  closed_date date NOT NULL,
  reason text
);
CREATE TABLE IF NOT EXISTS public.sections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  is_smoking boolean NOT NULL DEFAULT false,
  is_outdoor boolean NOT NULL DEFAULT false,
  capacity integer
);
CREATE TABLE IF NOT EXISTS public.tables (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  section_id uuid,
  table_number text NOT NULL,
  capacity integer NOT NULL,
  min_capacity integer NOT NULL DEFAULT 1,
  state table_state NOT NULL DEFAULT 'free'::table_state,
  qr_code_url text,
  qr_code_token text DEFAULT (gen_random_uuid())::text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  pos_x numeric,
  pos_y numeric,
  pos_w numeric DEFAULT 12,
  pos_h numeric DEFAULT 12,
  shape text DEFAULT 'square'::text,
  access_code text
);
CREATE TABLE IF NOT EXISTS public.table_state_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL,
  old_state table_state,
  new_state table_state NOT NULL,
  changed_by uuid,
  reason text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.restaurant_settings (
  restaurant_id uuid NOT NULL,
  currency text NOT NULL DEFAULT 'AZN'::text,
  tax_rate numeric(5,2) NOT NULL DEFAULT 18.00,
  service_charge numeric(5,2) NOT NULL DEFAULT 0,
  booking_slot_minutes integer NOT NULL DEFAULT 60,
  max_party_size integer NOT NULL DEFAULT 20,
  min_booking_notice integer NOT NULL DEFAULT 30,
  auto_cancel_minutes integer NOT NULL DEFAULT 15,
  loyalty_points_per_azn integer NOT NULL DEFAULT 10,
  allow_walk_in boolean NOT NULL DEFAULT true,
  require_prepayment boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.departments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  name text NOT NULL,
  description text
);
CREATE TABLE IF NOT EXISTS public.staff (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role staff_role NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  joined_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.employees (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  staff_id uuid,
  department_id uuid,
  national_id text,
  date_of_birth date,
  address text,
  emergency_contact_name text,
  emergency_contact_phone text,
  job_title text NOT NULL,
  employment_type text NOT NULL,
  status employment_status NOT NULL DEFAULT 'probation'::employment_status,
  hire_date date NOT NULL DEFAULT CURRENT_DATE,
  termination_date date,
  termination_reason text,
  base_salary numeric(10,2) NOT NULL,
  salary_currency text NOT NULL DEFAULT 'AZN'::text,
  pay_frequency text NOT NULL DEFAULT 'monthly'::text,
  bank_name text,
  bank_account text,
  iban text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.salary_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  old_salary numeric(10,2),
  new_salary numeric(10,2) NOT NULL,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  reason text,
  approved_by uuid,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.shifts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  section_id uuid,
  role staff_role NOT NULL,
  scheduled_start timestamptz NOT NULL,
  scheduled_end timestamptz NOT NULL,
  actual_start timestamptz,
  actual_end timestamptz,
  status shift_status NOT NULL DEFAULT 'scheduled'::shift_status,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.attendance (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  clock_in timestamptz,
  clock_out timestamptz,
  worked_minutes integer DEFAULT (CASE WHEN ((clock_in IS NOT NULL) AND (clock_out IS NOT NULL)) THEN ((EXTRACT(epoch FROM (clock_out - clock_in)))::integer / 60) ELSE NULL::integer END),
  is_overtime boolean NOT NULL DEFAULT false,
  overtime_minutes integer DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'::text,
  notes text,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_gross numeric(12,2) NOT NULL DEFAULT 0,
  total_tax numeric(12,2) NOT NULL DEFAULT 0,
  total_net numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft'::text,
  approved_by uuid,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.payroll_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  payroll_run_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  base_pay numeric(10,2) NOT NULL,
  overtime_pay numeric(10,2) NOT NULL DEFAULT 0,
  deductions numeric(10,2) NOT NULL DEFAULT 0,
  bonuses numeric(10,2) NOT NULL DEFAULT 0,
  gross_pay numeric(10,2) NOT NULL,
  income_tax numeric(10,2) NOT NULL DEFAULT 0,
  net_pay numeric(10,2) NOT NULL,
  worked_hours numeric(6,2),
  notes text
);
CREATE TABLE IF NOT EXISTS public.leave_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  leave_type text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  days_requested integer NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending'::text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.performance_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  reviewer_id uuid NOT NULL,
  review_period text NOT NULL,
  rating integer NOT NULL,
  strengths text,
  improvements text,
  goals text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  contact_name text,
  phone text,
  email text,
  address text,
  city text,
  country text NOT NULL DEFAULT 'AZ'::text,
  tax_id text,
  payment_terms text DEFAULT 'net_30'::text,
  is_active boolean NOT NULL DEFAULT true,
  rating numeric(3,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.restaurant_suppliers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  account_number text,
  credit_limit numeric(10,2),
  is_preferred boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.supplier_catalog (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL,
  item_name text NOT NULL,
  item_code text,
  unit text NOT NULL DEFAULT 'kg'::text,
  unit_price numeric(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'AZN'::text,
  min_order_qty numeric(10,2) DEFAULT 1,
  lead_time_days integer DEFAULT 1,
  is_available boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.supplier_price_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  supplier_catalog_id uuid NOT NULL,
  old_price numeric(10,2),
  new_price numeric(10,2) NOT NULL,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  po_number text NOT NULL,
  status po_status NOT NULL DEFAULT 'draft'::po_status,
  ordered_at timestamptz,
  expected_at date,
  notes text,
  total_amount numeric(12,2) DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.po_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL,
  supplier_catalog_id uuid,
  item_name text NOT NULL,
  ordered_qty numeric(10,2) NOT NULL,
  unit text NOT NULL,
  unit_price numeric(10,2) NOT NULL,
  total_price numeric(10,2) DEFAULT (ordered_qty * unit_price),
  received_qty numeric(10,2) NOT NULL DEFAULT 0,
  notes text
);
CREATE TABLE IF NOT EXISTS public.deliveries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL,
  restaurant_id uuid NOT NULL,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  received_by uuid,
  invoice_number text,
  invoice_amount numeric(12,2),
  notes text,
  status text NOT NULL DEFAULT 'pending'::text
);
CREATE TABLE IF NOT EXISTS public.delivery_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL,
  po_item_id uuid,
  item_name text NOT NULL,
  received_qty numeric(10,2) NOT NULL,
  unit text NOT NULL,
  unit_price numeric(10,2) NOT NULL,
  expiry_date date,
  batch_number text,
  condition text NOT NULL DEFAULT 'good'::text
);
CREATE TABLE IF NOT EXISTS public.ingredients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  name text NOT NULL,
  name_az text,
  name_it text,
  category text NOT NULL DEFAULT 'general'::text,
  unit text NOT NULL DEFAULT 'g'::text,
  stock_qty numeric(12,2) NOT NULL DEFAULT 0,
  low_threshold numeric(12,2) NOT NULL DEFAULT 500,
  reorder_qty numeric(12,2),
  preferred_supplier_id uuid,
  cost_per_unit numeric(10,4),
  allergens allergen_type[],
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.ingredient_batches (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ingredient_id uuid NOT NULL,
  delivery_id uuid,
  batch_number text,
  quantity numeric(12,2) NOT NULL,
  remaining_qty numeric(12,2) NOT NULL,
  unit_cost numeric(10,4),
  received_at timestamptz NOT NULL DEFAULT now(),
  expiry_date date,
  is_depleted boolean NOT NULL DEFAULT false,
  is_expired boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.stock_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ingredient_id uuid NOT NULL,
  batch_id uuid,
  changed_by uuid,
  delta numeric(12,2) NOT NULL,
  balance_after numeric(12,2) NOT NULL,
  reason stock_reason NOT NULL,
  order_item_id uuid,
  delivery_id uuid,
  notes text,
  logged_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.waste_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  ingredient_id uuid NOT NULL,
  batch_id uuid,
  quantity numeric(12,2) NOT NULL,
  unit text NOT NULL,
  waste_type text NOT NULL,
  estimated_cost numeric(10,2),
  reported_by uuid,
  notes text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.stock_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  ingredient_id uuid NOT NULL,
  alert_type text NOT NULL,
  message text NOT NULL,
  is_resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.menus (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  available_from time without time zone,
  available_until time without time zone,
  days_available integer[],
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.menu_sections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  menu_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS public.dishes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  menu_section_id uuid,
  name text NOT NULL,
  name_az text,
  name_it text,
  description text,
  description_az text,
  price numeric(10,2) NOT NULL,
  photo text,
  category dish_category NOT NULL,
  available boolean NOT NULL DEFAULT true,
  is_vegan boolean NOT NULL DEFAULT false,
  is_vegetarian boolean NOT NULL DEFAULT false,
  is_gluten_free boolean NOT NULL DEFAULT false,
  is_spicy boolean NOT NULL DEFAULT false,
  spice_level integer,
  prep_time_min integer,
  calories integer,
  sort_order integer NOT NULL DEFAULT 0,
  is_featured boolean NOT NULL DEFAULT false,
  toggled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  avg_rating numeric(3,2) DEFAULT 0,
  review_count integer DEFAULT 0
);
CREATE TABLE IF NOT EXISTS public.dish_price_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  dish_id uuid NOT NULL,
  old_price numeric(10,2),
  new_price numeric(10,2) NOT NULL,
  changed_by uuid,
  reason text,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.dish_ingredients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  dish_id uuid NOT NULL,
  ingredient_id uuid NOT NULL,
  quantity numeric(10,4) NOT NULL,
  unit text NOT NULL DEFAULT 'g'::text,
  is_optional boolean NOT NULL DEFAULT false,
  notes text
);
CREATE TABLE IF NOT EXISTS public.recipe_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  dish_id uuid NOT NULL,
  version_number integer NOT NULL,
  recipe_snapshot jsonb NOT NULL,
  changed_by uuid,
  change_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.dish_allergens (
  dish_id uuid NOT NULL,
  allergen allergen_type NOT NULL,
  from_ingredient uuid
);
CREATE TABLE IF NOT EXISTS public.dish_photos (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  dish_id uuid NOT NULL,
  url text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  uploaded_by uuid,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  dish_id uuid NOT NULL,
  user_id uuid NOT NULL,
  order_item_id uuid,
  rating integer NOT NULL,
  body text,
  photo text,
  is_verified boolean NOT NULL DEFAULT false,
  is_flagged boolean NOT NULL DEFAULT false,
  flag_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  table_id uuid NOT NULL,
  reserved_from timestamptz NOT NULL,
  reserved_until timestamptz NOT NULL,
  party_size integer NOT NULL,
  status booking_status NOT NULL DEFAULT 'pending'::booking_status,
  special_requests text,
  occasion text,
  source text NOT NULL DEFAULT 'app'::text,
  prepaid_amount numeric(10,2) DEFAULT 0,
  confirmed_at timestamptz,
  seated_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.waitlist (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  party_size integer NOT NULL,
  preferred_from timestamptz NOT NULL,
  preferred_until timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'waiting'::text,
  notified_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + '24:00:00'::interval),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  payload text,
  read boolean NOT NULL DEFAULT false,
  sent_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  table_id uuid NOT NULL,
  user_id uuid NOT NULL,
  booking_id uuid,
  status order_status NOT NULL DEFAULT 'open'::order_status,
  round integer NOT NULL DEFAULT 1,
  notes text,
  subtotal numeric(10,2) NOT NULL DEFAULT 0,
  tax_amount numeric(10,2) NOT NULL DEFAULT 0,
  service_charge numeric(10,2) NOT NULL DEFAULT 0,
  total_amount numeric(10,2) NOT NULL DEFAULT 0,
  placed_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  dish_id uuid NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric(10,2) NOT NULL,
  line_total numeric(10,2) DEFAULT ((quantity)::numeric * unit_price),
  special_request text,
  status text NOT NULL DEFAULT 'pending'::text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.kds_tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL,
  restaurant_id uuid NOT NULL,
  status ticket_status NOT NULL DEFAULT 'new'::ticket_status,
  priority integer NOT NULL DEFAULT 0,
  estimated_ready timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  station text,
  notes text
);
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  user_id uuid NOT NULL,
  method payment_method NOT NULL,
  amount numeric(10,2) NOT NULL,
  tip_amount numeric(10,2) NOT NULL DEFAULT 0,
  status payment_status NOT NULL DEFAULT 'pending'::payment_status,
  provider text,
  provider_ref text,
  initiated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  refunded_at timestamptz,
  refund_amount numeric(10,2) DEFAULT 0,
  refund_reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.payment_splits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  payment_id uuid,
  user_id uuid,
  amount numeric(10,2) NOT NULL,
  items_covered uuid[],
  is_paid boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.refunds (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL,
  order_id uuid NOT NULL,
  amount numeric(10,2) NOT NULL,
  reason text NOT NULL,
  refund_type text NOT NULL DEFAULT 'full'::text,
  provider_ref text,
  approved_by uuid,
  processed_at timestamptz,
  status text NOT NULL DEFAULT 'pending'::text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  order_id uuid,
  invoice_number text NOT NULL,
  invoice_type text NOT NULL DEFAULT 'customer'::text,
  issued_to text NOT NULL,
  issued_to_tax text,
  subtotal numeric(10,2) NOT NULL,
  tax_rate numeric(5,2) NOT NULL,
  tax_amount numeric(10,2) NOT NULL,
  total numeric(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'AZN'::text,
  status text NOT NULL DEFAULT 'draft'::text,
  issued_at timestamptz,
  due_date date,
  paid_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  amount numeric(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'AZN'::text,
  vendor text,
  receipt_url text,
  purchase_order_id uuid,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  approved_by uuid,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price_monthly numeric(10,2) NOT NULL,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  max_dishes integer,
  max_tables integer,
  max_staff integer,
  has_analytics boolean NOT NULL DEFAULT false,
  has_ads boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS public.restaurant_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active'::text,
  trial_ends_at timestamptz,
  current_period_start timestamptz NOT NULL DEFAULT now(),
  current_period_end timestamptz NOT NULL,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.ad_campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  budget numeric(10,2) NOT NULL,
  spent numeric(10,2) NOT NULL DEFAULT 0,
  daily_limit numeric(10,2),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'draft'::text,
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  title text,
  description text,
  image_url text,
  dish_id uuid
);
CREATE TABLE IF NOT EXISTS public.tip_distribution (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  amount numeric(10,2) NOT NULL,
  distributed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  name text NOT NULL,
  email text,
  message text NOT NULL,
  rating integer,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.saved_dishes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  dish_id uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.user_follows (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  restaurant_id uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.likes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.review_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL,
  user_id uuid NOT NULL,
  body text,
  photo text,
  is_flagged boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.supplier_reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL,
  restaurant_id uuid NOT NULL,
  delivery_id uuid,
  quality_rating integer NOT NULL,
  timeliness_rating integer NOT NULL,
  notes text,
  reviewed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  description text
);

-- NOTE: Sections 5-14 (constraints, functions, indexes, views, matviews,
-- triggers, RLS+policies, realtime, grants) continue in _prod_baseline_part2.sql
-- — split to keep each file reviewable. Run part1 then part2 in order.
