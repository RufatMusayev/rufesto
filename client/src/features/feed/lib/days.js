// Calendar days in Asia/Baku (the server buckets Friends items by Baku day, docs/V2-CONTRACT.md 18.1).
const TZ = 'Asia/Baku'
const DAY_MS = 86400000
const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

/** 'YYYY-MM-DD' of a Date / ISO string / epoch in Baku. */
export function bakuDay(d) {
  const p = {}
  for (const x of parts.formatToParts(d instanceof Date ? d : new Date(d))) p[x.type] = x.value
  return `${p.year}-${p.month}-${p.day}`
}

/** The day a feed item belongs to: the server's `day`, else the Baku day of `createdAt`. */
export const dayOf = item => item.day || (item.createdAt ? bakuDay(item.createdAt) : '')

/** 'today' | 'yesterday' | null for a 'YYYY-MM-DD' day. */
export function relativeDay(day, now = Date.now()) {
  if (day === bakuDay(now)) return 'today'
  if (day === bakuDay(now - DAY_MS)) return 'yesterday'
  return null
}

/**
 * 'Monday, 12 October' (the year only when it is not this year) in the app language. Names come from the
 * locale files (feed.weekdays / feed.months / feed.dayLabel*), not from Intl: a browser without Azerbaijani
 * locale data would print the date in a root pattern.
 */
export function formatDay(day, t) {
  const [y, m, d] = day.split('-').map(Number)
  if (!y || !m || !d) return day
  const names = k => { const v = t(k, { returnObjects: true }); return Array.isArray(v) ? v : [] }
  const weekday = names('feed.weekdays')[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  const month = names('feed.months')[m - 1]
  if (!weekday || !month) return day
  const sameYear = String(y) === bakuDay(Date.now()).slice(0, 4)
  return t(sameYear ? 'feed.dayLabel' : 'feed.dayLabelYear', { weekday, day: d, month, year: y })
}
