import { useState } from 'react'
import { dishEmoji } from '../lib/dishEmoji'
import './DishThumb.css'

/**
 * A small square picture of a dish for list rows (order lines, the review prompt): the dish photo when it has one
 * (and it loads), else the emoji of its category refined by its name (lib/dishEmoji). `size` in px, default 40.
 */
export default function DishThumb({ name, category, photo, size = 40 }) {
  const [failed, setFailed] = useState(false)
  const style = { '--dish-thumb': `${size}px` }
  if (photo && !failed) {
    return <img className="dish-thumb" style={style} src={photo} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
  }
  return <span className="dish-thumb dish-thumb--emoji" style={style} aria-hidden="true">{dishEmoji({ name, category })}</span>
}
