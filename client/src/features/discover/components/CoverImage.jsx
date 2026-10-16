import { useEffect, useState } from 'react'

const initials = name => {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean)
  return ((words[0]?.[0] || '') + (words.length > 1 ? words[1][0] : '')).toUpperCase() || '·'
}

/**
 * The picture of a restaurant or dish card, in a fixed aspect box (the box is sized by the parent's CSS, so
 * nothing shifts while the image loads). `sources` is tried in order: [{ url, fit?: 'cover' | 'logo' }];
 * an image that fails to load moves on to the next one, and when none is left the box shows the initials of
 * `name` (never emoji art). Restaurant cover order: cover_photo, cover_fallback (first dish photo), logo.
 */
export default function CoverImage({ sources, name, eager = false }) {
  const list = sources.filter(s => s && s.url)
  const key = list.map(s => s.url).join('|')
  const [at, setAt] = useState(0)
  useEffect(() => { setAt(0) }, [key])
  const cur = list[at]
  if (!cur) return <span className="dsc-initials" aria-hidden="true">{initials(name)}</span>
  return (
    <img
      key={cur.url}
      className={cur.fit === 'logo' ? 'dsc-img dsc-img-logo' : 'dsc-img'}
      src={cur.url} alt="" draggable={false}
      loading={eager ? 'eager' : 'lazy'} decoding="async"
      onError={() => setAt(i => i + 1)}
    />
  )
}

/** Sources for a restaurant card: cover_photo, then the first dish photo, then the logo. */
export const restaurantSources = r => [
  { url: r.coverPhoto }, { url: r.coverFallback }, { url: r.logo, fit: 'logo' },
]
