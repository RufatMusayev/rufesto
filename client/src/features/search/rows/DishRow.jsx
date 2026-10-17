import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { formatPrice } from '../../../lib/helpers'
import { useDishAvailable } from '../../feed/dishAvailability'
import CoverImage from '../../discover/components/CoverImage'
import Hl from './Hl'

/**
 * A dish: 64 px row. Name and price on line 1 (price in the mono face on the right), venue and rating on line 2.
 * Sold out: line 2 ends with "Sold out" in red and the thumbnail is desaturated. Tapping opens the dish sheet over
 * the page (the page pushes ?dish=<id>).
 */
export default memo(function DishRow({ d, q = '', onOpen }) {
  const { t } = useTranslation('search')
  const available = useDishAvailable(d.id, d.available)
  const place = d.restaurant
  const meta = [
    place?.name || null,
    d.rating != null && d.reviewCount > 0 ? `★${d.rating.toFixed(1)} (${d.reviewCount})` : null,
  ].filter(Boolean).join(' · ')
  return (
    <button type="button" className="sr-row sr-row-btn" data-dish-id={d.id} onClick={() => onOpen?.(d)}>
      <span className={`sr-thumb${available ? '' : ' is-sold'}`}><CoverImage sources={[{ url: d.photo }]} name={d.name} /></span>
      <span className="sr-main">
        <span className="sr-line">
          <span className="sr-name"><Hl text={d.name} q={q} /></span>
          {d.price != null && <span className="sr-price">{formatPrice(d.price)}</span>}
        </span>
        <span className="sr-meta">
          {meta}
          {!available && <span className="sr-sold">{meta ? ' · ' : ''}{t('soldOut')}</span>}
        </span>
      </span>
    </button>
  )
})
