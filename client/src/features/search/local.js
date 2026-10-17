// Instant local results (UX plan 3.6): while the server answers, the rows come from the discover() answer that is
// already in memory (venue names, cuisines, trending dish names), folded the same way the server folds. The rows
// are the same shape as the server's, so the swap by id changes no geometry. Also the browse fallback while sql/67
// is missing: filters only, no text, answered from the same cached discover().
import { fold } from './fold'
import { passesLegacy } from './api'

const uniq = lists => {
  const seen = new Set()
  return lists.flat().filter(r => r && !seen.has(r.id) && seen.add(r.id))
}

export const placesOf = discover => (discover ? uniq([discover.allRestaurants, discover.openNow]) : [])

/** Places and dishes of the cached answer that contain the folded query. */
export function localMatches(discover, q, max = 6) {
  const needle = fold(q).trim()
  if (!discover || !needle) return { restaurants: [], dishes: [] }
  const restaurants = placesOf(discover)
    .filter(r => fold(r.name).includes(needle) || (r.cuisine && fold(r.cuisine).includes(needle)))
    .slice(0, max)
  const dishes = discover.trendingDishes
    .filter(d => fold(d.name).includes(needle) || (d.restaurant && fold(d.restaurant.name).includes(needle)))
    .slice(0, max)
  return { restaurants, dishes }
}

/** Filters-only query answered from the cached answer (used while the server cannot browse). */
export function localBrowse(discover, filters, coords) {
  const restaurants = placesOf(discover).filter(r => passesLegacy(r, filters, coords))
  const ids = new Set(restaurants.map(r => r.id))
  const diet = { vegan: d => d.isVegan, vegetarian: d => d.isVegetarian, gluten_free: d => d.isGlutenFree, spicy: d => d.isSpicy }
  const dishes = discover ? discover.trendingDishes.filter(d => (!d.restaurant || ids.has(d.restaurant.id)) && filters.diet.every(k => diet[k](d))) : []
  return { restaurants, dishes, browse: true }
}
