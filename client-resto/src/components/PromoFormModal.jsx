import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { friendlyError, writeError } from '../lib/errors'
import useDialog from '../lib/useDialog'
import { dishName } from '../lib/dishName'
import { composeDescription, discountProblem, DISCOUNT_KINDS, parseDiscount } from '../features/v2/promoDiscount'
import {
  defaultWindow, FORM_STATUSES, MANAGERS_ONLY, STATUS_LABEL_KEYS, toLocalInput, TYPE_KEYS, TYPES,
} from '../features/v2/promoMeta'
import '../features/v2/styles.css'

// Order the fields are checked (and focused) in.
const FIELD_ORDER = ['name', 'title', 'discount', 'budget', 'daily_limit', 'dates']

/** { field: i18n key } for everything that stops the form from being saved; {} when it is fine. */
function validate(form, budgetLocked) {
  const e = {}
  if (!form.name.trim()) e.name = 'errNameRequired'
  if (!form.title.trim()) e.title = 'errTitleRequired'
  if (form.type === 'discount') {
    const problem = discountProblem(form.discount_kind, form.discount_value)
    if (problem) e.discount = problem === 'amount' ? 'errDiscountAmount' : 'errDiscountPercent'
  }
  if (!budgetLocked && (!form.budget || Number.isNaN(Number(form.budget)) || Number(form.budget) <= 0)) e.budget = 'errBudgetPositive'
  if (form.daily_limit && (Number.isNaN(Number(form.daily_limit)) || Number(form.daily_limit) <= 0)) e.daily_limit = 'errDailyLimitPositive'
  if (!form.starts_at || !form.ends_at) e.dates = 'errDatesRequired'
  else if (new Date(form.ends_at) <= new Date(form.starts_at)) e.dates = 'errEndAfterStart'
  return e
}

function initialForm(campaign) {
  const { kind, value, text } = parseDiscount(campaign?.description)
  const window = campaign ? { starts_at: toLocalInput(campaign.starts_at), ends_at: toLocalInput(campaign.ends_at) } : defaultWindow()
  return {
    name: campaign?.name || '',
    title: campaign?.title || '',
    description: text,
    type: campaign?.type || 'feed_placement',
    discount_kind: kind || 'percent',
    discount_value: value !== null ? String(value) : '',
    dish_id: campaign?.dish_id || '',
    budget: campaign?.budget?.toString() || '',
    daily_limit: campaign?.daily_limit?.toString() || '',
    ...window,
    status: campaign?.status || 'draft',
  }
}

