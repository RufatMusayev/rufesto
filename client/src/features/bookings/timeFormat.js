// Display helpers. Booking times are Asia/Baku wall-clock whatever the browser timezone is, so every
// formatter works on the Baku calendar date / clock; calendar-date maths comes from lib/bookingSlots.js.
//
// Azerbaijani and Russian names come from the small tables below instead of Intl: several browser builds ship without
// complete az locale data and print "M10 2, Fri", which would show up on the main language of the app; ru gets the same
// tables so a date is the same everywhere (genitive month after a day: "2 окт", "пятница, 3 октября").
import { bakuDateString, weekdayOf } from '../../lib/bookingSlots'
import { langOf } from '../../lib/lang'

const TZ = 'Asia/Baku'

const AZ = {
  monthsLong: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avqust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'],
  monthsShort: ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avq', 'sen', 'okt', 'noy', 'dek'],
  // Sunday first, like Date#getDay and operating_hours.day_of_week
  daysLong: ['bazar', 'bazar ertəsi', 'çərşənbə axşamı', 'çərşənbə', 'cümə axşamı', 'cümə', 'şənbə'],
  daysShort: ['baz', 'b.e.', 'ç.a.', 'çər', 'c.a.', 'cümə', 'şən'],
}

const RU = {
  monthsLong: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
  monthsShort: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
  daysLong: ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'],
  daysShort: ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'],
}

const TABLES = { az: AZ, ru: RU }

/** 'HH:MM' of an instant on the Baku clock. */
export function formatBakuTime(value) {
  return new Date(value).toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
}

/** The Baku calendar date ('YYYY-MM-DD') of an instant. */
export function bakuDateOf(value) {
  return bakuDateString(new Date(value))
}

/** A 'YYYY-MM-DD' calendar date formatted with Intl options (en) or the tables above (az, ru). Timezone independent. */
function styled(dateStr, lng, opts) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const tbl = TABLES[langOf(lng)]
  if (!tbl) {
    return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts })
  }
  const wd = weekdayOf(dateStr)
  const month = opts.month === 'long' ? tbl.monthsLong[m - 1] : tbl.monthsShort[m - 1]
  const weekday = opts.weekday === 'long' ? tbl.daysLong[wd] : tbl.daysShort[wd]
  if (opts.month && !opts.day) return month
  if (opts.weekday && !opts.day) return weekday
  const date = `${d} ${month}${opts.year ? ` ${y}` : ''}`
  return opts.weekday ? `${weekday}, ${date}` : date
}

/** "Fri 2 Oct" / "cümə, 2 okt" / "пт, 2 окт" of an instant on the Baku calendar. */
export function formatBakuDate(value, lng) {
  return styled(bakuDateOf(value), lng, { weekday: 'short', day: 'numeric', month: 'short' })
}

/** "2 Oct 2026" of an instant on the Baku calendar (rows and lists). */
export function formatBakuDateLong(value, lng) {
  return styled(bakuDateOf(value), lng, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Parts for a day chip from a 'YYYY-MM-DD' calendar date. */
export function dayChipParts(dateStr, lng) {
  return {
    weekday: styled(dateStr, lng, { weekday: 'short' }),
    day: String(Number(dateStr.split('-')[2])),
    month: styled(dateStr, lng, { month: 'short' }),
  }
}

/** "Friday 3 October" from a 'YYYY-MM-DD' calendar date. */
export function formatDateStr(dateStr, lng) {
  return styled(dateStr, lng, { weekday: 'long', day: 'numeric', month: 'long' })
}

export const EARLY_MINUTES = 30

/** Where "now" sits against a booking: 'early' (before the check-in window), 'open', or 'late' (past the end). */
export function checkInWindow(startsAt, endsAt, now = Date.now()) {
  const start = new Date(startsAt).getTime()
  const end = new Date(endsAt).getTime()
  const opensAt = start - EARLY_MINUTES * 60 * 1000
  if (now < opensAt) return { state: 'early', opensAt: new Date(opensAt) }
  if (now > end) return { state: 'late', opensAt: new Date(opensAt) }
  return { state: 'open', opensAt: new Date(opensAt) }
}

/** Phone check for the form: the server wants 7 to 15 digits (an optional leading +). */
export const PHONE_REGEX = /^\+?[0-9\s\-()]{7,20}$/
export function isValidPhone(value) {
  const v = String(value || '').trim()
  if (!PHONE_REGEX.test(v)) return false
  return /^\+?[0-9]{7,15}$/.test(v.replace(/[^0-9+]/g, ''))
}
