// Every Supabase call of the ranked Home and Friends feeds lives here (Discover's are in discover/api.js).
// Functions return { data, error } and never throw; `error` is { code, key } (social/errors.js).
// Shapes follow docs/V2-CONTRACT.md sections 17 and 18.
import { supabase } from '../../lib/supabase'
import { toError } from '../social/errors'
import { mapFeedItem } from '../social/mappers'
import { signInBackground } from '../social/lib/postPhotos'

export const HOME_PAGE_SIZE = 20          // home_feed p_limit (1..30)
export const MAX_EXCLUDE = 300            // home_feed p_exclude cap (more raises too_many_excluded)
export const NEW_COUNT_CAP = 50           // home_feed_new_count never answers more than this

export async function rpc(name, args) {
  try {
    const { data, error } = await supabase.rpc(name, args)
    return error ? { data: null, error: toError(error) } : { data, error: null }
  } catch (err) {
    return { data: null, error: toError(err) }
  }
}

export const hasGps = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng)

/**
 * One page of the ranked Home feed. Callable signed out.
 * CONTRACT 17.3: home_feed(p_lat, p_lng, p_exclude uuid[], p_limit) -> jsonb
 *   { items: [post | promo], exclude: uuid[], caught_up: boolean, mix: { nearby, following, discover }, radius_km: number | null }
 * `exclude` in the answer is what the next call sends back (pages never overlap). Photos come as storage paths: the page is
 * returned at once and `signed` (Promise<Map>[], one per signing call) resolves as they are signed, so the cards render
 * while the signing requests are in flight (pagedFeed applies each with applySigned).
 */
export async function getHomeFeed({ lat = null, lng = null, exclude = [], limit = HOME_PAGE_SIZE } = {}) {
  const args = { p_exclude: exclude, p_limit: limit }
  if (hasGps(lat, lng)) { args.p_lat = lat; args.p_lng = lng }
  const { data, error } = await rpc('home_feed', args)
  if (error) return { data: null, error }
  const { items, signed } = signInBackground((data?.items || []).map(mapFeedItem))
  return {
    data: {
      items,
      signed,
      exclude: Array.isArray(data?.exclude) ? data.exclude : [],
      caughtUp: !!data?.caught_up,
      mix: data?.mix || null,
      radiusKm: data?.radius_km == null ? null : Number(data.radius_km),
    },
    error: null,
  }
}

/**
 * CONTRACT 18.1: friends_feed(p_lat, p_lng, p_exclude uuid[], p_limit) -> jsonb { items, exclude, caught_up }
 * (authenticated only). Items are post items (17.2) and review items (_review_json), each with `day`
 * ('YYYY-MM-DD', Baku), `position`, `affinity`, `km`. Same exclusion paging as home_feed. Every item gets
 * pool 'friends' so the feed events carry it. One createSignedUrls call per page, in the background (see getHomeFeed).
 */
export async function getFriendsFeed({ lat = null, lng = null, exclude = [], limit = HOME_PAGE_SIZE } = {}) {
  const args = { p_exclude: exclude, p_limit: limit }
  if (hasGps(lat, lng)) { args.p_lat = lat; args.p_lng = lng }
  const { data, error } = await rpc('friends_feed', args)
  if (error) return { data: null, error }
  const { items, signed } = signInBackground((data?.items || []).map(it => mapFeedItem({ ...it, pool: 'friends' })))
  return {
    data: {
      items,
      signed,
      exclude: Array.isArray(data?.exclude) ? data.exclude : [],
      caughtUp: !!data?.caught_up,
      radiusKm: null,
    },
    error: null,
  }
}

/**
 * CONTRACT 17.3: home_feed_new_count(p_since timestamptz, p_lat, p_lng) -> int (0..50), callable signed out.
 */
export async function getHomeFeedNewCount({ since, lat = null, lng = null }) {
  const args = { p_since: since }
  if (hasGps(lat, lng)) { args.p_lat = lat; args.p_lng = lng }
  const { data, error } = await rpc('home_feed_new_count', args)
  if (error) return { data: null, error }
  return { data: Math.max(0, Number(data) || 0), error: null }
}

/**
 * CONTRACT 18.1b: friends_new_count(p_since timestamptz) -> int (0..50), authenticated only: posts and reviews of me and my
 * friends newer than `since` that the Friends tab does not show yet. The RPC may not exist on a database yet: the error
 * code is then 'unavailable' and the caller stops asking (the pill stays hidden).
 */
export async function getFriendsNewCount({ since }) {
  const { data, error } = await rpc('friends_new_count', { p_since: since })
  if (error) return { data: null, error }
  return { data: Math.max(0, Number(data) || 0), error: null }
}

/**
 * CONTRACT 17.4: log_feed_events(p_events jsonb) -> int (rows written). Each event:
 *   { item_type 'post'|'promo', item_id uuid, event 'impression'|'open'|'like'|'comment'|'save'|'order_tap'|'hide',
 *     pool?, position?, anon_key? }  (<= 50 per call; anon_key only for signed-out viewers)
 */
export function logFeedEvents(events) {
  return rpc('log_feed_events', { p_events: events })
}
