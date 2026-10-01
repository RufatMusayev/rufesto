import { useTranslation } from 'react-i18next'

/** Compact summary card: restaurant, date, time, party. Labels are formatted by the caller (Baku time). */
export default function BookingSummary({ restaurantName, dateLabel, timeLabel, partySize }) {
  const { t } = useTranslation('bookings')
  const rows = [
    ['summary.restaurant', restaurantName],
    ['summary.date', dateLabel],
    ['summary.time', timeLabel],
    ['summary.party', t('summary.guests', { n: partySize })],
  ]
  return (
    <dl className="card bk-summary">
      {rows.map(([k, v]) => (
        <div key={k} className="bk-summary-row">
          <dt>{t(k)}</dt>
          <dd className={k === 'summary.restaurant' ? '' : 'font-mono'}>{v}</dd>
        </div>
      ))}
    </dl>
  )
}
