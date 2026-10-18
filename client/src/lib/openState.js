// Open state of a place on the Baku clock (docs/MAP-PLAN-2026-10-18.md section 4, "Open state").
// The database says `open_now`, `closes_at` ('HH:MM'), `opens_at` ('HH:MM') and `opens_day` (null = today, 'tomorrow',
// 'Mon'..'Sun') as of the moment it answered; this turns that into what the guest sees *now* without a refetch:
//   open    "Open until 23:00" (23:59 reads 00:00)
//   soon    "Closes soon - 22:30" when 45 minutes or less are left
//   closed  "Closed - opens 09:00 / tomorrow 09:30 / Mon 11:00" (from opens_at / opens_day), or just "Closed"
// Azerbaijan has no daylight saving time since 2016 (UTC+4 all year); Intl is asked first and the fixed offset is the
// fallback for an engine without time zone data. Hours that run past midnight are not modelled: a closing time earlier
// on the clock than "now" is read as "after midnight" unless it is far away (more than 18 h), which means it has passed.

export const SOON_MINUTES = 45
const DAY = 1440
const TZ = 'Asia/Baku'

let fmt
function formatter() {
  if (fmt !== undefined) return fmt
  try {
    fmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  } catch {
    fmt = null
  }
  return fmt
}

/** Minutes since midnight on the Baku clock (0..1439). */
export function bakuMinutes(now = Date.now()) {
  const f = formatter()
  if (f) {
    try {
      let h = 0
      let m = 0
      for (const p of f.formatToParts(now)) {
        if (p.type === 'hour') h = Number(p.value) % 24
        else if (p.type === 'minute') m = Number(p.value)
      }
      return h * 60 + m
    } catch { /* fall through to the fixed offset */ }
  }
  const d = new Date(now)
  return (d.getUTCHours() * 60 + d.getUTCMinutes() + 240) % DAY
}

/** 'HH:MM' or 'HH:MM:SS' -> minutes since midnight, null when it is not a time. */
export function clockToMinutes(s) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(s ?? ''))
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  return h > 23 || min > 59 ? null : h * 60 + min
}

/** 'HH:MM' for display: seconds dropped, 23:59 shown as 00:00 (a place that "closes at 23:59" closes at midnight). */
export function clockLabel(s) {
  const mins = clockToMinutes(s)
  if (mins == null) return null
  if (mins === 23 * 60 + 59) return '00:00'
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

/**
 * -> { state: 'open' | 'soon' | 'closed', open: boolean, time: 'HH:MM' | null, day: null | 'tomorrow' | 'Mon'..'Sun' }
 * `place` needs { open_now, closes_at, opens_at, opens_day }; `nowMin` is bakuMinutes().
 */
export function openState(place, nowMin = bakuMinutes()) {
  if (!place) return { state: 'closed', open: false, time: null, day: null }
  if (place.open_now) {
    const closes = clockToMinutes(place.closes_at)
    if (closes == null) return { state: 'open', open: true, time: null, day: null }
    const left = (closes - nowMin + DAY) % DAY
    if (left > 18 * 60) return { state: 'closed', open: false, time: null, day: null } // closed since, until the next refresh
    return {
      state: left <= SOON_MINUTES ? 'soon' : 'open',
      open: true,
      time: clockLabel(place.closes_at),
      day: null,
    }
  }
  return {
    state: 'closed',
    open: false,
    time: place.opens_at ? clockLabel(place.opens_at) : null,
    day: place.opens_at ? (place.opens_day || null) : null,
  }
}

/** True when the place is open at `nowMin`. */
export const isOpenNow = (place, nowMin) => openState(place, nowMin).open
