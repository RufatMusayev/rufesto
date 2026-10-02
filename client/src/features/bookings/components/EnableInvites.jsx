import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { setBookingInvites } from '../api'
import { PeopleIcon } from './Icons'

/**
 * Host-only, for a booking whose invite link is switched off (created without invites, or turned off since):
 * a small "Invite friends" action that calls set_booking_invites(true). `onEnabled` runs after the server said yes,
 * so the caller can refetch and reveal the link.
 */
export default function EnableInvites({ bookingId, onEnabled }) {
  const { t } = useTranslation('bookings')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)
  const busy = useRef(false)

  async function enable() {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setError(null)
    const { error: err } = await setBookingInvites(bookingId, true)
    busy.current = false
    setPending(false)
    if (err) { setError(err); return }
    onEnabled?.()
  }

  return (
    <div className="bk-enable-invites">
      <button type="button" className="btn btn-ghost" onClick={enable} disabled={pending}>
        {pending ? <span className="spinner" aria-hidden="true" /> : <PeopleIcon size={18} />}
        {t('invite.enable')}
      </button>
      <p className="bk-invite-hint">{t('invite.enableHint')}</p>
      {error ? <p className="bk-error" role="alert">{t(error.key)}</p> : null}
    </div>
  )
}
