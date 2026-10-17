import i18n from './i18n'

// Short relative time for lists (docs/UX-PLAN-2026-10-18.md 6.10).
//   en: now, 5m, 3h, 2d, 3w, then "12 Oct" (and "12 Oct 2025" when it is not this year)
//   az: indi, 5 dəq, 3 saat, 2 gün, 3 həftə, then "12 okt"
// Words and month names come from locales/<lng>/common.json (timeShort.*), not from Intl: a browser without
// Azerbaijani locale data would print a root pattern (same reason as features/feed/lib/days.js).
const MIN = 60
const HOUR = 3600
const DAY = 86400
const WEEK = 7 * DAY

/**
 * @param ts   ISO string, epoch ms or Date
 * @param lang 'en' | 'az' (pass i18n.language from useTranslation so the caller re-renders on a language switch)
 * @param now  epoch ms, for tests
 */
export function timeShort(ts, lang, now = Date.now()) {
  if (!ts) return ''
  const at = ts instanceof Date ? ts.getTime() : new Date(ts).getTime()
  if (Number.isNaN(at)) return ''
  const t = i18n.getFixedT(lang || i18n.language, 'common')
  const diff = Math.max(0, Math.floor((now - at) / 1000))
  if (diff < MIN) return t('timeShort.now')
  if (diff < HOUR) return t('timeShort.m', { n: Math.floor(diff / MIN) })
  if (diff < DAY) return t('timeShort.h', { n: Math.floor(diff / HOUR) })
  if (diff < WEEK) return t('timeShort.d', { n: Math.floor(diff / DAY) })
  if (diff < 4 * WEEK) return t('timeShort.w', { n: Math.floor(diff / WEEK) })
  const d = new Date(at)
  const months = t('timeShort.months', { returnObjects: true })
  const month = Array.isArray(months) ? months[d.getMonth()] : ''
  const sameYear = d.getFullYear() === new Date(now).getFullYear()
  return t(sameYear ? 'timeShort.date' : 'timeShort.dateYear', { day: d.getDate(), month, year: d.getFullYear() })
}

export default timeShort
