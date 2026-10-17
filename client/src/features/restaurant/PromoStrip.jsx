import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchPromos, trackPromoClick } from './api'

/**
 * The restaurant's active promos as slim rows pinned above the post grid (ad_campaigns, readable by anyone while
 * active). A promo that points at a dish opens that dish's sheet; one without a dish is just a banner.
 */
export default function PromoStrip({ restaurantId, onOpenDish }) {
  const { t } = useTranslation('restaurant')
  const [promos, setPromos] = useState([])

  useEffect(() => {
    let alive = true
    fetchPromos(restaurantId).then(rows => { if (alive) setPromos(rows) })
    return () => { alive = false }
  }, [restaurantId])

  if (!promos.length) return null
  return (
    <ul className="rst-promos" aria-label={t('posts.promoList')}>
      {promos.map(p => {
        const text = p.title || p.description
        if (!text) return null
        const body = (
          <>
            <span className="rst-promo-tag">{t('posts.promo')}</span>
            <span className="rst-promo-text">{text}</span>
          </>
        )
        return (
          <li key={p.id}>
            {p.dish_id ? (
              <button
                type="button"
                className="rst-promo rst-promo--tap"
                onClick={() => { trackPromoClick(p.id); onOpenDish(p.dish_id) }}
              >
                {body}
                <svg viewBox="0 0 20 20" className="rst-promo-go" aria-hidden="true">
                  <path fill="currentColor" d="M7.2 4.2a.75.75 0 0 1 1.06 0l5.25 5.25a.75.75 0 0 1 0 1.06L8.26 15.8a.75.75 0 1 1-1.06-1.06l4.72-4.72-4.72-4.72a.75.75 0 0 1 0-1.1z" />
                </svg>
              </button>
            ) : (
              <div className="rst-promo">{body}</div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
