// Every Supabase call of the social feature (tables, RPCs, storage, realtime) lives here.
// Functions return { data, error } and never throw; `error` is { code, key } (see errors.js).
// Names and shapes follow docs/V2-CONTRACT.md section 1 (sql/40 .. 43); each call carries a
// `// CONTRACT:` note so a rename there is a one-line change.
import { supabase } from '../../lib/supabase'
import { rsrc } from '../../lib/publicSource'
import { toError } from './errors'
import { POST_PHOTO_BUCKET, withSignedPhotos } from './lib/postPhotos'
import {
  mapFriend, mapRequest, mapSearchRow, mapFeedItem, mapComment, mapReviewRow, mapProfile,
} from './mappers'

// CONTRACT: PRIVATE bucket 'post-photos' (sql/43 + sql/48: 5 MB, jpeg/png/webp, authenticated insert
// only into the caller's own <uid>/ folder). posts.photo_url holds the object PATH (`<uid>/<file>`);
// feed / get_post / get_public_profile return it as-is and the client signs it per page of results
// (lib/postPhotos.js, createSignedUrls, 1 h, cached in memory). If the bucket is missing on the
// server, the new-post screen drops to caption-only with a "Photo upload coming soon" note
// (see uploadPostPhoto + NewPostPage).
export const PHOTO_UPLOAD_ENABLED = true
export { POST_PHOTO_BUCKET }
const postPhotoPath = uid => `${uid}/${Date.now()}.jpg`
// CONTRACT: create_post(p_photo_url, p_caption, p_restaurant_id DEFAULT NULL, ...): the tag is optional.
export const POST_REQUIRES_RESTAURANT = false
export const FEED_PAGE_SIZE = 15

async function call(fn) {
  try {
    const { data, error, count } = await fn()
    if (error) return { data: null, error: toError(error) }
    return { data, error: null, count }
  } catch (err) {
    return { data: null, error: toError(err) }
  }
}
const rpc = (name, args) => call(() => supabase.rpc(name, args))
const first = data => (Array.isArray(data) ? data[0] : data)

let channelSeq = 0
function listen(prefix, specs, onEvent) {
  try {
    let ch = supabase.channel(`soc-${prefix}-${++channelSeq}`)
    for (const spec of specs) {
      ch = ch.on('postgres_changes', { schema: 'public', event: '*', ...spec }, onEvent)
    }
    ch.subscribe()
    return () => { try { supabase.removeChannel(ch) } catch { /* already gone */ } }
  } catch {
    return () => {}
  }
}

/* ------------------------------------------------------------------ friends */

export async function listFriends() {
  // CONTRACT: my_friends() -> [{ friendship_id, user_id, name, profile_photo, since }]
  const { data, error } = await rpc('my_friends')
  if (error) return { data: null, error }
  return { data: (data || []).map(mapFriend), error: null }
}

export async function listRequests() {
  // CONTRACT: friend_requests() -> { incoming: [{ id, user_id, name, profile_photo, created_at }], outgoing: [...] }
  const { data, error } = await rpc('friend_requests')
  if (error) return { data: null, error }
  return {
    data: {
      incoming: (data?.incoming || []).map(mapRequest),
      outgoing: (data?.outgoing || []).map(mapRequest),
    },
    error: null,
  }
}

export async function searchUsers(query) {
  // CONTRACT: search_users(p_q text, >= 3 chars, shorter returns []) -> [{ id, name, profile_photo, friendship_status }]
  const { data, error } = await rpc('search_users', { p_q: query })
  if (error) return { data: null, error }
  return { data: (data || []).map(mapSearchRow), error: null }
}

export async function sendFriendRequest(userId) {
  // CONTRACT: send_friend_request(p_user_id uuid) -> { id, status: 'pending' | 'accepted' }
  // (if they already asked us, the RPC accepts instead of creating a second request)
  const { data, error } = await rpc('send_friend_request', { p_user_id: userId })
  if (error) return { data: null, error }
  return { data: { id: data?.id || null, status: data?.status === 'accepted' ? 'friends' : 'pending_out' }, error: null }
}

export async function respondFriendRequest(requestId, accept) {
  // CONTRACT: respond_friend_request(p_id uuid, p_accept boolean) -> { id, status: 'accepted' | 'declined' }
  return rpc('respond_friend_request', { p_id: requestId, p_accept: !!accept })
}

