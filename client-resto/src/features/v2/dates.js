// Date helpers for the v2 dashboard screens. Booking and "today" logic follows
// the restaurant's own clock (Asia/Baku), never the browser's.

const BAKU_TZ = 'Asia/Baku'

/** 'YYYY-MM-DD' for the given instant on the Baku calendar. */
export function bakuDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BAKU_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const get = type => parts.find(p => p.type === type).value
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Display order of weekdays: Monday first. DB day_of_week: 0 = Sunday. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

/** Localised weekday name for a DB day_of_week (0 = Sunday). */
export function weekdayName(dow, localeTag) {
  // 2024-01-07 is a Sunday; UTC avoids any timezone shift.
  return new Date(Date.UTC(2024, 0, 7 + dow)).toLocaleDateString(localeTag, { weekday: 'long', timeZone: 'UTC' })
}

/** 'YYYY-MM-DD' (a calendar date, no time) shown in the given locale. */
export function formatCalendarDate(ymd, localeTag) {
  const [y, m, d] = String(ymd).split('-').map(Number)
  if (!y || !m || !d) return String(ymd)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(localeTag, {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC',
  })
}

/** 'HH:MM:SS' or 'HH:MM' -> 'HH:MM'. */
export function hhmm(time) {
  return String(time || '').slice(0, 5)
}
