// Viewer location for the "nearby" pool (docs/V2-CONTRACT.md 17.5, shared by Home and Discover in 18.3).
// No automatic prompt: the pill "Use my location for nearby" calls navigator.geolocation once per tap.
// Granted -> coordinates rounded to 3 decimals (about 100 m), kept in memory only, plus a `rufesto_geo_ok`
// flag in localStorage so the next visit fetches silently when the browser reports the permission as
// granted. Denied -> the feed stays on the GPS-off mix and the pill stays. Coordinates are never stored or
// sent anywhere but home_feed / home_feed_new_count / friends_feed / discover.
//
// One module-level state: every tab that calls useViewerLocation sees the same permission, the same fix
// and the same pill state, and a tap in one tab updates all of them.
import { useEffect } from 'react'
import { createStore, useStore } from './store'

const FLAG = 'rufesto_geo_ok'
const SILENT_TIMEOUT_MS = 2500          // the first load waits for this at most
const ASK_TIMEOUT_MS = 10000
const MAX_AGE_MS = 10 * 60 * 1000

const round3 = v => Math.round(v * 1000) / 1000
const supported = () => typeof navigator !== 'undefined' && !!navigator.geolocation

function readFlag() {
  try { return localStorage.getItem(FLAG) === '1' } catch { return false }
}
function writeFlag(on) {
  try { if (on) localStorage.setItem(FLAG, '1'); else localStorage.removeItem(FLAG) } catch { /* storage blocked */ }
}

// `pending` is true from the first frame when a remembered permission will be used silently, so the feeds
// wait for that one fix and load once with GPS instead of twice.
const store = createStore({ coords: null, status: 'off', pending: supported() && readFlag() })
let started = false

function position(timeout) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: round3(p.coords.latitude), lng: round3(p.coords.longitude) }),
      reject,
      { enableHighAccuracy: false, timeout, maximumAge: MAX_AGE_MS },
    )
  })
}

async function silentFix() {
  try {
    // only an explicit 'granted' may use the position silently; a missing / failing Permissions API
    // means 'unknown' and must never trigger a prompt (contract 17.5: no automatic prompt)
    let state = 'unknown'
    try { state = (await navigator.permissions.query({ name: 'geolocation' })).state } catch { /* no Permissions API */ }
    if (state !== 'granted') {
      writeFlag(false)                                   // reset, denied or unknown: forget it, wait for the pill tap
      store.set({ status: state === 'denied' ? 'denied' : 'off' })
      return
    }
    const coords = await position(SILENT_TIMEOUT_MS)
    store.set({ coords, status: 'on' })
  } catch (err) {
    if (err?.code === 1) writeFlag(false)
    store.set({ status: err?.code === 1 ? 'denied' : 'off' })
  } finally {
    store.set({ pending: false })
  }
}

/** Starts the silent fix once (idempotent). Called on route load, before any component mounts. */
export function startViewerLocation() {
  if (started) return
  started = true
  if (store.get().pending) silentFix()
}

/** Resolves with the coordinates (or null) once the silent fix has settled; at once when none is pending. */
export function locationSettled() {
  startViewerLocation()
  return new Promise(resolve => {
    if (!store.get().pending) { resolve(store.get().coords); return }
    const off = store.subscribe(() => {
      if (!store.get().pending) { off(); resolve(store.get().coords) }
    })
  })
}

/** The pill tap: asks the browser (this is the only place that can prompt). */
export async function requestViewerLocation() {
  if (!supported() || store.get().status === 'asking') return
  store.set({ status: 'asking' })
  try {
    const coords = await position(ASK_TIMEOUT_MS)
    writeFlag(true)
    store.set({ coords, status: 'on' })
  } catch (err) {
    if (err?.code === 1) { writeFlag(false); store.set({ status: 'denied' }) }   // PERMISSION_DENIED
    else store.set({ status: 'error' })                                          // unavailable / timeout: tap again
  }
}

/**
 * -> { coords: {lat, lng} | null, status, pending, supported, request }
 * status: 'off' | 'asking' | 'on' | 'denied' | 'error'. `pending` is true while a remembered
 * permission is being used silently on page load (the feeds wait for it).
 */
export function useViewerLocation() {
  const s = useStore(store)
  useEffect(() => { startViewerLocation() }, [])
  return { coords: s.coords, status: s.status, pending: s.pending, supported: supported(), request: requestViewerLocation }
}
