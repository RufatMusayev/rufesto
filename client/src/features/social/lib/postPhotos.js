// The `post-photos` bucket is PRIVATE (sql/48): posts carry the object PATH (`<uid>/<file>`) and the
// viewer signs it. All signing goes through here, one createSignedUrls call per page of results.
// Never throws: a path that cannot be signed (not visible to this viewer, deleted, network) comes
// back as null and the screens show the photo placeholder instead.
import { supabase } from '../../../lib/supabase'

export const POST_PHOTO_BUCKET = 'post-photos'

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

/** Fills `photoUrl` of mapped items/tiles that carry a `photoPath`; legacy absolute URLs are left as mapped. */
export async function withSignedPhotos(items) {
  const paths = items.map(i => i?.photoPath).filter(Boolean)
  if (!paths.length) return items
  const signed = await signPostPhotos(paths)
  return items.map(i => (i?.photoPath ? { ...i, photoUrl: signed.get(i.photoPath) || null } : i))
}
