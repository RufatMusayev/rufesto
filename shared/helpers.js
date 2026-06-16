export const CUISINE_EMOJI = {
  italian: '🍝', azerbaijani: '🫕', japanese: '🍣',
  turkish: '🥙', french: '🥐', american: '🍔',
  chinese: '🥢', indian: '🍛', mexican: '🌮',
  mediterranean: '🫒', georgian: '🥘', default: '🍽️',
}

export const CATEGORY_EMOJI = {
  mains: '🍽️', main: '🍽️', pizza: '🍕', pasta: '🍝',
  salad: '🥗', salads: '🥗', soup: '🍲', soups: '🍲',
  dessert: '🍮', desserts: '🍮', beverage: '🥤', beverages: '🥤',
  alcoholic: '🍷', sushi: '🍣', rolls: '🌯',
  starters: '🫕', starter: '🫕', grill: '🥩', grilled: '🥩',
  rice: '🍚', breakfast: '🍳', default: '🍴',
}

export function cuisineEmoji(cuisine) {
  return CUISINE_EMOJI[(cuisine || '').toLowerCase()] || CUISINE_EMOJI.default
}

export function categoryEmoji(category) {
  return CATEGORY_EMOJI[(category || '').toLowerCase()] || CATEGORY_EMOJI.default
}

export function formatPrice(n) {
  return `₼${Number(n).toFixed(2)}`
}

export function isRestaurantOpen(hours = []) {
  if (!hours?.length) return false
  const now  = new Date()
  const day  = now.getDay()
  const mins = now.getHours() * 60 + now.getMinutes()
  const row  = hours.find(h => h.day_of_week === day && !h.is_closed)
  if (!row) return false
  const [oh, om] = (row.open_time  || '00:00').split(':').map(Number)
  const [ch, cm] = (row.close_time || '23:59').split(':').map(Number)
  return mins >= oh * 60 + om && mins < ch * 60 + cm
}

export function getTodayHours(hours = []) {
  if (!hours?.length) return null
  const day = new Date().getDay()
  const row = hours.find(h => h.day_of_week === day)
  if (!row || row.is_closed) return null
  return {
    open:  (row.open_time  || '').slice(0, 5),
    close: (row.close_time || '').slice(0, 5),
  }
}

export function timeAgo(ts) {
  if (!ts) return ''
  const diff = (Date.now() - new Date(ts)) / 1000
  if (diff < 60)   return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

/** Looks like a raw id slice (hash handle): 5+ lowercase letters/digits, and either
 *  contains a digit or has no vowels (so real lowercase names aren't dropped).
 *  e.g. "gffzcfcb", "a1b2c3d4" → true; "marino", "leyla" → false. */
function isRawIdToken(token) {
  if (!/^[a-z0-9]{5,}$/.test(token)) return false
  return /[0-9]/.test(token) || !/[aeiou]/.test(token)
}

/** Strip raw id hashes from auto-generated usernames like "Anonymous gffzcfcb".
 *  Handles both the full-string case and a trailing standalone hash token.
 *  Never renders a raw id in the UI — falls back to "Anonymous". */
export function cleanDisplayName(name) {
  if (!name) return 'Anonymous'
  const parts = String(name).trim().split(/\s+/)
  if (parts.length > 1 && isRawIdToken(parts[parts.length - 1])) {
    parts.pop()
  }
  const cleaned = parts.join(' ').trim()
  return cleaned || 'Anonymous'
}

export function stars(rating, max = 5) {
  const full  = Math.floor(rating)
  const half  = rating - full >= 0.5 ? 1 : 0
  const empty = max - full - half
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty)
}

const DISH_BACKGROUNDS = {
  starter:   'linear-gradient(145deg, #2D1810 0%, #5C3520 50%, #8B5E3C 100%)',
  soup:      'linear-gradient(145deg, #1C0E08 0%, #6B3818 50%, #A85525 100%)',
  main:      'linear-gradient(145deg, #2D0808 0%, #7A2222 50%, #B04545 100%)',
  pasta:     'linear-gradient(145deg, #2D2008 0%, #7A6015 50%, #C8A020 100%)',
  pizza:     'linear-gradient(145deg, #3D1008 0%, #A03518 50%, #D85828 100%)',
  dessert:   'linear-gradient(145deg, #2D0820 0%, #7A1850 50%, #C03080 100%)',
  beverage:  'linear-gradient(145deg, #081820 0%, #1A4868 50%, #2878A8 100%)',
  alcoholic: 'linear-gradient(145deg, #200818 0%, #581035 50%, #902058 100%)',
}

const CUISINE_BACKGROUNDS = {
  italian:       'linear-gradient(145deg, #2D1008 0%, #7A3518 40%, #D86030 80%, #F08848 100%)',
  azerbaijani:   'linear-gradient(145deg, #1A0E05 0%, #6B4012 40%, #C88025 80%, #E0A840 100%)',
  japanese:      'linear-gradient(145deg, #1A0A10 0%, #5C1E2E 40%, #8B2D42 80%, #C04060 100%)',
  turkish:       'linear-gradient(145deg, #1A0D08 0%, #6B2A10 40%, #C44C1C 80%, #E06830 100%)',
  french:        'linear-gradient(145deg, #1A1208 0%, #6B5010 40%, #C4942C 80%, #E0B040 100%)',
  american:      'linear-gradient(145deg, #1A0A08 0%, #7A2A10 40%, #C84420 80%, #E06030 100%)',
  chinese:       'linear-gradient(145deg, #1A0808 0%, #7A1810 40%, #C83018 80%, #E04828 100%)',
  indian:        'linear-gradient(145deg, #1A0E05 0%, #7A4010 40%, #C87020 80%, #E09030 100%)',
  mexican:       'linear-gradient(145deg, #1A1205 0%, #6B5010 40%, #C49020 80%, #E0A830 100%)',
  mediterranean: 'linear-gradient(145deg, #0E1A0A 0%, #3A5A18 40%, #7A9C30 80%, #A0B848 100%)',
  georgian:      'linear-gradient(145deg, #1A0808 0%, #6B2010 40%, #B83820 80%, #D85030 100%)',
}

export function dishBackground(category) {
  return DISH_BACKGROUNDS[(category || '').toLowerCase()] || 'linear-gradient(145deg, #1a1510 0%, #3d3020 50%, #5c4830 100%)'
}

export function cuisineBackground(cuisine) {
  return CUISINE_BACKGROUNDS[(cuisine || '').toLowerCase()] || 'linear-gradient(145deg, #1a1510 0%, #3d3020 50%, #5c4830 100%)'
}

const SECTION_EMOJI = {
  starters: '🫕', 'başlanğıc': '🫕', soups: '🍲', 'şorbalar': '🍲',
  pasta: '🍝', risotto: '🍚', mains: '🍽️', 'ana yemək': '🥩',
  pizza: '🍕', desserts: '🍮', 'şirniyyat': '🍮',
  beverages: '🥤', 'içkilər': '🍵',
  'wines & spirits': '🍷', 'japanese drinks': '🍶',
  sashimi: '🐟', nigiri: '🍣', 'maki rolls': '🌯',
}

export function sectionEmoji(name) {
  return SECTION_EMOJI[(name || '').toLowerCase()] || '🍴'
}
