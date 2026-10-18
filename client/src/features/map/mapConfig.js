// The one swappable file of the map (docs/MAP-PLAN-2026-10-18.md M2, 6, 7c): everything that names a tile host, a glyph host,
// an attribution or a camera limit lives in here and in mapEndpoints.js (the few constants prefetch.js needs in the entry
// chunk, re-exported below), so moving off OpenFreeMap is a change in these two files only: the TileJSON URL (with the
// VITE_MAP_TILES_URL override), the pmtiles switch, glyphs, attribution, bounds and zoom limits.
export * from './mapEndpoints.js'
import { TILES_ORIGIN } from './mapEndpoints.js'

/** `{fontstack}` / `{range}` are filled in by MapLibre. */
export const GLYPHS_URL = `${TILES_ORIGIN}/fonts/{fontstack}/{range}.pbf`

/** The only font stack of the map (plan M3). Noto Sans Regular covers Latin, Latin Extended (ə ğ ı ş) and Cyrillic. */
export const FONT_STACK = ['Noto Sans Regular']

/** Required attribution (OpenFreeMap terms): rendered as links by AttributionChip. */
export const ATTRIBUTION = [
  { name: 'OpenFreeMap', href: 'https://openfreemap.org' },
  { name: '© OpenMapTiles', href: 'https://www.openmaptiles.org/' },
  { name: '© OpenStreetMap', href: 'https://www.openstreetmap.org/copyright' },
]

// ---- camera ----------------------------------------------------------------------------------------------------------
/** Azerbaijan, as [[west, south], [east, north]] (lng, lat). */
export const MAX_BOUNDS = [[44.7, 38.3], [50.95, 41.95]]
export const MIN_ZOOM = 10
export const MAX_ZOOM = 18.5
/** Baku city centre as [lng, lat] and the zoom of the last-resort initial camera. */
export const BAKU_CENTER = [49.838, 40.371]
export const BAKU_ZOOM = 12.5
