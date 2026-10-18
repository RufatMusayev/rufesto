// Which dish name / description staff see in the dashboard. The Menu editor shows the raw columns; every other screen
// (Menu list, Orders, Kitchen, Waiter, Tables, Promos, post composer) shows the name in the dashboard language:
//
//   name_i18n[lang]  ->  name_az (Azerbaijani only)  ->  name
//
// `dish` is a dishes row (or the nested `dishes(...)` of an order item); a missing localisation falls back, never blank.

const code = lang => String(lang || '').toLowerCase().slice(0, 2)
const text = v => (typeof v === 'string' && v.trim() ? v : '')
const map = v => (v && typeof v === 'object' && !Array.isArray(v) ? v : null)

/** Columns to add to a `dishes(...)` / `.select(...)` so dishName() has what it needs. */
export const DISH_NAME_COLUMNS = 'name, name_az, name_i18n'

export function dishName(dish, lang, fallback = '') {
  if (!dish) return fallback
  const l = code(lang)
  return text(map(dish.name_i18n)?.[l]) || (l === 'az' ? text(dish.name_az) : '') || text(dish.name) || fallback
}

export function dishDescription(dish, lang, fallback = '') {
  if (!dish) return fallback
  const l = code(lang)
  return text(map(dish.desc_i18n)?.[l]) || (l === 'az' ? text(dish.description_az) : '') || text(dish.description) || fallback
}
