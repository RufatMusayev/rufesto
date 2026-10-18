// Geometry for the detail mode (docs/MAP-PLAN-2026-10-18.md round 2): which building polygon of the OpenMapTiles `building`
// layer a venue's point belongs to, and the GeoJSON the highlight layers draw. Pure functions over [lng, lat] rings.
//
// OpenMapTiles knows footprints, heights and house numbers; it has no entrances, floors or indoor plans (2GIS does), so the best
// this can do is "the building the venue's point is in, or the nearest one within 25 m".

const M_PER_DEG_LAT = 110574
const mPerDegLng = lat => 111320 * Math.cos((lat * Math.PI) / 180)

/** Ray casting: is the point inside the ring? (ring = [[lng, lat], ...], closed or not) */
export function inRing(pt, ring) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** Unsigned planar area of a ring in square metres (local equirectangular, good enough to rank two polygons). */
export function ringArea(ring) {
  if (!ring.length) return 0
  const k = mPerDegLng(ring[0][1])
  let a = 0
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] * k) * (ring[i][1] * M_PER_DEG_LAT) - (ring[i][0] * k) * (ring[j][1] * M_PER_DEG_LAT)
  }
  return Math.abs(a) / 2
}

/** Shortest distance in metres from the point to the ring's edge. */
export function distToRingM(pt, ring) {
  const k = mPerDegLng(pt[1])
  const px = pt[0] * k
  const py = pt[1] * M_PER_DEG_LAT
  let best = Infinity
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const ax = ring[j][0] * k
    const ay = ring[j][1] * M_PER_DEG_LAT
    const bx = ring[i][0] * k
    const by = ring[i][1] * M_PER_DEG_LAT
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
    best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)))
  }
  return best
}

const bboxNear = (ring, pt, deg) => {
  let w = Infinity; let s = Infinity; let e = -Infinity; let n = -Infinity
  for (const [x, y] of ring) {
    if (x < w) w = x
    if (x > e) e = x
    if (y < s) s = y
    if (y > n) n = y
  }
  return pt[0] >= w - deg && pt[0] <= e + deg && pt[1] >= s - deg && pt[1] <= n + deg
}

const polygonsOf = geometry => {
  if (geometry?.type === 'Polygon') return [geometry.coordinates]
  if (geometry?.type === 'MultiPolygon') return geometry.coordinates
  return []
}

/**
 * The building of a venue: the polygon that contains its point (the largest when several do, tiles can cut a building in
 * pieces), else the nearest within `maxM` metres (a venue geocoded onto the street in front of the door).
 * @param {Array<{geometry:object, properties:object}>} features features of the `building` layer
 * @returns {{ rings:number[][][], props:object } | null}
 */
export function pickBuilding(features, pt, maxM = 25) {
  let inside = null
  let insideArea = -1
  let near = null
  let nearD = Infinity
  for (const f of features) {
    for (const rings of polygonsOf(f.geometry)) {
      if (!rings[0] || !bboxNear(rings[0], pt, 0.0004)) continue
      if (inRing(pt, rings[0]) && !rings.slice(1).some(h => inRing(pt, h))) {
        const a = ringArea(rings[0])
        if (a > insideArea) { inside = { rings, props: f.properties || {} }; insideArea = a }
      } else if (!inside) {
        const d = distToRingM(pt, rings[0])
        if (d < nearD) { near = { rings, props: f.properties || {} }; nearD = d }
      }
    }
  }
  if (inside) return inside
  return near && nearD <= maxM ? near : null
}

/** Grows a polygon about its outer ring's centroid by about `m` metres, so the highlight's walls do not coincide with the base
 * building's (coplanar walls flicker). Holes are left alone. */
export function inflate(rings, m = 0.5) {
  const outer = rings[0]
  let cx = 0
  let cy = 0
  for (const [x, y] of outer) { cx += x; cy += y }
  cx /= outer.length
  cy /= outer.length
  const k = mPerDegLng(cy)
  let r = 0
  for (const [x, y] of outer) r += Math.hypot((x - cx) * k, (y - cy) * M_PER_DEG_LAT)
  r = Math.max(3, r / outer.length)
  const s = 1 + m / r
  return [outer.map(([x, y]) => [cx + (x - cx) * s, cy + (y - cy) * s]), ...rings.slice(1)]
}

/** A circle polygon around the point (the soft footprint when the data has no building there). */
export function circleRing(pt, radiusM = 14, steps = 36) {
  const k = mPerDegLng(pt[1])
  const ring = []
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI
    ring.push([pt[0] + (Math.cos(a) * radiusM) / k, pt[1] + (Math.sin(a) * radiusM) / M_PER_DEG_LAT])
  }
  return ring
}

export const EMPTY = { type: 'FeatureCollection', features: [] }

/** The FeatureCollection of the highlight source: the extruded building copy or the footprint circle. */
export function highlightFor(hit, pt) {
  if (hit) {
    const h = Number(hit.props.render_height)
    const b = Number(hit.props.render_min_height)
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { kind: 'building', h: Number.isFinite(h) && h > 0 ? h : 6, b: Number.isFinite(b) ? b : 0 },
        geometry: { type: 'Polygon', coordinates: inflate(hit.rings) },
      }],
    }
  }
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: { kind: 'circle' }, geometry: { type: 'Polygon', coordinates: [circleRing(pt)] } }],
  }
}
