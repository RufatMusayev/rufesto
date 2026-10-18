// Layer list of the Rufesto base map, derived from OpenFreeMap Positron (fetched once while building this; the style is
// never fetched at runtime) and recoloured with the Cream / Ember palettes. docs/MAP-PLAN-2026-10-18.md section 2.
//   kept:    background, park + wood, water, residential, waterway, buildings (z15+), paths, minor / major / motorway roads
//            (tunnel and bridge variants keep the road colours), main railway, water / road / place labels
//   removed: boundaries, aeroways, airport, road shields, transit and service rails, state / country labels, ice, piers
// No sprite and one font stack, so no icon-image anywhere and no italic / bold faces to download.
// Round 2 (detail mode, 2GIS-style): 3D buildings from z15.5 (fill-extrusion of the OpenMapTiles building layer, rising out of
// the ground between z15.5 and z16.5), house numbers from z17, and three layers that draw the selected venue's building in the
// accent colour (an extruded copy of its polygon, or a soft footprint circle when the data has no building there).
import { FONT_STACK } from '../mapConfig.js'

const SRC = 'openmaptiles'
/** GeoJSON source the controller fills with the selected venue's building (or footprint circle); empty by default. */
export const HIGHLIGHT_SOURCE = 'sel-building'
const FONT = FONT_STACK

const isLine = ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false]
const isPoint = ['match', ['geometry-type'], ['MultiPoint', 'Point'], true, false]
const MAJOR = ['primary', 'secondary', 'tertiary', 'trunk']
const MINOR = ['minor', 'service', 'track']
const cls = list => ['match', ['get', 'class'], list, true, false]
const exp = (base, ...stops) => ['interpolate', ['exponential', base], ['zoom'], ...stops]
const lin = (...stops) => ['interpolate', ['linear'], ['zoom'], ...stops]
/** A building height that grows from 0 at z15.5 to the real value at z16.5 (cheap: no translucent extrusion pass). */
const rise = (prop, fallback) => lin(15.5, 0, 16.5, ['coalesce', ['get', prop], fallback])

/**
 * `text-field` expression of the label language. Language change = setLayoutProperty(id, 'text-field', labelExpr(lang))
 * on every layer of LABEL_LAYERS, no reload. Missing local names fall back to the generic `name`.
 */
export function labelExpr(lang) {
  if (lang === 'ru') return ['coalesce', ['get', 'name:ru'], ['get', 'name']]
  if (lang === 'en') return ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name:latin'], ['get', 'name']]
  return ['coalesce', ['get', 'name:az'], ['get', 'name']]
}

/** Ids of every symbol layer that shows a name (the ones whose text-field follows the language). */
export const LABEL_LAYERS = [
  'water_name_point_label', 'water_name_line_label', 'highway-name-minor', 'highway-name-major',
  'label_other', 'label_village', 'label_town', 'label_city',
]

