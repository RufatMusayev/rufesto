// Numbers that tune the behaviour of the map (docs/MAP-PLAN-2026-10-18.md section 4, 7). Kept apart from mapConfig.js,
// which prefetch.js pulls into the entry chunk: only the lazy map chunk needs these.

/** Zoom the camera settles at for "my location" and the largest zoom a fit may use. */
export const LOCATE_ZOOM = 15
export const FIT_MAX_ZOOM = 15
/** Closer than this the locate move is an ease; farther it flies. */
export const LOCATE_EASE_MAX_M = 3000

/** At or below this zoom the pins are grouped into count bubbles (supercluster). */
export const CLUSTER_MAX_ZOOM = 12
export const CLUSTER_RADIUS = 56

/** No `load` within this long: the map is reported offline and the list carries on. */
export const LOAD_TIMEOUT_MS = 8000
/** The canvas fades in at `load` plus the first `idle`, or this long after `load`. */
export const REVEAL_FALLBACK_MS = 600
/** The safe rect is the visible area inset by this much; a selected pin inside it does not move the camera. */
export const SAFE_INSET = 48

/** Camera animation durations in ms. */
export const MS = { select: 450, fit: 500, cluster: 450, locate: 500, locateFlyMax: 1000, pitch: 500, detail: 800 }

export const quint = t => 1 - (1 - t) ** 5
export const cubic = t => 1 - (1 - t) ** 3

// ---- round 2 ----
/** Below this many venues there are no count bubbles at all: the pill / dot collision handles overlap. */
export const CLUSTER_MIN_PLACES = 30
/** A filter fit never zooms out below this (the dense core of the results, not the whole region). */
export const FIT_MIN_ZOOM = 12
/** A select farther than this from the current centre flies (zoom out, then in) instead of panning. */
export const FAR_SELECT_KM = 3
/** The safe rect keeps this much extra room at the top: a pill hangs 34 px above its point and the attribution chip sits there. */
export const SAFE_TOP_EXTRA = 28
/** Detail mode (2GIS-style 3D): tilt is offered from TILT_MIN_ZOOM, the selected building is drawn from HIGHLIGHT_MIN_ZOOM,
 * "show on map" eases to DETAIL_ZOOM at DETAIL_PITCH. */
export const TILT_MIN_ZOOM = 15
export const HIGHLIGHT_MIN_ZOOM = 15.5
export const DETAIL_ZOOM = 17.5
export const DETAIL_PITCH = 55
export const MAX_PITCH = 60
