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

// ── Calendar-day arithmetic (tips ranges) ──
// Works on 'YYYY-MM-DD' strings through UTC, so it never drifts with the
// browser's timezone or DST. Pair with bakuDateString() for "today".

const YMD = /^\d{4}-\d{2}-\d{2}$/

/** True for a well-formed 'YYYY-MM-DD' that is a real calendar date. */
export function isYmd(value) {
  if (!YMD.test(String(value))) return false
  const [y, m, d] = value.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/** 'YYYY-MM-DD' plus `n` calendar days (n may be negative). */
export function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** The Monday on or before `ymd` (weeks start on Monday). */
export function mondayOf(ymd) {
  const [y, m, d] = ymd.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = Sunday
  return addDays(ymd, -((dow + 6) % 7))
}

/** Every day from `from` to `to`, inclusive; null when the span is longer than `cap` days. */
export function eachDay(from, to, cap = 120) {
  const days = []
  for (let day = from; day <= to; day = addDays(day, 1)) {
    if (days.length >= cap) return null
    days.push(day)
  }
  return days
}

/** Preset range for the tips screens, on the Baku calendar: today | week (Mon..today) | month (1st..today). */
export function presetRange(preset, today = bakuDateString()) {
  if (preset === 'week') return { from: mondayOf(today), to: today }
  if (preset === 'month') return { from: `${today.slice(0, 8)}01`, to: today }
  return { from: today, to: today }
}

/** Whole days from `a` to `b` (negative when b is earlier). */
export function daysBetween(a, b) {
  const [ya, ma, da] = a.split('-').map(Number)
  const [yb, mb, db] = b.split('-').map(Number)
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000)
}

// The tips RPCs refuse a range longer than 366 days (invalid_range).
export const MAX_RANGE_DAYS = 366

/** Why a range can't be sent: 'incomplete' (a missing / impossible date), 'order' (start after end), 'long', or null when it is fine. */
export function rangeProblem({ from, to }) {
  if (!isYmd(from) || !isYmd(to)) return 'incomplete'
  if (from > to) return 'order'
  if (daysBetween(from, to) >= MAX_RANGE_DAYS) return 'long'
  return null
}

/** The range can be sent to the tips RPCs. */
export function isValidRange(range) {
  return rangeProblem(range) === null
}

/** Time of day on the Baku clock, e.g. '14:05'. */
export function bakuTime(iso, localeTag) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(localeTag, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: BAKU_TZ })
}

/** Short day and month on the Baku clock, e.g. '2 Oct'. */
export function bakuDayMonth(iso, localeTag) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(localeTag, { day: 'numeric', month: 'short', timeZone: BAKU_TZ })
}

/** Time only for an instant on today's Baku date, otherwise 'D Mon HH:mm'; '' for no / invalid input. */
export function bakuWhen(iso, localeTag) {
  if (!iso || Number.isNaN(new Date(iso).getTime())) return ''
  const time = bakuTime(iso, localeTag)
  return bakuDateString(new Date(iso)) === bakuDateString() ? time : `${bakuDayMonth(iso, localeTag)} ${time}`
}

/** 'YYYY-MM-DD HH:mm' on the Baku clock (CSV export); '' for no / invalid input. */
export function bakuStamp(iso) {
  const d = iso ? new Date(iso) : null
  if (!d || Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: BAKU_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d)
}
