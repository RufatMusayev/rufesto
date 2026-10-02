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

const mapDish = d => (d ? { id: d.id || null, name: d.name || '', photo: d.photo || null } : null)

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

export const mapSearchRow = r => ({
  id: r.id,
  name: r.name || null,
  photo: r.profile_photo || null,
  status: mapStatus(r.friendship_status ?? r.friendship),
})

/** A feed entry: kind 'post' | 'review'. */
export const mapFeedItem = r => ({
  kind: r.kind === 'review' ? 'review' : 'post',
  id: r.id,
  createdAt: r.created_at,
  why: r.why || null,                       // 'own' | 'friend' | 'following'
  user: mapUser(r.user),
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
})

export const mapComment = c => ({
  id: c.id,
  user: mapUser(c.user),
  body: c.body || '',
  createdAt: c.created_at,
  mine: !!c.mine,
})

/** A review row read straight from the `reviews` table (signed-out feed). */
export const mapReviewRow = r => ({
  kind: 'review',
  id: r.id,
  createdAt: r.created_at,
  why: null,
  user: mapUser(r.users),
  restaurant: mapRestaurant(r.dishes?.restaurants),
  dish: mapDish(r.dishes),
  photoUrl: r.photo || null,
  text: r.body || null,
  rating: r.rating ?? null,
  likeCount: 0,
  commentCount: 0,
  likedByMe: false,
  verified: !!r.is_verified,
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
