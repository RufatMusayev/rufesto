// The map engine (docs/MAP-PLAN-2026-10-18.md sections 2, 4, 6, 7): MapLibre GL JS 6 + our style + the pins, driven
// imperatively. MapCanvas.jsx (React) creates one controller per mount and forwards props to it; nothing here touches React
// state, so the map never re-renders React per frame. This module is the lazy chunk that carries maplibre-gl.
//
// Rules kept here:
//  - coordinates are [lng, lat] everywhere;
//  - camera moves are decided here: a selected place moves the camera only when it is outside the safe rect (camera.js);
//  - reduced motion: jumps and fades only, no easeTo / flyTo with a duration, no stagger;
//  - teardown: stop() before remove(), every listener and observer released (the old Leaflet page died of a timer that
//    outlived its map).
import { LngLatBounds, Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl'
import { MAX_BOUNDS, MAX_ZOOM, MIN_ZOOM, WORKER_URL } from './mapConfig.js'
import {
  FIT_MAX_ZOOM, LOCATE_EASE_MAX_M, LOCATE_ZOOM, MS, REVEAL_FALLBACK_MS, cubic, quint,
} from './mapTuning.js'
import { buildStyle } from './style/buildStyle.js'
import { LABEL_LAYERS, labelExpr } from './style/layers.js'
import { centreOffset, fitPadding, insideRect, metersBetween, safeRect } from './camera.js'
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
 * @param {object} o.camera          { center:[lng,lat], zoom } | { bounds:[[w,s],[e,n]] }
 * @param {'light'|'dark'} o.theme
 * @param {'az'|'en'|'ru'} o.lang
 * @param {boolean} o.reduced
 * @param {{tiles:string[],minzoom?:number,maxzoom?:number}|null} o.tilejson
 * @param {{top:number,bottom:number}} o.overlay
 * @param {object} o.text            labels for the pins (see pinLayer)
 * @param {object} o.cb              { onSelect, onDeselect, onCamera, onHover, onLoad, onReady, onError }
 */
export function createController(o) {
  const { root, container, cb, tilejson } = o
  let theme = o.theme
  let lang = o.lang
  let reduced = o.reduced
  let overlay = { top: o.overlay?.top || 0, bottom: o.overlay?.bottom || 0 }
  let places = []
  let byId = new Map()
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
  const camera = o.camera.bounds
    ? { bounds: o.camera.bounds, fitBoundsOptions: { padding: fitPadding(overlay), maxZoom: FIT_MAX_ZOOM, animate: false } }
    : { center: o.camera.center, zoom: o.camera.zoom }

  let map
  try {
    map = new MapLibreMap({
      container,
      style: buildStyle({ theme, lang, tilejson, animateTheme: !reduced }),
      ...camera,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      maxBounds: MAX_BOUNDS,
      renderWorldCopies: false,
      // north-up, flat: no rotation and no pitch by hand, keyboard or touch
      dragRotate: false,
      touchPitch: false,
      pitchWithRotate: false,
      maxPitch: 0,
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

  pins = createPinLayer({
    map,
    text: o.text,
    reduced,
    cb: {
      onSelect: id => cb.onSelect(id),
      onHover: id => cb.onHover(id),
      onCluster: b => expandCluster(b),
    },
  })

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
    cb.onCamera({ center: [c.lng, c.lat], zoom: map.getZoom(), user })
  }
  map.on('moveend', e => { animating = false; emitCamera(!!e.originalEvent) })
  map.on('zoomend', () => pins.onZoomEnd())
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

  function moveToPlace(place, animate) {
    const duration = animate ? animateMs(MS.select) : 0
    if (duration) animating = true
    map.easeTo({ center: [place.lng, place.lat], offset: centreOffset(size(), overlay), duration, easing: quint })
  }

  /** Brings a place into the safe rect when it is outside; returns true when the camera moved. */
  function revealPlace(id, { animate = true } = {}) {
    const place = byId.get(id)
    if (!place || dead) return false
    if (insideRect(map.project([place.lng, place.lat]), safeRect(size(), overlay))) return false
    moveToPlace(place, animate)
    return true
  }

  function fitPlaces(ids, { animate = true } = {}) {
    if (dead) return false
    const ps = (ids || []).map(id => byId.get(id)).filter(Boolean)
    if (!ps.length) return false
    const rect = safeRect(size(), overlay)
    if (ps.every(p => insideRect(map.project([p.lng, p.lat]), rect))) return false
    const b = new LngLatBounds()
    for (const p of ps) b.extend([p.lng, p.lat])
    const duration = animate ? animateMs(MS.fit) : 0
    if (duration) animating = true
    map.fitBounds(b, { padding: fitPadding(overlay), maxZoom: FIT_MAX_ZOOM, duration, easing: cubic })
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
    const target = Math.min(FIT_MAX_ZOOM, Math.max(pins.expansionZoom(b.id), map.getZoom() + 1))
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
      pins.setPlaces(places)
    },
    /** Selection moves the camera only when the place is outside the safe rect. */
    setSelected(id, { camera: moveCamera = true } = {}) {
      if (dead) return
      selectedId = id || null
      pins.setSelected(selectedId)
      if (selectedId && moveCamera) revealPlace(selectedId, { animate: true })
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
      return { center: [c.lng, c.lat], zoom: map.getZoom() }
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
    setText: noop, setReduced: noop, revealPlace: () => false, fitPlaces: () => false, easeToMe: () => false, zoomBy: noop,
    getCenter: () => null, getCamera: () => null, destroy: noop,
  }
}
