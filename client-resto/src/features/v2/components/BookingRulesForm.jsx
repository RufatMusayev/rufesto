import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchBookingRules, saveBookingRules } from '../api'
import { v2Error } from '../errors'
import useLiveList from '../hooks/useLiveList'
import ErrorBanner from './ErrorBanner'
import LoadError from './LoadError'
import StatusPill from './StatusPill'
import Switch from './Switch'

const SLOT_STEPS = [15, 30, 60]

// Numeric rules with the range the form enforces. `optional` fields may stay
// empty (empty = no limit).
const GROUPS = [
  { id: 'timing', titleKey: 'rulesTiming', slotStep: true, fields: [
    { key: 'turn12', labelKey: 'ruleTurn12', min: 30, max: 240, unit: 'unitMin' },
    { key: 'turn34', labelKey: 'ruleTurn34', min: 30, max: 240, unit: 'unitMin' },
    { key: 'turn56', labelKey: 'ruleTurn56', min: 30, max: 240, unit: 'unitMin' },
    { key: 'turn7', labelKey: 'ruleTurn7', min: 30, max: 240, unit: 'unitMin' },
    { key: 'buffer', labelKey: 'ruleBuffer', min: 0, max: 60, unit: 'unitMin' },
  ] },
  { id: 'limits', titleKey: 'rulesLimits', fields: [
    { key: 'maxCovers', labelKey: 'ruleMaxCovers', hintKey: 'ruleMaxCoversHint', min: 1, max: 500, unit: 'unitGuests', optional: true },
    { key: 'maxParty', labelKey: 'ruleMaxParty', min: 1, max: 50, unit: 'unitGuests' },
    { key: 'minNotice', labelKey: 'ruleMinNotice', min: 0, max: 1440, unit: 'unitMin' },
    { key: 'autoCancel', labelKey: 'ruleAutoCancel', min: 0, max: 120, unit: 'unitMin' },
  ] },
]
const FIELDS = GROUPS.flatMap(g => g.fields)
const SWITCHES = [
  { key: 'groupEnabled', labelKey: 'ruleGroup', hintKey: 'ruleGroupHint' },
  { key: 'allowWalkIn', labelKey: 'ruleWalkIn', hintKey: 'ruleWalkInHint' },
]

const isWhole = s => /^\d+$/.test(String(s).trim())

function toForm(rules) {
  const form = { slotStep: String(rules.slotStep) }
  for (const f of FIELDS) form[f.key] = rules[f.key] === null ? '' : String(rules[f.key])
  for (const s of SWITCHES) form[s.key] = rules[s.key]
  // null = every section is bookable online
  form.sectionIds = (rules.onlineSectionIds || rules.sections.map(s => s.id)).slice().sort()
  return form
}

function toRules(form, sections) {
  const rules = { slotStep: Number(form.slotStep) }
  for (const f of FIELDS) rules[f.key] = form[f.key] === '' ? null : Number(form[f.key])
  for (const s of SWITCHES) rules[s.key] = form[s.key]
  // Every section checked (or none exist) is stored as NULL so new sections are included automatically.
  rules.onlineSectionIds = sections.length === 0 || form.sectionIds.length === sections.length ? null : form.sectionIds
  return rules
}

