// Explore search: the server RPC search(p_q, p_limit), its fallback, and the small helpers around them.
//
// search() -> { dishes: [ discover-shaped dish cards ], restaurants: [ discover-shaped restaurant cards ] }, ranked,
// accent-insensitive, matching names, descriptions, cuisine and category (docs/V2-CONTRACT.md section 20). The dish
// cards are slim ({ id, name, photo, price, category, available, avg_rating, review_count, restaurant { id, name, slug,
// ... } }), so the full rows the grid and the dish sheet need (diet flags, description, calories ...) are read with one
// `dishes` select by id; if that read fails the cards themselves are shown. When search() is not deployed (PGRST202 /
// 404) the page filters the dishes it already loaded, folding accents on the client.
import { supabase } from '../lib/supabase'
import { rsrc } from '../lib/publicSource'
import { isMissing } from '../features/restaurant/api'

export const SEARCH_LIMIT = 40          // the RPC caps p_limit at 50
export const SEARCH_MIN = 2             // the RPC ignores words shorter than 2 letters: a single letter is filtered locally

// the Unicode combining diacritical marks (U+0300 to U+036F), built from their code points so the source stays plain ASCII
const COMBINING_MARKS = new RegExp('[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g')

/** lower case, accents removed, Azerbaijani letters folded: "Şirvan" -> "sirvan", "dönər" -> "doner", "Tiramisù" -> "tiramisu". */
export function fold(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ə/g, 'e').replace(/ı/g, 'i')
    .normalize('NFD').replace(COMBINING_MARKS, '')
}

/** Client-side match used only while search() is unavailable: name, description, category, restaurant and cuisine. */
export function dishMatches(dish, q) {
  const needle = fold(q).trim()
  if (!needle) return true
  const hay = [dish.name, dish.description, dish.category, dish.restaurants?.name, dish.restaurants?.cuisine_type]
  return hay.some(v => v && fold(v).includes(needle))
}

/** A slim discover dish card as the row shape Explore renders (restaurants { name, slug }, restaurant_id). */
export function cardToDish(card) {
  const r = card.restaurant || card.restaurants || {}
  return {
    ...card,
    restaurant_id: card.restaurant_id || r.id || null,
    restaurants: { name: r.name || '', slug: r.slug || '', cuisine_type: r.cuisine_type || null },
  }
}

/**
 * Runs search(q). Resolves { dishes, restaurants } (Explore rows / restaurant cards, in the server's order),
 * or { missing: true } when the RPC does not exist yet, or { error } for any other failure.
 */
export async function searchRemote(q, limit = SEARCH_LIMIT) {
  try {
    const { data, error } = await supabase.rpc('search', { p_q: q, p_limit: limit })
    if (error) return isMissing(error) ? { missing: true } : { error }
    const cards = Array.isArray(data?.dishes) ? data.dishes : []
    const restaurants = Array.isArray(data?.restaurants) ? data.restaurants : []
    const ids = cards.map(c => c.id).filter(Boolean)
    let full = new Map()
    if (ids.length) {
      const { data: rows, error: rowsError } = await supabase
        .from('dishes')
        // !inner: dishes of restaurants that are not listed (the public source is active-only) drop out.
        .select(`*, ${rsrc()}!inner(name, slug, cuisine_type)`)
        .in('id', ids)
      if (!rowsError) full = new Map((rows || []).map(r => [r.id, r]))
    }
    const dishes = cards.map(c => full.get(c.id) || cardToDish(c))
    return { dishes, restaurants }
  } catch (error) {
    return { error }
  }
}
