// Booking time helpers. Everything here works in Asia/Baku wall-clock time, because
// operating_hours / special_closures / bookings.reserved_from are all Baku-local,
// whatever timezone the visitor's browser happens to be in. (Baku has had no DST
// since 2016; the offset is still resolved through Intl rather than hardcoded.)

const TZ = 'Asia/Baku'

export const BOOKING_MINUTES = 90   // length of a booking (reserved_until = reserved_from + 90 min)
export const SLOT_STEP = 30         // minutes between bookable start times

const wallClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit',
  hourCycle: 'h23',
})

const pad = n => String(n).padStart(2, '0')

function bakuParts(date) {
  const p = {}
  for (const x of wallClock.formatToParts(date)) p[x.type] = x.value
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute }
}

function splitDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return { y, m, d }
}

/** 'YYYY-MM-DD' for the given instant, as the calendar date in Baku. */
export function bakuDateString(date = new Date()) {
  const p = bakuParts(date)
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`
}

/** Minutes since midnight in Baku for the given instant. */
export function bakuMinutesOfDay(date = new Date()) {
  const p = bakuParts(date)
  return p.h * 60 + p.mi
}

/** 'YYYY-MM-DD' + n calendar days (pure calendar maths, timezone independent). */
export function addDays(dateStr, n) {
  const { y, m, d } = splitDate(dateStr)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

/** Day of week (0 = Sunday ... 6 = Saturday) of a calendar date; matches operating_hours.day_of_week. */
export function weekdayOf(dateStr) {
  const { y, m, d } = splitDate(dateStr)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** The real instant at which the Baku wall clock reads `dateStr` `timeStr` ('HH:MM'). */
export function bakuToInstant(dateStr, timeStr) {
  const { y, m, d } = splitDate(dateStr)
  const [h, mi] = timeStr.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, h, mi)
  const p = bakuParts(new Date(guess))
  const offset = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - guess   // Baku minus UTC, in ms
  return new Date(guess - offset)
}

function toMinutes(t) {
  const [h, m] = String(t).split(':').map(Number)
  return h * 60 + (m || 0)
}

function toLabel(minutes) {
  return `${pad(Math.floor(minutes / 60) % 24)}:${pad(minutes % 60)}`
}

/** Opening window for a date as { open, close } in minutes, or null when there is no hours row for that
 *  weekday or it is flagged closed. Mirrors the server rule (sql/36 validate_booking_time): a booking must
 *  start and end on the same calendar day, so a close time of 00:00 counts as 23:59 and any overnight
 *  window (close <= open) is capped at 23:59. */
function dayWindow(hours, dateStr) {
  const row = (hours || []).find(h => h.day_of_week === weekdayOf(dateStr))
  if (!row || row.is_closed) return null
  const open = toMinutes(row.open_time)
  let close = toMinutes(row.close_time)
  if (close <= open) close = 1439   // 00:00 or overnight: bookable until 23:59 only
  return { open, close }
}

/**
 * Everything the booking form needs to know about one date.
 *   status: 'ok' | 'closedDate' (special closure) | 'closedDay' (weekly closed / no hours) | 'noneLeft' (today, all past)
 *   slots:  ['12:00', '12:30', ...] start times that fit a full booking inside opening hours
 *   open / close: 'HH:MM' labels for display (null when closed)
 */
export function bookableSlots(hours, closures, dateStr, now = new Date()) {
  if (!dateStr) return { status: 'ok', slots: [], open: null, close: null, reason: null }

  const closure = (closures || []).find(c => c.closed_date === dateStr)
  if (closure) return { status: 'closedDate', slots: [], open: null, close: null, reason: closure.reason || null }

  const win = dayWindow(hours, dateStr)
  if (!win) return { status: 'closedDay', slots: [], open: null, close: null, reason: null }

  const isToday = dateStr === bakuDateString(now)
  const nowMin = bakuMinutesOfDay(now)
  const slots = []
  // A slot is offered only if the whole booking ends inside the window on the same day (never past midnight).
  for (let t = Math.ceil(win.open / SLOT_STEP) * SLOT_STEP; t + BOOKING_MINUTES <= win.close; t += SLOT_STEP) {
    if (isToday && t <= nowMin) continue
    slots.push(toLabel(t))
  }

  return {
    status: slots.length ? 'ok' : (isToday ? 'noneLeft' : 'closedDay'),
    slots,
    open: toLabel(win.open),
    close: toLabel(win.close),
    reason: null,
  }
}

/** Re-checks a chosen slot right before submitting. Returns null when fine, else { code, open, close, reason }. */
export function checkSlot(hours, closures, dateStr, timeStr, now = new Date()) {
  const day = bookableSlots(hours, closures, dateStr, now)
  if (day.status === 'closedDate' || day.status === 'closedDay') {
    return { code: day.status, open: day.open, close: day.close, reason: day.reason }
  }
  if (!day.slots.includes(timeStr)) {
    // Not offered: either already in the past today, or it doesn't fit inside opening hours.
    const instant = bakuToInstant(dateStr, timeStr)
    if (instant.getTime() <= now.getTime()) return { code: 'past', open: day.open, close: day.close, reason: null }
    return { code: 'outsideHours', open: day.open, close: day.close, reason: null }
  }
  return null
}
