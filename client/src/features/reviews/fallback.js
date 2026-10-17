// Table reads used while sql/67 (dish_reviews / restaurant_reviews / review_replies) is not on a database yet (PGRST202).
// Same view model as the RPCs, with the one known gap: RLS on `users` hides every author but the viewer, so other
// authors come back without a name (the rows then show "Rufesto guest" instead of the old "Anonymous"). Likes are read
// in one extra query. api.js asks the RPCs first and remembers a miss for the page load, so this stops being used the
// moment a database has them.
import { supabase } from '../../lib/supabase'
import { rsrc } from '../../lib/publicSource'
import { toError } from '../social/errors'
import { mapReviews, mapSummary } from './mapper'

const COLS = 'id, rating, body, photo, is_verified, created_at, user_id, dish_id, users(name, profile_photo), review_comments(count), '
  + `dishes!inner(id, name, photo, category, price, restaurant_id, ${rsrc()}!inner(id, name, slug, logo, status))`

function toRaw(r, likes, me) {
  const rest = r.dishes?.restaurants
  const hits = likes.filter(l => l.target_id === r.id)
  return {
    kind: 'review', id: r.id, created_at: r.created_at,
    user: { id: r.user_id, name: r.users?.name || null, profile_photo: r.users?.profile_photo || null },
    restaurant: rest ? { id: rest.id, name: rest.name, slug: rest.slug, logo: rest.logo } : null,
    dish: r.dishes ? { id: r.dishes.id, name: r.dishes.name, photo: r.dishes.photo, category: r.dishes.category, price: r.dishes.price } : null,
    photo_url: r.photo, text: r.body, rating: r.rating, is_verified: r.is_verified,
    like_count: hits.length,
    comment_count: Array.isArray(r.review_comments) ? Number(r.review_comments[0]?.count) || 0 : 0,
    liked_by_me: !!me && hits.some(l => l.user_id === me),
    is_mine: !!me && r.user_id === me,
  }
}

const rank = (a, b) => (Number(b.is_mine) - Number(a.is_mine)) || (b.like_count - a.like_count)
  || (Number(!!b.text) - Number(!!a.text)) || (Number(!!b.photo_url) - Number(!!a.photo_url))
  || String(b.created_at).localeCompare(String(a.created_at))

/** filter: { dish_id } or { restaurant_id } (of the dish). Same answer shape as the RPCs, already mapped. */
export async function readReviews(filter, { sort = 'top', cursor = null, limit = 10 } = {}) {
  let q = supabase.from('reviews').select(COLS, { count: 'exact' }).eq('is_flagged', false)
  if (filter.dish_id) q = q.eq('dish_id', filter.dish_id)
  if (filter.restaurant_id) q = q.eq('dishes.restaurant_id', filter.restaurant_id)
  if (cursor) q = q.lt('created_at', String(cursor).split('|')[0])
  q = q.order('created_at', { ascending: false }).limit(sort === 'top' ? 30 : limit)
  const { data, error, count } = await q
  if (error) return { data: null, error: toError(error) }
  const rows = data || []
  let me = null
  try { me = (await supabase.auth.getSession()).data.session?.user?.id || null } catch { /* signed out */ }
  let likes = []
  if (rows.length) {
    const res = await supabase.from('likes').select('target_id, user_id').eq('target_type', 'review').in('target_id', rows.map(r => r.id))
    likes = res.data || []
  }
  let raws = rows.map(r => toRaw(r, likes, me))
  let next = null
  if (sort === 'top') raws = raws.sort(rank).slice(0, limit)
  else if (rows.length >= limit) next = `${rows[rows.length - 1].created_at}|${rows[rows.length - 1].id}`
  const rated = rows.map(r => Number(r.rating)).filter(n => n > 0)
  const summary = mapSummary({
    avg_rating: rated.length ? Math.round((rated.reduce((a, b) => a + b, 0) / rated.length) * 10) / 10 : null,
    review_count: count ?? rows.length,
    histogram: [1, 2, 3, 4, 5].map(n => rated.filter(x => Math.round(x) === n).length),
  })
  return { data: { items: mapReviews(raws), nextCursor: next, summary }, error: null }
}
