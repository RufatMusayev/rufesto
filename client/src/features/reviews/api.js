// Every Supabase call of the review components (docs/UX-PLAN-2026-10-18.md 9.1). Functions return { data, error } and never
// throw; `error` is { code, key } (social/errors.js). dish_reviews / restaurant_reviews / review_replies come with sql/67:
// until a database has them the first call gets PGRST202 ('unavailable'), the miss is remembered for the page load and
// the table reads in fallback.js / social/api.js answer instead, so nothing breaks.
import { rpc } from '../feed/api'
import { listReviewReplies, addReviewReply, deleteReviewReply, setReviewLike, REPLIES_LIMIT } from '../social/api'
import { mapReviewPage, mapReply } from './mapper'

export { addReviewReply, deleteReviewReply, setReviewLike, REPLIES_LIMIT }

const missing = { dish: false, restaurant: false, replies: false }
const isMissing = e => e?.code === 'unavailable'

/**
 * dish_reviews(p_dish_id, p_sort 'top' | 'new', p_cursor, p_limit 1..30) -> { items, nextCursor, summary }.
 * 'top' = the viewer's own review first, then likes; one page, no cursor. 'new' = keyset by (created_at, id).
 */
export async function getDishReviews({ dishId, sort = 'top', cursor = null, limit = 10 }) {
  if (!missing.dish) {
    const { data, error } = await rpc('dish_reviews', { p_dish_id: dishId, p_sort: sort, p_cursor: cursor, p_limit: limit })
    if (!error) return { data: mapReviewPage(data), error: null }
    if (!isMissing(error)) return { data: null, error }
    missing.dish = true
  }
  return (await import('./fallback')).readReviews({ dish_id: dishId }, { sort, cursor, limit })
}

/** restaurant_reviews(p_restaurant_id, ...): same shape and rules, over every dish of the restaurant. */
export async function getRestaurantReviews({ restaurantId, sort = 'top', cursor = null, limit = 20 }) {
  if (!missing.restaurant) {
    const { data, error } = await rpc('restaurant_reviews', { p_restaurant_id: restaurantId, p_sort: sort, p_cursor: cursor, p_limit: limit })
    if (!error) return { data: mapReviewPage(data), error: null }
    if (!isMissing(error)) return { data: null, error }
    missing.restaurant = true
  }
  return (await import('./fallback')).readReviews({ restaurant_id: restaurantId }, { sort, cursor, limit })
}

/** review_replies(p_review_id, p_cursor, p_limit) -> { items, nextCursor }, oldest first, real author names. */
export async function getReplies({ reviewId, userId = null, cursor = null, limit = 30 }) {
  if (!missing.replies) {
    const { data, error } = await rpc('review_replies', { p_review_id: reviewId, p_cursor: cursor, p_limit: limit })
    if (!error) return { data: { items: (data?.items || []).map(mapReply), nextCursor: data?.next_cursor || null }, error: null }
    if (!isMissing(error)) return { data: null, error }
    missing.replies = true
  }
  const res = await listReviewReplies(reviewId, userId)
  return res.error ? res : { data: { items: res.data, nextCursor: null }, error: null }
}
