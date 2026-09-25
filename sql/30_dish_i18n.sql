-- Migration: add i18n JSONB columns to dishes for EN/AZ dish name & description
-- File: sql/30_dish_i18n.sql

BEGIN;

ALTER TABLE public.dishes
  ADD COLUMN IF NOT EXISTS name_i18n jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS desc_i18n jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.dishes.name_i18n IS 'Localized dish names keyed by lang code, e.g. {"en":"Margherita Pizza","az":"Marqarita Pizza"}. Falls back to dishes.name.';
COMMENT ON COLUMN public.dishes.desc_i18n IS 'Localized dish descriptions keyed by lang code. Falls back to dishes.description.';

-- Backfill English from existing canonical columns
UPDATE public.dishes
   SET name_i18n = jsonb_build_object('en', name)
 WHERE (name_i18n = '{}'::jsonb OR name_i18n IS NULL) AND name IS NOT NULL;

UPDATE public.dishes
   SET desc_i18n = jsonb_build_object('en', description)
 WHERE (desc_i18n = '{}'::jsonb OR desc_i18n IS NULL) AND description IS NOT NULL;

-- GIN indexes for efficient key lookups
CREATE INDEX IF NOT EXISTS idx_dishes_name_i18n ON public.dishes USING gin (name_i18n);
CREATE INDEX IF NOT EXISTS idx_dishes_desc_i18n ON public.dishes USING gin (desc_i18n);

COMMIT;
