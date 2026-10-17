// Every Supabase call of the restaurant page lives here. Reads return { data, error } and never throw;
// `error` is { code, key } (social/errors.js). Shapes follow docs/V2-CONTRACT.md section 19.
import { supabase } from '../../lib/supabase'
import { rsrc, RESTAURANT_COLS } from '../../lib/publicSource'
import { toError } from '../social/errors'
import { mapFeedItem } from '../social/mappers'
import { withSignedPhotos } from '../social/lib/postPhotos'
import { mapMenu, mapLegacyMenu } from './mappers'

export const POSTS_PAGE_SIZE = 21          // a multiple of 3 (grid columns); within both RPC limits (venue 1..50, guests 1..30)

const guard = async run => {
  try { return await run() } catch (err) { return { data: null, error: toError(err) } }
}

/** True when the function or table is not deployed yet (PostgREST 404 / PGRST202 / undefined function). */
export const isMissing = err => !!err && (
  ['PGRST202', 'PGRST205', '42883', '42P01'].includes(err.code) || err.status === 404
  || /could not find the (function|table)|schema cache/i.test(`${err.message || ''} ${err.details || ''}`)
)

// ---- restaurant header -------------------------------------------------------------------------------------

/** An answer that means "there is no such (active) restaurant", as opposed to a failed read. */
const isNoSuchRestaurant = err => !!err && (err.code === 'PGRST116' || /restaurant_not_found/.test(err.message || ''))

/** The active restaurant of `slug` with its opening hours; data null (and no error) = no such restaurant. */
export function fetchRestaurant(slug) {
  return guard(async () => {
    const { data, error } = await supabase
      .from(rsrc())
      .select(`${RESTAURANT_COLS}, operating_hours(*)`)
      .eq('slug', slug)
      .eq('status', 'active')
      .maybeSingle()
    if (isNoSuchRestaurant(error)) return { data: null, error: null }
    return error ? { data: null, error: toError(error) } : { data: data || null, error: null }
  })
}

/** Seats, not tables: the capacities of the free tables over the capacities of all tables. */
export function countSeats(tables) {
  let free = 0
  let total = 0
  for (const t of tables) {
    const seats = Number(t.capacity) || 0
    total += seats
    if (t.state === 'free') free += seats
  }
  return { free, total }
}

export function fetchSeats(restaurantId) {
  return guard(async () => {
    const { data, error } = await supabase.from('tables').select('id, state, capacity').eq('restaurant_id', restaurantId)
    return error ? { data: null, error: toError(error) } : { data: countSeats(data || []), error: null }
  })
}

/** Realtime table changes of ONE restaurant (never cross-tenant). Returns the unsubscribe function. */
export function subscribeTables(restaurantId, onChange) {
  const channel = supabase
    .channel(`tables-${restaurantId}`)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'tables', filter: `restaurant_id=eq.${restaurantId}`,
    }, onChange)
    .subscribe()
  return () => supabase.removeChannel(channel)
}

// ---- follow ------------------------------------------------------------------------------------------------

/** Count-only RPC: follow rows are private (RLS shows a user only their own). */
export function fetchFollowerCount(restaurantId) {
  return guard(async () => {
    const { data, error } = await supabase.rpc('restaurant_follower_count', { p_restaurant_id: restaurantId })
    return error ? { data: null, error: toError(error) } : { data: Number(data) || 0, error: null }
  })
}

export function fetchIsFollowing(userId, restaurantId) {
  return guard(async () => {
    const { data, error } = await supabase
      .from('user_follows').select('id').eq('user_id', userId).eq('restaurant_id', restaurantId).maybeSingle()
    return error ? { data: null, error: toError(error) } : { data: !!data, error: null }
  })
}

export function setFollowing(userId, restaurantId, follow) {
  return guard(async () => {
    const q = follow
      ? supabase.from('user_follows').insert({ user_id: userId, restaurant_id: restaurantId })
      : supabase.from('user_follows').delete().eq('user_id', userId).eq('restaurant_id', restaurantId)
    const { error } = await q
    return error ? { data: null, error: toError(error) } : { data: true, error: null }
  })
}

// ---- menu --------------------------------------------------------------------------------------------------

async function fetchLegacyMenu(restaurantId) {
  const [secs, dishes] = await Promise.all([
    supabase
      .from('menu_sections')
      .select('*, menus!inner(restaurant_id, is_active)')
      .eq('menus.restaurant_id', restaurantId)
      .eq('menus.is_active', true)
      .order('sort_order'),
    supabase
      .from('dishes')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('sort_order')
      .order('name'),
  ])
  if (secs.error || dishes.error) return { data: null, error: toError(secs.error || dishes.error) }
  return { data: mapLegacyMenu(secs.data, dishes.data, restaurantId), error: null }
}

/**
 * CONTRACT 19.1: restaurant_menu(p_slug text) -> jsonb { restaurant, design { theme, accent, show_photos, note },
 * sections [ { id|null, name, name_az, sort_order, dishes [...] } ], updated_at } (anon + authenticated).
 * Until the function exists (PGRST202) the page reads menu_sections + dishes as it did before and renders the
 * default classic theme, so it never breaks.
 */
