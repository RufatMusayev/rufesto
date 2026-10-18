// The MapLibre style OBJECT of the Rufesto map, generated in code (docs/MAP-PLAN-2026-10-18.md M1, section 2): no style
// fetch, no sprite, one glyph stack. Called with the theme ('light' | 'dark'), the label language ('az' | 'en' | 'ru') and
// - when prefetch.js has already got it - the TileJSON content, so the source needs no extra round trip.
import { GLYPHS_URL, PMTILES_URL, TILEJSON_URL } from '../mapConfig.js'
import { paletteOf } from './palette.js'
import { HIGHLIGHT_SOURCE, buildLayers } from './layers.js'

/** The vector source: inline tiles when the TileJSON is known, else the TileJSON url (or a self-hosted pmtiles file). */
function vectorSource(tilejson) {
  if (PMTILES_URL) return { type: 'vector', url: `pmtiles://${PMTILES_URL}`, attribution: '' }
  if (tilejson?.tiles?.length) {
    return {
      type: 'vector',
      tiles: tilejson.tiles,
      minzoom: tilejson.minzoom ?? 0,
      maxzoom: tilejson.maxzoom ?? 14,
      attribution: '',
    }
  }
  return { type: 'vector', url: TILEJSON_URL, attribution: '' }
}

/**
 * @param {{ theme: 'light'|'dark', lang: 'az'|'en'|'ru', tilejson?: object|null, animateTheme?: boolean }} o
 * `animateTheme`: paint properties cross-fade over 300 ms when a theme switch swaps the style (off with reduced motion).
 */
export function buildStyle({ theme, lang, tilejson = null, animateTheme = true }) {
  return {
    version: 8,
    name: `rufesto-${theme}`,
    glyphs: GLYPHS_URL,
    transition: { duration: animateTheme ? 300 : 0, delay: 0 },
    // style-level light: the faces of the 3D buildings (detail mode) shade softly; one directional light, nothing per feature
    light: { anchor: 'viewport', color: '#ffffff', intensity: theme === 'dark' ? 0.32 : 0.3, position: [1.5, 210, 38] },
    sources: {
      openmaptiles: vectorSource(tilejson),
      [HIGHLIGHT_SOURCE]: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    },
    layers: buildLayers(paletteOf(theme), lang),
  }
}
