import { forwardRef } from 'react'
import { useTranslation } from 'react-i18next'
import { DIETS } from './search'

/**
 * Search field + dietary filter tags printed under the menu title. Filters with no dish on this menu are not
 * offered (as before the redesign); each shows how many dishes it matches.
 */
const MenuSearch = forwardRef(function MenuSearch({ value, onChange, diets, onToggleDiet, onClearDiets, counts }, ref) {
  const { t } = useTranslation('restaurant')
  const offered = DIETS.filter(f => counts[f.key] > 0)

  return (
    <div className="mn-tools">
      <label className="mn-search">
        <svg viewBox="0 0 24 24" className="mn-search-icon" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4.5 4.5" />
        </svg>
        <input
          ref={ref}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={t('menu.searchPlaceholder')}
          aria-label={t('menu.searchLabel')}
        />
        {value && (
          <button type="button" className="mn-search-x" onClick={() => onChange('')} aria-label={t('menu.clearSearch')}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" /></svg>
          </button>
        )}
      </label>

      {offered.length > 0 && (
        <div className="mn-diets" role="group" aria-label={t('menu.dietary')}>
          {offered.map(f => (
            <button
              key={f.key}
              type="button"
              className="mn-diet"
              aria-pressed={diets.includes(f.key)}
              onClick={() => onToggleDiet(f.key)}
            >
              {t(f.label)}
              <span className="mn-diet-n">{counts[f.key]}</span>
            </button>
          ))}
          {diets.length > 0 && (
            <button type="button" className="mn-diet mn-diet--clear" onClick={onClearDiets}>{t('clear')}</button>
          )}
        </div>
      )}
    </div>
  )
})

export default MenuSearch
