// Every Supabase call of the Profile screen lives here. Functions return { data, error } and
// never throw; `error` is { code } (the UI shows a generic translated message, never error.message).
// Rows are mapped to the view-models below so a column rename only touches this file.
import { supabase } from '../../lib/supabase'
import { rsrc } from '../../lib/publicSource'
import { getPublicProfile } from '../social/api'

const fail = err => ({ data: null, error: { code: String(err?.code || 'generic') } })

async function run(fn) {
  try {
    const res = await fn()
    if (res.error) return fail(res.error)
    return { data: res.data ?? null, error: null, count: res.count ?? null }
  } catch (err) {
    return fail(err)
  }
}

const num = v => (typeof v === 'number' ? v : null)

/* ------------------------------------------------------------------ header */

/** { posts, friends, visits }: a count that could not be read is null (shown as a dash). */
export async function getMyCounts(userId) {
  const [posts, friends, visits] = await Promise.all([
    // own posts are always readable (posts_read: author)
    run(() => supabase.from('posts').select('id', { count: 'exact', head: true }).eq('user_id', userId)),
    // CONTRACT: my_friends() -> [{ friendship_id, user_id, name, profile_photo, since }]
    run(() => supabase.rpc('my_friends')),
    // CONTRACT: visits (own rows readable: visits_own_read), one row per paid bill
    run(() => supabase.from('visits').select('id', { count: 'exact', head: true }).eq('user_id', userId)),
  ])
  const counts = {
    posts: posts.error ? null : num(posts.count),
    friends: friends.error ? null : (Array.isArray(friends.data) ? friends.data.length : null),
    visits: visits.error ? null : num(visits.count),
  }
  const allFailed = posts.error && friends.error && visits.error
  return { data: counts, error: allFailed ? posts.error : null }
}

const ZERO_ACCOUNT = { points: 0, tier: 'bronze', earned: 0, spent: 0 }

/** Resto-Credits balance. A guest without a loyalty row has a zero balance. */
export async function getCredits(userId) {
  const { data, error } = await run(() => supabase
    .from('loyalty_accounts')
    .select('points, tier, points_earned, points_spent')
    .eq('user_id', userId)
    .maybeSingle())
  if (error) return { data: null, error }
  if (!data) return { data: ZERO_ACCOUNT, error: null }
  return {
    data: {
      points: Number(data.points) || 0,
      tier: data.tier || 'bronze',
      earned: Number(data.points_earned) || 0,
      spent: Number(data.points_spent) || 0,
    },
    error: null,
  }
}

