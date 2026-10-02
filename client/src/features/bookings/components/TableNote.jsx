import { useTranslation } from 'react-i18next'

/**
 * "You picked table 4" under the restaurant header when the guest came from the floor plan (`?table=<id>`).
 * Display only: create_group_booking assigns the table itself, so the copy says it is not guaranteed.
 */
export default function TableNote({ table }) {
  const { t } = useTranslation('bookings')
  if (!table) return null
  return (
    <p className="bk-table-note" role="note">
      <strong className="font-mono">{t('table.picked', { number: table.number })}</strong>
      {' '}
      {t('table.pickedNote')}
    </p>
  )
}
