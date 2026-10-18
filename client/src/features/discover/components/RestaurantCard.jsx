import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import CoverImage, { restaurantSources } from './CoverImage'
import { distanceLabel } from '../../social/lib/distance'
import { formatNumber } from '../../../lib/helpers'

/**
 * A place in a rail: a 16:10 cover, the name and one muted line (rating, distance). The "New" tag sits on the
 * cover. No Follow, no like, no status pills: the rail only holds places that are open (UX plan 1.3).
 */
export default function RestaurantCard({ r }) {
  const { t } = useTranslation('search')
  const { t: ts } = useTranslation('social')       // distanceLabel reads the social namespace
  const to = r.slug ? `/restaurant/${r.slug}` : null
  const meta = [
    r.rating != null && r.reviewCount > 0 ? `★${formatNumber(r.rating, 1)}` : null,
    distanceLabel(ts, r.km),
  ].filter(Boolean).join(' · ')
  const body = (
    <>
      <span className="dsc-photo">
        <CoverImage sources={restaurantSources(r)} name={r.name} size={[136, 85]} />
        {r.isNew && <span className="dsc-new">{t('search:newTag')}</span>}
      </span>
      <span className="dsc-pc-name">{r.name}</span>
      {meta && <span className="dsc-pc-meta">{meta}</span>}
    </>
  )
  return to
    ? <Link to={to} className="dsc-pc">{body}</Link>
    : <div className="dsc-pc">{body}</div>
}
