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
  italian:     'linear-gradient(145deg, #2D1008 0%, #7A3518 40%, #D86030 80%, #F08848 100%)',
  azerbaijani: 'linear-gradient(145deg, #1A0E05 0%, #6B4012 40%, #C88025 80%, #E0A840 100%)',
  japanese:    'linear-gradient(145deg, #080E1A 0%, #1A3558 40%, #2A5888 80%, #3878B0 100%)',
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
