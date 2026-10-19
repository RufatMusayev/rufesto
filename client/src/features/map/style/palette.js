// Cream (light) and Ember (dark) palettes of the base map (docs/MAP-PLAN-2026-10-18.md section 2). The CSS mirror of the
// pin colours is `--mp-*` in canvas.css; keep the two in step. The map is the quiet backdrop, the venues the only loud thing.
//
// Round 2: the dark water is lifted a clear step from the land (it was almost the same brown-black) and gets a faint edge, the
// dark roads one step lighter, the water / minor label colours reach 4.5:1 against what they sit on, and the detail-mode colours
// are added (3D building, house numbers, the selected building).
// 2026-10-19 (Rufat: "the dark mode map is too dark"): the whole Ember palette lifted about two steps (land #1E1714 -> #2F2723);
// labels stay >= 4.5:1 on the land, the closed-pin ring ~5:1.
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
    houseNumber: '#8C7F76',
    highlight: '#B5586D',        // a lighter tint than the selected pin's accent, so the pin keeps its edge on the building
    highlightEdge: '#6E1F31',
  },
  dark: {
    land: '#2F2723',
    residential: '#342B26',
    park: '#2E3A29',
    water: '#28434F',
    waterEdge: '#436574',
    waterLabel: '#A3BDC8',
    building: '#3C312C',
    building3d: '#504239',
    roadMinor: '#483C35',
    roadMinorCasing: '#261E1B',
    roadMajor: '#5A4B42',
    roadMajorCasing: '#261E1B',
    motorway: '#6B5647',
    motorwayCasing: '#261E1B',
    rail: '#5A4B42',
    path: '#5A4B42',
    label: '#C9BAB1',
    halo: '#261E1B',
    minorLabel: '#AE9F96',
    houseNumber: '#9A8B82',
    highlight: '#C25A73',
    highlightEdge: '#F0B3C3',
  },
}

export const paletteOf = theme => PALETTES[theme] || PALETTES.light
