import { useEffect, useState } from 'react'
import { metersBetween } from './camera.js'

// The guest's live position for the "you are here" dot (docs/MAP-PLAN-2026-10-18.md section 4, Location).
// `enabled` is true once location is on (useViewerLocation().status === 'on'): the permission itself is asked elsewhere,
// on a tap only. The fix lives in this hook's state and nowhere else (never stored, never sent). The watch stops while the
// page is hidden and when the map unmounts; fixes that moved less than 5 m (with the same accuracy band) are dropped, so
// a still phone does not re-render the screen.
const MIN_MOVE_M = 5

/** @returns {{ lat:number, lng:number, accuracy:number } | null} */
export default function useMyPosition(enabled) {
  const [pos, setPos] = useState(null)

  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setPos(null)
      return undefined
    }
    let watch = null
    let last = null

    const onFix = p => {
      const next = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy || 0) }
      if (last
        && metersBetween([last.lng, last.lat], [next.lng, next.lat]) < MIN_MOVE_M
        && Math.abs(last.accuracy - next.accuracy) < 15) return
      last = next
      setPos(next)
    }
    const start = () => {
      if (watch !== null) return
      watch = navigator.geolocation.watchPosition(onFix, () => {}, { enableHighAccuracy: false, maximumAge: 10000, timeout: 30000 })
    }
    const stop = () => {
      if (watch === null) return
      navigator.geolocation.clearWatch(watch)
      watch = null
    }
    const onVisibility = () => { if (document.hidden) stop(); else start() }

    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      stop()
    }
  }, [enabled])

  return enabled ? pos : null
}

export { useMyPosition }
