// _review_json (docs/UX-PLAN-2026-10-18.md 9.1) -> the review view model every review component reads. It is the same
// model social/mappers.js `mapFeedItem` returns for a review in a feed, so Home / Friends items and dish_reviews /
// restaurant_reviews / discover().top_reviews items are interchangeable:
//   { kind:'review', id, createdAt, user:{id,name,photo,topReviewer}, restaurant:{id,name,slug,logo},
//     dish:{id,name,photo,category,price}, photoUrl, text, rating, likeCount, commentCount, likedByMe, verified, isMine,
//     pool, reason, likes14d }
import { mapFeedItem, mapUser } from '../social/mappers'

export const mapReview = raw => mapFeedItem({ ...raw, kind: 'review' })
export const mapReviews = list => (Array.isArray(list) ? list : []).map(mapReview)

const int = v => (Number.isFinite(Number(v)) ? Number(v) : 0)

/** dish_reviews / restaurant_reviews `summary` -> { avg: number | null, count, histogram: [n1..n5] } */
export function mapSummary(s) {
  const h = Array.isArray(s?.histogram) ? s.histogram.map(int) : []
  return {
    avg: s?.avg_rating == null || Number.isNaN(Number(s.avg_rating)) ? null : Number(s.avg_rating),
    count: int(s?.review_count),
    histogram: [0, 1, 2, 3, 4].map(i => h[i] || 0),
  }
}

/** dish_reviews / restaurant_reviews answer -> { items, nextCursor, summary } */
export const mapReviewPage = d => ({
  items: mapReviews(d?.items),
  nextCursor: d?.next_cursor || null,
  summary: mapSummary(d?.summary),
})

/** review_replies item -> { id, user, body, createdAt, mine } (the shape social/components/CommentRow reads too) */
export const mapReply = r => ({
  id: r.id,
  user: mapUser(r.user),
  body: r.body || '',
  createdAt: r.created_at,
  mine: !!r.is_mine,
})

/**
 * One of the viewer's own / someone's profile reviews (features/profile/api.js getMyReviews, get_public_profile) as the
 * model of `<CompactReview variant="own">`: no counts, no actions.
 */
export const mapProfileReview = r => ({
  kind: 'review',
  id: r.id,
  createdAt: r.createdAt || r.created_at,
  user: { id: null, name: null, photo: null, topReviewer: false },
  restaurant: r.restaurant
    ? { id: r.restaurant.id || null, name: r.restaurant.name || '', slug: r.restaurant.slug || null, logo: r.restaurant.logo || null }
    : null,
  dish: r.dish
    ? { id: r.dish.id || null, name: r.dish.name || '', nameI18n: r.dish.nameI18n || r.dish.name_i18n || null, photo: r.dish.photo || null, category: r.dish.category || null, price: null, available: null }
    : null,
  photoUrl: r.photoUrl || r.photo || null,
  text: r.body ?? r.text ?? null,
  rating: r.rating ?? null,
  likeCount: 0,
  commentCount: 0,
  likedByMe: false,
  verified: !!(r.verified ?? r.is_verified),
  isMine: false,
})
