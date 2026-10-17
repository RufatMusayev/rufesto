// Web push for this device (V2-CONTRACT 21.3 / 21.5): feature detection, subscribe, unsubscribe. The Supabase side
// (save_push_subscription / delete_push_subscription) is in notifApi.js; this file only talks to the browser.
//
// The worker is /sw.js (client-resto/public), scope "/" = the dashboard origin. The browser only asks for permission
// inside subscribeThisDevice(), which the Settings switch calls from a tap.

const VAPID_PUBLIC_KEY = String(import.meta.env.VITE_VAPID_PUBLIC_KEY || '').trim()
const SW_URL = '/sw.js'
const READY_TIMEOUT_MS = 10000

/** The VAPID public key is not secret; it ships as VITE_VAPID_PUBLIC_KEY. Missing: the push switch is hidden. */
export function hasVapidKey() {
  return VAPID_PUBLIC_KEY.length > 20
}

function isIos() {
  const ua = navigator.userAgent || ''
  // iPadOS 13+ reports itself as a Mac with touch.
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
  } catch {
    return false
  }
}

/** 'ok' | 'ios-install' (iPhone / iPad outside the Home Screen app, where push does not exist yet) | 'unsupported'. */
export function pushSupport() {
  const ok = typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    && typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window
  if (ok) return 'ok'
  return isIos() && !isStandalone() ? 'ios-install' : 'unsupported'
}

/** 'granted' | 'denied' | 'default' (never asked). */
export function notificationPermission() {
  try { return Notification.permission } catch { return 'default' }
}

function urlBase64ToUint8Array(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, c => c.charCodeAt(0))
}

function sameKey(sub, keyBytes) {
  const current = sub?.options?.applicationServerKey
  if (!current) return true // not exposed by this browser: assume it matches
  const a = new Uint8Array(current)
  return a.length === keyBytes.length && a.every((v, i) => v === keyBytes[i])
}

/** This device's existing subscription for the dashboard worker, or null. Never registers anything. */
export async function currentSubscription() {
  try {
    const reg = await navigator.serviceWorker.getRegistration('/')
    return reg ? await reg.pushManager.getSubscription() : null
  } catch {
    return null
  }
}

export function subscriptionKeys(sub) {
  const j = sub.toJSON()
  return { endpoint: sub.endpoint, p256dh: j.keys?.p256dh || '', auth: j.keys?.auth || '' }
}

/** Error with a `code` the card maps to a message: 'permission_denied' | 'permission_dismissed' | 'push_failed'. */
function pushError(code) {
  const e = new Error(code)
  e.code = code
  return e
}

/**
 * Asks for permission (call from a tap only), registers /sw.js and subscribes with the VAPID public key.
 * Returns { sub, created } (created = a new browser subscription, so the caller may roll it back).
 */
export async function subscribeThisDevice() {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw pushError(permission === 'denied' ? 'permission_denied' : 'permission_dismissed')

  let reg
  try {
    reg = await navigator.serviceWorker.register(SW_URL, { scope: '/' })
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_, reject) => setTimeout(() => reject(new Error('sw_timeout')), READY_TIMEOUT_MS)),
    ])
  } catch {
    throw pushError('push_failed')
  }

  const keyBytes = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  try {
    let sub = await reg.pushManager.getSubscription()
    // A subscription made with another VAPID key (keys rotated) can never receive our pushes: replace it.
    if (sub && !sameKey(sub, keyBytes)) {
      await sub.unsubscribe()
      sub = null
    }
    if (sub) return { sub, created: false }
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes })
    return { sub, created: true }
  } catch {
    throw pushError('push_failed')
  }
}

/** Removes the browser subscription (the caller deletes the saved row first, it needs the endpoint). */
export async function unsubscribeThisDevice() {
  const sub = await currentSubscription()
  if (sub) await sub.unsubscribe().catch(() => {})
}
