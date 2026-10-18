import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Avatar, Pill } from '../../../components/ui'
import { seedDish } from '../../../components/dish/dishLink'
import { formatPrice } from '../../../lib/helpers'
import { nameIn } from '../../../lib/lang'
import { useDishAvailable } from '../../feed/dishAvailability'
import { distanceLabel } from '../lib/distance'

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

const placeInfo = (item, t) => [
  distanceLabel(t, item.km),
  item.openNow ? t('post.openNow') : null,
].filter(Boolean).join(' · ')

/** Avatar link + name link + time (+ distance and "Open now" when Home sends them and the photo does not show them). */
export function RestaurantPostHead({ item, when, showSub = true }) {
  const { t } = useTranslation('social')
  const to = restaurantPath(item)
  const name = item.author.name || item.restaurant?.name || ''
  const logo = item.author.photo || item.restaurant?.logo || null
  const sub = showSub ? placeInfo(item, t) : ''
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

/** What PhotoChips would show: a restaurant post (distance, open now, "Sold out") or a tagged restaurant. */
export function hasPhotoChips(item, isResto) {
  if (isResto) return item.km != null || !!item.openNow || item.dish?.available === false
  return !!item.restaurant?.name
}

function PinGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  )
}

/**
 * Chips over the bottom of a post photo (docs/V2-CONTRACT.md 18.4): the restaurant (people's post) or its distance /
 * open state (restaurant post, whose header already names it), and "Sold out" when the dish ran out. An available dish
 * shows nothing: "Order this" already says it is (docs/UX-PLAN-2026-10-18.md 1.2).
 * Taps on the chips are not taps on the photo (no double-tap like). The restaurant chip is a link whose box is a
 * 44px target around the 32px pill.
 */
export function PhotoChips({ item, isResto }) {
  const { t } = useTranslation('social')
  const place = item.restaurant
  const dish = item.dish
  const available = useDishAvailable(dish?.id, dish?.available ?? null)
  const soldOut = available === false
  const info = isResto ? placeInfo(item, t) : ''
  const name = !isResto && place?.name ? place.name : ''
  const pill = <span className="soc-chip"><PinGlyph /><span className="soc-chip-text">{name}</span></span>
  return (
    <div className="soc-photo-chips" onClick={e => e.stopPropagation()}>
      {name && (place.slug ? <Link to={`/restaurant/${place.slug}`} className="soc-chip-link">{pill}</Link> : pill)}
      {info && <span className="soc-chip"><span className="soc-chip-text">{info}</span></span>}
      {isResto && soldOut && <span className="soc-avail soc-avail-off">{t('post.soldOut')}</span>}
    </div>
  )
}

/**
 * A restaurant post that is only words (persona-newcomer N15): a designed card as tall as it is wide instead of a thin
 * strip. The caption is set as a serif quote on the accent colour, the venue sits in a chip at the bottom.
 */
export function TextCard({ item }) {
  const name = item.author.name || item.restaurant?.name || ''
  const to = restaurantPath(item)
  const size = item.text.length > 160 ? 'sm' : item.text.length > 70 ? 'md' : 'lg'
  const pill = <span className="soc-chip"><PinGlyph /><span className="soc-chip-text">{name}</span></span>
  return (
    <div className={`soc-textcard soc-textcard-${size}`}>
      <span className="soc-textcard-mark" aria-hidden="true">&ldquo;</span>
      <p className="soc-textcard-quote">{item.text}</p>
      {name && (to ? <Link to={to} className="soc-chip-link">{pill}</Link> : pill)}
    </div>
  )
}

/**
 * Dish name + price + (without a photo) a "Sold out" pill when it ran out + the "Order this" button.
 * A dish that sold out (the page said so, or the 60 s refresh found out) shows a disabled "Sold out" button
 * instead of "Order this" (persona-leyla #8).
 */
export function DishStrip({ item, onOrder, showPill = true }) {
  const { t, i18n } = useTranslation('social')
  const dish = item.dish
  const available = useDishAvailable(dish?.id, dish?.available ?? null)
  const base = restaurantPath(item)
  const href = base && dish?.id ? `${base}?dish=${dish.id}&src=post:${item.id}` : null
  const soldOut = available === false
  return (
    <div className="soc-dish">
      <div className="soc-dish-info">
        <span className="soc-dish-name">{nameIn(dish, i18n.language) || dish.name}</span>
        <span className="soc-dish-meta">
          {dish.price != null && <span className="soc-dish-price">{formatPrice(dish.price)}</span>}
          {showPill && soldOut && <Pill tone="red">{t('post.soldOut')}</Pill>}
        </span>
      </div>
      {href && (soldOut ? (
        <button type="button" className="btn btn-ghost soc-order" disabled>{t('post.soldOut')}</button>
      ) : (
        <Link
          to={href} className="btn btn-primary soc-order"
          onClick={() => { seedDish(dish, item.restaurant); onOrder?.() }}   // the sheet opens from this card at once (components/dish/dishLink)
        >
          {t('post.orderThis')}
        </Link>
      ))}
    </div>
  )
}
