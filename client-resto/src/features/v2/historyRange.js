// Day ranges for the history views (Overview, Orders, Bills). Everything is a calendar day on the restaurant's own
// clock (Asia/Baku, fixed UTC+4), never the browser's. A range is { from, to } as 'YYYY-MM-DD', both inclusive.
import { addDays, bakuDateString, isYmd, mondayOf } from './dates'

/** Overview and Orders: Today / Yesterday / This week (Monday to today). */
export const SUMMARY_PRESETS = ['today', 'yesterday', 'week']

/** Bills: Today / Yesterday / Last 7 days / pick one day. */
export const BILL_PRESETS = ['today', 'yesterday', 'last7', 'day']

/**
 * The range a preset stands for, computed from `today` (a Baku 'YYYY-MM-DD'). `picked` is the day chosen with the
 * date input ('day' preset); a missing or impossible date falls back to today so a screen always has a range to ask for.
 */
export function rangeForPreset(preset, today = bakuDateString(), picked = '') {
  switch (preset) {
    case 'yesterday': { const d = addDays(today, -1); return { from: d, to: d } }
    case 'week':      return { from: mondayOf(today), to: today }
    case 'last7':     return { from: addDays(today, -6), to: today }
    case 'day':       { const d = isYmd(picked) && picked <= today ? picked : today; return { from: d, to: d } }
    default:          return { from: today, to: today }
  }
}

/** Start of a Baku calendar day as an instant (Azerbaijan has no DST, so the offset is fixed). */
export const bakuDayStart = ymd => `${ymd}T00:00:00+04:00`

/** [from, to) as ISO instants for a day range: `to` is the start of the day AFTER the last day, so use `.lt`. */
export function rangeInstants({ from, to }) {
  return { fromISO: bakuDayStart(from), toISO: bakuDayStart(addDays(to, 1)) }
}

/** Whether an instant falls on a calendar day inside the range (Baku calendar). */
export function inDayRange(iso, { from, to }) {
  if (!iso || Number.isNaN(Date.parse(iso))) return false
  const day = bakuDateString(new Date(iso))
  return day >= from && day <= to
}

/** True when the range is exactly today. */
export const isTodayRange = (range, today = bakuDateString()) => range.from === today && range.to === today

/** Stable string for effect dependencies. */
export const rangeKey = ({ from, to }) => `${from}|${to}`
