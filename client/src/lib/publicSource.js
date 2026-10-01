// The relation the app reads public restaurant data from.
//
// This is the `restaurants` table with explicit safe columns. Migration 35 gives anon
// column-level SELECT on exactly RESTAURANT_COLS (and RLS already limits anon to
// status = 'active'), and before 35 anon could read the table as well, so this works both
// before and after it. Embeds from other tables (`restaurants(name, slug)` on dishes, bookings,
// reviews, ...) resolve through the base-table foreign keys. Embed keys follow the relation
// name, so if rsrc() ever returns something else, alias the embeds back to `restaurants:`.
//
// Never select('*') from this source: that would include owner_id / email (and fail for anon
// once 35 is applied). Use RESTAURANT_COLS.

/** The relation to read public restaurant data from. */
export function rsrc() {
  return 'restaurants'
}

/** The safe, public columns of a restaurant. */
export const RESTAURANT_COLS =
  'id, name, slug, address, city, country, phone, website, cuisine_type, cover_photo, logo, ' +
  'description, seating_capacity, status, created_at, updated_at, latitude, longitude'
