import { useTranslation } from 'react-i18next'
import { IN_USE_STATES, SEATABLE_STATES, stateKey } from '../states'

/**
 * The panel under the floor for the tapped table: number, state, seats free / total, the chairs, and what to do.
 * Guests never claim from here: they scan the QR on a chair (`<code>-S<n>`). The only exception is a guest who
 * already holds a session at this table: they see "You're here".
 * `held` is the session the guest has at THIS table ({ seatNo, pending }) or null.
 */
export default function TableDetail({ table, sectionName, held, onClose, onReserve }) {
  const { t } = useTranslation(['floor', 'common'])
  const key = stateKey(table.state)
  const taken = table.occupiedSeats.length
  const freeSeats = table.capacity - taken
  const inUseNoSeats = table.seatInfo && IN_USE_STATES.includes(table.state) && taken === 0
  const showSeats = table.seatInfo && table.capacity <= 24

  let seatsText
  if (!table.seatInfo) seatsText = t('seatsTotal', { count: table.capacity })
  else if (inUseNoSeats) seatsText = t('seatsInUse', { count: table.capacity })
  else seatsText = t('seatsFree', { count: table.capacity, free: freeSeats, total: table.capacity })

  let hint
  if (held && !held.pending) hint = held.seatNo ? t('youAreHereSeat', { n: held.seatNo }) : t('youAreHere')
  else if (held && held.pending) hint = t('pending')
  else if (!SEATABLE_STATES.includes(table.state)) hint = t('unavailable')
  else if (table.seatInfo && freeSeats <= 0) hint = t('allTaken')
  else hint = t('scanHint')

  return (
    <section className="fl-detail" aria-label={t('common:tableLabel', { number: table.number })}>
      <div className="fl-detail-head">
        <div className="fl-detail-title">
          <span className="fl-detail-num">{t('common:tableLabel', { number: table.number })}</span>
          <span className="fl-pill"><i className={`fl-swatch fl-st fl-st-${key}`} aria-hidden="true" />{t(`state.${key}`)}</span>
        </div>
        <button type="button" className="icon-btn fl-detail-close" onClick={onClose} aria-label={t('closeDetail')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <p className="fl-detail-sub">
        {sectionName ? `${sectionName} · ` : ''}{seatsText}
      </p>

      {showSeats && (
        <ol className="fl-seats" aria-label={t('seatsLabel')}>
          {Array.from({ length: table.capacity }, (_, i) => {
            const n = i + 1
            const mine = !!held && !held.pending && held.seatNo === n
            const isTaken = table.occupiedSeats.includes(n)
            const mode = mine ? 'mine' : isTaken ? 'taken' : 'free'
            const label = mine ? t('seatNYou', { n }) : isTaken ? t('seatNTaken', { n }) : t('seatNFree', { n })
            return <li key={n} className={`fl-seat is-${mode}`} aria-label={label}>{n}</li>
          })}
        </ol>
      )}

      <p className={`fl-detail-hint${held && !held.pending ? ' is-here' : ''}`}>{hint}</p>

      {onReserve && table.state === 'free' && (
        <button type="button" className="btn btn-primary fl-reserve" onClick={() => onReserve(table)}>
          {t('reserve')}
        </button>
      )}
    </section>
  )
}
