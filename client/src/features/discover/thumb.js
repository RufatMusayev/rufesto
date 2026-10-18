// Small renditions of photos for small boxes (QA round 3, A3: the Search zero state loaded 15 originals of 800 px for
// 48 px thumbnails, 1.6 MB). The seed photos are Unsplash URLs, which resize on the fly: ask for the box size x2 (retina)
// as a cropped, compressed copy. Anything else (Storage photos, logos, data URLs) is returned as it is: post photos
// already come as their `_w640` copy (social/lib/postPhotos.js) and the dish-photos bucket has no renditions.

const RETINA = 2

/** `thumb(url, 48)` -> `...?w=96&h=96&fit=crop&q=70&auto=format` for an Unsplash url; `thumb(url, 136, 85)` for a 136x85 box. */
export function thumb(url, w, h = w) {
  if (!url || typeof url !== 'string') return url
  try {
    const u = new URL(url)
    if (u.hostname !== 'images.unsplash.com') return url
    u.searchParams.set('w', String(Math.round(w * RETINA)))
    u.searchParams.set('h', String(Math.round(h * RETINA)))
    u.searchParams.set('fit', 'crop')
    u.searchParams.set('q', '70')
    if (!u.searchParams.has('auto')) u.searchParams.set('auto', 'format')
    return u.toString()
  } catch {
    return url
  }
}
