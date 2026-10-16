import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { formatPrice } from '../../../lib/helpers'
import CoverImage from './CoverImage'

/**
 * A trending dish: photo with the Available / Sold out pill and the price over its bottom gradient, name in the
 * serif face, restaurant and rating. The whole card is one link: /restaurant/<slug>?dish=<id> opens the
 * restaurant with that dish's sheet (RestaurantPage reads ?dish=).
 */
export default function DishCard({ d }) {
  const { t } = useTranslation('social')
  const place = d.restaurant
  const to = place?.slug ? `/restaurant/${place.slug}?dish=${d.id}` : null
  const body = (
    <>
      <div className="dsc-photo">
        <CoverImage sources={[{ url: d.photo }]} name={d.name} />
        <span className="dsc-shade" aria-hidden="true" />
        <span className="dsc-over dsc-over-top">
          <span className={`dsc-pill ${d.available ? 'dsc-pill-open' : 'dsc-pill-off'}`}>
            {t(d.available ? 'discover.available' : 'post.soldOut')}
          </span>
        </span>
        {d.price != null && (
          <span className="dsc-over dsc-over-bottom"><span className="dsc-price">{formatPrice(d.price)}</span></span>
        )}
      </div>
      <div className="dsc-dc-body">
        <h3 className="dsc-dc-name">{d.name}</h3>
        {place?.name && <p className="dsc-dc-rest">{place.name}</p>}
        {d.rating != null && d.reviewCount > 0 && (
          <p className="dsc-dc-rating" role="img" aria-label={t('discover.ratingAria', { rating: d.rating })}>
            ★ {d.rating.toFixed(1)} <span className="dsc-rating-n">({d.reviewCount})</span>
          </p>
        )}
      </div>
    </>
  )
  return (
    <article className="dsc-dc">
      {to ? <Link to={to} className="dsc-dc-link">{body}</Link> : <div className="dsc-dc-link">{body}</div>}
    </article>
  )
}
