import { useTranslation } from 'react-i18next'
import { cuisineLabel } from '../cuisine'

/** "All" + the cuisines of active restaurants. Picking one asks the server with p_cuisine (cached per cuisine). */
export default function CuisineChips({ chips, value, onChange }) {
  const { t } = useTranslation('social')
  if (chips.length === 0) return null
  const current = (value || '').toLowerCase()
  return (
    <div className="dsc-chips no-scrollbar" role="group" aria-label={t('discover.cuisines')}>
      <button
        type="button" className={`chip dsc-chip${current ? '' : ' active'}`} aria-pressed={!current}
        onClick={() => onChange(null)}
      >
        {t('discover.all')}
      </button>
      {chips.map(c => {
        const on = current === c.key.toLowerCase()
        return (
          <button
            key={c.key} type="button" className={`chip dsc-chip${on ? ' active' : ''}`} aria-pressed={on}
            onClick={() => onChange(c.key)}
          >
            {cuisineLabel(t, c.key)}
          </button>
        )
      })}
    </div>
  )
}
