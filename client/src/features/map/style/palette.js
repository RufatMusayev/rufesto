// Cream (light) and Ember (dark) palettes of the base map (docs/MAP-PLAN-2026-10-18.md section 2). The CSS mirror of the
// pin colours is `--map-*` in canvas.css; keep the two in step. The map is the quiet backdrop, the venues the only loud thing.
export const PALETTES = {
  light: {
    land: '#F3EDE3',
    residential: '#EFE8DC',
    park: '#E2E6D3',
    water: '#CFDDE0',
    waterLabel: '#6F848B',
    building: '#E8DFD2',
    roadMinor: '#FBF8F3',
    roadMinorCasing: '#E4DACB',
    roadMajor: '#FFFFFF',
    roadMajorCasing: '#DCCFBD',
    motorway: '#F7EBDD',
    motorwayCasing: '#E0CDB5',
    rail: '#D4C9BA',
    path: '#D9CDBC',
    label: '#6B5F57',
    halo: '#F5F0E8',
    minorLabel: '#7E7168',
  },
  dark: {
    land: '#1E1714',
    residential: '#211915',
    park: '#1F2219',
    water: '#121A1D',
    waterLabel: '#6E8590',
    building: '#2A211D',
    roadMinor: '#2B221E',
    roadMinorCasing: '#1A1210',
    roadMajor: '#352A25',
    roadMajorCasing: '#1A1210',
    motorway: '#3D2F27',
    motorwayCasing: '#1A1210',
    rail: '#3A2E29',
    path: '#3A2E29',
    label: '#A89890',
    halo: '#1A1210',
    minorLabel: '#8E8079',
  },
}

export const paletteOf = theme => PALETTES[theme] || PALETTES.light