// Settings -> Booking rules: availability_rules + restaurant_settings in one
// form with inline range messages and a single Save.
export default function BookingRulesForm({ restaurantId, onSaved }) {
  const { t } = useTranslation(['v2', 'dashboard'])
  const load = useCallback(() => fetchBookingRules(restaurantId), [restaurantId])
  const { data, error, loading, retry } = useLiveList(load, null, restaurantId)

  const [form, setForm] = useState(null)
  const [baseline, setBaseline] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (!data) return
    const next = toForm(data)
    setForm(next)
    setBaseline(next)
  }, [data])

  const errors = useMemo(() => {
    const out = {}
    if (!form) return out
    for (const f of FIELDS) {
      const v = form[f.key]
      if (f.optional && v === '') continue
      if (!isWhole(v) || Number(v) < f.min || Number(v) > f.max) out[f.key] = t('errRange', { min: f.min, max: f.max })
    }
    return out
  }, [form, t])
  const invalid = Object.keys(errors).length > 0
  const dirty = !!form && JSON.stringify(form) !== JSON.stringify(baseline)
  const sections = data ? data.sections : []

  const set = (key, value) => setForm(f => ({ ...f, [key]: value }))
  const toggleSection = id => setForm(f => ({
    ...f,
    sectionIds: (f.sectionIds.includes(id) ? f.sectionIds.filter(x => x !== id) : [...f.sectionIds, id]).sort(),
  }))

  async function handleSave() {
    if (saving || !dirty || invalid) return
    setSaving(true)
    setSaveError('')
    const { error: err } = await saveBookingRules(restaurantId, toRules(form, sections))
    setSaving(false)
    if (err) return setSaveError(v2Error(err, t))
    setBaseline(form)
    onSaved()
  }

  if (loading) {
    return (
      <div aria-hidden="true">
        {[0, 1, 2].map(i => <div key={i} className="skeleton v2-skel-card" />)}
      </div>
    )
  }
  if (!form) return <LoadError message={v2Error(error, t)} onRetry={retry} />

  const stepOptions = SLOT_STEPS.includes(Number(form.slotStep)) ? SLOT_STEPS : [...SLOT_STEPS, Number(form.slotStep)].sort((a, b) => a - b)

  return (
    <div className="v2-stack">
      <ErrorBanner message={saveError} onDismiss={() => setSaveError('')} />

      <section className="v2-card" aria-labelledby="v2-rules-options">
        <h2 id="v2-rules-options" className="dash-section-title">{t('rulesOptions')}</h2>
        {SWITCHES.map(s => (
          <div key={s.key} className="v2-switch-row">
            <div>
              <div className="v2-switch-label">{t(s.labelKey)}</div>
              <div className="v2-hint">{t(s.hintKey)}</div>
            </div>
            <Switch checked={form[s.key]} onChange={v => set(s.key, v)} label={t(s.labelKey)} />
          </div>
        ))}
      </section>

      {sections.length > 0 && (
        <section className="v2-card" aria-labelledby="v2-rules-sections">
          <h2 id="v2-rules-sections" className="dash-section-title">{t('rulesSections')}</h2>
          <p className="v2-hint">{t('ruleSectionsHint')}</p>
          <div className="v2-sections">
            {sections.map(s => (
              <label key={s.id} className="v2-check">
                <input type="checkbox" checked={form.sectionIds.includes(s.id)} onChange={() => toggleSection(s.id)} />
                <span>{s.name}</span>
              </label>
            ))}
          </div>
          {form.sectionIds.length === 0 && <div className="v2-field-error" role="status">{t('ruleNoSection')}</div>}
        </section>
      )}

      {GROUPS.map(g => (
        <section key={g.id} className="v2-card" aria-labelledby={`v2-rules-${g.id}`}>
          <h2 id={`v2-rules-${g.id}`} className="dash-section-title">{t(g.titleKey)}</h2>
          <div className="v2-fields">
            {g.slotStep && (
              <div className="v2-field">
                <label className="label" htmlFor="v2-slotStep">{t('ruleSlotStep')}</label>
                <select id="v2-slotStep" className="input" value={form.slotStep} onChange={e => set('slotStep', e.target.value)}>
                  {stepOptions.map(n => <option key={n} value={n}>{t('minutes', { count: n })}</option>)}
                </select>
              </div>
            )}
            {g.fields.map(f => (
              <div key={f.key} className="v2-field">
                <label className="label" htmlFor={`v2-${f.key}`}>{t(f.labelKey)}</label>
                <div className="v2-input-unit">
                  <input
                    id={`v2-${f.key}`}
                    type="number"
                    inputMode="numeric"
                    min={f.min}
                    max={f.max}
                    step={1}
                    className={`input${errors[f.key] ? ' is-invalid' : ''}`}
                    value={form[f.key]}
                    aria-invalid={!!errors[f.key]}
                    aria-describedby={errors[f.key] ? `v2-${f.key}-err` : undefined}
                    onChange={e => set(f.key, e.target.value)}
                  />
                  <span className="v2-unit">{t(f.unit)}</span>
                </div>
                {f.hintKey && !errors[f.key] && <div className="v2-hint v2-field-hint">{t(f.hintKey)}</div>}
                {errors[f.key] && <div id={`v2-${f.key}-err`} className="v2-field-error" role="alert">{errors[f.key]}</div>}
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="v2-card v2-card--muted" aria-labelledby="v2-rules-deposits">
        <div className="v2-switch-row">
          <div>
            <h2 id="v2-rules-deposits" className="dash-section-title">{t('depositsTitle')}</h2>
            <div className="v2-hint">{t('depositsHint')}</div>
          </div>
          <StatusPill tone="gold">{t('comingSoon')}</StatusPill>
        </div>
      </section>

      <div className="v2-savebar">
        <span className="v2-savebar-note" role="status">{invalid ? t('fixRules') : dirty ? t('unsaved') : ''}</span>
        <button type="button" className="btn btn-primary" disabled={!dirty || invalid || saving} onClick={handleSave}>
          {saving && <span className="spinner" aria-hidden="true" />}
          {t('saveRules')}
        </button>
      </div>
    </div>
  )
}
