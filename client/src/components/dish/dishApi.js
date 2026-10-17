// The one read of the dish sheet that is not on the restaurant page: a dish by id (Search, shared links).
import { supabase } from '../../lib/supabase'
import { rsrc } from '../../lib/publicSource'
import { toSheetDish } from '../../features/restaurant/mappers'

/** The dish with its restaurant, in the shape the sheet and the cart read; null when it does not exist (or is not listed). */
export async function fetchDish(id, lang) {
  try {
    const { data, error } = await supabase
      .from('dishes')
      // !inner: a dish of a restaurant that is not listed (the public source is active-only) drops out.
      .select(`*, ${rsrc()}!inner(name, slug, cuisine_type)`)
      .eq('id', id)
      .maybeSingle()
    if (error || !data) return null
    return toSheetDish(data, lang, data.restaurants)
  } catch {
    return null
  }
}
