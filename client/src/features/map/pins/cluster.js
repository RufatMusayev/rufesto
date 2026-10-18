// Count bubbles for zoom <= CLUSTER_MAX_ZOOM (docs/MAP-PLAN-2026-10-18.md M7), on supercluster. The index is rebuilt when
// the list of places changes; a view is "which places are still single pins, which groups are bubbles" at a zoom.
// Round 2: below CLUSTER_MIN_PLACES venues there are no bubbles at all (the pill / dot collision copes with overlap).
import Supercluster from 'supercluster'
import { CLUSTER_MAX_ZOOM, CLUSTER_MIN_PLACES, CLUSTER_RADIUS } from '../mapTuning.js'

const WORLD = [-180, -85, 180, 85]

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

  return {
    /** @returns {{ pins: Set<string>, bubbles: Array<{id:number, lng:number, lat:number, count:number, idx:number}> }} */
    view(zoom) {
      if (zoom > CLUSTER_MAX_ZOOM || places.length < CLUSTER_MIN_PLACES) return { pins: new Set(places.map(p => p.id)), bubbles: [] }
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
    /** Zoom at which the bubble falls apart (capped by the caller). */
    expansionZoom(clusterId) {
      try { return index.getClusterExpansionZoom(clusterId) } catch { return CLUSTER_MAX_ZOOM + 1 }
    },
  }
}
