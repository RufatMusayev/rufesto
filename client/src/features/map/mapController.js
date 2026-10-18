// The map engine (docs/MAP-PLAN-2026-10-18.md sections 2, 4, 6, 7): MapLibre GL JS 6 + our style + the pins, driven
// imperatively. MapCanvas.jsx (React) creates one controller per mount and forwards props to it; nothing here touches React
// state, so the map never re-renders React per frame. This module is the lazy chunk that carries maplibre-gl.
//
// Rules kept here:
//  - coordinates are [lng, lat] everywhere;
//  - camera moves are decided here: a selected place moves the camera only when it is outside the safe rect (camera.js), and
//    every move lands in the part of the map the sheet / carousel leave visible (overlay offsets), never under it;
//  - detail mode (detail.js): tilt only through the 2D / 3D toggle or "show on map", the selected building in the accent colour;
//  - reduced motion: jumps and fades only, no easeTo / flyTo with a duration, no stagger;
//  - teardown: stop() before remove(), every listener and observer released (the old Leaflet page died of a timer that
//    outlived its map).
import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl'
import { MAX_BOUNDS, MAX_ZOOM, MIN_ZOOM, WORKER_URL } from './mapConfig.js'
import {
  CLUSTER_MAX_ZOOM, DETAIL_PITCH, DETAIL_ZOOM, FAR_SELECT_KM, FIT_MAX_ZOOM, FIT_MIN_ZOOM, LOCATE_EASE_MAX_M, LOCATE_ZOOM, MAX_PITCH, MS,
  REVEAL_FALLBACK_MS, cubic, quint,
} from './mapTuning.js'
import { buildStyle } from './style/buildStyle.js'
import { LABEL_LAYERS, labelExpr } from './style/layers.js'
import { boundsOfPoints, centreOffset, denseCore, fitPadding, flyMs, insideRect, metersBetween, safeRect } from './camera.js'
import { createDetail } from './detail.js'
import { createPinLayer } from './pins/pinLayer.js'
import { createMeDot } from './MeDot.js'

setWorkerUrl(WORKER_URL)

