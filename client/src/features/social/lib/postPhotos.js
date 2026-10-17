// The `post-photos` bucket is PRIVATE (sql/48): posts carry the object PATH (`<uid>/<file>`) and the
// viewer signs it. All signing goes through here, one createSignedUrls call per page of results.
// Never throws: a path that cannot be signed (not visible to this viewer, deleted, network) comes
// back as null and the screens show the photo placeholder instead.
//
// SMALL COPIES (sql/65): every post photo also has a 640px copy next to it, `<path>_w640.<ext>`. Feeds and grids sign and
// show that copy (signInBackground, withSignedPhotos(items, { small: true })); post detail keeps the full photo. A post
// whose small copy does not exist (older post, small upload failed) is shown with its full photo: the small path is
// signed first and the full path only for the paths that could not be signed. Cards and tiles that hit an image error
// re-sign the FULL path once (resignPostPhoto), then show the placeholder.
import { supabase } from '../../../lib/supabase'

export const POST_PHOTO_BUCKET = 'post-photos'

/** `<uid>/abc.jpg` -> `<uid>/abc_w640.jpg` (the same folder and extension, as sql/65 expects). Anything else is returned as it is. */
export function smallPhotoPath(path) {
  if (typeof path !== 'string' || /_w640\.[A-Za-z0-9]+$/.test(path)) return path     // (no lookbehind: older Safari fails to parse it)
  return path.replace(/(\.[A-Za-z0-9]+)$/, '_w640$1')
}

const TTL_S = 3600                          // lifetime requested for each signed URL
const REFRESH_MARGIN_MS = 5 * 60 * 1000     // re-sign when less than this is left
const MISS_MS = 60 * 1000                   // remember a failed path briefly, so re-renders don't hammer the API
const MAX_ENTRIES = 500

// path -> { url: string | null, exp: epoch ms }. In-memory only (never persisted), so a reload
// re-signs; it is emptied whenever the signed-in user changes.
const cache = new Map()

let owner
try {
  supabase.auth.onAuthStateChange((_event, session) => {
    const id = session?.user?.id || null
    if (id !== owner) { owner = id; cache.clear() }
  })
} catch { /* auth not available: the cache simply lives until reload */ }

function remember(path, url, now) {
  if (cache.size >= MAX_ENTRIES) {
    for (const [k, v] of cache) if (v.exp <= now) cache.delete(k)
    while (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value)
  }
  cache.set(path, { url, exp: now + (url ? TTL_S * 1000 - REFRESH_MARGIN_MS : MISS_MS) })
}

/** Signed URLs for `paths`: Map(path -> url | null). Cached paths are not re-signed. */
export async function signPostPhotos(paths) {
  const out = new Map()
  const todo = []
  const now = Date.now()
  for (const p of new Set(paths)) {
    const hit = cache.get(p)
    if (hit && hit.exp > now) out.set(p, hit.url)
    else todo.push(p)
  }
  if (todo.length) {
    try {
      const { data, error } = await supabase.storage.from(POST_PHOTO_BUCKET).createSignedUrls(todo, TTL_S)
      if (!error && Array.isArray(data)) {
        const at = Date.now()
        data.forEach((row, i) => {
          const path = row?.path || todo[i]
          if (!path) return
          const url = row?.signedUrl && !row.error ? row.signedUrl : null
          remember(path, url, at)
          out.set(path, url)
        })
      }
    } catch { /* leave unsigned; not cached, so the next load retries */ }
    for (const p of todo) if (!out.has(p)) out.set(p, null)
  }
  return out
}

/**
 * Display URLs for photo paths, small copy first: Map(path -> url | null), keyed by the FULL path. A path whose small copy
 * cannot be signed (it does not exist, or is not visible) gets the signed URL of the full photo instead. Cached paths are
 * not re-signed, and the full photos are only requested when some small copy is missing.
 */
export async function signSmallPhotos(paths) {
  const unique = [...new Set(paths)].filter(Boolean)
  const smalls = await signPostPhotos(unique.map(smallPhotoPath))
  const out = new Map()
  const missing = []
  for (const p of unique) {
    const url = smallPhotoPath(p) !== p ? smalls.get(smallPhotoPath(p)) : null
    if (url) out.set(p, url)
    else missing.push(p)
  }
  if (missing.length) {
    const full = await signPostPhotos(missing)
    for (const p of missing) out.set(p, full.get(p) || null)
  }
  return out
}

// the cached URL of a full path (undefined = not cached, null = cached as "cannot be signed")
function cachedFull(path, now) {
  const hit = cache.get(path)
  return hit && hit.exp > now ? hit.url : undefined
}

// the cached display URL of a path in small mode: the small copy's, else (small copy known to be missing) the full photo's
function cachedSmall(path, now) {
  const hit = cache.get(smallPhotoPath(path))
  if (!hit || hit.exp <= now) return undefined
  return hit.url || cachedFull(path, now)
}

/**
 * For the ranked feeds: lets a page render before its photos are signed. Items whose path is already in the cache get
 * their `photoUrl` at once; the others are marked `photoPending` (the card shows a shimmering photo box) and are signed
 * while the cards render. The first `firstBatch` paths (the photos on the first screen) go in their own small
 * createSignedUrls call, the rest in a second one sent at the same time: signing cost grows with the number of paths, so
 * the photos the guest sees first do not wait for the whole page. -> { items, signed: Promise<Map>[] } (empty when
 * nothing needs signing); hand each Map to applySigned() as it arrives. The promises never reject (signPostPhotos never
 * throws).
 */
export function signInBackground(items, { firstBatch = 3, small = true } = {}) {
  const now = Date.now()
  const todo = []
  const out = items.map(i => {
    if (!i?.photoPath) return i
    const url = small ? cachedSmall(i.photoPath, now) : cachedFull(i.photoPath, now)
    if (url !== undefined) return { ...i, photoUrl: url }
    todo.push(i.photoPath)
    return { ...i, photoPending: true }
  })
  const sign = small ? signSmallPhotos : signPostPhotos
  const head = todo.slice(0, firstBatch)
  const tail = todo.slice(firstBatch)
  return { items: out, signed: [head, tail].filter(batch => batch.length).map(batch => sign(batch)) }
}

/** Puts the signed URLs of signInBackground() into the items that were waiting for them (null = could not be signed). */
export function applySigned(items, map) {
  return items.map(i => (i?.photoPending && map.has(i.photoPath)
    ? { ...i, photoUrl: map.get(i.photoPath) || null, photoPending: false }
    : i))
}

/**
 * Fills `photoUrl` of mapped items/tiles that carry a `photoPath`; legacy absolute URLs are left as mapped.
 * `small: true` (feeds, grids, tiles) fills it with the 640px copy (the full photo where no copy exists); the default is
 * the full photo (post detail).
 */
export async function withSignedPhotos(items, { small = false } = {}) {
  const paths = items.map(i => i?.photoPath).filter(Boolean)
  if (!paths.length) return items
  const signed = await (small ? signSmallPhotos(paths) : signPostPhotos(paths))
  return items.map(i => (i?.photoPath ? { ...i, photoUrl: signed.get(i.photoPath) || null } : i))
}

/**
 * One fresh createSignedUrls for a single FULL path (drops its cache entry first). Used once when an <img> failed to load:
 * a card showing the small copy falls back to the full photo here.
 */
export async function resignPostPhoto(path) {
  cache.delete(path)
  const signed = await signPostPhotos([path])
  return signed.get(path) || null
}
