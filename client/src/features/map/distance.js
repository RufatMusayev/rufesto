// Distances of the map: computed on the phone from the viewer's 3-decimal position (docs/MAP-PLAN-2026-10-18.md 4,
// "List order"). Nothing here leaves the device.
import { decimal } from './format'

const R_KM = 6371.0088
const rad = d => (d * Math.PI) / 180

/** Great-circle distance in km between two { lat, lng } points. */
export function haversineKm(a, b) {
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** "850 m" (50 m steps, never below 50 m) under a kilometre, "1.2 km" up to 10 km, "14 km" beyond. `t` = map translate. */
export function distanceText(t, km, lang) {
  if (km == null || !Number.isFinite(km)) return null
  if (km < 1) {
    const m = Math.min(950, Math.max(50, Math.round((km * 1000) / 50) * 50))
    return t('meters', { n: m })
  }
  const tenth = Math.round(km * 10) / 10
  const shown = tenth < 10 ? decimal(tenth, 1, lang) : String(Math.round(km))
  return t('km', { n: shown })
}

/** Walking minutes along streets: straight line x 1.3 at 80 m/min. Only worth saying up to 25 minutes. */
export function walkMinutes(km) {
  if (km == null || !Number.isFinite(km)) return null
  const min = Math.max(1, Math.round((km * 1.3 * 1000) / 80))
  return min <= 25 ? min : null
}
