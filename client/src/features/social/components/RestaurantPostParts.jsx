import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Avatar, Pill } from '../../../components/ui'
import { formatPrice } from '../../../lib/helpers'

// Pieces of a post whose author is a restaurant (docs/V2-CONTRACT.md 17.2 / 17.5). PostCard stays the
// single card; it swaps in these for the header and adds the dish strip under the photo.

/** A restaurant without a slug is plain text instead of a link. */
function MaybeLink({ to, className, children, ...rest }) {
  return to ? <Link to={to} className={className} {...rest}>{children}</Link> : <span className={className}>{children}</span>
}

export const restaurantPath = item => {
  const slug = item.author?.slug || item.restaurant?.slug
  return slug ? `/restaurant/${slug}` : null
}

/** Avatar link + name link + time (+ distance and "Open now" when Home sends them). */
export function RestaurantPostHead({ item, when }) {
  const { t } = useTranslation('social')
  const to = restaurantPath(item)
  const name = item.author.name || item.restaurant?.name || ''
  const logo = item.author.photo || item.restaurant?.logo || null
  const sub = [
    item.km != null ? t('post.kmAway', { km: item.km }) : null,
    item.openNow ? t('post.openNow') : null,
  ].filter(Boolean).join(' · ')
  return (
    <>
      <MaybeLink to={to} className="soc-post-author" aria-label={name}>
        <Avatar name={name} src={logo} size={36} />
      </MaybeLink>
      <div className="soc-post-who">
        <div className="soc-post-line">
          <MaybeLink to={to} className="soc-post-name">{name}</MaybeLink>
          <span className="soc-post-time">· {when}</span>
        </div>
        {sub && <span className="soc-post-where">{sub}</span>}
      </div>
    </>
  )
}

/** Dish name + price + live "Available now" / "Sold out" pill + the "Order this" button. */
export function DishStrip({ item, onOrder }) {
  const { t } = useTranslation('social')
  const dish = item.dish
  const base = restaurantPath(item)
  const href = base && dish?.id ? `${base}?dish=${dish.id}&src=post:${item.id}` : null
  const soldOut = dish.available === false
  return (
    <div className="soc-dish">
      <div className="soc-dish-info">
        <span className="soc-dish-name">{dish.name}</span>
        <span className="soc-dish-meta">
          {dish.price != null && <span className="soc-dish-price">{formatPrice(dish.price)}</span>}
          {dish.available != null && (
            <Pill tone={soldOut ? 'red' : 'green'}>{t(soldOut ? 'post.soldOut' : 'post.availableNow')}</Pill>
          )}
        </span>
      </div>
      {href && (
        <Link to={href} className={`btn soc-order ${soldOut ? 'btn-ghost' : 'btn-primary'}`} onClick={onOrder}>
          {t('post.orderThis')}
        </Link>
      )}
    </div>
  )
}
