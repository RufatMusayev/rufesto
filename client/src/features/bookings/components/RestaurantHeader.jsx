import { useState } from 'react'
import { cuisineEmoji } from '../../../lib/helpers'

/** Cover thumb, restaurant name and cuisine. Falls back to a cuisine emoji when there is no photo. */
export default function RestaurantHeader({ restaurant }) {
  const [broken, setBroken] = useState(false)
  const showImg = !!restaurant.cover && !broken
  return (
    <div className="bk-rest">
      <div className="bk-rest-thumb" aria-hidden="true">
        {showImg
          ? <img src={restaurant.cover} alt="" loading="lazy" onError={() => setBroken(true)} />
          : <span>{cuisineEmoji(restaurant.cuisine)}</span>}
      </div>
      <div className="bk-rest-text">
        <h2 className="bk-rest-name">{restaurant.name}</h2>
        {restaurant.cuisine ? <div className="bk-rest-sub">{restaurant.cuisine}</div> : null}
      </div>
    </div>
  )
}
