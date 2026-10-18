import { memo } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import CoverImage, { restaurantSources } from '../../discover/components/CoverImage'
import { cuisineLabel } from '../../discover/cuisine'
import { distanceLabel } from '../../social/lib/distance'
import { formatNumber } from '../../../lib/helpers'
import Hl from './Hl'

/**
 * A place: 64 px row. 48 px cover or logo, name (match in 600), and one muted line with only the parts that are
 * known: cuisine, rating, "Open until 23:00", distance, price. A closed place carries "Closed" on the right (or
 * "Closed · opens 12:00" in the line when the server says when).
 *
 * The Map's list uses the same row as a selector (docs/MAP-PLAN-2026-10-18.md 6):
 *  - onSelect(r)  renders a <button> that selects the place instead of a link that opens it;
 *  - selected     aria-pressed + the .is-selected class of that button;
 *  - meta         the muted lines, already written by the caller (a string, or an array of lines): the row then
 *                 composes nothing itself and shows no end badge;
 *  - rowProps     extra attributes for the button (tabIndex of a roving list, data attributes).
 */
export default memo(function PlaceRow({ r, q = '', onOpen, onSelect, selected = false, meta: metaOverride, rowProps }) {
  const { t } = useTranslation('search')
  const { t: ts } = useTranslation('social')
  const to = r.slug ? `/restaurant/${r.slug}` : null
  const status = r.openNow
    ? (r.closesAt ? t('openUntil', { t: r.closesAt }) : null)
    : (r.opensAt ? t('closedOpens', { t: r.opensAt }) : null)
  const meta = metaOverride ?? [
    r.cuisine ? cuisineLabel(ts, r.cuisine) : null,
    r.rating != null && r.reviewCount > 0 ? `★${formatNumber(r.rating, 1)}` : null,
    status,
    distanceLabel(ts, r.km),
    r.priceBand ? '₼'.repeat(Math.min(3, r.priceBand)) : null,
  ].filter(Boolean).join(' · ')
  const lines = (Array.isArray(meta) ? meta : [meta]).filter(Boolean)
  const body = (
    <>
      <span className="sr-thumb sr-thumb-place"><CoverImage sources={restaurantSources(r)} name={r.name} size={48} /></span>
      <span className="sr-main">
        <span className="sr-name"><Hl text={r.name} q={q} /></span>
        {lines.map((line, i) => <span key={i} className="sr-meta">{line}</span>)}
      </span>
      {metaOverride === undefined && !r.openNow && !r.opensAt && <span className="sr-end sr-end-muted">{t('closed')}</span>}
      {metaOverride === undefined && r.isNew && r.openNow && <span className="sr-end sr-tag">{t('newTag')}</span>}
    </>
  )
  if (onSelect) {
    return (
      <button
        type="button"
        className={`sr-row${selected ? ' is-selected' : ''}`}
        aria-pressed={selected}
        onClick={() => onSelect(r)}
        {...rowProps}
      >
        {body}
      </button>
    )
  }
  return to
    ? <Link to={to} className="sr-row" onClick={() => onOpen?.(r)}>{body}</Link>
    : <div className="sr-row">{body}</div>
})
