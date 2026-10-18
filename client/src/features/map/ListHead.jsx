import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import FilterChips from './FilterChips'

/** "10 places · 6 open" and the filter chips: the head of the sheet (phone) and of the side panel (desktop). */
export default memo(function ListHead({ total, open, loading, filters, onToggleOpen, onToggleKind }) {
  const { t } = useTranslation('map')
  return (
    <div className="mp-head">
      <p className="mp-count" aria-live="polite">
        {loading ? ' ' : `${t('places', { count: total })} · ${t('openCount', { count: open })}`}
      </p>
      <FilterChips filters={filters} onToggleOpen={onToggleOpen} onToggleKind={onToggleKind} />
    </div>
  )
})
