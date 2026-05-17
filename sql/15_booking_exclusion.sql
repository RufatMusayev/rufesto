CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    table_id WITH =,
    tstzrange(reserved_from, reserved_until) WITH &&
  )
  WHERE (status NOT IN ('cancelled', 'completed'));
