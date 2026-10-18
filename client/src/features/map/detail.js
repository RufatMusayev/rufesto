// Detail mode of the map (docs/MAP-PLAN-2026-10-18.md round 2, 2GIS-style): from zoom 15 a 2D / 3D toggle is offered, and from
// zoom 15.5 the selected venue's building is drawn in the accent colour (its footprint extruded, or a soft circle when the tile
// data has no building there). Tilt exists only here: there are no pitch gestures, the pitch is set by the toggle or by "show on
// map" and goes back to 0 when the guest zooms out below 15 or deselects.
//
// Nothing here runs per frame: state is recomputed on zoomend / pitchend / moveend, the building is looked up once the map is
// idle after a change.
import { HIGHLIGHT_SOURCE } from './style/layers.js'
import { EMPTY, highlightFor, pickBuilding } from './buildings.js'
import { DETAIL_PITCH, HIGHLIGHT_MIN_ZOOM, TILT_MIN_ZOOM, MS, cubic } from './mapTuning.js'

const TILTED_AT = 5 // degrees: above this the map counts as tilted

/**
 * @param {object} o
 * @param {import('maplibre-gl').Map} o.map
 * @param {(state:{available:boolean, tilted:boolean}) => void} o.onChange
 * @param {() => boolean} o.reduced
 * @param {(opts:object) => void} o.ease  the controller's easeTo wrapper (marks the camera as animating)
 */
export function createDetail({ map, onChange, reduced, ease }) {
  let selected = null
  let needs = false
  let drawn = '' // what the highlight source shows now: '<id>:building' | '<id>:circle' | ''
  let available = false
  let tilted = false
  let dead = false
  let flattenTimer = 0

  const source = () => map.getSource(HIGHLIGHT_SOURCE)

  function clear() {
    if (!drawn) return
    drawn = ''
    source()?.setData(EMPTY)
  }

  function compute() {
    if (dead) return
    if (!selected || map.getZoom() < HIGHLIGHT_MIN_ZOOM) { clear(); return }
    const src = source()
    if (!src || !map.getSource('openmaptiles')) return
    const pt = [selected.lng, selected.lat]
    let features = []
    try { features = map.querySourceFeatures('openmaptiles', { sourceLayer: 'building' }) } catch { /* source not ready */ }
    const hit = pickBuilding(features, pt)
    const key = `${selected.id}:${hit ? 'building' : 'circle'}`
    if (key === drawn && hit) return // same building, nothing new
    drawn = key
    src.setData(highlightFor(hit, pt))
  }

  const sync = () => {
    if (dead) return
    const a = map.getZoom() >= TILT_MIN_ZOOM
    const t = map.getPitch() > TILTED_AT
    if (a !== available || t !== tilted) {
      available = a
      tilted = t
      onChange({ available, tilted })
    }
    // zoomed out of detail: the tilt goes with it (a tick later: easeTo must not run inside the map's own end-of-move event)
    if (!a && map.getPitch() > 0 && !flattenTimer) {
      flattenTimer = setTimeout(() => {
        flattenTimer = 0
        if (!dead && map.getZoom() < TILT_MIN_ZOOM && map.getPitch() > 0) ease({ pitch: 0, duration: reduced() ? 0 : 300, easing: cubic })
      }, 0)
    }
  }

  const onMoveEnd = () => { needs = true; sync() }
  const onIdle = () => { if (needs) { needs = false; compute() } }
  map.on('zoomend', onMoveEnd)
  map.on('pitchend', sync)
  map.on('moveend', onMoveEnd)
  map.on('idle', onIdle)

  return {
    /** The selected place (or null): the highlight follows it; deselecting flattens the map. */
    setSelected(place) {
      // the same place again (the list was refreshed): keep what is drawn
      if (place && selected && place.id === selected.id && place.lng === selected.lng && place.lat === selected.lat) { selected = place; return }
      const had = selected
      selected = place
      needs = true
      drawn = 'x'
      clear() // the previous highlight goes at once; the new one is drawn when the map is idle
      if (!place) {
        if (had && map.getPitch() > 0) ease({ pitch: 0, duration: reduced() ? 0 : MS.pitch, easing: cubic })
        return
      }
      if (map.isStyleLoaded() && !map.isMoving()) onIdle()
    },
    /** The style was swapped (theme): the highlight source is empty again, draw it anew once idle. */
    refresh() { drawn = ''; needs = true },
    /** 2D <-> 3D at the current centre and zoom. False when detail mode is not available (zoom < 15). */
    toggleTilt() {
      if (dead || map.getZoom() < TILT_MIN_ZOOM) return false
      ease({ pitch: map.getPitch() > TILTED_AT ? 0 : DETAIL_PITCH, duration: reduced() ? 0 : MS.pitch, easing: cubic })
      return true
    },
    state: () => ({ available, tilted }),
    destroy() {
      dead = true
      clearTimeout(flattenTimer)
      map.off('zoomend', onMoveEnd)
      map.off('pitchend', sync)
      map.off('moveend', onMoveEnd)
      map.off('idle', onIdle)
    },
  }
}
