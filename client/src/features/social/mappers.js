// Backend row -> view-model mappers. Screens only ever see the shapes returned here, so a
// contract rename is a change in this file and api.js, never in a component.

const STATUS = {
  none: 'none', pending_out: 'pending_out', pending_in: 'pending_in',
  accepted: 'friends', friends: 'friends', blocked: 'blocked', self: 'self',
}
/** 'none' | 'pending_out' | 'pending_in' | 'friends' | 'blocked' | 'self' */
export const mapStatus = s => STATUS[s] || 'none'

export const mapUser = u => ({
  id: u?.id || null,
  name: u?.name || null,
  photo: u?.profile_photo || u?.photo || null,
  topReviewer: !!u?.top_reviewer,           // _review_json (sql/67); false elsewhere
})

const mapRestaurant = r => (r ? {
  id: r.id || null, name: r.name || '', slug: r.slug || null, logo: r.logo || null,
} : null)

/**
 * Post photo: the `post-photos` bucket is private, so the backend sends the object path
 * (`<uid>/<file>`). A path is kept as `photoPath` and signed by api.js (lib/postPhotos.js), which
 * then fills `photoUrl`; a legacy absolute URL (contains '://') is used as it is.
 */
const isPhotoPath = v => typeof v === 'string' && v !== '' && !v.includes('://')
const mapPostPhoto = v => ({
  photoPath: isPhotoPath(v) ? v : null,
  photoUrl: v && !isPhotoPath(v) ? v : null,
  hasPhoto: !!v,
})

const num = v => (v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v))
// price / available only come with home_feed and the v2 post item (live kitchen toggle); null = unknown
const mapDish = d => (d ? {
  id: d.id || null, name: d.name || '', photo: d.photo || null, category: d.category || null,
  price: num(d.price), available: d.available == null ? null : !!d.available,
} : null)

/**
 * Post author (docs/V2-CONTRACT.md 17.2): `{ type: 'user', id, name, profile_photo }` or
 * `{ type: 'restaurant', id, name, slug, logo }`. Older feed() rows have no `author`: fall back to `user`.
 */
const mapAuthor = (a, user) => {
  if (a?.type === 'restaurant') {
    return { type: 'restaurant', id: a.id || null, name: a.name || '', slug: a.slug || null, photo: a.logo || null }
  }
  const u = mapUser(a || user)
  return { type: 'user', id: u.id, name: u.name, slug: null, photo: u.photo }
}

// Stop-gap the dashboard used before campaigns had discount columns: the description starts with
// "[discount:percent=15]" or "[discount:amount=5]". It is read here and never shown.
const DISCOUNT_PREFIX = /^\s*\[discount:(percent|amount)=(\d+(?:[.,]\d+)?)\]\s*/i

/**
 * The discount of a promo and its clean description. Real fields win (discount_percent / discount_amount on the
 * campaign, sql/63); otherwise the prefix above is parsed. A value of 0 or less is no discount.
 */
export function mapDiscount(r) {
  let description = String(r.description || '')
  let percent = num(r.discount_percent)
  let amount = num(r.discount_amount)
  const m = description.match(DISCOUNT_PREFIX)
  if (m) {
    description = description.slice(m[0].length)
    const v = Number(m[2].replace(',', '.'))
    if (percent == null && amount == null) {
      if (m[1].toLowerCase() === 'percent') percent = v
      else amount = v
    }
  }
  return { description, percent: percent > 0 ? percent : null, amount: amount > 0 ? amount : null }
}

/** home_feed promo slot -> view-model (the card adapter lives in features/feed). */
const mapPromo = r => ({
  kind: 'promo',
  id: r.id,
  pool: 'promo',
  position: num(r.position),
  restaurant: mapRestaurant(r.restaurant),
  title: r.title || '',
  description: mapDiscount(r).description,
  discountPercent: mapDiscount(r).percent,
  discountAmount: mapDiscount(r).amount,
  imageUrl: r.image_url || null,
  dish: mapDish(r.dish),
  startsAt: r.starts_at || null,
  endsAt: r.ends_at || null,
  type: r.type || null,
})

export const mapFriend = r => ({
  friendshipId: r.friendship_id,
  userId: r.user_id,
  name: r.name || null,
  photo: r.profile_photo || null,
  since: r.since || null,
})