const htmlTheme = () => {
  const v = document.documentElement.getAttribute('data-theme')
  if (v === 'light' || v === 'dark') return v
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * @param {object} o
 * @param {HTMLElement} o.root       the .mp-canvas element (theme / ready / lost classes go here)
 * @param {HTMLElement} o.container  the empty element MapLibre draws into
 * @param {object} o.camera          { center:[lng,lat], zoom, exact? } | { bounds:[[w,s],[e,n]], minZoom?, maxZoom? }
 *                                   without `exact` a centre is shown in the middle of the VISIBLE area (above the sheet)
 * @param {'light'|'dark'} o.theme
 * @param {'az'|'en'|'ru'} o.lang
 * @param {boolean} o.reduced
 * @param {{tiles:string[],minzoom?:number,maxzoom?:number}|null} o.tilejson
 * @param {{top:number,bottom:number}} o.overlay
 * @param {object} o.text            labels for the pins (see pinLayer)
 * @param {object} o.cb              { onSelect, onDeselect, onCamera, onHover, onHoverEnd, onDetail, onLoad, onReady, onError }
 */
export function createController(o) {
  const { root, container, cb, tilejson } = o
  let theme = o.theme
  let lang = o.lang
  let reduced = o.reduced
  let overlay = { top: o.overlay?.top || 0, bottom: o.overlay?.bottom || 0 }
  let places = []
  let byId = new Map()
  let prevIds = null // ids of the places before the last setPlaces (a filter that WIDENS the set never moves the camera)
  let curIds = new Set()
  let selectedId = null
  let me = null
  let loaded = false
  let revealed = false
  let dead = false
  let animating = false
  let tileErrors = 0
  let tileOk = 0
  let revealTimer = 0
  let pins = null
  let meDot = null
  let detail = null
  const timers = new Set()

  const later = (fn, ms) => {
    const t = setTimeout(() => { timers.delete(t); fn() }, ms)
    timers.add(t)
    return t
  }

  const size = () => ({ width: container.clientWidth, height: container.clientHeight })
  const animateMs = ms => (reduced ? 0 : ms)

  root.dataset.mapTheme = theme

  // ---- map -------------------------------------------------------------------------------------------------------
  const spec = o.camera
  const boundsCentre = spec.bounds && [(spec.bounds[0][0] + spec.bounds[1][0]) / 2, (spec.bounds[0][1] + spec.bounds[1][1]) / 2]

  let map
  try {
    map = new MapLibreMap({
      container,
      style: buildStyle({ theme, lang, tilejson, animateTheme: !reduced }),
      center: spec.center || boundsCentre,
      zoom: spec.zoom ?? 12,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      maxBounds: MAX_BOUNDS,
      renderWorldCopies: false,
      // north-up, and no rotation or tilt by hand, keyboard or touch: the pitch is only ever set by detail mode (maxPitch lets
      // the toggle / "show on map" tilt programmatically)
      dragRotate: false,
      touchPitch: false,
      pitchWithRotate: false,
      maxPitch: MAX_PITCH,
      boxZoom: false,
      attributionControl: false,
      fadeDuration: 200,
      refreshExpiredTiles: false,
      pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
      canvasContextAttributes: { antialias: false },
      reduceMotion: reduced ? true : undefined,
    })
  } catch {
    // WebGL2 could not be started although the capability check passed
    queueMicrotask(() => cb.onError('nowebgl'))
    return inertController()
  }
  map.touchZoomRotate.disableRotation()
  map.keyboard.disableRotation()
  applyInitialCamera()

  /** Sets the first camera before any frame: bounds fit with the zoom clamped to [minZoom, maxZoom], a centre placed in the
   * visible area unless `exact` (a restored camera is the literal map centre). */
  function applyInitialCamera() {
    const offset = centreOffset(size(), overlay)
    if (spec.bounds) {
      const maxZoom = spec.maxZoom ?? FIT_MAX_ZOOM
      const minZoom = spec.minZoom ?? 0
      const cam = map.cameraForBounds(spec.bounds, { padding: fitPadding(overlay), maxZoom })
      if (cam && cam.zoom >= minZoom) map.jumpTo(cam)
      else map.easeTo({ center: boundsCentre, zoom: Math.min(maxZoom, Math.max(minZoom, cam?.zoom ?? minZoom)), offset, duration: 0 })
    } else if (!spec.exact) {
      map.easeTo({ center: spec.center, zoom: spec.zoom, offset, duration: 0 })
    }
  }

  pins = createPinLayer({
    map,
    text: o.text,
    reduced,
    cb: {
      onSelect: id => cb.onSelect(id),
      onHover: id => cb.onHover(id),
      onHoverEnd: id => cb.onHoverEnd(id),
      onCluster: b => expandCluster(b),
    },
  })
  detail = createDetail({ map, onChange: st => cb.onDetail(st), reduced: () => reduced, ease })

  // ---- load / reveal / errors ---------------------------------------------------------------------------------------
  function reveal() {
    if (revealed || dead) return
    // tiles were requested and none arrived (host blocked, no network): the map is blank, report it instead of faking it
    if (tileErrors > 0 && tileOk === 0) { fail('offline'); return }
    revealed = true
    clearTimeout(revealTimer)
    container.classList.add('is-ready')
    pins.reveal()
    emitCamera(false)
    later(() => { if (!dead) cb.onReady() }, reduced ? 120 : 240)
  }

  map.once('load', () => {
    if (dead) return
    loaded = true
    cb.onLoad()
    applyLang()
    // the canvas fades in at `load` plus the first `idle`, or after 600 ms at the latest
    revealTimer = later(reveal, REVEAL_FALLBACK_MS)
    map.once('idle', reveal)
  })

  map.on('error', e => {
    // a missing tile or glyph mid-session is not fatal; a TileJSON / source failure before the first load is
    if (!e?.sourceId) return
    if (e.tile) { if (!revealed) tileErrors += 1 } else if (!loaded) fail('offline')
  })
  map.on('data', e => { if (e.dataType === 'source' && e.tile && e.sourceId === 'openmaptiles') tileOk += 1 })

  function fail(kind) {
    if (dead) return
    cb.onError(kind)
  }

  // WebGL context loss (iOS Safari drops it in the background): placeholder while lost, MapLibre rebuilds on restore
  map.on('webglcontextlost', () => container.classList.add('is-lost'))
  map.on('webglcontextrestored', () => {
    map.once('idle', () => container.classList.remove('is-lost'))
    later(() => container.classList.remove('is-lost'), 2000)
  })

  // ---- events from the map ---------------------------------------------------------------------------------------
  function emitCamera(user) {
    if (dead || !map) return
    const c = map.getCenter()
    cb.onCamera({ center: [c.lng, c.lat], zoom: map.getZoom(), pitch: map.getPitch(), user })
  }
  map.on('moveend', e => { animating = false; emitCamera(!!e.originalEvent) })
  map.on('zoomend', () => pins.onZoomEnd())
  map.on('pitchend', () => pins.onZoomEnd()) // a tilt moves every pin on screen: pill / dot is decided again
  map.on('click', e => {
    if (e.originalEvent?.target?.closest?.('.mp-marker')) return
    cb.onDeselect()
  })
  // any touch on the canvas stops a camera animation of ours
  const onPointerDown = () => { if (animating) { map.stop(); animating = false } }
  container.addEventListener('pointerdown', onPointerDown)

  // ---- theme: html[data-theme] + prefers-color-scheme ---------------------------------------------------------------
  const mo = new MutationObserver(() => setTheme(htmlTheme()))
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
  const onScheme = () => { if (!document.documentElement.getAttribute('data-theme')) setTheme(htmlTheme()) }
  mq?.addEventListener?.('change', onScheme)

  // ---- camera ----------------------------------------------------------------------------------------------------
  function ease(opts) {
    animating = true
    map.easeTo(opts)
  }

  /** The camera to a place, centred in the visible area. Near: an ease. Farther than 3 km: a fly (out and back in) whose
   * duration grows with the distance, so a far select reads as a journey and not as a blur. `extra`: zoom / pitch. */
  function moveToPlace(place, animate, extra = {}) {
    const to = [place.lng, place.lat]
    const offset = centreOffset(size(), overlay)
    const c = map.getCenter()
    const km = metersBetween([c.lng, c.lat], to) / 1000
    if (!animate || reduced) { map.easeTo({ center: to, offset, duration: 0, ...extra }); return }
    animating = true
    if (km > FAR_SELECT_KM) map.flyTo({ center: to, offset, duration: flyMs(km), curve: 1.42, essential: false, ...extra })
    else map.easeTo({ center: to, offset, duration: extra.zoom || extra.pitch ? MS.detail : MS.select, easing: quint, ...extra })
  }

  /** Brings a place into the safe rect when it is outside; returns true when the camera moved. */
  function revealPlace(id, { animate = true } = {}) {
    const place = byId.get(id)
    if (!place || dead) return false
    if (insideRect(map.project([place.lng, place.lat]), safeRect(size(), overlay))) return false
    moveToPlace(place, animate)
    return true
  }

  /**
   * A filter changed: bring the results into view. Never for a set that only grew (a chip cleared); the dense core of the
   * results is what is fitted (one outlier does not drag the view out to sea, never below z12); nothing moves while the core is
   * already inside the safe rect.
   */
  function fitPlaces(ids, { animate = true } = {}) {
    if (dead) return false
    const ps = (ids || []).map(id => byId.get(id)).filter(Boolean)
    if (!ps.length) return false
    const now = new Set(ps.map(p => p.id))
    const widened = prevIds && prevIds.size < now.size && [...prevIds].every(id => now.has(id))
    if (widened) return false
    const core = denseCore(ps)
    const rect = safeRect(size(), overlay)
    if (core.every(p => insideRect(map.project([p.lng, p.lat]), rect))) return false
    const cam = map.cameraForBounds(boundsOfPoints(core), { padding: fitPadding(overlay), maxZoom: FIT_MAX_ZOOM })
    if (!cam) return false
    const duration = animate ? animateMs(MS.fit) : 0
    if (duration) animating = true
    map.easeTo({ center: cam.center, zoom: Math.max(cam.zoom, FIT_MIN_ZOOM), duration, easing: cubic })
    return true
  }

  function easeToMe({ animate = true } = {}) {
    if (dead || !me) return false
    const to = [me.lng, me.lat]
    const c = map.getCenter()
    const zoom = Math.max(map.getZoom(), LOCATE_ZOOM)
    const offset = centreOffset(size(), overlay)
    if (!animate || reduced) {
      map.easeTo({ center: to, zoom, offset, duration: 0 })
    } else if (metersBetween([c.lng, c.lat], to) <= LOCATE_EASE_MAX_M) {
      ease({ center: to, zoom, offset, duration: MS.locate, easing: quint })
    } else {
      animating = true
      map.flyTo({ center: to, zoom, offset, speed: 1.6, curve: 1.42, maxDuration: MS.locateFlyMax, essential: false })
    }
    return true
  }

  function expandCluster(b) {
    // one tap always ends on pins: at least one level in and past the clustering zoom
    const target = Math.min(FIT_MAX_ZOOM, Math.max(pins.expansionZoom(b.id), map.getZoom() + 1, CLUSTER_MAX_ZOOM + 1))
    pins.markFlyOrigin([b.lng, b.lat])
    const offset = centreOffset(size(), overlay)
    if (reduced) map.easeTo({ center: [b.lng, b.lat], zoom: target, offset, duration: 0 })
    else ease({ center: [b.lng, b.lat], zoom: target, offset, duration: MS.cluster, easing: cubic })
  }

  // ---- style: theme and language -----------------------------------------------------------------------------------
  function setTheme(next) {
    if (dead || next === theme || (next !== 'light' && next !== 'dark')) return
    theme = next
    root.dataset.mapTheme = next
    map.setStyle(buildStyle({ theme, lang, tilejson, animateTheme: !reduced }), { diff: true })
    detail?.refresh()
  }

  function applyLang() {
    if (dead) return
    const expr = labelExpr(lang)
    for (const id of LABEL_LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, 'text-field', expr)
  }

  // ---- public ----------------------------------------------------------------------------------------------------
  return {
    setPlaces(next) {
      if (dead) return
      places = next || []
      byId = new Map(places.map(p => [p.id, p]))
      prevIds = curIds
      curIds = new Set(byId.keys())
      pins.setPlaces(places)
      if (selectedId) detail.setSelected(byId.get(selectedId) || null) // the selection may have arrived before its place
    },
    /**
     * Selection moves the camera only when the place is outside the safe rect. Deselecting: when the place that was selected
     * is on screen but now under the returning sheet, it is brought back above it; the tilt goes back to flat.
     */
    setSelected(id, { camera: moveCamera = true } = {}) {
      if (dead) return
      const prev = selectedId
      selectedId = id || null
      pins.setSelected(selectedId)
      detail.setSelected(selectedId ? byId.get(selectedId) || null : null)
      if (selectedId && moveCamera) revealPlace(selectedId, { animate: true })
      else if (!selectedId && prev && moveCamera) {
        const place = byId.get(prev)
        if (place) {
          const pt = map.project([place.lng, place.lat])
          const sz = size()
          const onScreen = pt.x >= 0 && pt.x <= sz.width && pt.y >= 0 && pt.y <= sz.height
          if (onScreen) revealPlace(prev, { animate: true })
        }
      }
    },
    setHovered: id => pins?.setHovered(id || null),
    setMe(next) {
      if (dead) return
      me = next && Number.isFinite(next.lat) && Number.isFinite(next.lng) ? next : null
      if (!meDot && me) meDot = createMeDot({ map, reduced })
      meDot?.set(me)
    },
    setOverlay(next) {
      const top = next?.top || 0
      const bottom = next?.bottom || 0
      if (Math.abs(top - overlay.top) < 2 && Math.abs(bottom - overlay.bottom) < 2) return
      overlay = { top, bottom }
    },
    setTheme,
    setLang(next) {
      if (next === lang) return
      lang = next
      if (map.isStyleLoaded()) applyLang()
      else map.once('styledata', applyLang)
    },
    setText: text => pins?.setText(text),
    setReduced(v) {
      reduced = v
      pins?.setReduced(v)
      meDot?.setReduced(v)
    },
    revealPlace,
    fitPlaces,
    easeToMe,
    /** "Show on map": the place in 3D (zoom 17.5, pitch 55), centred in the visible area. */
    showPlaceDetail(id) {
      const place = byId.get(id)
      if (!place || dead) return false
      moveToPlace(place, true, { zoom: DETAIL_ZOOM, pitch: DETAIL_PITCH })
      return true
    },
    toggleTilt: () => detail.toggleTilt(),
    zoomBy(delta) {
      if (dead) return
      const duration = animateMs(200)
      if (duration) animating = true
      map.zoomTo(map.getZoom() + delta, { duration })
    },
    getCenter() {
      if (dead) return null
      const c = map.getCenter()
      return [c.lng, c.lat]
    },
    getCamera() {
      if (dead) return null
      const c = map.getCenter()
      return { center: [c.lng, c.lat], zoom: map.getZoom(), pitch: map.getPitch() }
    },
    destroy() {
      if (dead) return
      dead = true
      clearTimeout(revealTimer)
      for (const t of timers) clearTimeout(t)
      timers.clear()
      mo.disconnect()
      mq?.removeEventListener?.('change', onScheme)
      container.removeEventListener('pointerdown', onPointerDown)
      // an animation that outlives its map is what broke the Leaflet page: stop first, then remove
      try { map.stop() } catch { /* half-built map */ }
      pins.destroy()
      detail?.destroy()
      meDot?.destroy()
      map.remove()
    },
  }
}

/** What createController returns when WebGL could not start: every call is a no-op. */
function inertController() {
  const noop = () => {}
  return {
    setPlaces: noop, setSelected: noop, setHovered: noop, setMe: noop, setOverlay: noop, setTheme: noop, setLang: noop,
    setText: noop, setReduced: noop, revealPlace: () => false, fitPlaces: () => false, easeToMe: () => false, showPlaceDetail: () => false, toggleTilt: () => false, zoomBy: noop,
    getCenter: () => null, getCamera: () => null, destroy: noop,
  }
}
