import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { formatPrice } from '../../../lib/helpers'
import { dishText } from '../mappers'
import { thumb } from '../../discover/thumb'

/**
 * One dish line of the printed menu: name ..... price, the description under it, then small text tags
 * (Chef's pick, V / VG / GF, spice, rating, Sold out). The whole row opens the dish sheet; a seated guest also
 * gets an inline "+" on available dishes. Sold-out rows stay tappable (details), the name is struck through.
 * Memoized: typing in the search re-renders only the rows whose props changed.
 */
function MenuRow({ dish, lang, photos, seated, onOpen, onAdd }) {
  const { t } = useTranslation('restaurant')
  const { name, description } = dishText(dish, lang)
  const sold = !dish.available
  const spice = dish.is_spicy ? Math.max(1, dish.spice_level) : 0
  const diet = dish.is_vegan ? 'vegan' : dish.is_vegetarian ? 'vegetarian' : null
  const showThumb = photos && !!dish.photo

  return (
    <li className={`mn-row${sold ? ' is-sold' : ''}`} data-dish-id={dish.id}>
      <button type="button" className="mn-row-btn" onClick={() => onOpen(dish)}>
        <span className="mn-row-text">
          <span className="mn-line">
            <span className="mn-name">{name}</span>
            <span className="mn-leader" aria-hidden="true" />
            <span className="mn-price">{formatPrice(dish.price)}</span>
          </span>
          {description && <span className="mn-desc">{description}</span>}
          {(dish.is_featured || diet || dish.is_gluten_free || spice > 0 || dish.review_count >= 1 || sold) && (
            <span className="mn-meta">
              {sold && <span className="mn-tag mn-tag--sold">{t('menu.soldOut')}</span>}
              {dish.is_featured && <span className="mn-tag mn-tag--pick">{'★'} {t('menu.chefsPick')}</span>}
              {diet && (
                <span className="mn-tag" title={t(`menu.${diet}`)}>
                  <span aria-hidden="true">{diet === 'vegan' ? 'VG' : 'V'}</span>
                  <span className="mn-sr">{t(`menu.${diet}`)}</span>
                </span>
              )}
              {dish.is_gluten_free && (
                <span className="mn-tag" title={t('menu.glutenFree')}>
                  <span aria-hidden="true">GF</span>
                  <span className="mn-sr">{t('menu.glutenFree')}</span>
                </span>
              )}
              {spice > 0 && (
                <span className="mn-tag mn-tag--spice" title={t('menu.spicy')}>
                  <span aria-hidden="true">{'🌶️'.repeat(spice)}</span>
                  <span className="mn-sr">{t('menu.spicy')}</span>
                </span>
              )}
              {dish.review_count >= 1 && (
                <span className="mn-tag mn-tag--rate">
                  {'★'} {dish.avg_rating.toFixed(1)} ({dish.review_count})
                </span>
              )}
            </span>
          )}
        </span>
        {showThumb && <img className="mn-thumb" src={thumb(dish.photo, 56)} alt="" loading="lazy" decoding="async" />}
      </button>
      {seated && !sold && (
        <button type="button" className="mn-add" onClick={() => onAdd(dish)} aria-label={t('menu.addToOrder', { name })}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      )}
    </li>
  )
}

export default memo(MenuRow)
