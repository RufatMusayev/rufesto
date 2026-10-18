import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import FilterChips from './FilterChips'

/**
 * "10 places · 6 open", the filter chips, and (without a location, where one can still be asked) one quiet "See distances"
 * action: the head of the sheet (phone) and of the side panel (desktop). No count over an empty or failed list.
 */
export default memo(function ListHead({ total, open, loading, filters, onToggleOpen, onToggleKind, onSeeDistances }) {
  const { t } = useTranslation('map')
  const text = loading || !total ? ' ' : `${t('places', { count: total })} · ${t('openCount', { count: open })}`
  return (
    <div className="mp-head">
      <div className="mp-count-row">
        <p className="mp-count" aria-live="polite">{text}</p>
        {onSeeDistances && total > 0 && (
          <button type="button" className="mp-link" onClick={onSeeDistances}>{t('seeDistances')}</button>
        )}
      </div>
      <FilterChips filters={filters} onToggleOpen={onToggleOpen} onToggleKind={onToggleKind} />
    </div>
  )
})
