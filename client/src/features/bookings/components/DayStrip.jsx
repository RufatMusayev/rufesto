import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays } from '../../../lib/bookingSlots'
import { dayChipParts, formatDateStr } from '../timeFormat'

/** Horizontally scrolling day chips for the next `days` Baku calendar dates, starting at `today` ('YYYY-MM-DD'). */
export default function DayStrip({ today, days = 30, value, onChange }) {
  const { t, i18n } = useTranslation('bookings')
  const selectedRef = useRef(null)
  const list = useMemo(() => Array.from({ length: days }, (_, i) => addDays(today, i)), [today, days])

  useEffect(() => {
    // keep the selected chip in view without scrolling the page
    const el = selectedRef.current
    if (el?.parentElement) {
      const parent = el.parentElement
      parent.scrollLeft = Math.max(0, el.offsetLeft - parent.clientWidth / 2 + el.clientWidth / 2)
    }
  }, [value])

  return (
    <div className="bk-days no-scrollbar" role="group" aria-label={t('wizard.pickDate')}>
      {list.map((d, i) => {
        const p = dayChipParts(d, i18n.language)
        const active = d === value
        return (
          <button
            key={d} type="button" ref={active ? selectedRef : null}
            className={`bk-day${active ? ' active' : ''}`} aria-pressed={active}
            aria-label={formatDateStr(d, i18n.language)}
            onClick={() => onChange(d)}
          >
            <span className="bk-day-wd">{i === 0 ? t('wizard.today') : p.weekday}</span>
            <span className="bk-day-num font-mono">{p.day}</span>
            <span className="bk-day-mo">{p.month}</span>
          </button>
        )
      })}
    </div>
  )
}
