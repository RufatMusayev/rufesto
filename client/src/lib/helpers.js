// The shared helpers (shared/helpers.js, also used by client-resto) plus the few that depend on the app language.
// A name exported here wins over the same name from the star export below: formatPrice is the shared one for English and
// Azerbaijani (unchanged output) and speaks Russian when the app is in Russian. (timeAgo knows ru in shared/helpers.js itself.)
import { formatPrice as sharedFormatPrice } from '@shared/helpers'
import i18n from './i18n'
import { langOf } from './lang'

export * from '@shared/helpers'

const NBSP = '\u00A0'
const appLang = () => langOf(i18n.resolvedLanguage || i18n.language)

const ruFormats = {}
/** Intl.NumberFormat('ru-RU') with a fixed number of decimals (cached): 1234.5 -> "1 234,50" (non-breaking space). */
const ru = digits => (ruFormats[digits] ||= new Intl.NumberFormat('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits }))

/** A decimal number the way the app language writes it: az / en keep toFixed (4.5), ru uses the comma (4,5). */
export function formatNumber(n, digits = 1) {
  const x = Number(n)
  if (appLang() !== 'ru' || !Number.isFinite(x)) return x.toFixed(digits)
  return ru(digits).format(x)
}

/** Money: az / en "₼12.00" (as before), ru "12,00 ₼" (symbol after the amount, comma, non-breaking space). */
export function formatPrice(n) {
  if (appLang() !== 'ru') return sharedFormatPrice(n)
  const x = Number(n)
  return Number.isFinite(x) ? `${ru(2).format(x)}${NBSP}₼` : sharedFormatPrice(n)
}

/** Money without ".00" for whole amounts (promo badges): "₼5" / "₼5.50", ru "5 ₼" / "5,50 ₼". */
export function formatPriceShort(n) {
  const x = Number(n)
  if (appLang() !== 'ru') return `₼${Number.isInteger(x) ? x : x.toFixed(2)}`
  return Number.isFinite(x) ? `${ru(Number.isInteger(x) ? 0 : 2).format(x)}${NBSP}₼` : sharedFormatPrice(n)
}
