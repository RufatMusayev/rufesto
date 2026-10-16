// Every Supabase call of the Posts page (dashboard, /posts). Same rules as api.js: all functions
// return { data, error } and never throw. Kept in its own file because api.js is already past the
// file-size budget. Source of truth: docs/V2-CONTRACT.md section 17 (sql/58_feed_schema.sql).
//
// View-model
//   PostItem { id, createdAt, photoPath, photoUrl, caption, likeCount, commentCount,
//              dish: { id, name, available } | null }
//   PostsPage { items: PostItem[], nextCursor: string | null }

import { supabase } from '../../lib/supabase'
import { isNotReady } from './errors'

export const POST_BUCKET = 'post-photos'
const SIGN_TTL_S = 3600
const PAGE_SIZE = 20

async function run(fn) {
  try {
    const res = await fn()
    return { data: res?.data ?? null, error: res?.error ?? null }
  } catch (error) {
    return { data: null, error }
  }
}

const toCount = v => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0 }

/** The restaurant's dishes for the tag select: [{ id, name, available }], by name. */
export async function fetchPostDishes(restaurantId) {
  // CONTRACT: the staff of a restaurant read its dishes (id, name, available) through RLS, as the Menu page does.
  const res = await run(() => supabase.from('dishes').select('id, name, available').eq('restaurant_id', restaurantId).order('name'))
  if (res.error) return res
  return { data: (res.data || []).map(d => ({ id: d.id, name: d.name || '', available: d.available !== false })), error: null }
}

/**
 * Uploads the prepared JPEG to `post-photos` at `r/<restaurant id>/<uuid>.jpg` and returns the path.
 * CONTRACT: sql/58 storage policies let a manager of the restaurant insert into the `r/<restaurant id>/` folder.
 */
export async function uploadPostPhoto(restaurantId, blob) {
  const path = `r/${restaurantId}/${crypto.randomUUID()}.jpg`
  const res = await run(() => supabase.storage.from(POST_BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false }))
  return res.error ? { data: null, error: res.error } : { data: path, error: null }
}

/** Best effort: deletes an uploaded object nobody references (a failed publish, a deleted post). Never reports a failure. */
export async function removePostPhoto(path) {
  if (!path || !path.startsWith('r/')) return
  try { await supabase.storage.from(POST_BUCKET).remove([path]) } catch { /* the object stays; harmless */ }
}

/** Publishes a restaurant post. `photoPath` and `caption` are each optional, but not both (empty_post). */
export async function createRestaurantPost({ restaurantId, photoPath, caption, dishId }) {
  // CONTRACT: create_restaurant_post(p_restaurant_id, p_photo_url, p_caption, p_dish_id) -> { id, created_at }
  // p_photo_url is the storage PATH (not a URL). Errors (message == code): forbidden, empty_post,
  // invalid_photo_url, caption_too_long, dish_not_found, too_many_posts.
  const res = await run(() => supabase.rpc('create_restaurant_post', {
    p_restaurant_id: restaurantId,
    p_photo_url: photoPath || null,
    p_caption: caption || null,
    p_dish_id: dishId || null,
  }))
  if (res.error) return res
  const row = Array.isArray(res.data) ? res.data[0] : res.data
  return { data: { id: row?.id || null, createdAt: row?.created_at || null }, error: null }
}

// Exceptions create_restaurant_post raises when it REFUSES the post (message == code), so nothing was written.
// Anything else (a network failure, a timeout, an unknown error) is ambiguous: the server may have committed.
const REFUSED = new Set(['forbidden', 'empty_post', 'invalid_photo_url', 'caption_too_long', 'dish_not_found', 'too_many_posts'])

/** True when `err` proves the post was not created: a refusal above, or a function that is not deployed at all. */
export function isDefiniteRejection(err) {
  return REFUSED.has(String(err?.message || '').trim().toLowerCase()) || isNotReady(err)
}

/** Signed URLs for a page of photo paths in ONE call: Map(path -> url | null). Never throws. */
async function signPhotos(paths) {
  const out = new Map()
  const unique = [...new Set(paths)]
  if (unique.length) {
    try {
      const { data, error } = await supabase.storage.from(POST_BUCKET).createSignedUrls(unique, SIGN_TTL_S)
      if (!error && Array.isArray(data)) {
        data.forEach((row, i) => {
          const path = row?.path || unique[i]
          if (path) out.set(path, row?.signedUrl && !row.error ? row.signedUrl : null)
        })
      }
    } catch { /* leave unsigned: the card shows a placeholder */ }
  }
  for (const p of unique) if (!out.has(p)) out.set(p, null)
  return out
}

/** A fresh signed URL for one photo path, or null. Used once by a card whose signed URL expired. */
export async function signPostPhoto(path) {
  return (await signPhotos([path])).get(path) || null
}

function mapPost(raw) {
  const photo = raw.photo_url || ''
  const isUrl = /^https?:\/\//i.test(photo)       // legacy absolute URL: shown as is, nothing to sign
  return {
    id: raw.id,
    createdAt: raw.created_at,
    photoPath: photo && !isUrl ? photo : null,
    photoUrl: isUrl ? photo : null,
    caption: raw.caption || raw.text || '',
    likeCount: toCount(raw.like_count),
    commentCount: toCount(raw.comment_count),
    dish: raw.dish && raw.dish.id ? { id: raw.dish.id, name: raw.dish.name || '', available: raw.dish.available !== false } : null,
  }
}

/** One page of the restaurant's own posts, newest first. `cursor` = the previous page's nextCursor (null for the first). */
export async function fetchRestaurantPosts(restaurantId, cursor = null) {
  // CONTRACT: restaurant_posts(p_restaurant_id, p_cursor timestamptz, p_limit) -> { items: [post item, 17.2], next_cursor }
  const res = await run(() => supabase.rpc('restaurant_posts', { p_restaurant_id: restaurantId, p_cursor: cursor, p_limit: PAGE_SIZE }))
  if (res.error) return res
  const body = Array.isArray(res.data) ? res.data[0] : res.data
  const items = (Array.isArray(body?.items) ? body.items : []).filter(r => r && r.id).map(mapPost)
  const signed = await signPhotos(items.map(i => i.photoPath).filter(Boolean))
  for (const item of items) if (item.photoPath) item.photoUrl = signed.get(item.photoPath) || null
  return { data: { items, nextCursor: body?.next_cursor || null }, error: null }
}

/**
 * Deletes a post (the poster or a manager of the tagged restaurant may). A post that is already gone counts as
 * deleted. The photo object is removed afterwards, best effort.
 */
export async function deletePost(post) {
  // CONTRACT: delete_post(p_id uuid) -> void; error post_not_found (sql/40b).
  const res = await run(() => supabase.rpc('delete_post', { p_id: post.id }))
  if (res.error) {
    // Already gone (deleted elsewhere): drop it from the list, but leave the object alone since the row was not seen deleted.
    if (String(res.error.message || '').trim().toLowerCase() === 'post_not_found') return { data: true, error: null }
    return { data: null, error: res.error }
  }
  await removePostPhoto(post.photoPath)
  return { data: true, error: null }
}
