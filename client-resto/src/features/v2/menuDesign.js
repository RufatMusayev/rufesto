// Menu design (V2-CONTRACT 19.1 / 19.3): the four restaurant_settings columns the owner edits and the
// constants the Settings card and its live previews share.

export const MENU_THEMES = ['classic', 'bistro', 'modern', 'cafe']
export const HEX_RE = /^#[0-9A-Fa-f]{6}$/   // mirrors the CHECK on restaurant_settings.menu_accent
export const NOTE_MAX = 280                  // mirrors the CHECK on restaurant_settings.menu_note

// Accent a style uses when menu_accent is NULL (the previews show it; the live menu falls back the same way).
export const THEME_DEFAULT_ACCENT = {
  classic: '#8B2E1F',
  bistro: '#E0A100',
  modern: '#B23A3A',
  cafe: '#6B4A2B',
}

// Six presets per style, picked to read on that style's paper. The first one is the style default.
export const ACCENT_PRESETS = {
  classic: ['#8B2E1F', '#7A3B18', '#8A5A14', '#5E2B3A', '#2F5D50', '#1F3A5F'],
  bistro: ['#E0A100', '#F2C14E', '#E4572E', '#C8102E', '#6FCF97', '#5BC0EB'],
  modern: ['#B23A3A', '#B5452A', '#2563EB', '#0F766E', '#7C3AED', '#1F2937'],
  cafe: ['#6B4A2B', '#2F5D50', '#B5452A', '#C27C0E', '#8E4A6B', '#3D6A8A'],
}

export const DEFAULT_DESIGN = { theme: 'classic', accent: null, showPhotos: false, note: '' }

/** Hex text -> '#RRGGBB' (upper case, '#' added when missing); anything else is returned trimmed. */
export function normaliseHex(text) {
  const s = String(text || '').trim().toUpperCase()
  if (s === '') return ''
  return s.startsWith('#') ? s : `#${s}`
}

/** True for '' (style default) or a valid #RRGGBB. */
export function isAccentOk(text) {
  return text === '' || HEX_RE.test(text)
}

/** The form (accent as text, '' = style default) -> the stored columns. */
export function toColumns(form) {
  const note = form.note.trim()
  return {
    menu_theme: form.theme,
    menu_accent: form.accent === '' ? null : form.accent,
    menu_show_photos: form.showPhotos,
    menu_note: note === '' ? null : note,
  }
}
