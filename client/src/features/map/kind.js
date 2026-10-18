// The three kinds of place the map knows (map_places.kind, sql/70: derived from restaurants.cuisine_type on the server).
export const KINDS = ['coffee', 'quick', 'restaurant']

/** i18n key (map namespace) of the filter chip of a kind. */
export const KIND_CHIP_KEY = { coffee: 'kindCoffee', quick: 'kindQuick', restaurant: 'kindRestaurant' }

/** An unknown or missing kind reads as a restaurant (the server does the same for a null cuisine). */
export const normKind = k => (KINDS.includes(k) ? k : 'restaurant')

/** i18n key of the singular name of a kind ("Cafe", "Quick bite", "Restaurant"). */
export const kindOneKey = k => `kindOne.${normKind(k)}`
