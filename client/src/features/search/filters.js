// The Search filters and their URL form: /explore?q=&open=1&cuisine=italian&price=2&km=3&diet=vegan,spicy&tab=dishes
// The URL is the state, so Back from a restaurant restores query, filters and tab (UX plan 3.4).

export const DIETS = ['vegan', 'vegetarian', 'gluten_free', 'spicy']       // = the p_diet values of search()
export const PRICES = [1, 2, 3]
export const KMS = [1, 3, 10]
export const TABS = ['all', 'places', 'dishes', 'people']

export const EMPTY_FILTERS = { open: false, cuisine: null, price: null, km: null, diet: [] }

/** URLSearchParams -> filters (unknown or out-of-range values are dropped). */
export function readFilters(params) {
  const price = Number(params.get('price'))
  const km = Number(params.get('km'))
  return {
    open: params.get('open') === '1',
    cuisine: (params.get('cuisine') || '').trim() || null,
    price: PRICES.includes(price) ? price : null,
    km: KMS.includes(km) ? km : null,
    diet: (params.get('diet') || '').split(',').filter(d => DIETS.includes(d)),
  }
}

/** Writes the filters into `params` (a URLSearchParams, changed in place). */
export function writeFilters(params, f) {
  const set = (k, v) => { if (v == null || v === false || v === '') params.delete(k); else params.set(k, String(v)) }
  set('open', f.open ? '1' : null)
  set('cuisine', f.cuisine)
  set('price', f.price)
  set('km', f.km)
  set('diet', f.diet.length ? f.diet.join(',') : null)
  return params
}

export const activeCount = f => (f.open ? 1 : 0) + (f.cuisine ? 1 : 0) + (f.price ? 1 : 0) + (f.km ? 1 : 0) + f.diet.length
export const filterKey = f => [f.open ? 1 : 0, f.cuisine || '', f.price || '', f.km || '', f.diet.join('+')].join('|')

/** The rpc arguments for the filters (only the ones that are set, so the two-argument call stays a subset). */
export function filterArgs(f, coords) {
  const args = {}
  if (f.open) args.p_open_now = true
  if (f.cuisine) args.p_cuisine = f.cuisine
  if (f.price) args.p_price = f.price
  if (f.km && coords) args.p_max_km = f.km
  if (f.diet.length) args.p_diet = f.diet
  return args
}
