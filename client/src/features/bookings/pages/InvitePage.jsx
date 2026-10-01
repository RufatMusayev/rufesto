import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../../components/ui'
import LoadError from '../../../components/LoadError'
import { joinGroupBooking } from '../api'
import { useInvitePreview, useRequireAuth } from '../hooks'
import { clearPendingInvite, rememberPendingInvite, sanitizeInviteCode } from '../pendingInvite'
import PreviewCard from '../components/PreviewCard'

// Errors after which the preview is stale (full, expired, cancelled...): refetch so the right panel shows.
const REFRESH_ON = ['booking_full', 'invite_expired', 'booking_closed', 'invalid_code']

function InviteShell({ children }) {
  return (
    <div className="claim-page bk-page-narrow">
      <div className="card claim-card state-panel bk-invite-card">{children}</div>
    </div>
  )
}

export default function InvitePage() {
  const { code: rawCode } = useParams()
  const code = sanitizeInviteCode(rawCode)
  const { t } = useTranslation(['bookings', 'common'])
  const navigate = useNavigate()
  const { preview, loading, error, reload } = useInvitePreview(code)
  const { session, authLoading, requireAuth, authModal } = useRequireAuth()
  const userId = session?.user?.id
  const [consent, setConsent] = useState(false)
  const [consentError, setConsentError] = useState(false)
  const [joinError, setJoinError] = useState(null)
  const [pending, setPending] = useState(false)
  const busy = useRef(false)

  // Signed out: remember the code for the sign-in round trip (OAuth / magic link reload the app) and forget it
  // again when this page goes away. Signed in: nothing is pending any more.
  useEffect(() => {
    if (authLoading) return undefined
    if (userId) { clearPendingInvite(); return undefined }
    if (!code) return undefined
    rememberPendingInvite(code)
    return () => clearPendingInvite()
  }, [authLoading, code, userId])

  // Already in the party: straight to the booking.
  useEffect(() => {
    if (preview?.alreadyMember && preview.bookingId) navigate(`/bookings/${preview.bookingId}`, { replace: true })
  }, [preview, navigate])

  async function join() {
    if (busy.current || !preview) return
    if (!requireAuth()) return
    if (!consent) { setConsentError(true); return }
    busy.current = true
    setPending(true)
    setJoinError(null)
    const { data, error: err } = await joinGroupBooking({ code, consent })
    busy.current = false
    setPending(false)
    if (err) {
      setJoinError(err)
      if (REFRESH_ON.includes(err.code)) reload({ silent: true })
      return
    }
    clearPendingInvite()
    navigate(`/bookings/${data.bookingId}`, { replace: true })
  }

  if (!code) return <InvalidInvite />
  if (loading || (!preview && !error) || preview?.alreadyMember) {
    return (
      <InviteShell>
        <div aria-busy="true" className="bk-invite-skeleton">
          <div className="skeleton bk-sk-cover" />
          <div className="skeleton bk-sk-line" />
          <div className="skeleton bk-sk-line short" />
          <div className="skeleton bk-sk-btn" />
        </div>
      </InviteShell>
    )
  }
  if (error?.code === 'invalid_code') return <InvalidInvite />
  if (error) {
    return <InviteShell><LoadError onRetry={reload} /></InviteShell>
  }

  const ended = preview.isExpired || ['completed', 'no_show'].includes(preview.status)
  if (preview.status !== 'cancelled' && ended) return <InvalidInvite />

  let action
  if (preview.status === 'cancelled') {
    action = <p className="bk-notice bk-notice-red" role="status">{t('bookings:invite.cancelled')}</p>
  } else if (preview.isFull) {
    action = <p className="bk-notice" role="status">{t('bookings:invite.full')}</p>
  } else if (!userId) {
    action = (
      <div className="state-actions">
        <button type="button" className="btn btn-primary" onClick={() => requireAuth()}>
          {t('bookings:invite.signInToJoin')}
        </button>
      </div>
    )
  } else {
    action = (
      <div className="bk-join">
        <label className="bk-check bk-check-left">
          <input
            type="checkbox" checked={consent} disabled={pending}
            onChange={e => { setConsent(e.target.checked); setConsentError(false) }}
            aria-invalid={consentError} aria-describedby={consentError ? 'bk-join-consent-err' : undefined}
          />
          <span>{t('bookings:form.consent')}</span>
        </label>
        {consentError ? <p id="bk-join-consent-err" className="bk-error" role="alert">{t('bookings:form.errConsent')}</p> : null}
        {joinError ? <p className="bk-error" role="alert">{t(joinError.key)}</p> : null}
        <div className="state-actions">
          <button type="button" className="btn btn-primary" onClick={join} disabled={pending}>
            {pending ? <span className="spinner" aria-hidden="true" /> : null}
            {pending ? t('bookings:invite.joining') : t('bookings:invite.join')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <InviteShell>
      <PreviewCard preview={preview} />
      {action}
      {authModal}
    </InviteShell>
  )
}

function InvalidInvite() {
  const { t } = useTranslation('bookings')
  return (
    <InviteShell>
      <EmptyState
        icon="🔗" title={t('invite.invalidTitle')} body={t('invite.invalidBody')}
        action={<Link to="/explore" className="btn btn-ghost">{t('invite.browse')}</Link>}
      />
    </InviteShell>
  )
}
