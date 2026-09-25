// Small date/time helpers for client-resto. Keeps "today" and date formatting
// tied to the restaurant's own timezone/language instead of the browser's.

const BAKU_TZ = 'Asia/Baku'

/**
 * ISO timestamp (with explicit +04:00 offset) for the start of "today" in
 * Baku, regardless of the browser's local timezone. Azerbaijan has used a
 * fixed UTC+4 offset with no DST since 2016, so the offset can be hardcoded.
 */
export function bakuTodayStartISO(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BAKU_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const y = parts.find(p => p.type === 'year').value
  const m = parts.find(p => p.type === 'month').value
  const d = parts.find(p => p.type === 'day').value
  return `${y}-${m}-${d}T00:00:00+04:00`
}

/** Maps an i18next language code to a locale tag for Intl/toLocale* calls. */
export function localeTag(lang) {
  return lang && lang.startsWith('az') ? 'az-AZ' : 'en-GB'
}
