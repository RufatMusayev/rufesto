// Money and relative-time formatting that follows the dashboard language. English and Azerbaijani keep the shared
// helpers' output ("₼12.50", "5m ago"); Russian gets the Russian conventions: "12,50 ₼" (decimal comma, the sign after
// the number, a no-break space so the sign never wraps alone) and "5 мин назад".
//
// shared/helpers.js is also used by the consumer app, so the Russian variants live here, in client-resto only.
// Call sites already re-render on a language change (they call useTranslation); `lang` defaults to the active language.

import i18n from './i18n'
import { formatPrice as sharedFormatPrice, timeAgo as sharedTimeAgo } from '@shared/helpers'
import { localeTag } from './time'

const NBSP = ' '

const isRu = lang => String(lang || '').toLowerCase().startsWith('ru')
const activeLang = () => i18n.resolvedLanguage || i18n.language || 'en'

const RU_TIME_AGO = {
  justNow: 'только что',
  minutes: n => `${n} мин назад`,
  hours: n => `${n} ч назад`,
  days: n => `${n} дн назад`,
}

/** "₼12.50" (en, az) or "12,50 ₼" (ru). */
export function formatPrice(n, lang = activeLang()) {
  if (!isRu(lang)) return sharedFormatPrice(n)
  const value = Number(n)
  const text = new Intl.NumberFormat(localeTag(lang), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0)
  return `${text}${NBSP}₼`
}

/** A whole-manat amount for tight spots (chart labels): "₼12" (en, az) or "12 ₼" (ru). */
export function formatPriceWhole(n, lang = activeLang()) {
  const value = Math.round(Number(n)) || 0
  return isRu(lang) ? `${value}${NBSP}₼` : `₼${value}`
}

/** "just now" / "5m ago" in the dashboard language; '' for no timestamp. */
export function timeAgo(ts, lang = activeLang()) {
  if (!isRu(lang)) return sharedTimeAgo(ts, lang)
  if (!ts) return ''
  const diff = (Date.now() - new Date(ts)) / 1000
  if (diff < 60) return RU_TIME_AGO.justNow
  if (diff < 3600) return RU_TIME_AGO.minutes(Math.floor(diff / 60))
  if (diff < 86400) return RU_TIME_AGO.hours(Math.floor(diff / 3600))
  return RU_TIME_AGO.days(Math.floor(diff / 86400))
}
