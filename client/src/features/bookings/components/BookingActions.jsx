import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useCart } from '../../../contexts/CartContext'
import { cancelBooking, claimTableFromBooking, joinTableFromBooking, leaveGroupBooking } from '../api'
import { useNow } from '../hooks'
import ConfirmSheet from './ConfirmSheet'
import WeHereButton from './WeHereButton'

const LIVE = ['pending', 'confirmed']

/**
 * The state-dependent action area of the booking screen and its footer (cancel for the host, leave for a member).
 * Server rules stay the authority: every action can still be refused and the answer is shown translated.
 */
export default function BookingActions({ booking, onChanged }) {
  const { t } = useTranslation(['bookings', 'common'])
  const navigate = useNavigate()
  const { setTable, refreshTableSession } = useCart()
  const now = useNow()
  const [sheet, setSheet] = useState(null)          // 'weHere' | 'cancel' | 'leave'
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)          // i18n key shown in the open sheet
  const [tableError, setTableError] = useState(null)
  const [going, setGoing] = useState(false)
  const busy = useRef(false)

  const { status, isHost, isGroup, myStatus } = booking
  const isMember = !isHost && ['joined', 'arrived'].includes(myStatus)
  const invitedOnly = !isHost && myStatus === 'invited'
  const seated = status === 'seated'
  const live = LIVE.includes(status)

  const close = () => { if (!pending) { setSheet(null); setError(null) } }

  async function run(fn, done) {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setError(null)
    const { data, error: err } = await fn()
    busy.current = false
    setPending(false)
    if (err) { setError(err.key); return }
    setSheet(null)
    done(data)
  }

  const weHere = () => run(
    () => claimTableFromBooking(booking.id),
    d => {
      setTable(d.tableId, d.restaurantId, d.bookingId, d.sessionStatus, d.isHost)
      navigate('/table')
    },
  )
  const cancel = () => run(() => cancelBooking(booking.id), () => onChanged?.())
  const leave = () => run(() => leaveGroupBooking(booking.id), () => navigate('/profile', { replace: true }))

  async function goToTable() {
    if (busy.current) return
    busy.current = true
    setGoing(true)
    setTableError(null)
    // The session may already exist server-side (seated by the host); read it first.
    const synced = await refreshTableSession()
    let ok = !synced.error && !!synced.data
    if (!ok && isHost) {
      const { data, error: err } = await claimTableFromBooking(booking.id)
      if (!err && data) {
        setTable(data.tableId, data.restaurantId, data.bookingId, data.sessionStatus, data.isHost)
        ok = true
      } else {
        setTableError(err?.key || 'bookings:errors.no_session')
      }
    } else if (!ok) {
      // A member joins the host's session instead of claiming a table, then re-reads it.
      const { error: err } = await joinTableFromBooking(booking.id)
      if (err) {
        setTableError(err.key)
      } else {
        const after = await refreshTableSession()
        ok = !after.error && !!after.data
        if (!ok) setTableError('bookings:errors.no_session')
      }
    }
    busy.current = false
    setGoing(false)
    if (ok) navigate('/table')
  }

  return (
    <div className="bk-actions">
      {seated && (isHost || isMember) ? (
        <>
          <button type="button" className="btn btn-primary bk-big" onClick={goToTable} disabled={going}>
            {going ? <span className="spinner" aria-hidden="true" /> : null}
            {t('bookings:detail.goToTable')}
          </button>
          {tableError ? <p className="bk-error" role="alert">{t(tableError)}</p> : null}
        </>
      ) : null}

      {live && status === 'pending' ? <p className="bk-notice bk-notice-amber" role="status">{t('bookings:detail.pendingNote')}</p> : null}

      {live && isHost && isGroup ? (
        <WeHereButton startsAt={booking.startsAt} endsAt={booking.endsAt} now={now} onClick={() => setSheet('weHere')} />
      ) : null}
      {live && isMember ? <p className="bk-waiting" role="status">{t('bookings:detail.waitingHost')}</p> : null}
      {invitedOnly && (live || seated) && booking.invitesEnabled ? <p className="bk-notice" role="status">{t('bookings:detail.invitedNote')}</p> : null}

      {status === 'cancelled' ? <p className="bk-notice bk-notice-red" role="status">{t('bookings:detail.cancelledNote')}</p> : null}

      {isHost && live ? (
        <button type="button" className="btn btn-danger bk-block" onClick={() => { setError(null); setSheet('cancel') }}>
          {t('bookings:detail.cancel')}
        </button>
      ) : null}
      {(isMember || invitedOnly) && (live || seated) ? (
        <button type="button" className="btn btn-ghost bk-block" onClick={() => { setError(null); setSheet('leave') }}>
          {invitedOnly ? t('bookings:detail.decline') : t('bookings:detail.leave')}
        </button>
      ) : null}

      <ConfirmSheet
        open={sheet === 'weHere'} title={t('bookings:detail.weHereTitle')} body={t('bookings:detail.weHereBody')}
        confirmLabel={t('bookings:detail.weHereConfirm')} pending={pending} error={error}
        onConfirm={weHere} onClose={close}
      />
      <ConfirmSheet
        open={sheet === 'cancel'} danger title={t('bookings:detail.cancelTitle')} body={t('bookings:detail.cancelBody')}
        confirmLabel={t('bookings:detail.cancelConfirm')} pending={pending} error={error}
        onConfirm={cancel} onClose={close}
      />
      <ConfirmSheet
        open={sheet === 'leave'} danger
        title={invitedOnly ? t('bookings:detail.declineTitle') : t('bookings:detail.leaveTitle')}
        body={invitedOnly ? t('bookings:detail.declineBody') : t('bookings:detail.leaveBody')}
        confirmLabel={invitedOnly ? t('bookings:detail.decline') : t('bookings:detail.leaveConfirm')}
        pending={pending} error={error} onConfirm={leave} onClose={close}
      />
    </div>
  )
}