export function fetchMenu(slug, restaurantId) {
  return guard(async () => {
    const { data, error } = await supabase.rpc('restaurant_menu', { p_slug: slug })
    if (!error && data) return { data: mapMenu(data, restaurantId), error: null }
    if (error && !isMissing(error)) return { data: null, error: toError(error) }
    return fetchLegacyMenu(restaurantId)
  })
}

const PATCH_KEYS = [
  'name', 'name_az', 'description', 'description_az', 'price', 'photo', 'available', 'is_vegan', 'is_vegetarian',
  'is_gluten_free', 'is_spicy', 'spice_level', 'is_featured', 'avg_rating', 'review_count', 'prep_time_min', 'calories',
]

/** Live changes of the dishes of ONE restaurant (kitchen toggles availability, prices...). cb(dishId, patch). */
export function subscribeDishes(restaurantId, cb) {
  const channel = supabase
    .channel(`dishes-${restaurantId}`)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'dishes', filter: `restaurant_id=eq.${restaurantId}`,
    }, payload => {
      const row = payload.new || {}
      const patch = {}
      for (const k of PATCH_KEYS) if (k in row) patch[k] = row[k]
      if (row.id) cb(row.id, patch)
    })
    .subscribe()
  return () => supabase.removeChannel(channel)
}

// ---- posts -------------------------------------------------------------------------------------------------

/**
 * One page of the restaurant's posts, newest first, keyset on created_at.
 * scope 'venue'  -> restaurant_posts(p_restaurant_id, p_cursor, p_limit)        (exists, sql/58)
 * scope 'guests' -> restaurant_guest_posts(p_restaurant_id, p_cursor, p_limit)  (CONTRACT 19.1, sql/62)
 * Both answer { items: [post item 17.2], next_cursor }. Photos are storage paths, signed here per page (the 640px copy, sql/65).
 * A missing RPC comes back as error.key 'social:errors.unavailable' (the Guests chip then shows its empty state).
 */
export function fetchRestaurantPosts({ restaurantId, scope, cursor = null, limit = POSTS_PAGE_SIZE }) {
  return guard(async () => {
    const name = scope === 'guests' ? 'restaurant_guest_posts' : 'restaurant_posts'
    const { data, error } = await supabase.rpc(name, { p_restaurant_id: restaurantId, p_cursor: cursor, p_limit: limit })
    if (error) return { data: null, error: toError(error) }
    const items = await withSignedPhotos((data?.items || []).map(mapFeedItem), { small: true })      // grid tiles: the 640px copies
    return { data: { items, nextCursor: data?.next_cursor || null }, error: null }
  })
}

const PROMOS_SHOWN = 2
const PROMO_TTL_MS = 30 * 1000
let promoCache = null                      // { rows, at }: the RPC answers for every restaurant, so one read serves them all

/** A campaign that is running right now (the RPC already says so; this guards a cached answer and clock drift). */
export function isLivePromo(c, now = Date.now()) {
  if (!c || c.status !== 'active') return false
  const starts = c.starts_at ? Date.parse(c.starts_at) : null
  const ends = c.ends_at ? Date.parse(c.ends_at) : null
  return !(starts != null && starts > now) && !(ends != null && ends < now)
}

/**
 * Live promos of this restaurant, newest first (at most two). The campaigns table is staff-only (sql/52): guests and
 * anon read them through public_ad_campaigns() (anon + authenticated), which already limits the answer to active
 * campaigns inside their run window of active restaurants; this keeps the ones of THIS restaurant that are still live.
 * [] when there are none or the call fails.
 */
export async function fetchPromos(restaurantId) {
  try {
    let rows = promoCache && Date.now() - promoCache.at < PROMO_TTL_MS ? promoCache.rows : null
    if (!rows) {
      const { data, error } = await supabase.rpc('public_ad_campaigns')
      if (error) return []
      rows = Array.isArray(data) ? data : []
      promoCache = { rows, at: Date.now() }
    }
    const now = Date.now()
    return rows.filter(c => c.restaurant_id === restaurantId && isLivePromo(c, now)).slice(0, PROMOS_SHOWN)
  } catch { return [] }
}

/** Fire-and-forget click tracking, same call as PromoCard. */
export function trackPromoClick(campaignId) {
  try {
    supabase.rpc('track_campaign', { p_campaign_id: campaignId, p_event: 'click' }).then(() => {}, () => {})
  } catch { /* never block the UI */ }
}

/** True when the signed-in viewer is admin / manager of the restaurant (staff_role_at is authenticated-only). */
export async function fetchIsManager(restaurantId) {
  try {
    const { data, error } = await supabase.rpc('staff_role_at', { p_restaurant_id: restaurantId })
    return !error && (data === 'admin' || data === 'manager')
  } catch { return false }
}

/** Dashboard URL of this deployment: `resto.` in front of the consumer host (no domain is hardcoded). */
export function restoUrl(path) {
  const { protocol, hostname } = window.location
  if (hostname === 'localhost' || hostname === '127.0.0.1') return `${protocol}//${hostname}:5174${path}`
  return `${protocol}//resto.${hostname.replace(/^www\./, '')}${path}`
}
