import { memo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import CoverImage, { restaurantSources } from '../../discover/components/CoverImage'
import { cuisineLabel } from '../../discover/cuisine'
import { distanceLabel } from '../../social/lib/distance'
import Hl from './Hl'

/**
 * A place: 64 px row. 48 px cover or logo, name (match in 600), and one muted line with only the parts that are
 * known: cuisine, rating, "Open until 23:00", distance, price. A closed place carries "Closed" on the right (or
 * "Closed · opens 12:00" in the line when the server says when).
 */
export default memo(function PlaceRow({ r, q = '', onOpen }) {
  const { t } = useTranslation('search')
  const { t: ts } = useTranslation('social')
  const to = r.slug ? `/restaurant/${r.slug}` : null
  const status = r.openNow
    ? (r.closesAt ? t('openUntil', { t: r.closesAt }) : null)
    : (r.opensAt ? t('closedOpens', { t: r.opensAt }) : null)
  const meta = [
    r.cuisine ? cuisineLabel(ts, r.cuisine) : null,
    r.rating != null && r.reviewCount > 0 ? `★${r.rating.toFixed(1)}` : null,
    status,
    distanceLabel(ts, r.km),
    r.priceBand ? '₼'.repeat(Math.min(3, r.priceBand)) : null,
  ].filter(Boolean).join(' · ')
  const body = (
    <>
      <span className="sr-thumb sr-thumb-place"><CoverImage sources={restaurantSources(r)} name={r.name} size={48} /></span>
      <span className="sr-main">
        <span className="sr-name"><Hl text={r.name} q={q} /></span>
        {meta && <span className="sr-meta">{meta}</span>}
      </span>
      {!r.openNow && !r.opensAt && <span className="sr-end sr-end-muted">{t('closed')}</span>}
      {r.isNew && r.openNow && <span className="sr-end sr-tag">{t('newTag')}</span>}
    </>
  )
  return to
    ? <Link to={to} className="sr-row" onClick={() => onOpen?.(r)}>{body}</Link>
    : <div className="sr-row">{body}</div>
})
