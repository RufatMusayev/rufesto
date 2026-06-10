-- ============================================
-- 21: 2D floor-plan positions for tables
-- Applied to Supabase on 2026-06-10 (migration: table_floor_positions)
-- Canvas: 100 x 64 units per restaurant, percent-like coordinates.
-- Consumed by client/src/components/FloorPlanSheet.jsx (visual table picker).
-- ============================================

ALTER TABLE tables
  ADD COLUMN IF NOT EXISTS pos_x numeric,
  ADD COLUMN IF NOT EXISTS pos_y numeric,
  ADD COLUMN IF NOT EXISTS pos_w numeric DEFAULT 12,
  ADD COLUMN IF NOT EXISTS pos_h numeric DEFAULT 12,
  ADD COLUMN IF NOT EXISTS shape text DEFAULT 'square' CHECK (shape IN ('square','round','rect'));

-- Bella Roma: Indoor (left), Terrace (right)
UPDATE tables SET pos_x=14, pos_y=14, pos_w=10, pos_h=10, shape='round'  WHERE id='30000001-0000-0000-0000-000000000001';
UPDATE tables SET pos_x=36, pos_y=13, pos_w=12, pos_h=12, shape='square' WHERE id='30000001-0000-0000-0000-000000000002';
UPDATE tables SET pos_x=14, pos_y=38, pos_w=12, pos_h=12, shape='square' WHERE id='30000001-0000-0000-0000-000000000003';
UPDATE tables SET pos_x=34, pos_y=40, pos_w=18, pos_h=11, shape='rect'   WHERE id='30000001-0000-0000-0000-000000000004';
UPDATE tables SET pos_x=70, pos_y=14, pos_w=12, pos_h=12, shape='square' WHERE id='30000001-0000-0000-0000-000000000005';
UPDATE tables SET pos_x=68, pos_y=40, pos_w=18, pos_h=11, shape='rect'   WHERE id='30000001-0000-0000-0000-000000000006';

-- Səda Ocağı: Main Hall (left), Garden (top right), VIP Room (bottom right)
UPDATE tables SET pos_x=12, pos_y=12, pos_w=12, pos_h=12, shape='square' WHERE id='30000002-0000-0000-0000-000000000001';
UPDATE tables SET pos_x=32, pos_y=12, pos_w=12, pos_h=12, shape='square' WHERE id='30000002-0000-0000-0000-000000000002';
UPDATE tables SET pos_x=14, pos_y=38, pos_w=18, pos_h=11, shape='rect'   WHERE id='30000002-0000-0000-0000-000000000003';
UPDATE tables SET pos_x=62, pos_y=10, pos_w=18, pos_h=11, shape='rect'   WHERE id='30000002-0000-0000-0000-000000000004';
UPDATE tables SET pos_x=62, pos_y=27, pos_w=20, pos_h=12, shape='rect'   WHERE id='30000002-0000-0000-0000-000000000005';
UPDATE tables SET pos_x=66, pos_y=47, pos_w=14, pos_h=14, shape='round'  WHERE id='30000002-0000-0000-0000-000000000006';

-- Sakura House: Main Floor (left 2x2), Sushi Bar (right column)
UPDATE tables SET pos_x=12, pos_y=12, pos_w=10, pos_h=10, shape='round'  WHERE id='30000003-0000-0000-0000-000000000001';
UPDATE tables SET pos_x=32, pos_y=12, pos_w=10, pos_h=10, shape='round'  WHERE id='30000003-0000-0000-0000-000000000002';
UPDATE tables SET pos_x=12, pos_y=36, pos_w=12, pos_h=12, shape='square' WHERE id='30000003-0000-0000-0000-000000000003';
UPDATE tables SET pos_x=30, pos_y=38, pos_w=18, pos_h=11, shape='rect'   WHERE id='30000003-0000-0000-0000-000000000004';
UPDATE tables SET pos_x=68, pos_y=14, pos_w=18, pos_h=8,  shape='rect'   WHERE id='30000003-0000-0000-0000-000000000005';
UPDATE tables SET pos_x=68, pos_y=32, pos_w=18, pos_h=8,  shape='rect'   WHERE id='30000003-0000-0000-0000-000000000006';
