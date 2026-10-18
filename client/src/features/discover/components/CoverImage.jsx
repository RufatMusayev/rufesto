import { useCallback, useEffect, useState } from 'react'
import { thumb } from '../thumb'

const initials = name => {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean)
  return ((words[0]?.[0] || '') + (words.length > 1 ? words[1][0] : '')).toUpperCase() || '·'
}

/**
 * The picture of a place or dish, in a fixed box (the parent's CSS sizes it, so nothing shifts while the image
 * loads; the box shows --s3 until the picture fades in). `sources` is tried in order: [{ url, fit?: 'cover' | 'logo' }];
 * an image that fails to load moves on to the next one, and when none is left the box shows the initials of `name`
 * (never emoji art). Restaurant cover order: cover_photo, cover_fallback (first dish photo), logo.
 * `size` is the box in CSS px (a number, or [width, height]): the picture is requested as a small rendition of that size
 * (thumb.js), so a 48 px thumbnail does not download an 800 px original.
 */
export default function CoverImage({ sources, name, eager = false, size = null }) {
  const [w, h] = Array.isArray(size) ? size : [size, size]
  const list = sources.filter(s => s && s.url).map(s => (w ? { ...s, url: thumb(s.url, w, h) } : s))
  const key = list.map(s => s.url).join('|')
  const [at, setAt] = useState(0)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => { setAt(0); setLoaded(false) }, [key])
  const cur = list[at]
  // an image that is already in the cache can be complete before React attaches onLoad
  const ref = useCallback(el => { if (el && el.complete && el.naturalWidth > 0) setLoaded(true) }, [])
  if (!cur) return <span className="dsc-initials" aria-hidden="true">{initials(name)}</span>
  return (
    <img
      key={cur.url} ref={ref}
      className={`dsc-img${cur.fit === 'logo' ? ' dsc-img-logo' : ''}${loaded ? ' is-in' : ''}`}
      src={cur.url} alt="" draggable={false}
      loading={eager ? 'eager' : 'lazy'} decoding="async"
      onLoad={() => setLoaded(true)}
      onError={() => { setLoaded(false); setAt(i => i + 1) }}
    />
  )
}

/** Sources for a restaurant card: cover_photo, then the first dish photo, then the logo. */
export const restaurantSources = r => [
  { url: r.coverPhoto }, { url: r.coverFallback }, { url: r.logo, fit: 'logo' },
]
