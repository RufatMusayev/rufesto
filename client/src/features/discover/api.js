// Every Supabase call of the Discover tab lives here. Functions return { data, error } and never throw;
// `error` is { code, key } (social/errors.js). Shapes follow docs/V2-CONTRACT.md section 18.2.
import { supabase } from '../../lib/supabase'
import { toError } from '../social/errors'
import { mapFeedItem } from '../social/mappers'
import { rpc, hasGps } from '../feed/api'

const arr = v => (Array.isArray(v) ? v : [])
const num = v => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
const count = v => Math.max(0, Number(v) || 0)

/** Restaurant card (18.2) -> view-model. */
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
  rating: num(r.rating),
  reviewCount: count(r.review_count),
  followerCount: count(r.follower_count),
  freeSeats: count(r.free_seats),
  isFollowed: !!r.is_followed,
  trending: !!r.trending,
})

/** Dish card (18.2) -> view-model. */
export const mapDishCard = d => ({
  id: d.id,
  name: d.name || '',
  photo: d.photo || null,
  price: num(d.price),
  category: d.category || null,
  available: d.available == null ? true : !!d.available,
  rating: num(d.avg_rating),
  reviewCount: count(d.review_count),
  orders7d: count(d.orders_7d),
  restaurant: d.restaurant ? {
    id: d.restaurant.id || null,
    name: d.restaurant.name || '',
    slug: d.restaurant.slug || null,
    logo: d.restaurant.logo || null,
    openNow: !!d.restaurant.open_now,
    km: num(d.restaurant.km),
  } : null,
})

/** discover() answer -> view-model (sections default to empty lists, so a missing key hides its section). */
export function mapDiscover(d) {
  return {
    radiusKm: num(d?.location?.radius_km),
    openNow: arr(d?.open_now).map(mapRestaurantCard),
    trendingDishes: arr(d?.trending_dishes).map(mapDishCard),
    newPlaces: arr(d?.new_places).map(mapRestaurantCard),
    topReviews: arr(d?.top_reviews).map(r => mapFeedItem({ kind: 'review', ...r })),
    promos: arr(d?.promos).map(p => mapFeedItem({ ...p, kind: 'promo' })),
    allRestaurants: arr(d?.all_restaurants).map(mapRestaurantCard),
    cuisines: arr(d?.cuisines).map(c => ({ key: String(c.key || ''), count: count(c.count) })).filter(c => c.key),
  }
}

/**
 * CONTRACT 18.2: discover(p_lat, p_lng, p_cuisine) -> jsonb, anon + authenticated. One call renders the whole
 * tab. Lat / lng only with GPS (3 decimals); p_cuisine filters open_now and all_restaurants.
 */
export async function getDiscover({ lat = null, lng = null, cuisine = null } = {}) {
  const args = {}
  if (hasGps(lat, lng)) { args.p_lat = lat; args.p_lng = lng }
  if (cuisine) args.p_cuisine = cuisine
  const { data, error } = await rpc('discover', args)
  return error ? { data: null, error } : { data: mapDiscover(data), error: null }
}

async function table(fn) {
  try {
    const { data, error } = await fn()
    return error ? { data: null, error: toError(error), code: error.code } : { data, error: null }
  } catch (err) {
    return { data: null, error: toError(err) }
  }
}

/**
 * Like counts and "liked by me" of restaurants (the polymorphic `likes` table, target_type 'restaurant'):
 * two batched reads for a whole list instead of one per card. -> { counts: {id: n}, mine: {id: true} }
 */
export async function getRestaurantLikes(ids, userId) {
  if (!ids.length) return { counts: {}, mine: {} }
  const [all, own] = await Promise.all([
    table(() => supabase.from('likes').select('target_id').eq('target_type', 'restaurant').in('target_id', ids)),
    userId
      ? table(() => supabase.from('likes').select('target_id').eq('user_id', userId).eq('target_type', 'restaurant').in('target_id', ids))
      : Promise.resolve({ data: [] }),
  ])
  const counts = {}
  for (const row of all.data || []) counts[row.target_id] = (counts[row.target_id] || 0) + 1
  const mine = {}
  for (const row of own.data || []) mine[row.target_id] = true
  return { counts, mine }
}

/** Like / unlike a restaurant (same writes as the old Home list). An already existing like counts as done. */
export async function setRestaurantLike(userId, restaurantId, on) {
  const res = await table(() => (on
    ? supabase.from('likes').insert({ user_id: userId, target_type: 'restaurant', target_id: restaurantId })
    : supabase.from('likes').delete().eq('user_id', userId).eq('target_type', 'restaurant').eq('target_id', restaurantId)))
  return res.code === '23505' ? { data: null, error: null } : res
}

/** Follow / unfollow a restaurant (user_follows, same writes as the old Home list). */
export async function setFollow(userId, restaurantId, on) {
  const res = await table(() => (on
    ? supabase.from('user_follows').insert({ user_id: userId, restaurant_id: restaurantId })
    : supabase.from('user_follows').delete().eq('user_id', userId).eq('restaurant_id', restaurantId)))
  return res.code === '23505' ? { data: null, error: null } : res
}
