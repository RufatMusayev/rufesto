import { categoryEmoji } from './helpers'

// A dish without a photo is drawn as an emoji. Categories are coarse ("beverages" holds coffee and soda, "dessert"
// holds the croissant), so a few unmistakable words in the dish name refine the category's emoji; everything else
// falls back to the category (QA persona-aysel m6: a flat white must not be a soda cup).
const BY_NAME = [
  [/\b(coffee|espresso|latte|cappuccino|americano|flat white|mocha|macchiato|cortado|ristretto)\b|q[əe]hv[əe]|kofe/i, '☕'],
  [/\b(tea|chai|matcha)\b|çay/i, '🍵'],
  [/croissant|pastr(y|ies)|brioche|bagel|danish|cinnamon (roll|bun)|kruassan/i, '🥐'],
  [/\b(juice|lemonade|smoothie)\b|limonad|şir[əe]/i, '🧃'],
  [/\b(cola|soda|sprite|fanta)\b/i, '🥤'],
]

/** Emoji for a dish-like { name, category }: the name's clear hint first, then the category's emoji. */
export function dishEmoji(dish) {
  const name = String(dish?.name || '')
  if (name) {
    for (const [re, emoji] of BY_NAME) if (re.test(name)) return emoji
  }
  return categoryEmoji(dish?.category)
}
