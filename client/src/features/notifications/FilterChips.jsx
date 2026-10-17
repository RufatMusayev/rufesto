import { useTranslation } from 'react-i18next'

// null = every category. Same order as the contract: All · Social · Dine-in · Bookings · Places.
const CHIPS = [
  { id: null, key: 'filterAll' },
  { id: 'social', key: 'filterSocial' },
  { id: 'dinein', key: 'filterDinein' },
  { id: 'bookings', key: 'filterBookings' },
  { id: 'places', key: 'filterPlaces' },
]

/** The category filter: a row of toggle buttons that scrolls sideways inside itself on a narrow phone (the page never does). */
export default function FilterChips({ value, onChange }) {
  const { t } = useTranslation('notifications')
  return (
    <div className="ntf-chips" role="group" aria-label={t('filters')}>
      {CHIPS.map(c => (
        <button
          key={c.key}
          type="button"
          className={`chip ntf-chip${value === c.id ? ' active' : ''}`}
          aria-pressed={value === c.id}
          onClick={() => onChange(c.id)}
        >
          {t(c.key)}
        </button>
      ))}
    </div>
  )
}
