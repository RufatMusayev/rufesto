import { memo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Avatar, Img } from '../../components/ui'
import { cuisineLabel } from '../discover/cuisine'
import { thumb } from '../discover/thumb'
import { formatNumber } from '../../lib/helpers'
import { langOf } from '../../lib/lang'
import { openState } from '../../lib/openState'
import { distanceText, walkMinutes } from './distance'
import { kindOneKey } from './kind'
import { statusLabel } from './status'

const initials = name => {
  const w = String(name || '').trim().split(/\s+/).filter(Boolean)
  return ((w[0]?.[0] || '') + (w.length > 1 ? w[1][0] : '')).toUpperCase() || '·'
}

/** "Offer -20%" / "Offer -3 ₼" / "Offer": what the campaign says in a few characters. */
function promoText(t, promo) {
  const pct = promo.discount_percent
  const amt = promo.discount_amount
  if (pct > 0) return `${t('promo')} −${Math.round(pct)}%`
  if (amt > 0) return `${t('promo')} −${formatNumber(amt, amt % 1 ? 2 : 0)} ₼`
  return t('promo')
}

/**
 * The place card (docs/MAP-PLAN-2026-10-18.md 3): cover 84, name (Playfair), kind · cuisine · price band, rating (count) ·
 * distance · walk (distance only with a location), open state, offer badge, friends who have been here, and the three
 * actions Menu / Book / Directions. The cover, name and text are one link to the restaurant page.
 *  variant "carousel" (a slide: fixed width, same height in the whole set) | "inline" (desktop panel, fills the panel, with a close button: onClose)
 */
export default memo(function PlaceCard({ place, nowMin, km, onDirections, onClose, variant = 'carousel', tall = false }) {
  const { t, i18n } = useTranslation('map')
  const lang = langOf(i18n.language)
  const st = openState(place, nowMin)
  const to = place.slug ? `/restaurant/${place.slug}` : null
  const price = place.price_band ? '₼'.repeat(place.price_band) : null
  const sub = [t(kindOneKey(place.kind)), place.cuisine_type ? cuisineLabel(t, place.cuisine_type) : null, price].filter(Boolean).join(' · ')
  const walk = walkMinutes(km)
  const stats = [
    place.rating != null && place.review_count > 0 ? `★${formatNumber(place.rating, 1)} (${place.review_count})` : null,
    distanceText(t, km, lang),
    walk != null ? t('walk', { count: walk }) : null,
  ].filter(Boolean).join(' · ')
  const fr = place.friends && place.friends.count > 0 ? place.friends : null
  const frName = fr?.top?.[0]?.name || ''
  const frText = fr
    ? (fr.count === 1 || !frName ? t('friendsOne', { name: frName }) : t('friendsMany', { name: frName, count: fr.count - 1 }))
    : null

  const cover = (
    <span className="mp-card-cover">
      <Img
        src={thumb(place.cover, 84)} alt="" className="mp-card-img"
        fallback={<span className="mp-card-initials" aria-hidden="true">{initials(place.name)}</span>}
      />
      {place.promo && <span className="mp-card-promo">{promoText(t, place.promo)}</span>}
    </span>
  )
  const text = (
    <span className="mp-card-text">
      <span className="mp-card-name">{place.name}</span>
      {sub && <span className="mp-card-sub">{sub}</span>}
      {stats && <span className="mp-card-stats">{stats}</span>}
      <span className={`mp-card-status is-${st.state}`}>{statusLabel(t, st)}</span>
    </span>
  )

  return (
    <article
      className={`mp-card mp-card--${variant}${tall ? ' has-friends' : ''}`}
      data-id={place.id}
      aria-label={place.name}
    >
      {onClose && (
        <button type="button" className="mp-card-x" onClick={onClose} aria-label={t('common:close')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      )}
      {to ? <Link to={to} className="mp-card-main">{cover}{text}</Link> : <div className="mp-card-main">{cover}{text}</div>}
      {fr ? (
        <p className="mp-card-friends">
          <span className="mp-card-avatars" aria-hidden="true">
            {fr.top.slice(0, 3).map((f, i) => <Avatar key={f.id || i} name={f.name} src={f.profile_photo} size={20} />)}
          </span>
          <span className="mp-card-friends-text">{frText}</span>
        </p>
      ) : tall ? <span className="mp-card-friends mp-card-spacer" aria-hidden="true" /> : null}
      <div className="mp-card-actions">
        {to && <Link to={to} className="mp-act mp-act--menu">{t('menu')}</Link>}
        {to && <Link to={`/book/${place.slug}`} className="mp-act">{t('book')}</Link>}
        <button type="button" className="mp-act" onClick={() => onDirections(place)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M7 17 17 7M8 7h9v9" />
          </svg>
          {t('directions')}
        </button>
      </div>
    </article>
  )
})