export const mapRequest = r => ({
  id: r.id,
  userId: r.user_id,
  name: r.name || null,
  photo: r.profile_photo || null,
  createdAt: r.created_at || null,
})

/**
 * search_users row. The second line under a result (FindPeople) uses what the RPC sends: `mutual_friends` (int),
 * else `district`, else `joined_at` ("Joined <month>"). Today's search_users (sql/47c) sends none of them, so no
 * second line shows until the RPC grows one; the mapper already reads the names above.
 */
export const mapSearchRow = r => ({
  id: r.id,
  name: r.name || null,
  photo: r.profile_photo || null,
  status: mapStatus(r.friendship_status ?? r.friendship),
  mutual: Math.max(0, Number(r.mutual_friends ?? r.mutual_count) || 0),
  district: (typeof r.district === 'string' && r.district.trim()) || null,
  joinedAt: r.joined_at || null,
})

/** A feed entry: kind 'post' | 'review' | 'promo' (promo only from home_feed). */
export const mapFeedItem = r => (r.kind === 'promo' ? mapPromo(r) : {
  kind: r.kind === 'review' ? 'review' : 'post',
  id: r.id,
  createdAt: r.created_at,
  why: r.why || null,                       // 'own' | 'friend' | 'following' (feed) | the pool (home_feed)
  user: mapUser(r.user),
  author: mapAuthor(r.author, r.user),
  restaurant: mapRestaurant(r.restaurant),
  dish: mapDish(r.dish),
  ...(r.kind === 'review'
    ? { photoPath: null, photoUrl: r.photo_url ?? r.photo ?? null, hasPhoto: !!(r.photo_url ?? r.photo) }
    : mapPostPhoto(r.photo_url ?? r.photo)),
  text: r.text ?? r.caption ?? r.body ?? null,
  rating: r.rating ?? null,
  likeCount: Number(r.like_count) || 0,
  commentCount: Number(r.comment_count) || 0,
  likedByMe: !!r.liked_by_me,
  verified: !!r.is_verified,
  isMine: !!r.is_mine,
  // friends_feed only: the Baku calendar day the item belongs to ('YYYY-MM-DD'), for the day separators
  day: r.day || null,
  // home_feed only (null elsewhere)
  pool: r.pool || null,                     // 'nearby' | 'following' | 'discover' | 'popular' (a review)
  position: num(r.position),                // the server's 1-based slot in its page; Home re-numbers across the whole list
  km: num(r.km),                            // nearby pool only
  // popular reviews (home_feed, sql/67): why this review is on Home ('liked' | 'top_reviewer') and its likes in 14 days
  reason: r.reason || null,
  likes14d: num(r.likes_14d),
  openNow: r.open_now == null ? null : !!r.open_now,
})

export const mapComment = c => ({
  id: c.id,
  user: mapUser(c.user),
  body: c.body || '',
  createdAt: c.created_at,
  mine: !!c.mine,
})

/** get_public_profile -> profile view-model (posts as grid tiles, reviews as review items). */
export function mapProfile(p) {
  if (!p || !p.id) return null
  const user = mapUser(p)
  const counts = p.counts || {}
  return {
    id: p.id,
    name: p.name || null,
    photo: p.profile_photo || null,
    status: mapStatus(p.friendship_status ?? p.friendship),
    counts: {
      posts: Number(counts.posts) || 0,
      friends: Number(counts.friends) || 0,
      reviews: Number(counts.reviews) || 0,
    },
    posts: (p.posts || []).map(x => ({
      id: x.id,
      ...mapPostPhoto(x.photo_url),
      caption: x.caption || null,
      likeCount: Number(x.like_count) || 0,
      commentCount: Number(x.comment_count) || 0,
      createdAt: x.created_at,
    })),
    reviews: (p.reviews || []).map(x => ({
      kind: 'review',
      id: x.id,
      createdAt: x.created_at,
      why: null,
      user,
      restaurant: mapRestaurant(x.restaurant),
      dish: mapDish(x.dish),
      photoUrl: x.photo || null,
      text: x.body || null,
      rating: x.rating ?? null,
      likeCount: 0,
      commentCount: 0,
      likedByMe: false,
      verified: !!x.is_verified,
    })),
  }
}
