// Cream (light) and Ember (dark) palettes of the base map (docs/MAP-PLAN-2026-10-18.md section 2). The CSS mirror of the
// pin colours is `--mp-*` in canvas.css; keep the two in step. The map is the quiet backdrop, the venues the only loud thing.
//
// Round 2: the dark water is lifted a clear step from the land (it was almost the same brown-black) and gets a faint edge, the
// dark roads one step lighter, the water / minor label colours reach 4.5:1 against what they sit on, and the detail-mode colours
// are added (3D building, house numbers, the selected building).
export const PALETTES = {
  light: {
    land: '#F3EDE3',
    residential: '#EFE8DC',
    park: '#E2E6D3',
    water: '#CFDDE0',
    waterEdge: '#B9CBD0',
    waterLabel: '#4A626B',
    building: '#E8DFD2',
    building3d: '#E3D8C8',
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
    minorLabel: '#74675F',
    houseNumber: '#665A52',
    highlight: '#8B2D42',
  },
  dark: {
    land: '#1E1714',
    residential: '#241B17',
    park: '#222B1F',
    water: '#1C323C',
    waterEdge: '#34505D',
    waterLabel: '#8FAAB6',
    building: '#2D231F',
    building3d: '#41352F',
    roadMinor: '#3A2F2A',
    roadMinorCasing: '#17100E',
    roadMajor: '#4B3D36',
    roadMajorCasing: '#17100E',
    motorway: '#5A473C',
    motorwayCasing: '#17100E',
    rail: '#4B3D36',
    path: '#4B3D36',
    label: '#B0A097',
    halo: '#1A1210',
    minorLabel: '#9A8C84',
    houseNumber: '#9A8C83',
    highlight: '#A33550',
  },
}

export const paletteOf = theme => PALETTES[theme] || PALETTES.light
