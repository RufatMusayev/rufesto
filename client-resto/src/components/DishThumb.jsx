import { useState } from 'react'
import './DishThumb.css'

const UNSPLASH = /^https?:\/\/images\.unsplash\.com\//i

/**
 * A small rendition of a dish photo for a 32-46 px thumbnail. Unsplash links (the seed photos) are asked for w=96;
 * other sources (the dish-photos bucket) are used as they are.
 */
export function thumbSrc(url, width = 96) {
  if (!url || typeof url !== 'string') return ''
  if (!UNSPLASH.test(url)) return url
  try {
    const u = new URL(url)
    u.searchParams.set('w', String(width))
    u.searchParams.set('q', '70')
    u.searchParams.set('auto', 'format')
    u.searchParams.delete('h')
    return u.toString()
  } catch {
    return url
  }
}

const DRINK = new Set(['beverage', 'beverages', 'drink', 'drinks', 'alcoholic', 'coffee', 'tea'])
const SWEET = new Set(['dessert', 'desserts', 'sweets'])

const svg = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }

// The fallback when a dish has no photo (or it fails to load). Three plain icons by category: a cup, a cupcake and a
// fork and knife. They say "a drink / a sweet / a dish" and nothing more, unlike an emoji that has to guess the exact food.
function CategoryIcon({ category }) {
  const c = String(category || '').toLowerCase()
  if (DRINK.has(c)) {
    return <svg {...svg}><path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z" /><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16" /><path d="M8.5 3.5v2M12 3.5v2" /></svg>
  }
  if (SWEET.has(c)) {
    return <svg {...svg}><path d="M6.5 12h11l-1.3 8h-8.4z" /><path d="M6 12a6 5 0 0 1 12 0" /><path d="M12 4.5v2" /></svg>
  }
  return <svg {...svg}><path d="M6 3v5a3 3 0 0 0 6 0V3" /><path d="M9 3v18" /><path d="M17 21V3c-2.4 1.6-3.5 4.4-3.5 7.2 0 1.6 1.2 2.8 3.5 2.8" /></svg>
}

/**
 * The picture of a dish in a list (orders, tickets, overview, menu): its photo, or an icon of its category.
 * size: 'md' (36 px, default) | 'sm' (30 px) | 'fill' (fills its parent).
 */
export default function DishThumb({ photo, category, size = 'md' }) {
  const src = thumbSrc(photo)
  const [failed, setFailed] = useState('')
  const showPhoto = src && failed !== src
  return (
    <span className={`dish-thumb dish-thumb--${size}`} aria-hidden="true">
      {showPhoto
        ? <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(src)} />
        : <CategoryIcon category={category} />}
    </span>
  )
}
