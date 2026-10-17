// The Search RPC (docs/UX-PLAN-2026-10-18.md 3.7 / 9.3) and its fallbacks. Functions never throw.
//
// search(p_q, p_limit, p_lat, p_lng, p_open_now, p_cuisine, p_price, p_max_km, p_diet) -> { dishes, restaurants, browse }
// (sql/67). Until sql/67 is applied the database only has search(p_q, p_limit): the extended call is answered with
// PGRST202, then the page asks the two-argument form once, remembers that (`legacy`), and filters what it got on the
// client with what the cards say (open now, cuisine, distance). A browse query (no text, only filters) then has no
// server answer; the hook builds it from the cached discover() answer instead.
import { supabase } from '../../lib/supabase'
import { hasGps } from '../feed/api'
import { isMissing } from '../restaurant/api'
import { mapDishCard, mapRestaurantCard } from '../discover/api'
import { filterArgs } from './filters'

export const SEARCH_LIMIT = 40          // the RPC caps p_limit at 50

let legacy = false
/** True after the extended search() turned out not to exist (sql/67 not applied). */
export const isLegacySearch = () => legacy

const arr = v => (Array.isArray(v) ? v : [])

function call(args, signal) {
  let req = supabase.rpc('search', args)
  if (signal && typeof req.abortSignal === 'function') req = req.abortSignal(signal)
  return req
}

/** A card the client can still judge without the server: the filters it can check from the card itself. */
export function passesLegacy(place, f, coords) {
  if (!place) return true
  if (f.open && place.openNow === false) return false
  if (f.cuisine && place.cuisine && place.cuisine.toLowerCase() !== f.cuisine.toLowerCase()) return false
  if (f.price && place.priceBand && place.priceBand !== f.price) return false
  if (f.km && coords && place.km != null && place.km > f.km) return false
  return true
}

function legacyFilter(res, f, coords, lookup) {
  const has = f.open || f.cuisine || f.price || (f.km && coords) || f.diet.length
  if (!has) return res
  const diet = {
    vegan: d => d.isVegan, vegetarian: d => d.isVegetarian, gluten_free: d => d.isGlutenFree, spicy: d => d.isSpicy,
  }
  return {
    ...res,
    restaurants: res.restaurants.filter(r => passesLegacy(r, f, coords)),
    // a dish card knows only its venue's open state and distance: the cuisine comes from the cached discover() answer
    dishes: res.dishes.filter(d => passesLegacy(lookup?.(d.restaurant?.id) || d.restaurant, f, coords) && f.diet.every(k => diet[k](d))),
  }
}

/**
 * Runs search(). Resolves { restaurants, dishes, browse } (view models, in the server's order), or
 * { browseUnavailable: true } for a filters-only query while the server cannot do it, or { error } / { aborted: true }.
 */
export async function runSearch({ q, filters, coords = null, limit = SEARCH_LIMIT, signal, lookup = null }) {
  const base = { p_q: q, p_limit: limit }
  const extra = { ...filterArgs(filters, coords) }
  if (hasGps(coords?.lat, coords?.lng)) { extra.p_lat = coords.lat; extra.p_lng = coords.lng }
  const hasExtra = Object.keys(extra).length > 0
  try {
    if (legacy && !String(q || '').trim()) return { browseUnavailable: true }
    let { data, error } = await call(legacy ? base : { ...base, ...extra }, signal)
    if (signal?.aborted) return { aborted: true }
    if (error && !legacy && hasExtra && isMissing(error)) {
      legacy = true
      if (!String(q || '').trim()) return { browseUnavailable: true }
      ;({ data, error } = await call(base, signal))
      if (signal?.aborted) return { aborted: true }
    }
    if (error) return { error }
    const res = {
      restaurants: arr(data?.restaurants).map(mapRestaurantCard),
      dishes: arr(data?.dishes).map(mapDishCard),
      browse: !!data?.browse,
    }
    return legacy ? legacyFilter(res, filters, coords, lookup) : res
  } catch (error) {
    return signal?.aborted ? { aborted: true } : { error }
  }
}
