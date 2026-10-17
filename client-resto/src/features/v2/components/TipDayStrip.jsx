import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { formatPrice } from '@shared/helpers'
import { localeTag } from '../../../lib/time'
import { eachDay } from '../dates'

// Bar height classes come in 5% steps (v2-strip-fill--h5 .. --h100); a day with
// any tip never rounds down to nothing.
const heightClass = (total, max) =>
  total > 0 && max > 0 ? `v2-strip-fill--h${Math.max(5, Math.round((total / max) * 20) * 5)}` : ''

// How much a column can say depends on how many there are: up to a week the exact amount sits on every bar, up to
// two weeks a rounded one, beyond that only the highest day is written out (the rest is in the hover text and in
// the screen-reader text of every column).
const FULL_UP_TO = 7
const ROUNDED_UP_TO = 14

/**
 * Per-day totals as plain bars with their value on top. Days with no tips are filled in so the strip
 * covers the whole range; a span too long to fill shows the days the server
 * returned. Nothing renders for a single day.
 *   days  [{ day: 'YYYY-MM-DD', total }]
 */
export default function TipDayStrip({ days, from, to }) {
  const { t, i18n } = useTranslation('v2')
  const tag = localeTag(i18n.language)

  const cols = useMemo(() => {
    const byDay = new Map(days.map(d => [d.day, d.total]))
    const span = eachDay(from, to)
    return span ? span.map(day => ({ day, total: byDay.get(day) || 0 })) : [...days].sort((a, b) => a.day.localeCompare(b.day))
  }, [days, from, to])

  if (cols.length < 2) return null
  const max = Math.max(0, ...cols.map(c => c.total))
  const weekly = cols.length <= FULL_UP_TO

  // 'YYYY-MM-DD' read as UTC so the label never shifts with the browser's timezone. Weekday names come from the
  // translations, not from Intl, so Azerbaijani never falls back to English on a browser without that locale data.
  const label = day => {
    const d = new Date(`${day}T00:00:00Z`)
    return weekly ? t(`weekdayShort_${d.getUTCDay()}`) : String(d.getUTCDate())
  }
  const fullDate = day => new Date(`${day}T00:00:00Z`).toLocaleDateString(tag, { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const valueText = c => {
    if (c.total <= 0) return ''
    if (cols.length <= FULL_UP_TO) return formatPrice(c.total)
    if (cols.length <= ROUNDED_UP_TO) return `₼${Math.round(c.total)}`
    return c.total === max ? formatPrice(c.total) : ''
  }

  return (
    <section className="v2-card v2-strip-card" aria-labelledby="v2-strip-title">
      <h2 id="v2-strip-title" className="dash-section-title">{t('byDayTitle')}</h2>
      <ul className="v2-strip no-scrollbar">
        {cols.map(c => (
          <li key={c.day} className={`v2-strip-col${c.total === 0 ? ' is-empty' : ''}`} title={`${fullDate(c.day)}: ${formatPrice(c.total)}`}>
            <span className="v2-sr-only">{t('byDayItem', { date: fullDate(c.day), amount: formatPrice(c.total) })}</span>
            <span className="v2-strip-val" aria-hidden="true">{valueText(c)}</span>
            <span className="v2-strip-bar" aria-hidden="true">
              <span className={`v2-strip-fill ${heightClass(c.total, max)}`.trim()} />
            </span>
            <span className="v2-strip-label" aria-hidden="true">{label(c.day)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
