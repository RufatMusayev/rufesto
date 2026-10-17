import { useState } from 'react'
import { useTranslation } from 'react-i18next'

/** "Ingredients & allergens": one 44 px collapsible row; allergens stay amber chips inside (UX plan 7.2). */
export default function DishIngredients({ ingredients, allergens }) {
  const { t } = useTranslation('menu')
  const [open, setOpen] = useState(false)
  if (!ingredients.length && !allergens.length) return null
  return (
    <div className="dds-ing">
      <button type="button" className="dds-ing-row" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span>{t('dish.ingredientsAllergens')}</span>
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" className={`dds-chev${open ? ' is-open' : ''}`} aria-hidden="true"><path d="M8 11L3 6h10l-5 5z" /></svg>
      </button>
      {open && (
        <div className="dds-ing-body">
          {allergens.length > 0 && (
            <>
              <div className="dds-ing-label">{t('allergens')}</div>
              <div className="dds-chips">
                {allergens.map((a, i) => <span key={i} className="dds-allergen">{a.allergen}</span>)}
              </div>
            </>
          )}
          {ingredients.length > 0 && (
            <>
              <div className="dds-ing-label">{t('dish.ingredients')}</div>
              <ul className="dds-ing-list">
                {ingredients.map((ing, i) => (
                  <li key={i}>
                    {ing.ingredients?.name}
                    {ing.quantity ? <span className="dds-qty"> {ing.quantity}{ing.unit || 'g'}</span> : null}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  )
}
