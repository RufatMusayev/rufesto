import { useTranslation } from 'react-i18next'
import { cuisineLabel } from '../cuisine'

/**
 * The cuisines of active restaurants as a sideways row of chips. Picking one hands its key to `onPick` (Search turns it
 * into the Cuisine filter); `value` marks the one that is on. No "All" chip: the filter sheet has "Any".
 */
export default function CuisineChips({ chips, value, onPick, label }) {
  const { t } = useTranslation('social')
  if (chips.length === 0) return null
  const current = (value || '').toLowerCase()
  return (
    <div className="dsc-chips no-scrollbar" role="group" aria-label={label}>
      {chips.map(c => {
        const on = current === c.key.toLowerCase()
        return (
          <button
            key={c.key} type="button" className={`chip dsc-chip${on ? ' active' : ''}`} aria-pressed={on}
            onClick={() => onPick(on ? null : c.key)}
          >
            {cuisineLabel(t, c.key)}
          </button>
        )
      })}
    </div>
  )
}
