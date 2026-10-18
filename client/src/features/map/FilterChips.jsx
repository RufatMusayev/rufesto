import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import KindIcon from './KindIcon'
import { KINDS, KIND_CHIP_KEY } from './kind'

/**
 * The filter row: Open now, Coffee, Quick bites, Restaurants (docs/MAP-PLAN-2026-10-18.md M11). Toggles; several kinds
 * can be on at once, none on = all. Filtering is done by the owner on the device (no request). The row scrolls sideways
 * on a narrow phone; its touch-action is pan-x, so a vertical gesture on it still reaches the sheet's drag.
 */
export default memo(function FilterChips({ filters, onToggleOpen, onToggleKind }) {
  const { t } = useTranslation('map')
  return (
    <div className="mp-chips no-scrollbar" role="group" aria-label={t('filters')}>
      <button type="button" className={`mp-chip${filters.open ? ' is-on' : ''}`} aria-pressed={filters.open} onClick={onToggleOpen}>
        <span className="mp-chip-in">
          <span className="mp-chip-dot" aria-hidden="true" />
          {t('chipOpen')}
        </span>
      </button>
      {KINDS.map(k => {
        const on = filters.kinds.includes(k)
        return (
          <button key={k} type="button" className={`mp-chip${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => onToggleKind(k)}>
            <span className="mp-chip-in">
              <KindIcon kind={k} size={16} />
              {t(KIND_CHIP_KEY[k])}
            </span>
          </button>
        )
      })}
    </div>
  )
})
