import { useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { formatPrice } from '../../lib/helpers'

/**
 * The text block under the photo: name and price, one meta line (venue link, rating, category), the description
 * (3 lines, then "...more") and the facts line (kcal, prep time, diets). No hashtags, no repeated header (UX plan 7.2).
 * The venue is plain text when the sheet is already on that restaurant's page.
 */
export default function DishFacts({ dish, summary }) {
  const { t } = useTranslation('menu')
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [clamped, setClamped] = useState(false)
  const text = useRef(null)
  const slug = dish.restaurants?.slug
  const here = slug && pathname === `/restaurant/${slug}`

  // "...more" only when the text really overflows 3 lines (measured once per dish, while collapsed)
  useLayoutEffect(() => {
    setOpen(false)
    const el = text.current
    if (el) setClamped(el.scrollHeight > el.clientHeight + 1)
  }, [dish.id, dish.description])

  const avg = summary?.avg ?? (dish.review_count > 0 ? Number(dish.avg_rating) : null)
  const count = summary?.count ?? dish.review_count ?? 0
  const diets = [
    dish.is_spicy && t('dish.diets.spicy'),
    dish.is_vegan && t('dish.diets.vegan'),
    !dish.is_vegan && dish.is_vegetarian && t('dish.diets.vegetarian'),
    dish.is_gluten_free && t('dish.diets.glutenFree'),
  ].filter(Boolean)
  const facts = [
    dish.calories ? t('kcal', { count: dish.calories }) : null,
    dish.prep_time_min ? t('dish.prepShort', { count: dish.prep_time_min }) : null,
    ...diets,
  ].filter(Boolean)

  return (
    <div className="dds-info">
      <div className="dds-titlerow">
        <h2 className="dds-name" id="dds-title">{dish.name}</h2>
        {dish.price != null && <span className="dds-price">{formatPrice(dish.price)}</span>}
      </div>
      <p className="dds-meta">
        {dish.restaurants?.name && (here || !slug
          ? <span className="dds-venue">{dish.restaurants.name}</span>
          : <Link to={`/restaurant/${slug}?tab=menu`} replace className="dds-venue dds-venue-link">{dish.restaurants.name}</Link>)}
        {avg != null && count > 0 && <span>★{avg.toFixed(1)} ({count})</span>}
        {dish.category && <span className="dds-cat">{dish.category}</span>}
      </p>
      {!dish.description && dish.seed && (
        <div className="dds-desc-sk" aria-hidden="true"><span className="skeleton" /><span className="skeleton" /></div>
      )}
      {dish.description && (
        <div className="dds-desc">
          <p ref={text} className={open ? 'dds-desc-text is-open' : 'dds-desc-text'}>{dish.description}</p>
          {clamped && !open && (
            <button type="button" className="dds-more" onClick={() => setOpen(true)}>{t('dish.more')}</button>
          )}
        </div>
      )}
      {facts.length > 0 && <p className="dds-facts">{facts.join(' · ')}</p>}
    </div>
  )
}
