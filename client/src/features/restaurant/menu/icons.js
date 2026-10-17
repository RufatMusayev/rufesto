// Small icon (emoji) per menu section, for the cafe theme and its section navigator. Matches English and
// Azerbaijani section names; anything else falls back to the shared sectionEmoji().
import { sectionEmoji } from '../../../lib/helpers'

const RULES = [
  [/coffee|espresso|latte|cappuc|qəhvə|qehve|kofe/i, '☕'],
  [/\btea\b|çay|chay/i, '🫖'],
  [/pastr|bakery|croissant|bake|xəmir|xemir|çörək|corek/i, '🥐'],
  [/dessert|sweet|cake|şirniyyat|sirniyyat|desert|tort/i, '🍰'],
  [/breakfast|brunch|səhər|seher|omelet|egg/i, '🍳'],
  [/juice|smoothie|drink|beverage|içki|icki|şirə|soda|lemonade|limonad/i, '🥤'],
  [/wine|beer|cocktail|alcohol|şərab|sherab|pivə/i, '🍷'],
  [/salad|salat/i, '🥗'],
  [/soup|şorba|sorba/i, '🍲'],
  [/sandwich|toast|burger|sendviç|sendvic/i, '🥪'],
  [/pizza/i, '🍕'],
  [/pasta|noodle|makaron/i, '🍝'],
  [/grill|bbq|kebab|steak|meat|qril|mangal/i, '🥩'],
  [/fish|seafood|sushi|balıq|baliq/i, '🐟'],
  [/starter|appetizer|meze|zakuska|qəlyanaltı|qelyanalti/i, '🫒'],
]

export function sectionIcon(name) {
  const n = String(name || '')
  for (const [re, emoji] of RULES) if (re.test(n)) return emoji
  return sectionEmoji(n)
}
