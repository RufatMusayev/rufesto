// Viewer location for the "nearby" pool (docs/V2-CONTRACT.md 17.5). No automatic prompt: the pill
// "Use my location for nearby" calls navigator.geolocation once per tap. Granted -> coordinates rounded
// to 3 decimals (about 100 m), kept in memory only, plus a `rufesto_geo_ok` flag in localStorage so the
// next visit fetches silently when the browser reports the permission as granted. Denied -> the feed stays on the GPS-off mix and the pill stays.
// Coordinates are never stored or sent anywhere but home_feed / home_feed_new_count.
import { useCallback, useEffect, useState } from 'react'

const FLAG = 'rufesto_geo_ok'
const SILENT_TIMEOUT_MS = 4000          // the first feed load waits for this at most
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

let memo = null                          // { lat, lng } for the rest of this page load

function position(timeout) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: round3(p.coords.latitude), lng: round3(p.coords.longitude) }),
      reject,
      { enableHighAccuracy: false, timeout, maximumAge: MAX_AGE_MS },
    )
  })
}

/**
 * -> { coords: {lat, lng} | null, status, pending, supported, request }
 * status: 'off' | 'asking' | 'on' | 'denied' | 'error'. `pending` is true while a remembered
 * permission is being used silently on mount (the feed waits for it so it loads once, with GPS).
 */
export function useViewerLocation() {
  const [coords, setCoords] = useState(memo)
  const [status, setStatus] = useState(memo ? 'on' : 'off')
  const [pending, setPending] = useState(() => !memo && supported() && readFlag())

  useEffect(() => {
    if (!pending) return undefined
    let alive = true
    ;(async () => {
      try {
        // only an explicit 'granted' may use the position silently; a missing / failing Permissions API
        // means 'unknown' and must never trigger a prompt (contract 17.5: no automatic prompt)
        let state = 'unknown'
        try { state = (await navigator.permissions.query({ name: 'geolocation' })).state } catch { /* no Permissions API */ }
        if (state !== 'granted') {
          // not granted (reset, denied, unknown): forget the flag and wait for the pill tap
          writeFlag(false)
          if (alive) setStatus(state === 'denied' ? 'denied' : 'off')
          return
        }
        const c = await position(SILENT_TIMEOUT_MS)
        memo = c
        if (alive) { setCoords(c); setStatus('on') }
      } catch (err) {
        if (err?.code === 1) writeFlag(false)
        if (alive) setStatus(err?.code === 1 ? 'denied' : 'off')
      } finally {
        if (alive) setPending(false)
      }
    })()
    return () => { alive = false }
  }, [pending])

  const request = useCallback(async () => {
    if (!supported() || status === 'asking') return
    setStatus('asking')
    try {
      const c = await position(ASK_TIMEOUT_MS)
      memo = c
      writeFlag(true)
      setCoords(c)
      setStatus('on')
    } catch (err) {
      if (err?.code === 1) { writeFlag(false); setStatus('denied') }   // PERMISSION_DENIED
      else setStatus('error')                                          // unavailable / timeout: tap again
    }
  }, [status])

  return { coords, status, pending, supported: supported(), request }
}
