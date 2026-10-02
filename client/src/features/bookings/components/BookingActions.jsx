import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../contexts/AuthContext'
import { useCart } from '../../../contexts/CartContext'
import QRSheet from '../../../components/QRSheet'
import { cancelBooking, claimTableFromBooking, leaveGroupBooking } from '../api'
import { toError } from '../errors'
import { useNow } from '../hooks'
import ConfirmSheet from './ConfirmSheet'
import WeHereButton from './WeHereButton'

const LIVE = ['pending', 'confirmed']

/**
 * The state-dependent action area of the booking screen and its footer (cancel for the host, leave for a member).
 * Arriving means scanning the table's QR, nobody is seated remotely: the host's "We're here" opens the QR scanner and
 * sends the scanned code to claim_table_from_booking; a member scans the same QR like any guest (claim_table) and
 * sees "Go to our table" once they hold a session. Server rules stay the authority: every action can still be
 * refused and the answer is shown translated.
 */
export default function BookingActions({ booking, onChanged }) {
  const { t } = useTranslation(['bookings', 'common'])
  const navigate = useNavigate()
  const { session } = useAuth()
  const { setTable, refreshTableSession, tableId: heldTableId, activeBookingId } = useCart()
  const now = useNow()
  const [sheet, setSheet] = useState(null)          // 'cancel' | 'leave'
  const [scan, setScan] = useState(false)           // the table QR scanner
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)          // i18n key shown in the open sheet
  const [tableError, setTableError] = useState(null)
  const [needScan, setNeedScan] = useState(false)   // "Go to our table" found no session: offer the scanner again
  const [going, setGoing] = useState(false)
  const busy = useRef(false)
  const seatedByScan = useRef(false)                // the host's scan succeeded: leave for /table when the sheet closes

  const { status, isHost, isGroup, myStatus } = booking
  const isMember = !isHost && ['joined', 'arrived'].includes(myStatus)
  const invitedOnly = !isHost && myStatus === 'invited'
  const seated = status === 'seated'
  const live = LIVE.includes(status)
  // Arrived = the server says so (my member row) or I hold a session at this booking's table.
  const mine = booking.members.find(m => m.userId === session?.user?.id)
  const heldHere = !!heldTableId && ((!!booking.tableId && heldTableId === booking.tableId) || activeBookingId === booking.id)
  const arrived = myStatus === 'arrived' || !!mine?.arrived || heldHere

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

  // The host's scanned code goes to the booking: the host is seated at the table whose QR they scanned.
  async function hostScanned(code) {
    const { data, error: err } = await claimTableFromBooking(booking.id, code)
    if (err) return { error: t(err.code === 'invalid_code' ? 'bookings:errors.invalid_table_code' : err.key) }
    setTable(data.tableId, data.restaurantId, data.bookingId, data.sessionStatus, data.isHost)
    await refreshTableSession()
    seatedByScan.current = true
    return {
      data: {
        restaurant_name: data.restaurantName || booking.restaurant?.name || null,
        table_number: data.tableNumber,
        session_status: data.sessionStatus,
      },
    }
  }

  function closeScan() {
    setScan(false)
    setTableError(null)
    if (seatedByScan.current) {
      seatedByScan.current = false
      navigate('/table')
    } else {
      onChanged?.()      // a member's scan seated them through claim_table: re-read the booking (arrived flag)
    }
  }

  const cancel = () => run(() => cancelBooking(booking.id), () => onChanged?.())
  const leave = () => run(() => leaveGroupBooking(booking.id), () => navigate('/profile', { replace: true }))

  async function goToTable() {
    if (busy.current) return
    busy.current = true
    setGoing(true)
    setTableError(null)
    // The table session lives server-side (my_table_session); read it and sync the local table state.
    const synced = await refreshTableSession()
    const ok = !synced.error && !!synced.data
    if (!ok) {
      setTableError(synced.error ? toError(synced.error).key : 'bookings:errors.no_session')
      setNeedScan(true)
    }
    busy.current = false
    setGoing(false)
    if (ok) navigate('/table')
  }

  const showGoTo = (isHost && seated) || (isMember && arrived && (live || seated))
  const hostCheckIn = live && isHost && isGroup
  const showScan = hostCheckIn || (isMember && !arrived && (live || seated)) || (showGoTo && needScan)

  return (
    <div className="bk-actions">
      {showGoTo ? (
        <>
          <button type="button" className="btn btn-primary bk-big" onClick={goToTable} disabled={going}>
            {going ? <span className="spinner" aria-hidden="true" /> : null}
            {t('bookings:detail.goToTable')}
          </button>
          {tableError ? <p className="bk-error" role="alert">{t(tableError)}</p> : null}
        </>
      ) : null}

      {live && status === 'pending' ? <p className="bk-notice bk-notice-amber" role="status">{t('bookings:detail.pendingNote')}</p> : null}

      {showScan ? (
        <WeHereButton
          startsAt={booking.startsAt} endsAt={booking.endsAt} now={now} onClick={() => setScan(true)}
          label={hostCheckIn ? undefined : t('bookings:detail.scanQr')}
          hint={isHost ? undefined : t('bookings:detail.memberScanHint')}
        />
      ) : null}
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
      {scan ? <QRSheet onClose={closeScan} onCode={isHost ? hostScanned : undefined} /> : null}
    </div>
  )
}