// New / edit campaign. A new campaign starts today and runs seven days. Field errors appear after the first failed
// Save, sit under their own field, and go away as soon as that field is right (they are derived from the form).
export default function PromoFormModal({ campaign, dishes, restaurantId, onClose, onSaved }) {
  const { t, i18n } = useTranslation('dashboard')
  const isEdit = !!campaign
  const uid = useId()
  const fid = key => `${uid}-${key}`

  const [form, setForm] = useState(() => initialForm(campaign))
  const [saving, setSaving] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [error, setError] = useState('')

  // The form can only put a campaign into draft or paused. If it's already
  // active/completed/cancelled, that status came from Activate/Pause/Cancel
  // (manager-only buttons on the card) and stays locked here.
  const statusLocked = isEdit && !FORM_STATUSES.includes(campaign.status)
  // While a campaign is active its budget cannot change (sql/52 budget_locked): pause it first.
  const budgetLocked = isEdit && campaign.status === 'active'

  const errors = attempted ? validate(form, budgetLocked) : {}
  const dialogRef = useDialog(() => { if (!saving) onClose() })

  function update(key, val) {
    setForm(f => ({ ...f, [key]: val }))
  }

  const fieldError = key => (errors[key]
    ? <p id={fid(`${key}-err`)} className="v2-field-error" role="alert">{t(errors[key])}</p>
    : null)
  const invalidProps = (key, id = fid(key)) => (errors[key]
    ? { 'aria-invalid': true, 'aria-describedby': fid(`${key}-err`), id }
    : { id })

  async function handleSave() {
    const found = validate(form, budgetLocked)
    const first = FIELD_ORDER.find(k => found[k])
    if (first) {
      setAttempted(true)
      setError('')
      const target = first === 'dates' ? fid('ends') : fid(first)
      document.getElementById(target)?.focus()
      return
    }
    setSaving(true)
    setError('')

    // restaurant_id is intentionally left out of `row`: it must never be sent
    // on an update (a campaign could otherwise be moved to another
    // restaurant), and on insert it's added explicitly from the staff row.
    const row = {
      name: form.name.trim(),
      title: form.title.trim(),
      // A discount carries its value as a prefix of the description (features/v2/promoDiscount.js).
      description: composeDescription({ type: form.type, kind: form.discount_kind, value: form.discount_value, text: form.description }),
      type: form.type,
      dish_id: form.dish_id || null,
      daily_limit: form.daily_limit ? Number(form.daily_limit) : null,
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: new Date(form.ends_at).toISOString(),
      status: form.status,
    }
    // Not sent while locked: the stored budget stays as it is whatever the input shows.
    if (!budgetLocked) row.budget = Number(form.budget)

    const err = isEdit
      ? writeError(await supabase.from('ad_campaigns').update(row).eq('id', campaign.id).select('id'))
      : (await supabase.from('ad_campaigns').insert({ ...row, restaurant_id: restaurantId })).error

    if (err) {
      setError(friendlyError(err, t, MANAGERS_ONLY))
      setSaving(false)
      return
    }
    onSaved()
    onClose()
  }

  const isDiscount = form.type === 'discount'
  const percent = form.discount_kind === 'percent'

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal promo-modal" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={fid('title')}>
        <div className="promo-head">
          <h2 id={fid('title')} className="promo-title">{isEdit ? t('editCampaign') : t('newCampaign')}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label={t('common:close')}>✕</button>
        </div>

        <div className="promo-body">
          <div>
            <label className="label" htmlFor={fid('name')}>{t('name')} *</label>
            <input {...invalidProps('name')} className={`input${errors.name ? ' is-invalid' : ''}`} value={form.name}
              onChange={e => update('name', e.target.value)} placeholder={t('namePlaceholder')} />
            {fieldError('name')}
          </div>

          <div>
            <label className="label" htmlFor={fid('title-field')}>{t('title')} *</label>
            <input {...invalidProps('title', fid('title-field'))} className={`input${errors.title ? ' is-invalid' : ''}`} value={form.title}
              onChange={e => update('title', e.target.value)} placeholder={t('titlePlaceholder')} />
            {fieldError('title')}
          </div>

          <div>
            <label className="label" htmlFor={fid('description')}>{t('description')}</label>
            <textarea id={fid('description')} className="input promo-textarea" rows={2} value={form.description}
              onChange={e => update('description', e.target.value)} placeholder={t('descPromoPlaceholder')} />
          </div>

          <div role="group" aria-labelledby={fid('type')}>
            <span id={fid('type')} className="label">{t('type')} *</span>
            <div className="promo-chips">
              {TYPES.map(tp => (
                <button type="button" key={tp} className={`chip promo-chip${form.type === tp ? ' active' : ''}`}
                  aria-pressed={form.type === tp} onClick={() => update('type', tp)}>
                  {t(`dashboard:${TYPE_KEYS[tp]}`)}
                </button>
              ))}
            </div>
          </div>

          {isDiscount && (
            <div role="group" aria-labelledby={fid('discount-label')}>
              <span id={fid('discount-label')} className="label">{t('discountValue')} *</span>
              <div className="promo-discount">
                <div className="promo-chips">
                  {DISCOUNT_KINDS.map(k => (
                    <button type="button" key={k} className={`chip promo-chip${form.discount_kind === k ? ' active' : ''}`}
                      aria-pressed={form.discount_kind === k} onClick={() => update('discount_kind', k)}>
                      {t(k === 'percent' ? 'discountPercent' : 'discountAmount')}
                    </button>
                  ))}
                </div>
                <div className="v2-input-unit promo-discount-input">
                  <input {...invalidProps('discount')} className={`input${errors.discount ? ' is-invalid' : ''}`} type="number" inputMode="decimal"
                    step={percent ? '1' : '0.01'} min="0" max={percent ? '100' : undefined} value={form.discount_value}
                    onChange={e => update('discount_value', e.target.value)} placeholder={percent ? '15' : '5.00'}
                    aria-label={t('discountValue')} />
                  <span className="v2-unit" aria-hidden="true">{percent ? '%' : '₼'}</span>
                </div>
              </div>
              {fieldError('discount')}
              <p className="field-hint">{t('discountHint')}</p>
            </div>
          )}

          <div>
            <label className="label" htmlFor={fid('dish')}>{t('linkedDish')}</label>
            <select id={fid('dish')} className="input" value={form.dish_id} onChange={e => update('dish_id', e.target.value)}>
              <option value="">{t('none')}</option>
              {dishes.map(d => <option key={d.id} value={d.id}>{dishName(d, i18n.language)}</option>)}
            </select>
          </div>

          <div className="promo-pair">
            <div>
              <label className="label" htmlFor={fid('budget')}>{t('budgetLabel')} *</label>
              <input {...invalidProps('budget')} className={`input${errors.budget ? ' is-invalid' : ''}`} type="number" inputMode="decimal"
                step="0.01" min="0" value={form.budget} disabled={budgetLocked}
                aria-describedby={errors.budget ? fid('budget-err') : (budgetLocked ? fid('budget-hint') : undefined)}
                onChange={e => update('budget', e.target.value)} placeholder="0.00" />
              {fieldError('budget')}
              {budgetLocked && <p id={fid('budget-hint')} className="field-hint">{t('budgetLockedHint')}</p>}
            </div>
            <div>
              <label className="label" htmlFor={fid('daily_limit')}>{t('dailyLimit')}</label>
              <input {...invalidProps('daily_limit')} className={`input${errors.daily_limit ? ' is-invalid' : ''}`} type="number" inputMode="decimal"
                step="0.01" min="0" value={form.daily_limit} onChange={e => update('daily_limit', e.target.value)} placeholder="–" />
              {fieldError('daily_limit')}
            </div>
          </div>

          <div>
            <div className="promo-dates">
              <div>
                <label className="label" htmlFor={fid('starts')}>{t('starts')} *</label>
                <input id={fid('starts')} className={`input${errors.dates ? ' is-invalid' : ''}`} type="datetime-local" value={form.starts_at}
                  aria-invalid={errors.dates ? true : undefined} aria-describedby={errors.dates ? fid('dates-err') : undefined}
                  onChange={e => update('starts_at', e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor={fid('ends')}>{t('ends')} *</label>
                <input id={fid('ends')} className={`input${errors.dates ? ' is-invalid' : ''}`} type="datetime-local" value={form.ends_at}
                  aria-invalid={errors.dates ? true : undefined} aria-describedby={errors.dates ? fid('dates-err') : undefined}
                  onChange={e => update('ends_at', e.target.value)} />
              </div>
            </div>
            {fieldError('dates')}
          </div>

          {/* Status: only draft/paused here. Activate, Pause and Cancel are
              explicit manager-only buttons on the campaign card. */}
          <div>
            <label className="label" htmlFor={fid('status')}>{t('status')}</label>
            {statusLocked ? (
              <div id={fid('status')} className="input promo-status-locked">
                {t(`dashboard:${STATUS_LABEL_KEYS[form.status]}`)}
              </div>
            ) : (
              <select id={fid('status')} className="input" value={form.status} onChange={e => update('status', e.target.value)}>
                {FORM_STATUSES.map(k => (
                  <option key={k} value={k}>{t(`dashboard:${STATUS_LABEL_KEYS[k]}`)}</option>
                ))}
              </select>
            )}
          </div>

          {error && <p role="alert" className="v2-field-error">{error}</p>}

          <div className="promo-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>{t('cancel')}</button>
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <><span className="spinner" /> {t('saving')}</> : isEdit ? t('saveChanges') : t('createCampaign')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
