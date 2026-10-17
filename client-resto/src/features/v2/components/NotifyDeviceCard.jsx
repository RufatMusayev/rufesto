import { useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isNotReady, v2Error } from '../errors'
import {
  deletePushSubscription, ensurePushEnabled, fetchOwnsPushEndpoint, saveStaffPushSubscription,
} from '../notifApi'
import { BellIcon } from '../notifIcons'
import {
  currentSubscription, hasVapidKey, notificationPermission, pushSupport,
  subscribeThisDevice, subscriptionKeys, unsubscribeThisDevice,
} from '../notifPush'
import ErrorBanner from './ErrorBanner'
import Switch from './Switch'

// Settings -> Notifications -> "Notify me on this device" (V2-CONTRACT 21.5), for every staff role. One switch:
//   on  = ask the browser for permission (only on this tap), register /sw.js, subscribe with the VAPID public key,
//         save_push_subscription(..., 'staff'), and make sure notification_prefs.push_enabled is on;
//   off = delete_push_subscription + unsubscribe the browser.
// The switch is hidden when VITE_VAPID_PUBLIC_KEY is missing, or when this browser cannot do push (an iPhone outside
// the Home Screen app gets the "add to Home Screen" hint instead). "On" means this browser is subscribed AND the
// signed-in user owns that subscription: a device another staff member enabled shows "off" until you switch it on.
export default function NotifyDeviceCard() {
  const { t } = useTranslation('v2')
  const uid = useId()
  const support = useMemo(() => pushSupport(), [])
  const keyOk = hasVapidKey()
  const live = keyOk && support === 'ok'

  const [phase, setPhase] = useState(live ? 'checking' : 'idle') // idle | checking | ready | not-ready
  const [on, setOn] = useState(false)
  const [perm, setPerm] = useState(() => (live ? notificationPermission() : 'default'))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!live) return undefined
    let cancelled = false
    ;(async () => {
      const sub = await currentSubscription()
      if (cancelled) return
      if (!sub) { setOn(false); setPhase('ready'); return }
      const { data, error: err } = await fetchOwnsPushEndpoint(sub.endpoint)
      if (cancelled) return
      if (err && isNotReady(err)) { setOn(false); setPhase('not-ready'); return }
      setOn(!!data)
      setPhase('ready')
    })()
    return () => { cancelled = true }
  }, [live])

  async function change(next) {
    setBusy(true)
    setError('')
    try {
      if (next) {
        const { sub, created } = await subscribeThisDevice()
        const saved = await saveStaffPushSubscription(subscriptionKeys(sub))
        if (saved.error) {
          if (created) await sub.unsubscribe().catch(() => {}) // never leave a browser subscription the server does not know
          if (isNotReady(saved.error)) setPhase('not-ready')
          else setError(v2Error(saved.error, t))
          return
        }
        await ensurePushEnabled() // best effort; the answer does not matter to the switch
        setOn(true)
      } else {
        const sub = await currentSubscription()
        if (sub) await deletePushSubscription(sub.endpoint) // a failure here is cleaned up by the 404 / 410 sweep
        await unsubscribeThisDevice()
        setOn(false)
      }
    } catch (e) {
      // permission_denied: the note under the switch says it (perm is read again below). permission_dismissed: the
      // person closed the browser prompt, nothing to report.
      if (e?.code !== 'permission_denied' && e?.code !== 'permission_dismissed') setError(t('notifPushFailed'))
    } finally {
      setPerm(notificationPermission())
      setBusy(false)
    }
  }

  const denied = perm === 'denied' && !on
  let note = null
  if (!keyOk) note = t('notifPushNoKey')
  else if (support === 'ios-install') note = t('notifPushIos')
  else if (support === 'unsupported') note = t('notifPushUnsupported')
  else if (phase === 'not-ready') note = t('notifPushNotReady')
  else if (denied) note = t('notifPushDenied')

  const status = busy ? t('notifDeviceBusy') : on ? t('notifDeviceOn') : t('notifDeviceOff')

  return (
    <section className="v2-card notif-device" aria-labelledby={`${uid}-title`}>
      <div className="notif-device-head">
        <span className="notif-device-icon"><BellIcon /></span>
        <div className="notif-device-copy">
          <h2 id={`${uid}-title`} className="notif-device-title">{t('notifDeviceTitle')}</h2>
          <p className="v2-hint">{t('notifDeviceBody')}</p>
        </div>
      </div>

      {live && phase !== 'not-ready' && (
        <div className="v2-switch-row notif-device-row">
          <div className="notif-device-state">
            <label className="v2-switch-label" htmlFor={`${uid}-switch`}>{t('notifDeviceTitle')}</label>
            <span className="v2-hint" role="status">{phase === 'checking' ? t('notifDeviceBusy') : status}</span>
          </div>
          <Switch
            id={`${uid}-switch`}
            checked={on}
            onChange={change}
            label={t('notifDeviceTitle')}
            disabled={busy || phase !== 'ready' || denied}
          />
        </div>
      )}

      {note && <p className={`notif-device-note${denied ? ' is-warn' : ''}`}>{note}</p>}
      <ErrorBanner message={error} onDismiss={() => setError('')} />
    </section>
  )
}
