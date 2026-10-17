// Cuisine names (restaurants.cuisine_type is free English text such as "Fast Food"): shown in the guest's language.
// Known values are translated through social:cuisine.<slug>; an unknown one is shown as written, capitalised.

const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '')

/** 'Fast Food' -> 'fast_food' (the key under social:cuisine). */
export const cuisineSlug = key => String(key || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')

/** The label of a cuisine for the current language; `t` is the `social` namespace's translate function. */
export function cuisineLabel(t, key) {
  const slug = cuisineSlug(key)
  if (!slug) return ''
  return t('cuisine.' + slug, { defaultValue: cap(String(key).trim()) })
}
