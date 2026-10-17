// Backend rows -> view-models of the restaurant page (docs/V2-CONTRACT.md 19.1 / 19.2). Components only ever see
// the shapes built here, so a contract rename is a change in this file and api.js.
//
// A dish keeps the database key names (is_vegan, avg_rating, ...) on purpose: the very same object is handed to
// DishDetailSheet and CartContext.addDish, which read those keys. mapDish only adds what they also need
// (restaurant_id for the cross-restaurant guard, the section name).

export const MENU_THEMES = ['classic', 'bistro', 'modern', 'cafe']
export const MORE_KEY = '__more'

const arr = v => (Array.isArray(v) ? v : [])
const HEX = /^#[0-9A-Fa-f]{6}$/
const num = (v, d = 0) => (v == null || v === '' || Number.isNaN(Number(v)) ? d : Number(v))

/** design { theme, accent, show_photos, note } -> view-model; anything unknown falls back to the classic default. */
export function normalizeDesign(d) {
  const theme = MENU_THEMES.includes(d?.theme) ? d.theme : 'classic'
  const note = typeof d?.note === 'string' ? d.note.trim() : ''
  return {
    theme,
    accent: HEX.test(d?.accent || '') ? d.accent : null,
    showPhotos: !!d?.show_photos,
    note: note || null,
  }
}

/** One dish of the menu (RPC element or a legacy `dishes` row). */
export function mapDish(d, restaurantId, sectionName) {
  const spicy = !!d.is_spicy
  return {
    ...d,
    id: d.id,
    restaurant_id: d.restaurant_id || restaurantId,
    name: d.name || '',
    price: num(d.price),
    available: d.available !== false,
    review_count: num(d.review_count),
    avg_rating: num(d.avg_rating),
    spice_level: Math.min(3, Math.max(0, num(d.spice_level, spicy ? 1 : 0))) || (spicy ? 1 : 0),
    menu_sections: sectionName ? { name: sectionName } : null,
  }
}

function section(id, name, nameAz, dishes, restaurantId) {
  return {
    key: id || MORE_KEY,
    id: id || null,
    name: name || '',
    nameAz: nameAz || null,
    dishes: dishes.map(d => mapDish(d, restaurantId, name)),
  }
}

function finish(restaurantId, design, sections, updatedAt, source) {
  const shown = sections.filter(s => s.dishes.length > 0)        // a printed menu has no empty headings
  const all = shown.flatMap(s => s.dishes)
  return {
    restaurantId,
    design,
    sections: shown,
    dishCount: all.length,
    reviewCount: all.reduce((n, d) => n + d.review_count, 0),
    updatedAt: updatedAt || null,
    source,
  }
}

/** restaurant_menu(p_slug) answer -> menu view-model. */
export function mapMenu(raw, restaurantId) {
  const rid = raw?.restaurant?.id || restaurantId
  const sections = arr(raw?.sections).map(s => section(s.id, s.name, s.name_az, arr(s.dishes), rid))
  return finish(rid, normalizeDesign(raw?.design), sections, raw?.updated_at, 'rpc')
}

/**
 * Fallback while restaurant_menu does not exist yet (PGRST202): the menu_sections + dishes rows the page read
 * before the redesign, shaped like the RPC answer, with the default classic theme.
 */
export function mapLegacyMenu(sectionRows, dishRows, restaurantId) {
  const ids = new Set(arr(sectionRows).map(s => s.id))
  const loose = []
  const by = new Map()
  for (const d of arr(dishRows)) {
    if (d.menu_section_id && ids.has(d.menu_section_id)) {
      if (!by.has(d.menu_section_id)) by.set(d.menu_section_id, [])
      by.get(d.menu_section_id).push(d)
    } else {
      loose.push(d)
    }
  }
  const sections = arr(sectionRows).map(s => section(s.id, s.name, s.name_az, by.get(s.id) || [], restaurantId))
  sections.push(section(null, 'More', 'Digər', loose, restaurantId))
  return finish(restaurantId, normalizeDesign(null), sections, null, 'legacy')
}

/** Name / description in the app language when that text exists (az), else the default text. */
export function dishText(d, lang) {
  const az = lang === 'az'
  return {
    name: (az && d.name_az) || d.name,
    description: (az && d.description_az) || d.description || '',
  }
}

export const sectionTitle = (s, lang) => (lang === 'az' && s.nameAz) || s.name

/** The dish object DishDetailSheet and the cart get: localized text, plus the keys the sheet reads. */
export function toSheetDish(d, lang, restaurant) {
  const { name, description } = dishText(d, lang)
  return {
    ...d,
    name,
    description: description || null,
    category: d.category || d.menu_sections?.name || null,
    restaurants: restaurant ? { name: restaurant.name, slug: restaurant.slug } : null,
  }
}

/** The menu with one dish updated from a realtime `dishes` row (availability, price, ...). Same object if the dish is not in it. */
export function patchDish(menu, id, patch) {
  let hit = false
  const sections = menu.sections.map(s => {
    if (!s.dishes.some(d => d.id === id)) return s
    hit = true
    return { ...s, dishes: s.dishes.map(d => (d.id === id ? mapDish({ ...d, ...patch }, menu.restaurantId, s.name) : d)) }
  })
  if (!hit) return menu
  const all = sections.flatMap(s => s.dishes)
  return { ...menu, sections, reviewCount: all.reduce((n, d) => n + d.review_count, 0) }
}

/** The dish with this id anywhere on the menu, or null. */
export function findDish(menu, id) {
  if (!menu || !id) return null
  for (const s of menu.sections) {
    const hit = s.dishes.find(d => d.id === id)
    if (hit) return hit
  }
  return null
}
