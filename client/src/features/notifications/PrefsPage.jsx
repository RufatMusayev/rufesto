import { useCallback, useEffect, useId, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import SignedOut from './SignedOut'
import { ChevronLeftIcon } from './Icons'
import usePrefs, { QUIET_DEFAULT } from './usePrefs'
import { getPushState, enablePush, disablePush } from './push'
import './styles.css'

const CATEGORY_ROWS = [
  { id: 'social', label: 'prefsSocial', hint: 'prefsSocialHint' },
  { id: 'dinein', label: 'prefsDinein', hint: 'prefsDineinHint' },
  { id: 'bookings', label: 'prefsBookings', hint: 'prefsBookingsHint' },
  { id: 'places', label: 'prefsPlaces', hint: 'prefsPlacesHint' },
]

/** A switch with its label and hint: one 44px-high control, named by the label. */
function ToggleRow({ label, hint, checked, onChange, disabled }) {
  const id = useId()
  return (
    <div className="ntf-row">
      <div className="ntf-row-main">
        <span className="ntf-row-label" id={`${id}-l`}>{label}</span>
        {hint ? <span className="ntf-row-hint" id={`${id}-h`}>{hint}</span> : null}
      </div>
      <button
        type="button" role="switch" className="ntf-switch" disabled={disabled}
        aria-checked={checked} aria-labelledby={`${id}-l`} aria-describedby={hint ? `${id}-h` : undefined}
        onClick={() => onChange(!checked)}
      >
        <span className="ntf-switch-knob" aria-hidden="true" />
      </button>
    </div>
  )
}

/** "Push notifications": hidden without a VAPID key; a note instead of the switch where push cannot work. */
function PushSection({ onChanged }) {
  const { t } = useTranslation('notifications')
  const [state, setState] = useState(null)             // { status } | null while checking
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => { setState(await getPushState()) }, [])
  useEffect(() => { refresh() }, [refresh])

  async function toggle(next) {
    if (busy) return
    setBusy(true)
    setError(null)
    if (next) {
      const res = await enablePush()
      if (!res.ok && res.error !== 'dismissed') setError(res.error === 'unavailable' ? 'prefsPushUnavailable' : res.error === 'denied' ? null : 'prefsPushError')
    } else {
      const res = await disablePush()
      if (!res.ok) setError('prefsPushError')
    }
    await refresh()
    await onChanged()
    setBusy(false)
  }

  if (!state || state.status === 'nokey') return null
  const status = state.status
  const canSwitch = status === 'on' || status === 'off' || status === 'denied'

  return (
    <>
      <div className="ntf-card">
        {canSwitch ? (
          <ToggleRow
            label={t('prefsPushLabel')}
            hint={busy ? t('prefsPushBusy') : t('prefsPushHint')}
            checked={status === 'on'}
            disabled={busy || status === 'denied'}
            onChange={toggle}
          />
        ) : (
          <div className="ntf-row">
            <div className="ntf-row-main">
              <span className="ntf-row-label">{t('prefsPushLabel')}</span>
            </div>
          </div>
        )}
      </div>
      {status === 'denied' ? <p className="ntf-note ntf-note-warn" role="note">{t('prefsPushDenied')}</p> : null}
      {status === 'ios_install' ? (
        <>
          <p className="ntf-note" role="note">{t('prefsPushIos')}</p>
          <p className="ntf-note">{t('prefsPushIosHow')}</p>
        </>
      ) : null}
      {status === 'unsupported' ? <p className="ntf-note" role="note">{t('prefsPushUnsupported')}</p> : null}
      {error ? <p className="ntf-note ntf-note-warn" role="alert">{t(error)}</p> : null}
    </>
  )
}

function QuietHours({ prefs, change, disabled }) {
  const { t } = useTranslation('notifications')
  const on = !!(prefs.quiet_from && prefs.quiet_to)
  const fromId = useId()
  const toId = useId()
  return (
    <>
      <div className="ntf-card">
        <ToggleRow
          label={t('prefsQuietLabel')} hint={t('prefsQuietHint')} checked={on} disabled={disabled}
          onChange={next => change(next ? { ...QUIET_DEFAULT } : { quiet_from: null, quiet_to: null })}
        />
        {on ? (
          <div className="ntf-times">
            <div className="ntf-time-field">
              <label className="label" htmlFor={fromId}>{t('prefsQuietFrom')}</label>
              <input
                id={fromId} type="time" className="input ntf-time" value={prefs.quiet_from} disabled={disabled}
                onChange={e => e.target.value && change({ quiet_from: e.target.value, quiet_to: prefs.quiet_to })}
              />
            </div>
            <div className="ntf-time-field">
              <label className="label" htmlFor={toId}>{t('prefsQuietTo')}</label>
              <input
                id={toId} type="time" className="input ntf-time" value={prefs.quiet_to} disabled={disabled}
                onChange={e => e.target.value && change({ quiet_from: prefs.quiet_from, quiet_to: e.target.value })}
              />
            </div>
          </div>
        ) : null}
      </div>
    </>
  )
}

/** /settings/notifications: the push switch, what to be notified about, quiet hours: three cards, no headings. Saves as you tap. */
export default function PrefsPage() {
  const { session, loading } = useAuth()
  const { t } = useTranslation('notifications')
  const navigate = useNavigate()
  const location = useLocation()
  const { prefs, load, save, change, reload } = usePrefs(!!session)

  const back = () => (location.key !== 'default' ? navigate(-1) : navigate('/notifications'))

  // nothing below runs signed out: no prefs read, no push state, no saved-subscription lookup
  if (loading) return <div className="ntf-page" aria-busy="true" />
  if (!session) return <SignedOut title={t('prefsTitle')} />

  const locked = load !== 'ready'
  return (
    <div className="ntf-page">
      <div className="ntf-prefs-bar">
        <button type="button" className="icon-btn" onClick={back} aria-label={t('prefsBack')}>
          <ChevronLeftIcon size={22} />
        </button>
        <h1 className="ntf-prefs-title">{t('prefsTitle')}</h1>
      </div>

      <div className="ntf-prefs">
        <PushSection onChanged={reload} />

        <div className="ntf-card" aria-busy={load === 'loading'}>
          {CATEGORY_ROWS.map(r => (
            <ToggleRow
              key={r.id} label={t(r.label)} hint={t(r.hint)} checked={!!prefs[r.id]} disabled={locked}
              onChange={next => change({ [r.id]: next })}
            />
          ))}
        </div>

        <QuietHours prefs={prefs} change={change} disabled={locked} />

        {load === 'missing' ? <p className="ntf-note" role="note">{t('prefsUnavailable')}</p> : null}
        <p className={`ntf-status${save === 'error' || load === 'error' ? ' ntf-status-err' : ''}`} role="status">
          {save === 'saved' ? t('prefsSaved') : save === 'error' || load === 'error' ? t('prefsSaveError') : ''}
        </p>
      </div>
    </div>
  )
}
