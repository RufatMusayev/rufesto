import { cuisineLabel } from '../discover/cuisine'

// The three kinds of place the map knows (map_places.kind, sql/70: derived from restaurants.cuisine_type on the server).
export const KINDS = ['coffee', 'quick', 'restaurant']

/** i18n key (map namespace) of the filter chip of a kind. */
export const KIND_CHIP_KEY = { coffee: 'kindCoffee', quick: 'kindQuick', restaurant: 'kindRestaurant' }

/** An unknown or missing kind reads as a restaurant (the server does the same for a null cuisine). */
export const normKind = k => (KINDS.includes(k) ? k : 'restaurant')

/** i18n key of the singular name of a kind ("Cafe", "Quick bite", "Restaurant"). */
export const kindOneKey = k => `kindOne.${normKind(k)}`

// cuisine_type values that only repeat the kind they were mapped to (sql/70 _restaurant_kind): "Cafe" under Cafe says nothing
const FOLD = s => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const SAME_AS_KIND = {
  coffee: ['cafe', 'coffee', 'coffee shop', 'cafeteria'],
  quick: ['fast food', 'fastfood', 'street food'],
}

/**
 * What a place is, in words: the kind and the cuisine only when it says more than the kind ("Café", "Café · Bakery",
 * "Italian" for a restaurant, never "Café · Cafe" or "Фастфуд · Фастфуд"). `t` = translate function of the map namespace.
 */
export function kindWords(t, place) {
  const kind = normKind(place.kind)
  const cuisine = place.cuisine_type
  if (kind === 'restaurant') return cuisine ? cuisineLabel(t, cuisine) : t(kindOneKey(kind))
  const same = !cuisine || (SAME_AS_KIND[kind] || []).includes(FOLD(cuisine))
  const label = t(kindOneKey(kind))
  if (same) return label
  const c = cuisineLabel(t, cuisine)
  return FOLD(c) === FOLD(label) ? label : `${label} · ${c}`
}

/** "Nizami küç. 67, Bakı" -> "Nizami küç. 67": the street, without the city that every place shares. */
export function shortAddress(address) {
  if (!address) return null
  const first = String(address).split(',')[0].trim()
  return first || null
}
