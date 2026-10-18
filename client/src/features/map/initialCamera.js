import { useEffect, useRef, useState } from 'react'
import { haversineKm } from './distance'

// Where the map opens (docs/MAP-PLAN-2026-10-18.md 4, "Initial camera"; the constructor gets it, so the map never flies in
// from the world view): restore the last view -> the deep-linked place at z16 -> the guest's position (z14.5) when it is
// within 30 km of a venue -> the bounds of all venues -> Baku centre at z12.5. The hook decides once and returns null
// until it has: the venues (cache or answer) and a remembered location fix are waited for, but not for long.
export const BAKU_CENTER = [49.838, 40.371]
const NEAR_KM = 30
const WAIT_DATA_MS = 2500
const WAIT_LOCATION_MS = 600

export function boundsOf(places) {
  let w = Infinity; let s = Infinity; let e = -Infinity; let n = -Infinity
  for (const p of places) {
    if (p.lng < w) w = p.lng
    if (p.lng > e) e = p.lng
    if (p.lat < s) s = p.lat
    if (p.lat > n) n = p.lat
  }
  return [[w, s], [e, n]]
}

export function centerOfBounds(b) {
  return [(b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2]
}

export function computeCamera({ saved, place, coords, places }) {
  if (saved) return saved
  if (place) return { center: [place.lng, place.lat], zoom: 16 }
  const list = places || []
  if (coords && list.length && Math.min(...list.map(p => haversineKm(coords, p))) <= NEAR_KM) {
    return { center: [coords.lng, coords.lat], zoom: 14.5 }
  }
  if (list.length === 1) return { center: [list[0].lng, list[0].lat], zoom: 15 }
  if (list.length) return { bounds: boundsOf(list) }
  return { center: BAKU_CENTER, zoom: 12.5 }
}

/**
 * -> the initial camera ({ center, zoom } | { bounds }) or null while it is not decided.
 *   savedCamera  the camera to restore, or null (the caller decides whether this arrival restores: POP, or no deep link)
 *   placeKey     ?place= of the arrival
 */
export default function useInitialCamera({ savedCamera, placeKey, places, status, coords, locationPending }) {
  const [cam, setCam] = useState(savedCamera || null)
  const t0 = useRef(Date.now())
  const live = useRef({})
  live.current = { places, placeKey, coords }

  const dataReady = places != null || status === 'error'
  useEffect(() => {
    if (cam) return undefined
    const decide = () => {
      const { places: list, placeKey: key, coords: c } = live.current
      const place = key && list ? list.find(p => (p.slug || p.id) === key) : null
      setCam(computeCamera({ saved: null, place, coords: c, places: list }))
    }
    if (dataReady && !locationPending) { decide(); return undefined }
    const elapsed = Date.now() - t0.current
    const wait = dataReady ? WAIT_LOCATION_MS - elapsed : WAIT_DATA_MS - elapsed
    const id = setTimeout(decide, Math.max(0, wait))
    return () => clearTimeout(id)
  }, [cam, dataReady, locationPending])

  return cam
}