export async function cancelFriendRequest(requestId) {
  // CONTRACT: cancel_friend_request(p_id uuid) -> { id, cancelled } (requester only, while pending)
  return rpc('cancel_friend_request', { p_id: requestId })
}

export async function removeFriend(userId) {
  // CONTRACT: remove_friend(p_user_id uuid) -> { removed } (unfriends or cancels my outgoing request)
  return rpc('remove_friend', { p_user_id: userId })
}

export async function countIncomingRequests(userId) {
  // CONTRACT: table friendships (addressee_id, status 'pending'), select allowed to both parties
  const res = await call(() => supabase
    .from('friendships').select('id', { count: 'exact', head: true })
    .eq('addressee_id', userId).eq('status', 'pending'))
  return res.error ? { data: null, error: res.error } : { data: res.count || 0, error: null }
}

/** Live changes of friendships touching this user (incoming requests, accepted outgoing). */
export function subscribeFriendships(userId, onChange) {
  // CONTRACT: realtime on friendships filtered addressee_id / requester_id
  return listen('friends', [
    { table: 'friendships', filter: `addressee_id=eq.${userId}` },
    { table: 'friendships', filter: `requester_id=eq.${userId}` },
  ], onChange)
}

/* ------------------------------------------------------------------ profiles */

export async function getPublicProfile(userId) {
  // CONTRACT: get_public_profile(p_user_id) (anon + authenticated) ->
  //   { id, name, profile_photo, friendship, friendship_status, counts:{posts,friends,reviews}, posts:[...], reviews:[...] }
  // raises user_not_found for an unknown, banned or blocking user -> { data: null, error: null }.
  // Never contains email or phone.
  const { data, error } = await rpc('get_public_profile', { p_user_id: userId })
  if (error) return error.code === 'user_not_found' ? { data: null, error: null } : { data: null, error }
  const profile = mapProfile(first(data))
  if (profile) profile.posts = await withSignedPhotos(profile.posts)
  return { data: profile, error: null }
}

/* -------------------------------------------------------------------- feed */

export async function getFeed({ scope = 'all', cursor = null, limit = FEED_PAGE_SIZE } = {}) {
  // CONTRACT: feed(p_scope 'all' | 'friends', p_cursor timestamptz, p_limit int) -> { items: [...], next_cursor }
  // (authenticated only; 'friends' = mine + my friends' posts and reviews)
  const { data, error } = await rpc('feed', { p_scope: scope, p_cursor: cursor, p_limit: limit })
  if (error) return { data: null, error }
  const items = await withSignedPhotos((data?.items || []).map(mapFeedItem))
  return { data: { items, nextCursor: data?.next_cursor || null }, error: null }
}

/** Signed-out fallback for the Feed tab: recent public reviews (same read as Discover). */
export async function getPublicReviews(limit = FEED_PAGE_SIZE) {
  const { data, error } = await call(() => supabase
    .from('reviews')
    .select(`*, dishes(id, name, photo, restaurant_id, ${rsrc()}(id, name, slug, logo)), users(name, profile_photo)`)
    .eq('is_flagged', false)
    .order('created_at', { ascending: false })
    .limit(limit))
  if (error) return { data: null, error }
  return { data: { items: (data || []).map(mapReviewRow), nextCursor: null }, error: null }
}

/** Posts INSERT stream for the "New posts" pill. onInsert({ userId }). */
export function subscribePosts(onInsert) {
  // CONTRACT: realtime INSERT on posts (RLS decides what each client sees)
  return listen('posts', [{ table: 'posts', event: 'INSERT' }], p => onInsert({ userId: p?.new?.user_id || null }))
}

/* ------------------------------------------------------------------- posts */

export async function getPost(postId) {
  // CONTRACT: get_post(p_post_id) (anon + authenticated) -> one feed() item (kind 'post');
  // raises post_not_found when hidden or deleted -> { data: null, error: null }.
  const { data, error } = await rpc('get_post', { p_post_id: postId })
  if (error) return error.code === 'post_not_found' ? { data: null, error: null } : { data: null, error }
  const row = first(data)
  const item = row ? (await withSignedPhotos([mapFeedItem({ kind: 'post', ...row })]))[0] : null
  return { data: item, error: null }
}

