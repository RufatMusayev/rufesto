import { useTranslation } from 'react-i18next'

/** "Seat 2": the chair a guest sits on (table_sessions.seat_no). Renders nothing without a chair. */
export default function SeatChip({ seatNo, mine = false }) {
  const { t } = useTranslation('table')
  const n = Number(seatNo)
  if (!Number.isInteger(n) || n < 1) return null
  return <span className={`dn-seat${mine ? ' is-mine' : ''}`}>{t('seatNo', { n })}</span>
}
