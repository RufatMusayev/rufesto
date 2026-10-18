// Camera rules of the map (docs/MAP-PLAN-2026-10-18.md section 4): the safe rect, the offset that centres a point in the
// part of the map the sheet / carousel leaves visible, the fit padding and the distance used by the locate move.
// Pure functions; sizes are in CSS px of the MapCanvas container and `overlay` is { top, bottom } in the same px.
import { SAFE_INSET, SAFE_TOP_EXTRA } from './mapTuning.js'

/** The part of the container the sheet / carousel leave visible: { top, bottom } in container px (bottom is an y). */
export function visibleArea(size, overlay) {
  const top = Math.max(0, overlay?.top || 0)
  const bottom = Math.max(top, size.height - Math.max(0, overlay?.bottom || 0))
  return { top, bottom }
}

/** Visible area inset by SAFE_INSET on every side. */
export function safeRect(size, overlay) {
  const v = visibleArea(size, overlay)
  const inset = Math.min(SAFE_INSET, Math.max(0, (v.bottom - v.top) / 4), size.width / 4)
  // the top has room for a pill that hangs above its point and for the attribution chip
  return { left: inset, right: size.width - inset, top: v.top + inset + Math.min(SAFE_TOP_EXTRA, inset), bottom: v.bottom - inset }
}

export const insideRect = (pt, r) => pt.x >= r.left && pt.x <= r.right && pt.y >= r.top && pt.y <= r.bottom

/**
 * `offset` for easeTo / jumpTo: a point flown "to the centre" ends at the middle of the visible area instead of the middle
 * of the container. easeTo's offset is measured from the container centre.
 */
export function centreOffset(size, overlay) {
  const v = visibleArea(size, overlay)
  return [0, Math.round((v.top + v.bottom) / 2 - size.height / 2)]
}

/** fit padding: top 72, bottom overlay + 24, sides 48 (half a pill is 33 px, round 2: a pill must not touch the edge). */
export function fitPadding(overlay) {
  return { top: 72 + Math.max(0, overlay?.top || 0), bottom: 24 + Math.max(0, overlay?.bottom || 0), left: 48, right: 48 }
}

/** Great-circle distance in metres between two [lng, lat] points. */
export function metersBetween(a, b) {
  const R = 6371008.8
  const rad = Math.PI / 180
  const dLat = (b[1] - a[1]) * rad
  const dLng = (b[0] - a[0]) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Metres per CSS pixel at a latitude and (512 px tile) zoom. */
export const metersPerPixel = (lat, zoom) => (78271.51696402048 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom

/** [[w, s], [e, n]] of anything with lng / lat. */
export function boundsOfPoints(points) {
  let w = Infinity; let s = Infinity; let e = -Infinity; let n = -Infinity
  for (const p of points) {
    if (p.lng < w) w = p.lng
    if (p.lng > e) e = p.lng
    if (p.lat < s) s = p.lat
    if (p.lat > n) n = p.lat
  }
  return [[w, s], [e, n]]
}

const median = a => {
  const s = a.slice().sort((x, y) => x - y)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * The dense core of a set of places: those within `km` of the median point, so one far outlier (Tiflis Dvor, 8 km east of the
 * rest) does not drag a fit out to sea. Sets of fewer than three are returned whole, and the core is never smaller than two.
 * @template {{lng:number, lat:number}} T
 * @param {T[]} points
 * @returns {T[]}
 */
export function denseCore(points, km = 4) {
  if (points.length < 3) return points.slice()
  const c = [median(points.map(p => p.lng)), median(points.map(p => p.lat))]
  const core = points.filter(p => metersBetween(c, [p.lng, p.lat]) <= km * 1000)
  return core.length >= 2 ? core : points.slice()
}

/** Duration of a far camera move: grows with the distance, capped at 1.2 s. */
export const flyMs = km => Math.round(Math.min(1200, Math.max(700, 600 + km * 70)))