export async function getCreditHistory(userId, limit = 10) {
  const { data, error } = await run(() => supabase
    .from('loyalty_transactions')
    .select('id, delta, reason, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit))
  if (error) return { data: null, error }
  return {
    data: (data || []).map(r => ({ id: r.id, delta: Number(r.delta) || 0, reason: r.reason || null, createdAt: r.created_at })),
    error: null,
  }
}

/** Where and when the credits for some bills were earned: Map(billId -> { restaurant, visitedAt }).
 *  One row per paid bill in `visits` (own rows readable). A failure returns an empty map: the caller falls back to
 *  a plain "Bill paid". */
export async function getBillVisitInfo(userId, billIds) {
  const ids = [...new Set(billIds)].filter(Boolean)
  if (ids.length === 0) return new Map()
  const { data, error } = await run(() => supabase
    .from('visits')
    .select(`bill_id, visited_at, ${rsrc()}(name)`)
    .eq('user_id', userId)
    .in('bill_id', ids))
  const map = new Map()
  if (error) return map
  for (const v of data || []) {
    if (v.bill_id) map.set(v.bill_id, { restaurant: v.restaurants?.name || null, visitedAt: v.visited_at || null })
  }
  return map
}

/** What the credits for some reviews were earned on: Map(reviewId -> { dish, restaurant }). Own reviews are
 *  readable. A failure (or a review that was deleted) leaves the id out: the caller shows a plain "Review posted". */
export async function getReviewInfo(userId, reviewIds) {
  const ids = [...new Set(reviewIds)].filter(Boolean)
  if (ids.length === 0) return new Map()
  const { data, error } = await run(() => supabase
    .from('reviews')
    .select(`id, dishes(name, ${rsrc()}(name))`)
    .eq('user_id', userId)
    .in('id', ids))
  const map = new Map()
  if (error) return map
  for (const r of data || []) {
    map.set(r.id, { dish: r.dishes?.name || null, restaurant: r.dishes?.restaurants?.name || null })
  }
  return map
}

/* -------------------------------------------------------------------- tabs */

/** Own posts as grid tiles (newest 30, photos already signed by the social feature). */
export async function getOwnPosts(userId) {
  // CONTRACT: get_public_profile(own id) returns the author's posts, including friends-only ones
  const { data, error } = await getPublicProfile(userId)
  if (error) return { data: null, error: { code: error.code || 'generic' } }
  return { data: data?.posts || [], error: null }
}

export async function getMyReviews(userId) {
  const { data, error } = await run(() => supabase
    .from('reviews')
    .select(`*, dishes(name, category, price, restaurant_id, ${rsrc()}(name, slug))`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(30))
  if (error) return { data: null, error }
  return {
    data: (data || []).map(r => ({
      id: r.id,
      rating: Math.max(0, Math.min(5, Number(r.rating) || 0)),
      body: r.body || null,
      createdAt: r.created_at,
      verified: !!r.is_verified,
      dish: { name: r.dishes?.name || null, category: r.dishes?.category || null },
      restaurant: r.dishes?.restaurants ? { name: r.dishes.restaurants.name, slug: r.dishes.restaurants.slug } : null,
    })),
    error: null,
  }
}

export async function getSavedDishes(userId) {
  const { data, error } = await run(() => supabase
    .from('saved_dishes')
    .select(`*, dishes(id, name, category, price, available, restaurant_id, ${rsrc()}(name, slug))`)
    .eq('user_id', userId)
    .order('created_at', { ascending: false }))
  if (error) return { data: null, error }
  return {
    data: (data || []).filter(s => s.dishes).map(s => ({
      id: s.id,
      dish: {
        id: s.dishes.id, name: s.dishes.name, category: s.dishes.category,
        price: s.dishes.price, available: !!s.dishes.available,
      },
      restaurant: s.dishes.restaurants ? { name: s.dishes.restaurants.name, slug: s.dishes.restaurants.slug } : null,
    })),
    error: null,
  }
}

export async function removeSavedDish(savedId) {
  const { error } = await run(() => supabase.from('saved_dishes').delete().eq('id', savedId))
  return { data: null, error }
}

/** Paid visits, newest first. `billId` is set when the visit came from a settled bill (opens its receipt). */
export async function getVisits(userId, limit = 50) {
  const { data, error } = await run(() => supabase
    .from('visits')
    .select(`id, bill_id, amount_paid, visited_at, ${rsrc()}(name, slug, logo)`)
    .eq('user_id', userId)
    .order('visited_at', { ascending: false })
    .limit(limit))
  if (error) return { data: null, error }
  return {
    data: (data || []).map(v => ({
      id: v.id,
      billId: v.bill_id || null,
      amount: Number(v.amount_paid) || 0,
      visitedAt: v.visited_at,
      restaurant: v.restaurants ? { name: v.restaurants.name, slug: v.restaurants.slug, logo: v.restaurants.logo || null } : null,
    })),
    error: null,
  }
}

/* ---------------------------------------------------------------- feedback */

export async function sendFeedback({ userId, name, email, message, rating }) {
  return run(() => supabase.from('feedback').insert({
    user_id: userId || null,
    name,
    email: email || null,
    message,
    rating: rating || null,
  }))
}
