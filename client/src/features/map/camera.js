// Camera rules of the map (docs/MAP-PLAN-2026-10-18.md section 4): the safe rect, the offset that centres a point in the
// part of the map the sheet / carousel leaves visible, the fit padding and the distance used by the locate move.
// Pure functions; sizes are in CSS px of the MapCanvas container and `overlay` is { top, bottom } in the same px.
import { SAFE_INSET } from './mapTuning.js'

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
  return { left: inset, right: size.width - inset, top: v.top + inset, bottom: v.bottom - inset }
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

/** fitBounds padding: top 72, bottom overlay + 24, sides 32 (plan 4, filter chip row). */
export function fitPadding(overlay) {
  return { top: 72 + Math.max(0, overlay?.top || 0), bottom: 24 + Math.max(0, overlay?.bottom || 0), left: 32, right: 32 }
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