export async function createPost({ restaurantId, photoPath, caption, visibility = 'public' }) {
  // CONTRACT: create_post(p_photo_url, p_caption, p_restaurant_id, p_dish_id, p_visit_id, p_visibility) -> { id, created_at }
  // p_photo_url is the bare object path returned by uploadPostPhoto (`<uid>/<file>`), not a URL.
  const { data, error } = await rpc('create_post', {
    p_photo_url: photoPath || null, p_caption: caption || null,
    ...(restaurantId ? { p_restaurant_id: restaurantId } : {}), p_visibility: visibility,
  })
  if (error) return { data: null, error }
  return { data: { id: data?.id, createdAt: data?.created_at }, error: null }
}

export async function deletePost(postId) {
  // CONTRACT: delete_post(p_id uuid) -> void (author or restaurant manager)
  return rpc('delete_post', { p_id: postId })
}

export async function togglePostLike(postId) {
  // CONTRACT: toggle_post_like(p_post_id uuid) -> { liked, like_count }
  const { data, error } = await rpc('toggle_post_like', { p_post_id: postId })
  if (error) return { data: null, error }
  return { data: { liked: !!data?.liked, likeCount: Number(data?.like_count) || 0 }, error: null }
}

export async function setReviewLike(reviewId, userId, like) {
  // CONTRACT: existing polymorphic `likes` table, target_type 'review' (as HomePage does)
  return call(() => (like
    ? supabase.from('likes').insert({ user_id: userId, target_type: 'review', target_id: reviewId })
    : supabase.from('likes').delete().eq('user_id', userId).eq('target_type', 'review').eq('target_id', reviewId)))
}

/** Uploads to `<uid>/<file>` in the private bucket and resolves { data: path } (pass it to createPost). */
export async function uploadPostPhoto(userId, blob) {
  if (!PHOTO_UPLOAD_ENABLED) return { data: null, error: toError({ message: 'photo_disabled' }) }
  const path = postPhotoPath(userId)
  try {
    const { error } = await supabase.storage
      .from(POST_PHOTO_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false })
    if (error) {
      // bucket not created on this database yet: the screen falls back to caption-only
      const missing = /bucket not found/i.test(error.message || '') || String(error.statusCode) === '404'
      return { data: null, error: toError({ message: missing ? 'photo_disabled' : 'upload_failed' }) }
    }
  } catch {
    return { data: null, error: toError({ message: 'upload_failed' }) }
  }
  return { data: path, error: null }
}

export async function searchRestaurants(query) {
  const q = String(query || '').trim().replace(/[\\%_]/g, m => `\\${m}`)
  const { data, error } = await call(() => supabase
    .from(rsrc()).select('id, name, slug, cuisine_type, logo')
    .eq('status', 'active').ilike('name', `%${q}%`).order('name').limit(8))
  return error ? { data: null, error } : { data: data || [], error: null }
}

/* ---------------------------------------------------------------- comments */

export async function listComments(postId, { cursor = null, limit = 30 } = {}) {
  // CONTRACT: post_comments(p_post_id, p_cursor timestamptz, p_limit) -> { items, next_cursor }, newest first
  const { data, error } = await rpc('post_comments', { p_post_id: postId, p_cursor: cursor, p_limit: limit })
  if (error) return { data: null, error }
  return { data: { items: (data?.items || []).map(mapComment), nextCursor: data?.next_cursor || null }, error: null }
}

export async function addComment(postId, body) {
  // CONTRACT: add_post_comment(p_post_id, p_body) -> { id, post_id, body, created_at, comment_count }
  const { data, error } = await rpc('add_post_comment', { p_post_id: postId, p_body: body })
  if (error) return { data: null, error }
  return {
    data: { id: data.id, body: data.body, createdAt: data.created_at, commentCount: Number(data.comment_count) || 0 },
    error: null,
  }
}

export async function deleteComment(commentId) {
  // CONTRACT: delete_post_comment(p_comment_id uuid) -> void
  return rpc('delete_post_comment', { p_comment_id: commentId })
}

/** Live comments of one post. onChange({ type: 'INSERT' | 'DELETE', id }). */
export function subscribeComments(postId, onChange) {
  // CONTRACT: realtime on post_comments filtered post_id
  return listen(`comments-${postId.slice(0, 8)}`, [{ table: 'post_comments', filter: `post_id=eq.${postId}` }],
    p => onChange({ type: p?.eventType, id: (p?.new?.id || p?.old?.id) || null }))
}
