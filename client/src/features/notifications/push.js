// Web push on this device: register /sw.js, subscribe with the VAPID public key, save / delete the subscription through
// the RPCs (docs/V2-CONTRACT.md section 21.3 / 21.4). Nothing here asks for permission by itself: enablePush() is only
// called from a tap (the settings switch or the "Turn on" button of a contextual prompt).
//
// VITE_VAPID_PUBLIC_KEY is not secret; when it is not in the build, push is "unavailable" and no UI offers it.
import i18n from '../../lib/i18n'
import { savePushSubscription, deletePushSubscription, hasSavedSubscription, countSavedSubscriptions, setPrefs } from './api'

export const VAPID_PUBLIC_KEY = String(import.meta.env.VITE_VAPID_PUBLIC_KEY || '').trim()

const SW_URL = '/sw.js'

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isStandalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true

/**
 * Can this device be offered push? 'ok' | 'nokey' (no VAPID key in the build: show nothing) | 'ios_install' (iOS Safari
 * only pushes to an installed Home Screen app) | 'unsupported' (no service worker / push / Notification API).
 */
export function pushSupport() {
  if (!VAPID_PUBLIC_KEY) return 'nokey'
  if (isIos() && !isStandalone()) return 'ios_install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  return 'ok'
}

function keyBytes() {
  const pad = '='.repeat((4 - (VAPID_PUBLIC_KEY.length % 4)) % 4)
  const b64 = (VAPID_PUBLIC_KEY + pad).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(b64)
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

function sameKey(sub, bytes) {
  const k = sub.options && sub.options.applicationServerKey
  if (!k) return true
  const a = new Uint8Array(k)
  return a.length === bytes.length && a.every((v, i) => v === bytes[i])
}

async function registration() {
  await navigator.serviceWorker.register(SW_URL, { scope: '/' })
  return navigator.serviceWorker.ready
}

/**
 * Where this device stands: { status: 'nokey' | 'unsupported' | 'ios_install' | 'denied' | 'off' | 'on' }.
 * 'on' = the browser holds a subscription AND the server still has it for this guest (when it cannot tell, the browser decides).
 */
export async function getPushState() {
  const support = pushSupport()
  if (support !== 'ok') return { status: support }
  if (Notification.permission === 'denied') return { status: 'denied' }
  try {
    const reg = await navigator.serviceWorker.getRegistration('/')
    const sub = reg ? await reg.pushManager.getSubscription() : null
    if (sub && Notification.permission === 'granted') {
      const saved = await hasSavedSubscription(sub.endpoint)
      if (saved !== false) return { status: 'on', endpoint: sub.endpoint }
    }
  } catch { /* treated as off */ }
  return { status: 'off' }
}

/**
 * Turn push on for this device. Resolves { ok: true } or { ok: false, error } with error one of
 * 'denied' | 'dismissed' | 'unsupported' | 'ios_install' | 'nokey' | 'unavailable' (sql/64b not applied) | 'save_failed' | 'subscribe_failed'.
 * The permission prompt is the first thing awaited, so the tap's user activation is still valid (iOS needs that).
 */
export async function enablePush() {
  const support = pushSupport()
  if (support !== 'ok') return { ok: false, error: support }

  let permission = Notification.permission
  if (permission === 'default') permission = await Notification.requestPermission()
  if (permission !== 'granted') return { ok: false, error: permission === 'denied' ? 'denied' : 'dismissed' }

  let created = false
  let sub = null
  try {
    const reg = await registration()
    const bytes = keyBytes()
    sub = await reg.pushManager.getSubscription()
    if (sub && !sameKey(sub, bytes)) { await sub.unsubscribe(); sub = null }      // the key was rotated
    if (!sub) { sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes }); created = true }

    const json = sub.toJSON()
    const res = await savePushSubscription({
      endpoint: sub.endpoint, p256dh: json.keys && json.keys.p256dh, auth: json.keys && json.keys.auth,
      userAgent: navigator.userAgent.slice(0, 200),
    })
    if (res.error) {
      if (created) await sub.unsubscribe().catch(() => {})
      return { ok: false, error: res.error.missing ? 'unavailable' : 'save_failed' }
    }
    // The server only pushes to guests whose prefs say so; the UI language picks the wording of the push.
    await setPrefs({ push_enabled: true, language: String(i18n.language || 'en').slice(0, 2) })
    return { ok: true }
  } catch {
    if (created && sub) await sub.unsubscribe().catch(() => {})
    return { ok: false, error: 'subscribe_failed' }
  }
}

/** Turn push off for this device: forget the subscription on the server, then in the browser. */
export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.getRegistration('/')
    const sub = reg ? await reg.pushManager.getSubscription() : null
    if (sub) {
      await deletePushSubscription(sub.endpoint)
      await sub.unsubscribe()
    }
    // the master flag goes off only when no other device of this guest is still subscribed
    if ((await countSavedSubscriptions()) === 0) await setPrefs({ push_enabled: false })
    return { ok: true }
  } catch {
    return { ok: false, error: 'subscribe_failed' }
  }
}
