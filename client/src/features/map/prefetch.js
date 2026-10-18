// Map prefetch (docs/MAP-PLAN-2026-10-18.md section 7). This file is imported by BottomNav and Sidebar, so it lives in the
// ENTRY chunk: it must stay tiny and must never import maplibre-gl (the library is reached only through the dynamic
// import of mapController.js).
//   prefetchMap()     on intent (pointerdown / hover / focus of the Map tab): the route chunk of the screen, the places
//                     request (api.js, when it exports prefetchPlaces), a modulepreload of the self-hosted worker, a preconnect
//                     to the tile host, the TileJSON - and the controller chunk (maplibre + our map code) only AFTER the places
//                     have answered and a frame has passed (700 ms at most): evaluating a megabyte of JS must not land on the
//                     main thread right when the list rows are rendered (round 2, rows <= 800 ms).
//   scheduleMapIdle() on idle, 4 s after the app is up, only on a fast, un-metered connection: the JS only.
//   hasWebGL2()       the capability check; without WebGL2 nothing of the map is ever downloaded.
import { PMTILES_URL, TILEJSON_URL, TILES_ORIGIN, WORKER_URL } from './mapEndpoints.js'

let webgl2 = null

/** True when this device can run MapLibre 6 (WebGL2). The test context is released at once. */
export function hasWebGL2() {
  if (webgl2 === null) {
    try {
      const gl = document.createElement('canvas').getContext('webgl2')
      webgl2 = !!gl
      gl?.getExtension('WEBGL_lose_context')?.loseContext()
    } catch {
      webgl2 = false
    }
  }
  return webgl2
}

let tilejson = null

/**
 * The TileJSON as { tiles, minzoom, maxzoom }, or null when it cannot be had. Started on intent, so the style can name the
 * tile URLs inline and the map needs no TileJSON round trip of its own. A failed attempt is forgotten, the next call retries.
 */
export function getTileJSON() {
  if (PMTILES_URL) return Promise.resolve(null)
  if (!tilejson) {
    tilejson = fetch(TILEJSON_URL, { credentials: 'omit' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => (Array.isArray(j?.tiles) ? { tiles: j.tiles, minzoom: j.minzoom, maxzoom: j.maxzoom } : null))
      .catch(() => null)
      .then(v => { if (!v) tilejson = null; return v })
  }
  return tilejson
}

let controller = null

/** The map engine (maplibre-gl + style + pins), as a lazy chunk. A failed chunk fetch is retried on the next call. */
export function loadMapController() {
  if (!controller) {
    controller = import('./mapController.js')
    controller.catch(() => { controller = null })
  }
  return controller
}

function link(rel, href, crossorigin) {
  const el = document.createElement('link')
  el.rel = rel
  el.href = href
  if (crossorigin) el.crossOrigin = ''
  document.head.appendChild(el)
}

let started = false

/** Everything the Map tab needs, started as soon as the guest shows intent. Safe to call on every pointer event. */
export function prefetchMap() {
  if (started || !hasWebGL2()) return
  started = true
  link('preconnect', TILES_ORIGIN, true)
  link('modulepreload', WORKER_URL)
  getTileJSON()
  import('../../pages/MapPage').catch(() => {}) // the route chunk App.jsx lazy-loads (same module id, one chunk)
  let engine = false
  const startEngine = () => { if (!engine) { engine = true; loadMapController().catch(() => {}) } }
  setTimeout(startEngine, 700)
  import('./api.js').then(m => m.prefetchPlaces()).catch(() => {}).then(() => requestAnimationFrame(() => setTimeout(startEngine, 0)))
}

let idled = false

/** The JS of the map in the background, once, after the app has settled; skipped on data saver / slow connections. */
export function scheduleMapIdle() {
  if (idled || typeof window === 'undefined') return
  idled = true
  const c = navigator.connection
  if (c && (c.saveData || (c.effectiveType && c.effectiveType !== '4g'))) return
  setTimeout(() => {
    if (!hasWebGL2()) return
    const idle = window.requestIdleCallback || (cb => setTimeout(cb, 200))
    idle(() => { loadMapController().catch(() => {}) })
  }, 4000)
}
