import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEscapeClose } from '../../components/ui'
import { enablePush } from './push'
import { rememberPrompted } from './prompt'
import { BellIcon } from './Icons'
import './prompt.css'

const CLOSE_AFTER_MS = 3500

/**
 * The contextual ask: a card under the app header ("Get notified when your food is ready?" / "Remind me 1 hour before?").
 * It is remembered as shown the moment it appears, so it never returns on this device. "Turn on" is the tap that makes
 * the browser ask for permission; "Not now" just closes it.
 */
export default function PushPrompt({ kind, onClose }) {
  const { t } = useTranslation(['notifications', 'common'])
  const [phase, setPhase] = useState('ask')          // ask | busy | done | denied | error
  const timer = useRef(null)
  useEscapeClose(onClose, true)

  useEffect(() => { rememberPrompted(kind) }, [kind])
  useEffect(() => () => clearTimeout(timer.current), [])

  function closeSoon() {
    clearTimeout(timer.current)
    timer.current = setTimeout(onClose, CLOSE_AFTER_MS)
  }

  async function turnOn() {
    if (phase === 'busy') return
    setPhase('busy')
    const res = await enablePush()
    if (res.ok) { setPhase('done'); closeSoon() }
    else if (res.error === 'dismissed') setPhase('ask')      // the permission dialog was closed: they can tap again or say Not now
    else { setPhase(res.error === 'denied' ? 'denied' : 'error'); closeSoon() }
  }

  const title = kind === 'booking' ? t('notifications:promptBookingTitle') : t('notifications:promptOrderTitle')
  const body = kind === 'booking' ? t('notifications:promptBookingBody') : t('notifications:promptOrderBody')
  const message = phase === 'done' ? t('notifications:promptDone') : phase === 'denied' ? t('notifications:promptDenied') : phase === 'error' ? t('notifications:promptError') : null

  return (
    <section className="ntf-prompt" role="region" aria-label={title}>
      <div className="ntf-prompt-row">
        <span className="ntf-prompt-icon"><BellIcon size={22} /></span>
        <div className="ntf-prompt-main">
          {message ? (
            <p className="ntf-prompt-msg" role="status">{message}</p>
          ) : (
            <>
              <h2 className="ntf-prompt-title">{title}</h2>
              <p className="ntf-prompt-body">{body}</p>
            </>
          )}
        </div>
      </div>
      {message ? (
        <div className="ntf-prompt-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>{t('common:close')}</button>
        </div>
      ) : (
        <div className="ntf-prompt-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={phase === 'busy'}>{t('notifications:promptNotNow')}</button>
          <button type="button" className="btn btn-primary" onClick={turnOn} disabled={phase === 'busy'}>{t('notifications:promptTurnOn')}</button>
        </div>
      )}
    </section>
  )
}
