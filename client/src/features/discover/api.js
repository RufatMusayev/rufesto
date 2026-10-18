// Every Supabase call behind the Search zero state lives here (the old Discover tab moved into Search, UX plan D1).
// Functions return { data, error } and never throw; `error` is { code, key } (social/errors.js). Shapes follow
// docs/V2-CONTRACT.md section 18.2. Restaurant likes are gone from the UI (the data is kept); Follow lives on the
// restaurant page.
import { mapFeedItem } from '../social/mappers'
import { rpc, hasGps } from '../feed/api'

const arr = v => (Array.isArray(v) ? v : [])
const num = v => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
const count = v => Math.max(0, Number(v) || 0)

/** Restaurant card (18.2, sql/67 adds price_band) -> view-model. */
export const mapRestaurantCard = r => ({
  id: r.id,
  name: r.name || '',
  slug: r.slug || null,
  cuisine: r.cuisine_type || null,
  logo: r.logo || null,
  coverPhoto: r.cover_photo || null,
  coverFallback: r.cover_fallback || null,   // first available dish photo (RPC)
  address: r.address || null,
  km: num(r.km),
  openNow: !!r.open_now,
  closesAt: r.closes_at || null,             // 'HH:MM' Baku
  opensAt: r.opens_at || null,               // 'HH:MM' Baku, only when the RPC knows it
  rating: num(r.rating),
  reviewCount: count(r.review_count),
  followerCount: count(r.follower_count),
  freeSeats: count(r.free_seats),
  isFollowed: !!r.is_followed,
  trending: !!r.trending,
  priceBand: num(r.price_band),              // 1..3, null until sql/67 or without dishes
  isNew: !!r.is_new,
})

/** Dish card (18.2, sql/67 adds the diet flags) -> view-model. */
export const mapDishCard = d => ({
  id: d.id,
  name: d.name || '',
  nameAz: d.name_az || null,
  nameI18n: d.name_i18n && typeof d.name_i18n === 'object' ? d.name_i18n : null,   // { az, en, ru }; null until the database sends it
  photo: d.photo || null,
  price: num(d.price),
  category: d.category || null,
  available: d.available == null ? true : !!d.available,
  rating: num(d.avg_rating),
  reviewCount: count(d.review_count),
  orders7d: count(d.orders_7d),
  isVegan: !!d.is_vegan,
  isVegetarian: !!d.is_vegetarian,
  isGlutenFree: !!d.is_gluten_free,
  isSpicy: !!d.is_spicy,
  restaurant: d.restaurant ? {
    id: d.restaurant.id || null,
    name: d.restaurant.name || '',
    slug: d.restaurant.slug || null,
    logo: d.restaurant.logo || null,
    openNow: !!d.restaurant.open_now,
    km: num(d.restaurant.km),
    priceBand: num(d.restaurant.price_band),
  } : null,
})

/**
 * discover() answer -> view-model (sections default to empty lists, so a missing key hides its section).
 * "New places" is merged into "Open now": a new place that is open now joins that rail with `isNew` (a small tag
 * on its card); one that is closed shows in "All places" only.
 */
export function mapDiscover(d) {
  const fresh = new Set(arr(d?.new_places).map(r => r.id))
  const tag = r => (fresh.has(r.id) ? { ...r, isNew: true } : r)
  const open = arr(d?.open_now).map(mapRestaurantCard)
  const seen = new Set(open.map(r => r.id))
  const newOpen = arr(d?.new_places).map(mapRestaurantCard).filter(r => r.openNow && !seen.has(r.id))
  return {
    radiusKm: num(d?.location?.radius_km),
    openNow: [...open.map(tag), ...newOpen.map(r => ({ ...r, isNew: true }))],
    trendingDishes: arr(d?.trending_dishes).map(mapDishCard),
    topReviews: arr(d?.top_reviews).map(r => mapFeedItem({ kind: 'review', ...r })),
    allRestaurants: arr(d?.all_restaurants).map(mapRestaurantCard).map(tag),
    cuisines: arr(d?.cuisines).map(c => ({ key: String(c.key || ''), count: count(c.count) })).filter(c => c.key),
  }
}

/**
 * CONTRACT 18.2: discover(p_lat, p_lng, p_cuisine) -> jsonb, anon + authenticated. One call renders the whole
 * zero state. Lat / lng only with GPS (3 decimals); p_cuisine filters open_now and all_restaurants.
 */
export async function getDiscover({ lat = null, lng = null, cuisine = null } = {}) {
  const args = {}
  if (hasGps(lat, lng)) { args.p_lat = lat; args.p_lng = lng }
  if (cuisine) args.p_cuisine = cuisine
  const { data, error } = await rpc('discover', args)
  return error ? { data: null, error } : { data: mapDiscover(data), error: null }
}
