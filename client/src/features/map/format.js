import i18n from '../../lib/i18n'
import { langOf, localeTag } from '../../lib/lang'

// Numbers on the map in the way the app language writes them (QA MAP-14): az-AZ and ru-RU use a comma ("4,3", "1,2 km"),
// en a point. lib/lang.js decimalMark() is ru-only and shared with the rest of the app; the map has its own formatter.
const cache = new Map()
function formatter(lang, digits) {
  const key = `${lang}|${digits}`
  let f = cache.get(key)
  if (!f) {
    try {
      f = new Intl.NumberFormat(localeTag(lang), { minimumFractionDigits: digits, maximumFractionDigits: digits })
    } catch {
      f = { format: n => Number(n).toFixed(digits) }
    }
    cache.set(key, f)
  }
  return f
}

/** 4.3 -> "4,3" (az, ru) / "4.3" (en). `digits` fixed decimals, `lang` defaults to the app language. */
export function decimal(n, digits = 1, lang) {
  const x = Number(n)
  if (!Number.isFinite(x)) return ''
  const l = langOf(lang || i18n.resolvedLanguage || i18n.language)
  const s = formatter(l, digits).format(x)
  // a runtime with trimmed ICU data (some headless / embedded browsers) answers "4.2" for az: the comma is ours to guarantee
  return l === 'en' ? s : s.replace('.', ',')
}
