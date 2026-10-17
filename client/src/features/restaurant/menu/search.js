// Menu search and dietary filters. Text is folded (case, accents, Azerbaijani letters) so "cay" finds "Çay" and
// "ekmek" finds "Əkmək"; every word of the query must appear in the dish name, description or section name.

export const fold = s => String(s ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[ıəß]/g, c => (c === 'ß' ? 'ss' : c === 'ı' ? 'i' : 'e'))

/** id -> folded searchable text, built once per menu. */
export function buildHaystacks(menu) {
  const map = new Map()
  for (const s of menu.sections) {
    for (const d of s.dishes) {
      map.set(d.id, fold(`${d.name} ${d.name_az || ''} ${d.description || ''} ${d.description_az || ''} ${s.name} ${s.nameAz || ''}`))
    }
  }
  return map
}

export const DIETS = [
  { key: 'vegan', test: d => !!d.is_vegan, label: 'filterVegan' },
  { key: 'vegetarian', test: d => !!d.is_vegetarian, label: 'filterVegetarian' },
  { key: 'gluten-free', test: d => !!d.is_gluten_free, label: 'filterGlutenFree' },
  { key: 'spicy', test: d => !!d.is_spicy, label: 'filterSpicy' },
]

/** Sections of `menu` narrowed by the query and the selected diets; sections without a match are dropped. */
export function filterMenu(menu, haystacks, query, diets) {
  const words = fold(query).split(/\s+/).filter(Boolean)
  const tests = DIETS.filter(f => diets.includes(f.key)).map(f => f.test)
  if (!words.length && !tests.length) return menu.sections
  const out = []
  for (const s of menu.sections) {
    const dishes = s.dishes.filter(d => {
      if (!tests.every(t => t(d))) return false
      const hay = haystacks.get(d.id) || ''
      return words.every(w => hay.includes(w))
    })
    if (dishes.length) out.push(dishes.length === s.dishes.length ? s : { ...s, dishes })
  }
  return out
}