export function buildLayers(p, lang) {
  const text = labelExpr(lang)
  const halo = { 'text-halo-color': p.halo, 'text-halo-width': 1.2, 'text-halo-blur': 0.4 }

  const road = (id, extra) => ({ type: 'line', source: SRC, 'source-layer': 'transportation', id, ...extra })

  return [
    { id: 'background', type: 'background', paint: { 'background-color': p.land } },

    // ---- ground ----
    {
      id: 'landuse_residential', type: 'fill', source: SRC, 'source-layer': 'landuse', maxzoom: 16,
      filter: ['==', ['get', 'class'], 'residential'],
      paint: { 'fill-color': p.residential, 'fill-opacity': exp(0.6, 8, 0.8, 9, 0.6) },
    },
    {
      id: 'landcover_wood', type: 'fill', source: SRC, 'source-layer': 'landcover', minzoom: 10,
      filter: ['==', ['get', 'class'], 'wood'],
      paint: { 'fill-color': p.park, 'fill-opacity': lin(8, 0, 12, 1) },
    },
    { id: 'park', type: 'fill', source: SRC, 'source-layer': 'park', paint: { 'fill-color': p.park } },
    {
      id: 'water', type: 'fill', source: SRC, 'source-layer': 'water',
      filter: ['!=', ['get', 'brunnel'], 'tunnel'],
      paint: { 'fill-color': p.water, 'fill-antialias': true, 'fill-outline-color': p.waterEdge },
    },
    {
      id: 'waterway', type: 'line', source: SRC, 'source-layer': 'waterway', minzoom: 12, filter: isLine,
      paint: { 'line-color': p.water, 'line-width': exp(1.2, 12, 0.6, 18, 3) },
    },
    {
      id: 'building', type: 'fill', source: SRC, 'source-layer': 'building', minzoom: 15,
      paint: { 'fill-color': p.building, 'fill-opacity': lin(15, 0, 16, 1), 'fill-antialias': false },
    },

    // ---- tunnels (under everything else) ----
    road('tunnel_motorway_casing', {
      minzoom: 6, filter: ['all', isLine, ['==', ['get', 'brunnel'], 'tunnel'], ['==', ['get', 'class'], 'motorway']],
      layout: { 'line-cap': 'butt', 'line-join': 'miter' },
      paint: { 'line-color': p.motorwayCasing, 'line-width': exp(1.4, 5.8, 0, 6, 3, 20, 40) },
    }),
    road('tunnel_motorway_inner', {
      minzoom: 6, filter: ['all', isLine, ['==', ['get', 'brunnel'], 'tunnel'], ['==', ['get', 'class'], 'motorway']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': p.motorway, 'line-width': exp(1.4, 4, 2, 6, 1.3, 20, 30) },
    }),

    // ---- paths, minor, major ----
    road('highway_path', {
      minzoom: 15, filter: ['all', isLine, ['==', ['get', 'class'], 'path']],
      layout: { 'line-cap': 'butt', 'line-join': 'round' },
      paint: { 'line-color': p.path, 'line-width': 0.6, 'line-dasharray': [3, 2] },
    }),
    road('highway_minor_casing', {
      minzoom: 13, filter: ['all', isLine, cls(MINOR)],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': p.roadMinorCasing, 'line-width': exp(1.55, 13, 3, 20, 25) },
    }),
    road('highway_minor', {
      minzoom: 12, filter: ['all', isLine, cls(MINOR)],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': p.roadMinor, 'line-width': exp(1.55, 12, 0.7, 13, 1.6, 20, 22) },
    }),
    road('highway_major_subtle', {
      maxzoom: 11, filter: ['all', isLine, cls(MAJOR)],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': p.roadMajorCasing, 'line-opacity': 0.8, 'line-width': 1.4 },
    }),
    road('highway_major_casing', {
      minzoom: 11, filter: ['all', isLine, cls(MAJOR)],
      layout: { 'line-cap': 'butt', 'line-join': 'miter' },
      paint: { 'line-color': p.roadMajorCasing, 'line-width': exp(1.3, 10, 3, 20, 23) },
    }),
    road('highway_major_inner', {
      minzoom: 11, filter: ['all', isLine, cls(MAJOR)],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': p.roadMajor, 'line-width': exp(1.3, 10, 2, 20, 20) },
    }),

    // ---- motorways (not on a bridge or in a tunnel) ----
    road('highway_motorway_subtle', {
      maxzoom: 6, filter: ['all', isLine, ['==', ['get', 'class'], 'motorway']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': p.motorwayCasing, 'line-width': exp(1.4, 4, 2, 6, 1.3) },
    }),
    road('highway_motorway_casing', {
      minzoom: 6, filter: ['all', isLine, ['match', ['get', 'brunnel'], ['bridge', 'tunnel'], false, true], ['==', ['get', 'class'], 'motorway']],
      layout: { 'line-cap': 'butt', 'line-join': 'miter' },
      paint: { 'line-color': p.motorwayCasing, 'line-width': exp(1.4, 5.8, 0, 6, 3, 20, 40) },
    }),
    road('highway_motorway_inner', {
      minzoom: 6, filter: ['all', isLine, ['match', ['get', 'brunnel'], ['bridge', 'tunnel'], false, true], ['==', ['get', 'class'], 'motorway']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': p.motorway, 'line-width': exp(1.4, 4, 2, 6, 1.3, 20, 30) },
    }),

    // ---- main railway, dashed ----
    road('railway', {
      minzoom: 13, filter: ['all', isLine, ['!', ['has', 'service']], ['==', ['get', 'class'], 'rail']],
      layout: { 'line-join': 'round' },
      paint: { 'line-color': p.rail, 'line-dasharray': [4, 3], 'line-width': exp(1.3, 13, 0.8, 16, 1.4, 20, 4) },
    }),

    // ---- bridges (over everything else) ----
    road('highway_motorway_bridge_casing', {
      minzoom: 6, filter: ['all', isLine, ['==', ['get', 'brunnel'], 'bridge'], ['==', ['get', 'class'], 'motorway']],
      layout: { 'line-cap': 'butt', 'line-join': 'miter' },
      paint: { 'line-color': p.motorwayCasing, 'line-width': exp(1.4, 5.8, 0, 6, 5, 20, 45) },
    }),
    road('highway_motorway_bridge_inner', {
      minzoom: 6, filter: ['all', isLine, ['==', ['get', 'brunnel'], 'bridge'], ['==', ['get', 'class'], 'motorway']],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': p.motorway, 'line-width': exp(1.4, 4, 2, 6, 1.3, 20, 30) },
    }),

    // ---- 3D buildings and the selected building (over every flat layer, under the labels) ----
    {
      id: 'building-3d', type: 'fill-extrusion', source: SRC, 'source-layer': 'building', minzoom: 15.5,
      filter: ['!=', ['get', 'hide_3d'], true],
      paint: {
        'fill-extrusion-color': p.building3d,
        'fill-extrusion-height': rise('render_height', 6),
        'fill-extrusion-base': rise('render_min_height', 0),
        'fill-extrusion-opacity': 1,
        'fill-extrusion-vertical-gradient': true,
      },
    },
    {
      // the darker edge: the footprint outline at ground level, drawn BEFORE the extruded copy so the copy covers it and only
      // the rim around the walls stays visible (a 2D line drawn after an extrusion shows through it)
      id: 'sel-building-edge', type: 'line', source: HIGHLIGHT_SOURCE, minzoom: 15,
      filter: ['==', ['get', 'kind'], 'building'],
      paint: { 'line-color': p.highlightEdge, 'line-width': 2, 'line-opacity': 0.9 },
    },
    {
      id: 'sel-building-3d', type: 'fill-extrusion', source: HIGHLIGHT_SOURCE, minzoom: 15,
      filter: ['==', ['get', 'kind'], 'building'],
      paint: {
        'fill-extrusion-color': p.highlight,
        'fill-extrusion-height': ['+', ['get', 'h'], 0.6],
        'fill-extrusion-base': ['get', 'b'],
        'fill-extrusion-opacity': 1,
        'fill-extrusion-vertical-gradient': true,
      },
    },
    {
      id: 'sel-footprint-fill', type: 'fill', source: HIGHLIGHT_SOURCE, minzoom: 15,
      filter: ['==', ['get', 'kind'], 'circle'],
      paint: { 'fill-color': p.highlight, 'fill-opacity': 0.22 },
    },
    {
      id: 'sel-footprint-line', type: 'line', source: HIGHLIGHT_SOURCE, minzoom: 15,
      filter: ['==', ['get', 'kind'], 'circle'],
      paint: { 'line-color': p.highlight, 'line-width': 1.5, 'line-opacity': 0.7 },
    },

    // ---- labels ----
    {
      // House numbers show from z17.5, small and light, never over each other (collision on) and never under a pin (the
      // controller masks the numbers within a pin's footprint with a `within` filter). The layer's own minzoom must stay below
      // 16: this source stops at z14, and MapLibre builds no symbols for a layer whose minzoom is 16 or more on its overzoomed
      // tiles (measured: nothing renders). The opacity does the gating, and the numbers never take space from street names.
      id: 'housenumber', type: 'symbol', source: SRC, 'source-layer': 'housenumber', minzoom: 15,
      layout: {
        'text-field': ['get', 'housenumber'], 'text-font': FONT, 'text-size': lin(17.5, 8.5, 19.5, 10), 'text-padding': 8,
        'text-ignore-placement': true,
      },
      paint: { 'text-color': p.houseNumber, 'text-halo-color': p.halo, 'text-halo-width': 1, 'text-opacity': lin(17.3, 0, 17.5, 1) },
    },
    {
      id: 'water_name_point_label', type: 'symbol', source: SRC, 'source-layer': 'water_name', filter: isPoint,
      layout: { 'text-field': text, 'text-font': FONT, 'text-letter-spacing': 0.1, 'text-max-width': 5, 'text-size': lin(0, 10, 8, 13) },
      paint: { 'text-color': p.waterLabel, 'text-halo-color': p.water, 'text-halo-width': 1.2 },
    },
    {
      id: 'water_name_line_label', type: 'symbol', source: SRC, 'source-layer': 'water_name', filter: isLine,
      layout: { 'symbol-placement': 'line', 'symbol-spacing': 350, 'text-field': text, 'text-font': FONT, 'text-letter-spacing': 0.1, 'text-max-width': 5, 'text-size': 12 },
      paint: { 'text-color': p.waterLabel, 'text-halo-color': p.water, 'text-halo-width': 1.2 },
    },
    {
      id: 'highway-name-minor', type: 'symbol', source: SRC, 'source-layer': 'transportation_name', minzoom: 15,
      filter: ['all', isLine, cls(MINOR)],
      layout: { 'symbol-placement': 'line', 'text-field': text, 'text-font': FONT, 'text-rotation-alignment': 'map', 'text-size': lin(15, 11, 17, 12) },
      paint: { 'text-color': p.minorLabel, ...halo },
    },
    {
      id: 'highway-name-major', type: 'symbol', source: SRC, 'source-layer': 'transportation_name', minzoom: 13,
      filter: cls(MAJOR),
      layout: { 'symbol-placement': 'line', 'text-field': text, 'text-font': FONT, 'text-rotation-alignment': 'map', 'text-size': lin(13, 11, 16, 13) },
      paint: { 'text-color': p.label, ...halo },
    },
    {
      id: 'label_other', type: 'symbol', source: SRC, 'source-layer': 'place', minzoom: 12,
      filter: ['match', ['get', 'class'], ['city', 'continent', 'country', 'state', 'town', 'village'], false, true],
      layout: { 'text-field': text, 'text-font': FONT, 'text-letter-spacing': 0.04, 'text-max-width': 8, 'text-size': 11 },
      paint: { 'text-color': p.minorLabel, ...halo },
    },
    {
      id: 'label_village', type: 'symbol', source: SRC, 'source-layer': 'place', minzoom: 10,
      filter: ['==', ['get', 'class'], 'village'],
      layout: { 'text-field': text, 'text-font': FONT, 'text-max-width': 8, 'text-size': exp(1.2, 10, 10.5, 14, 12) },
      paint: { 'text-color': p.minorLabel, ...halo },
    },
    {
      id: 'label_town', type: 'symbol', source: SRC, 'source-layer': 'place', minzoom: 6,
      filter: ['==', ['get', 'class'], 'town'],
      layout: { 'text-field': text, 'text-font': FONT, 'text-max-width': 8, 'text-size': exp(1.2, 7, 12, 14, 14) },
      paint: { 'text-color': p.label, ...halo },
    },
    {
      id: 'label_city', type: 'symbol', source: SRC, 'source-layer': 'place', minzoom: 3,
      filter: ['==', ['get', 'class'], 'city'],
      layout: {
        'text-field': text, 'text-font': FONT, 'text-max-width': 8,
        'text-size': exp(1.2, 4, 11, 7, 13, 11, 17), 'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
      },
      // the city name steps aside once the quarters and streets take over, so it never sits behind the pins
      paint: { 'text-color': p.label, 'text-opacity': lin(12, 1, 14, 0), ...halo },
    },
  ]
}
