// The network endpoints of the map: the part of mapConfig.js that prefetch.js needs. prefetch.js is imported by BottomNav
// and Sidebar, i.e. it lives in the entry chunk, so these few constants are kept apart from the rest of the config (bounds,
// attribution, glyphs ...) that only the lazy map chunk reads. mapConfig.js re-exports everything here: import from there.
//   - VITE_MAP_TILES_URL overrides the TileJSON URL (any OpenMapTiles-schema TileJSON works);
//   - VITE_MAP_PMTILES_URL switches the source to a self-hosted `azerbaijan.pmtiles` (drill, plan 7c). The style then uses
//     `pmtiles://<url>`; the `pmtiles` protocol itself has to be registered in mapController.js and the package added when
//     the drill is run (not installed today: the file would be dead weight).
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

export const TILES_ORIGIN = 'https://tiles.openfreemap.org'

/** TileJSON of the OpenMapTiles vector tiles. The tile path inside it is versioned weekly: never hard-code it. */
export const TILEJSON_URL = import.meta.env.VITE_MAP_TILES_URL || `${TILES_ORIGIN}/planet`
export const PMTILES_URL = import.meta.env.VITE_MAP_PMTILES_URL || ''

/** Self-hosted MapLibre worker: a same-origin module worker (CSP `worker-src 'self'`, no blob:). */
export const WORKER_URL = workerUrl
