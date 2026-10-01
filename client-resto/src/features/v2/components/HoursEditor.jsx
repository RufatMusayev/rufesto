import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { addClosure, fetchHours, removeClosure, saveHours } from '../api'
import { WEEK_ORDER, weekdayName } from '../dates'
import { v2Error } from '../errors'
import { localeTag } from '../../../lib/time'
import useLiveList from '../hooks/useLiveList'
import ClosuresList from './ClosuresList'
import DayRow from './DayRow'
import ErrorBanner from './ErrorBanner'
import LoadError from './LoadError'

// A 00:00 close means "end of day"; the DB needs close > open, so it is stored
// as 23:59 (same reading as the consumer app's slot engine).
const normalise = days => days.map(d => (d.close === '00:00' ? { ...d, close: '23:59' } : d))

function rangeInvalid(d) {
  if (d.isClosed) return false
  if (!d.open || !d.close) return true
  const close = d.close === '00:00' ? '23:59' : d.close
  return close <= d.open
}

// Settings -> Opening hours: seven weekday rows (Monday first; DB day 0 is
// Sunday), one Save for the week, and special closures that save immediately.
export default function HoursEditor({ restaurantId, onSaved }) {
  const { t, i18n } = useTranslation(['v2', 'dashboard'])
  const load = useCallback(() => fetchHours(restaurantId), [restaurantId])
  const { data, error, loading, retry } = useLiveList(load, null, restaurantId)

  const [days, setDays] = useState(null)
  const [baseline, setBaseline] = useState(null)
  const [closures, setClosures] = useState([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (!data) return
    setDays(data.days)
    setBaseline(data.days)
    setClosures(data.closures)
  }, [data])

  const dirty = useMemo(() => !!days && JSON.stringify(days) !== JSON.stringify(baseline), [days, baseline])
  const anyInvalid = !!days && days.some(rangeInvalid)
  const tag = localeTag(i18n.language)

  function patchDay(dow, patch) {
    setDays(list => list.map(d => (d.dow === dow ? { ...d, ...patch } : d)))
  }

  function copyToAll(source) {
    setDays(list => list.map(d => ({ ...d, open: source.open, close: source.close })))
  }

  async function handleSave() {
    if (saving || !dirty || anyInvalid) return
    setSaving(true)
    setSaveError('')
    const next = normalise(days)
    const { error: err } = await saveHours(restaurantId, next)
    setSaving(false)
    if (err) return setSaveError(v2Error(err, t))
    setDays(next)
    setBaseline(next)
    onSaved()
  }

  async function handleAddClosure(date, reason) {
    const { data: row, error: err } = await addClosure(restaurantId, date, reason)
    if (err) return v2Error(err, t)
    setClosures(list => [...list, row].sort((a, b) => a.date.localeCompare(b.date)))
    onSaved()
    return ''
  }

  async function handleRemoveClosure(id) {
    const { error: err } = await removeClosure(id)
    if (err) return v2Error(err, t)
    setClosures(list => list.filter(c => c.id !== id))
    onSaved()
    return ''
  }

  if (loading) {
    return (
      <div aria-hidden="true">
        {WEEK_ORDER.map(d => <div key={d} className="skeleton v2-skel-day" />)}
      </div>
    )
  }
  if (!days) return <LoadError message={v2Error(error, t)} onRetry={retry} />

  const firstOpen = WEEK_ORDER.map(dow => days[dow]).find(d => !d.isClosed)

  return (
    <div className="v2-stack">
      <ErrorBanner message={saveError} onDismiss={() => setSaveError('')} />

      <section className="v2-card" aria-labelledby="v2-hours-title">
        <h2 id="v2-hours-title" className="dash-section-title">{t('hoursTitle')}</h2>
        <p className="v2-hint">{t('hoursHint')}</p>
        <div className="v2-days">
          {WEEK_ORDER.map(dow => {
            const day = days[dow]
            return (
              <DayRow
                key={dow}
                day={day}
                name={weekdayName(dow, tag)}
                invalid={rangeInvalid(day)}
                showCopy={firstOpen === day}
                onChange={patch => patchDay(dow, patch)}
                onCopy={() => copyToAll(day)}
              />
            )
          })}
        </div>
      </section>

      <ClosuresList closures={closures} onAdd={handleAddClosure} onRemove={handleRemoveClosure} />

      <div className="v2-savebar">
        <span className="v2-savebar-note" role="status">
          {anyInvalid ? t('fixHours') : dirty ? t('unsaved') : ''}
        </span>
        <button type="button" className="btn btn-primary" disabled={!dirty || anyInvalid || saving} onClick={handleSave}>
          {saving && <span className="spinner" aria-hidden="true" />}
          {t('saveHours')}
        </button>
      </div>
    </div>
  )
}
