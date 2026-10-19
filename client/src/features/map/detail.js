// Detail mode of the map (docs/MAP-PLAN-2026-10-18.md round 2, 2GIS-style): from zoom 15 a 2D / 3D toggle is offered, and from
// zoom 15.5 the selected venue's building is drawn in the accent colour (its footprint extruded, or a soft circle when the tile
// data has no building there). Tilt exists only here: there are no pitch gestures, the pitch is set by the toggle or by "show on
// map" and goes back to 0 when the guest zooms out below 15 or deselects.
// Round 3: availability is computed on arrival too (creation, load, idle), not only after a move; the root carries `data-detail`
// from zoom 15.5 (CSS rings the selected pin against its building); house numbers under a pin are masked.
//
// Nothing here runs per frame: state is recomputed on zoomend / pitchend / moveend / idle, the building is looked up once the
// map is idle after a change.
import { HIGHLIGHT_SOURCE } from './style/layers.js'
import { EMPTY, circleRing, highlightFor, pickBuilding } from './buildings.js'
import { metersPerPixel } from './camera.js'
import { DETAIL_PITCH, HIGHLIGHT_MIN_ZOOM, HOUSENUMBER_ZOOM, TILT_MIN_ZOOM, MS, cubic } from './mapTuning.js'

const TILTED_AT = 5 // degrees: above this the map counts as tilted
const PIN_MASK_PX = 46 // radius, in screen px, around a venue's point in which no house number is drawn (the pill sits there)
const PITCH_FOCUS_M = 180 // while tilted, house numbers show only this close to the focus (the selected venue, else the map centre)

/**
 * @param {object} o
 * @param {import('maplibre-gl').Map} o.map
 * @param {HTMLElement} o.root                the .mp-canvas element (gets data-detail)
 * @param {() => object[]} o.getPlaces        the venues on the map (their pins hide the house numbers under them)
 * @param {(state:{available:boolean, tilted:boolean}) => void} o.onChange
 * @param {() => boolean} o.reduced
 * @param {(opts:object) => void} o.ease  the controller's easeTo wrapper (marks the camera as animating)
 */
export function createDetail({ map, root, getPlaces, onChange, reduced, ease }) {
  let selected = null
  let needs = false
  let drawn = '' // what the highlight source shows now: '<id>:building' | '<id>:circle' | ''
  let available = false
  let tilted = false
  let dead = false
  let flattenTimer = 0
  let maskKey = '' // what the house-number filter was built for
  let padding = 8 // text-padding of the house numbers now (thinned while tilted)

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

  // house numbers hide under the pins: the layer's filter excludes the points within a pin's footprint
  function mask() {
    if (dead || !map.getLayer('housenumber')) return
    const z = map.getZoom()
    let key = ''
    let filter = null
    let pad = 8
    if (z >= HOUSENUMBER_ZOOM - 0.4) {
      const b = map.getBounds()
      const near = getPlaces().filter(p => b.contains([p.lng, p.lat]))
      // tilted: the far half of the view is a wall of numbers, so only the ones near the focus are kept, and thinner
      const tiltedNow = map.getPitch() > TILTED_AT
      const c = selected ? { lng: selected.lng, lat: selected.lat } : map.getCenter()
      key = `${z.toFixed(1)}|${tiltedNow ? `t${selected ? selected.id : `${c.lng.toFixed(3)},${c.lat.toFixed(3)}`}` : 'f'}|${near.map(p => p.id).join(',')}`
      if (key === maskKey) return
      const polys = near.map(p => [circleRing([p.lng, p.lat], PIN_MASK_PX * metersPerPixel(p.lat, z), 12)])
      const hide = polys.length ? ['!', ['within', { type: 'MultiPolygon', coordinates: polys }]] : null
      const focus = tiltedNow ? ['within', { type: 'Polygon', coordinates: [circleRing([c.lng, c.lat], PITCH_FOCUS_M, 24)] }] : null
      filter = focus && hide ? ['all', focus, hide] : focus || hide
      pad = tiltedNow ? 16 : 8
    }
    if (key === maskKey) return
    maskKey = key
    map.setFilter('housenumber', filter)
    if (pad !== padding) { padding = pad; map.setLayoutProperty('housenumber', 'text-padding', pad) }
  }

  function sync() {
    if (dead) return
    const z = map.getZoom()
    const a = z >= TILT_MIN_ZOOM
    const t = map.getPitch() > TILTED_AT
    if (a !== available || t !== tilted) {
      available = a
      tilted = t
      onChange({ available, tilted })
    }
    if (z >= HIGHLIGHT_MIN_ZOOM) root.setAttribute('data-detail', '')
    else root.removeAttribute('data-detail')
    // zoomed out of detail: the tilt goes with it (a tick later: easeTo must not run inside the map's own end-of-move event)
    if (!a && map.getPitch() > 0 && !flattenTimer) {
      flattenTimer = setTimeout(() => {
        flattenTimer = 0
        if (!dead && map.getZoom() < TILT_MIN_ZOOM && map.getPitch() > 0) ease({ pitch: 0, duration: reduced() ? 0 : 300, easing: cubic })
      }, 0)
    }
  }

  const onMoveEnd = () => { needs = true; sync() }
  const onIdle = () => {
    sync() // a jump or an arrival that no zoom / move event reported
    mask()
    if (needs) { needs = false; compute() }
  }
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
    refresh() { drawn = ''; needs = true; maskKey = '' },
    /** The list of venues changed: the house-number mask is rebuilt at the next idle. */
    placesChanged() { maskKey = '' },
    /** Recompute availability now (arrival, load). */
    sync,
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
