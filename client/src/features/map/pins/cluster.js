// Count bubbles (docs/MAP-PLAN-2026-10-18.md M7). Two rules, one view:
//  - from CLUSTER_MIN_PLACES venues up, places that sit close together are bubbles at zoom <= CLUSTER_MAX_ZOOM (supercluster);
//  - round 3: with fewer venues there are still bubbles BELOW GROUP_BELOW_ZOOM, for the venues that actually overlap on screen
//    at the current zoom (two venues closer than GROUP_PX px), so a zoomed-out city is never a pile of indistinguishable dots.
//    From that zoom up the pill / dot collision alone handles overlap.
// The index is rebuilt when the list of places changes; a view is "which places are still single pins, which groups are bubbles".
import Supercluster from 'supercluster'
import { CLUSTER_MAX_ZOOM, CLUSTER_MIN_PLACES, CLUSTER_RADIUS, GROUP_BELOW_ZOOM, GROUP_PX } from '../mapTuning.js'
import { compareRank } from './collide.js'

const WORLD = [-180, -85, 180, 85]

/**
 * Groups the places that overlap on screen: the best ranked venue takes every free neighbour closer than `px`.
 * @returns {{ pins: Set<string>, bubbles: Array<{id:string, lng:number, lat:number, count:number, idx:number, expandTo:number}> }}
 */
function groupOnScreen(places, project, zoom, selectedId, px = GROUP_PX) {
  const items = places
    .map((p, i) => ({ p, i, ...project([p.lng, p.lat]) }))
    .sort((a, b) => compareRank(a.p, b.p, selectedId))
  const taken = new Set()
  const pins = new Set()
  const bubbles = []
  for (const a of items) {
    if (taken.has(a.i)) continue
    taken.add(a.i)
    if (a.p.id === selectedId) { pins.add(a.p.id); continue } // the selected place is always a pin
    const group = [a]
    for (const b of items) {
      if (taken.has(b.i) || b.p.id === selectedId) continue
      if (Math.hypot(a.x - b.x, a.y - b.y) < px) { group.push(b); taken.add(b.i) }
    }
    if (group.length < 2) { pins.add(a.p.id); continue }
    let dmin = Infinity
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) dmin = Math.min(dmin, Math.hypot(group[i].x - group[j].x, group[i].y - group[j].y))
    }
    const idx = Math.min(...group.map(g => g.i))
    bubbles.push({
      id: `g${idx}`,
      lng: group.reduce((s, g) => s + g.p.lng, 0) / group.length,
      lat: group.reduce((s, g) => s + g.p.lat, 0) / group.length,
      count: group.length,
      idx,
      // the zoom at which the closest pair of the group is `px` apart (a little more, so one tap really separates them)
      expandTo: zoom + Math.log2((px * 1.15) / Math.max(dmin, 0.5)),
    })
  }
  return { pins, bubbles }
}

export function createClusterIndex(places) {
  const index = new Supercluster({
    radius: CLUSTER_RADIUS,
    maxZoom: CLUSTER_MAX_ZOOM,
    minZoom: 0,
    // the lowest list position inside a bubble: the keyboard order of bubbles and pins follows the list order
    map: p => ({ idx: p.idx }),
    reduce: (acc, p) => { if (p.idx < acc.idx) acc.idx = p.idx },
  })
  index.load(places.map((pl, i) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [pl.lng, pl.lat] },
    properties: { id: pl.id, idx: i },
  })))
  const all = () => ({ pins: new Set(places.map(p => p.id)), bubbles: [] })

  return {
    /**
     * @param {number} zoom
     * @param {{ project:(lngLat:number[]) => {x:number, y:number}, selectedId:string|null }} ctx  screen projection of the map
     * @returns {{ pins: Set<string>, bubbles: Array<{id:number|string, lng:number, lat:number, count:number, idx:number, expandTo?:number}> }}
     */
    view(zoom, ctx) {
      if (places.length < CLUSTER_MIN_PLACES) {
        return zoom < GROUP_BELOW_ZOOM && ctx ? groupOnScreen(places, ctx.project, zoom, ctx.selectedId) : all()
      }
      if (zoom > CLUSTER_MAX_ZOOM) return all()
      const pins = new Set()
      const bubbles = []
      for (const f of index.getClusters(WORLD, Math.max(0, Math.floor(zoom)))) {
        const p = f.properties
        if (p.cluster) {
          bubbles.push({
            id: p.cluster_id, lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1],
            count: p.point_count, idx: p.idx,
          })
        } else pins.add(p.id)
      }
      return { pins, bubbles }
    },
    /** Zoom at which a supercluster bubble falls apart (capped by the caller). */
    expansionZoom(clusterId) {
      try { return index.getClusterExpansionZoom(clusterId) } catch { return CLUSTER_MAX_ZOOM + 1 }
    },
  }
}
