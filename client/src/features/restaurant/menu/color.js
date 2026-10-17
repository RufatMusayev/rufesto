// Colour maths for the menu themes. The restaurant picks one accent (menu_accent, '#RRGGBB'); a dark red is
// unreadable on a dark board and a pale yellow is unreadable on cream, so each theme gets TWO derived accents
// (one for its light-mode paper, one for its dark-mode paper), pushed toward white / black until the contrast
// ratio against that paper is met. The theme CSS then picks `--mn-accent-l` or `--mn-accent-d`.

const HEX = /^#[0-9a-f]{6}$/i
export const isHex = v => typeof v === 'string' && HEX.test(v)

const toRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
const toHex = rgb => `#${rgb.map(c => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('')}`
const lin = c => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }

export function luminance(hex) {
  const [r, g, b] = toRgb(hex).map(lin)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio of two '#RRGGBB' colours (1..21). */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

function mix(a, b, t) {
  const ra = toRgb(a)
  const rb = toRgb(b)
  return toHex(ra.map((c, i) => c + (rb[i] - c) * t))
}

/** `accent`, or the nearest tint/shade of it that reaches `min` contrast on `bg`. */
export function readableOn(accent, bg, min = 4.5) {
  if (contrast(accent, bg) >= min) return accent
  const target = luminance(bg) < 0.4 ? '#FFFFFF' : '#000000'
  for (let t = 0.08; t <= 1.0001; t += 0.08) {
    const c = mix(accent, target, t)
    if (contrast(c, bg) >= min) return c
  }
  return target
}

/** Text colour (white or near-black) that reads best on a solid `hex` fill. */
export const onColor = hex => (contrast(hex, '#FFFFFF') >= contrast(hex, '#111111') ? '#FFFFFF' : '#111111')

// The worst-case background an accent sits on, per theme and mode. Keep in sync with themes/*.css.
const PAPER = {
  classic: { l: '#F7F0E3', d: '#1C1512' },
  bistro: { l: '#151515', d: '#151515' },
  modern: { l: '#FEFDFB', d: '#211A17' },
  cafe: { l: '#EADBC8', d: '#2E241D' },
}

/** Accent used when the restaurant has not chosen one (the seeded defaults of sql/62). */
export const DEFAULT_ACCENT = { classic: '#8B2E1F', bistro: '#E0A100', modern: '#B23A3A', cafe: '#6B4A2B' }

/** CSS custom properties for a theme: the readable accent and its on-colour for light and dark mode. */
export function accentVars(theme, accent) {
  const paper = PAPER[theme] || PAPER.classic
  const base = isHex(accent) ? accent : (DEFAULT_ACCENT[theme] || DEFAULT_ACCENT.classic)
  const l = readableOn(base, paper.l)
  const d = readableOn(base, paper.d)
  return { '--mn-accent-l': l, '--mn-accent-d': d, '--mn-on-l': onColor(l), '--mn-on-d': onColor(d) }
}
