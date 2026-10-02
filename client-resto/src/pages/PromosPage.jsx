import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatPrice } from '@shared/helpers'
import { localeTag } from '../lib/time'
import { debounce } from '../lib/debounce'
import { subscribeResync } from '../lib/realtime'
import { friendlyError, writeError } from '../lib/errors'
import ActionBanner from '../components/ActionBanner'
import useDialog from '../lib/useDialog'

// Writes to ad_campaigns are manager-only (RLS); a non-manager's failed write is
// reported as this instead of a raw policy error.
const MANAGERS_ONLY = { permission: 'errManagersOnly' }

const FILTERS = ['all', 'draft', 'active', 'paused', 'completed', 'cancelled']

const STATUS_STYLE = {
  draft:     { color: 'var(--t2)',  bg: 'var(--s3)',                border: 'var(--border)' },
  active:    { color: '#22c55e',    bg: 'rgba(34,197,94,0.08)',     border: 'rgba(34,197,94,0.18)' },
  paused:    { color: '#BA7517',    bg: 'rgba(186,117,23,0.08)',    border: 'rgba(186,117,23,0.18)' },
  completed: { color: '#3b82f6',    bg: 'rgba(59,130,246,0.08)',    border: 'rgba(59,130,246,0.18)' },
  cancelled: { color: '#A32D2D',    bg: 'rgba(239,68,68,0.08)',     border: 'rgba(239,68,68,0.18)' },
}

const TYPES = ['feed_placement', 'discount', 'highlight', 'banner']
const TYPE_KEYS = {
  feed_placement: 'typeFeed', discount: 'typeDiscount',
  highlight: 'typeHighlight', banner: 'typeBanner',
}
const STATUS_LABEL_KEYS = {
  draft: 'promoStatusDraft', active: 'promoStatusActive', paused: 'promoStatusPaused',
  completed: 'promoStatusCompleted', cancelled: 'promoStatusCancelled',
}
// The campaign form only ever creates/edits into these two statuses; Activate,
// Pause and Cancel (below) are the only paths to active/completed/cancelled,
// and are manager-only actions.
const FORM_STATUSES = ['draft', 'paused']

// The status a campaign really has right now. Nothing in the database moves an active campaign to completed when its
// end date passes (guests just stop seeing it), so an active campaign past its end date reads Completed here: in the
// chips, the counts and the badge. The stored status is unchanged (the edit form still works from it).
function effectiveStatus(c, nowMs = Date.now()) {
  if (c.status === 'active' && c.ends_at && new Date(c.ends_at).getTime() < nowMs) return 'completed'
  return c.status
}

function fmtDate(iso, lang) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString(localeTag(lang), { day: 'numeric', month: 'short', year: 'numeric' })
}

function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export default function PromosPage() {
  const { restaurantId, isManager } = useAuth()
  const { t } = useTranslation(['dashboard', 'common'])
  const [campaigns, setCampaigns] = useState([])
  const [dishes, setDishes] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(null)
  const [actionError, setActionError] = useState('')

  const [showAdd, setShowAdd] = useState(false)
  const [editCampaign, setEditCampaign] = useState(null)
  const [cancelCampaign, setCancelCampaign] = useState(null)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    if (!restaurantId) return
    load()

    // Every impression / click on the consumer app updates a campaign row, so
    // this fires constantly for an active campaign: keep the reload debounced.
    const debouncedLoad = debounce(load, 1000)
    const channel = supabase
      .channel(`dash-promos-${restaurantId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'ad_campaigns',
        filter: `restaurant_id=eq.${restaurantId}`,
      }, debouncedLoad)

    const stop = subscribeResync(channel, debouncedLoad)
    return () => { debouncedLoad.cancel(); stop() }
  }, [restaurantId])

  async function load() {
    const [{ data: c }, { data: d }] = await Promise.all([
      supabase.from('ad_campaigns').select('*, dishes(name)')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false }),
      supabase.from('dishes').select('id, name')
        .eq('restaurant_id', restaurantId)
        .order('name'),
    ])
    setCampaigns(c || [])
    setDishes(d || [])
    setLoading(false)
  }

  async function updateStatus(id, status) {
    setActing(id)
    setActionError('')
    const error = writeError(await supabase.from('ad_campaigns').update({ status }).eq('id', id).select('id'))
    if (error) {
      setActionError(friendlyError(error, t, MANAGERS_ONLY))
    } else {
      setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status } : c))
    }
    setActing(null)
  }

  async function handleCancel(id) {
    setCancelling(true)
    await updateStatus(id, 'cancelled')
    setCancelCampaign(null)
    setCancelling(false)
  }

  const nowMs = Date.now()
  const filtered = filter === 'all' ? campaigns : campaigns.filter(c => effectiveStatus(c, nowMs) === filter)

  const statusCounts = {}
  for (const c of campaigns) {
    const st = effectiveStatus(c, nowMs)
    statusCounts[st] = (statusCounts[st] || 0) + 1
  }

  return (
    <div style={{ padding: '1.25rem' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem', paddingBottom:'1rem', borderBottom:'1px solid var(--border)' }}>
        <div>
          <h1 className="page-title">{t('dashboard:promosTitle')}</h1>
          <span style={{ fontSize:'0.72rem', color:'var(--t3)', marginTop:2, display:'block' }}>
            {t('dashboard:promosSummary', { active: statusCounts.active || 0, total: campaigns.length })}
          </span>
        </div>
        {isManager && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)} style={{ gap:'0.35rem' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            {t('dashboard:newCampaign')}
          </button>
        )}
      </div>

      {!isManager && (
        <div style={{
          padding:'0.6rem 0.85rem', borderRadius:10, marginBottom:'1.25rem',
          background:'var(--s2)', border:'1px solid var(--border)',
          color:'var(--t2)', fontSize:'0.78rem',
        }}>
          {t('dashboard:managerOnlyNotice')}
        </div>
      )}

      {actionError && <ActionBanner message={actionError} onClose={() => setActionError('')} />}

      {/* Status filter chips */}
      <div className="no-scrollbar" style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', marginBottom: '1.25rem' }}>
        {FILTERS.map(f => {
          const cnt = f === 'all' ? campaigns.length : (statusCounts[f] || 0)
          const sm = f !== 'all' ? STATUS_STYLE[f] : null
          const chipLabel = f === 'all' ? t('dashboard:filterAll') : t(`dashboard:${STATUS_LABEL_KEYS[f]}`)
          return (
            <button key={f} className={`chip${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
              {sm && <span style={{ width: 6, height: 6, borderRadius: '50%', background: sm.color, display: 'inline-block', marginRight: 4 }} />}
              {chipLabel} ({cnt})
            </button>
          )
        })}
      </div>

      {/* Campaign list */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 96, borderRadius: 12 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">📣</div>
          {campaigns.length === 0 ? t('dashboard:noCampaignsYet') : t('dashboard:noCampaignsMatch')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.map(c => (
            <CampaignCard key={c.id} campaign={c} status={effectiveStatus(c, nowMs)}
              canManage={isManager}
              acting={acting === c.id}
              onEdit={() => setEditCampaign(c)}
              onActivate={() => updateStatus(c.id, 'active')}
              onPause={() => updateStatus(c.id, 'paused')}
              onCancel={() => setCancelCampaign(c)}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      {isManager && showAdd && (
        <PromoFormModal dishes={dishes} restaurantId={restaurantId}
          onClose={() => setShowAdd(false)} onSaved={load} />
      )}
      {isManager && editCampaign && (
        <PromoFormModal campaign={editCampaign} dishes={dishes} restaurantId={restaurantId}
          onClose={() => setEditCampaign(null)} onSaved={load} />
      )}
      {isManager && cancelCampaign && (
        <CancelConfirmModal campaignName={cancelCampaign.name} loading={cancelling}
          onConfirm={() => handleCancel(cancelCampaign.id)}
          onCancel={() => setCancelCampaign(null)} />
      )}
    </div>
  )
}

function CampaignCard({ campaign: c, status, canManage, acting, onEdit, onActivate, onPause, onCancel }) {
  const { t, i18n } = useTranslation('dashboard')
  const s = STATUS_STYLE[status] || STATUS_STYLE.draft
  const budget = Number(c.budget) || 0
  const spent = Number(c.spent) || 0
  const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0
  const canActivate = ['draft', 'paused'].includes(status)
  const canPause = status === 'active'
  const canCancel = ['draft', 'active', 'paused'].includes(status)

  return (
    <div style={{
      background:'var(--s2)', borderRadius:14,
      border:'1px solid var(--border)', overflow:'hidden',
      transition:'transform 0.15s, border-color 0.2s',
    }}
      onMouseEnter={e => e.currentTarget.style.transform='translateY(-1px)'}
      onMouseLeave={e => e.currentTarget.style.transform='translateY(0)'}
    >
      <div style={{ height: 2, background: s.color, opacity: 0.5 }} />

      <div style={{ padding: '0.85rem 1rem' }}>
        {/* Top row: name/title + chips */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.name}
            </div>
            {c.title && (
              <div style={{ fontSize: '0.75rem', color: 'var(--t2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.title}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
            <span style={{
              fontSize: '0.6rem', fontWeight: 600, padding: '2px 7px', borderRadius: 100,
              background: 'var(--s3)', color: 'var(--t2)', border: '1px solid var(--border)',
            }}>{t(`dashboard:${TYPE_KEYS[c.type] || 'typeFeed'}`)}</span>
            <span style={{
              fontSize: '0.58rem', fontWeight: 700, padding: '2px 7px', borderRadius: 4,
              background: s.bg, color: s.color, border: `1px solid ${s.border}`,
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>{t(`dashboard:${STATUS_LABEL_KEYS[status] || 'promoStatusDraft'}`)}</span>
          </div>
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.72rem', color: 'var(--t3)', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          <span>{fmtDate(c.starts_at, i18n.language)} → {fmtDate(c.ends_at, i18n.language)}</span>
          <span>{t('dashboard:impressions', { count: c.impressions || 0 })}</span>
          <span>{t('dashboard:clicks', { count: c.clicks || 0 })}</span>
          {c.dishes?.name && <span style={{ color: 'var(--gold)' }}>🍽 {c.dishes.name}</span>}
        </div>

        {/* Budget bar */}
        <div style={{ marginTop:'0.65rem' }}>
          <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.7rem', color:'var(--t2)', marginBottom:4 }}>
            <span>{t('dashboard:spent', { price: formatPrice(spent) })}</span>
            <span style={{ color: pct >= 90 ? 'var(--red)' : 'var(--t2)' }}>
              {t('dashboard:budget', { price: formatPrice(budget) })}{c.daily_limit ? ` · ${t('dashboard:perDay', { price: formatPrice(c.daily_limit) })}` : ''}
            </span>
          </div>
          <div style={{ height:5, borderRadius:100, background:'var(--s3)', overflow:'hidden' }}>
            <div style={{
              height:'100%', width:`${pct}%`, borderRadius:100,
              background: pct >= 90 ? 'var(--red)' : pct >= 70 ? 'var(--warning)' : s.color,
              opacity:0.75, transition:'width 0.4s',
            }} />
          </div>
        </div>

        {/* Actions */}
        {canManage && (
          <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.7rem', alignItems: 'center' }}>
            {canActivate && (
              <button className="btn btn-primary" style={{ fontSize: '0.74rem', padding: '0.35rem 0.85rem' }}
                onClick={onActivate} disabled={acting}>
                {acting ? <span className="spinner" style={{ width: 12, height: 12 }} /> : t('dashboard:activate')}
              </button>
            )}
            {canPause && (
              <button className="btn btn-ghost" style={{ fontSize: '0.74rem', padding: '0.35rem 0.85rem' }}
                onClick={onPause} disabled={acting}>
                {acting ? <span className="spinner" style={{ width: 12, height: 12 }} /> : t('dashboard:pause')}
              </button>
            )}
            {canCancel && (
              <button className="btn btn-danger" style={{ fontSize: '0.74rem', padding: '0.35rem 0.85rem' }}
                onClick={onCancel} disabled={acting}>{t('dashboard:cancel')}</button>
            )}
            <button type="button" className="icon-btn" onClick={onEdit} title={t('dashboard:edit')}
              aria-label={t('dashboard:edit')} style={{ marginLeft: 'auto' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function PromoFormModal({ campaign, dishes, restaurantId, onClose, onSaved }) {
  const { t } = useTranslation('dashboard')
  const isEdit = !!campaign
  const uid = useId()
  const fid = key => `${uid}-${key}`

  const [form, setForm] = useState({
    name: campaign?.name || '',
    title: campaign?.title || '',
    description: campaign?.description || '',
    type: campaign?.type || 'feed_placement',
    dish_id: campaign?.dish_id || '',
    budget: campaign?.budget?.toString() || '',
    daily_limit: campaign?.daily_limit?.toString() || '',
    starts_at: toLocalInput(campaign?.starts_at),
    ends_at: toLocalInput(campaign?.ends_at),
    status: campaign?.status || 'draft',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // The form can only put a campaign into draft or paused. If it's already
  // active/completed/cancelled, that status came from Activate/Pause/Cancel
  // (manager-only buttons on the card) and stays locked here.
  const statusLocked = isEdit && !FORM_STATUSES.includes(campaign.status)
  // While a campaign is active its budget cannot change (sql/52 budget_locked): pause it first.
  const budgetLocked = isEdit && campaign.status === 'active'

  const dialogRef = useDialog(() => { if (!saving) onClose() })

  function update(key, val) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function handleSave() {
    if (!form.name.trim()) { setError(t('errNameRequired')); return }
    if (!form.title.trim()) { setError(t('errTitleRequired')); return }
    if (!budgetLocked && (!form.budget || isNaN(Number(form.budget)) || Number(form.budget) <= 0)) { setError(t('errBudgetPositive')); return }
    if (form.daily_limit && (isNaN(Number(form.daily_limit)) || Number(form.daily_limit) <= 0)) { setError(t('errDailyLimitPositive')); return }
    if (!form.starts_at || !form.ends_at) { setError(t('errDatesRequired')); return }
    if (new Date(form.ends_at) <= new Date(form.starts_at)) { setError(t('errEndAfterStart')); return }
    setSaving(true)
    setError('')

    // restaurant_id is intentionally left out of `row`: it must never be sent
    // on an update (a campaign could otherwise be moved to another
    // restaurant), and on insert it's added explicitly from the staff row.
    const row = {
      name: form.name.trim(),
      title: form.title.trim(),
      description: form.description.trim() || null,
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

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={fid('title')}>
        <div style={{ padding: '1.25rem 1.25rem 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 id={fid('title')} style={{ fontSize: '1.1rem', fontWeight: 800 }}>
              {isEdit ? t('editCampaign') : t('newCampaign')}
            </h2>
            <button type="button" className="modal-close" onClick={onClose} aria-label={t('common:close')}>✕</button>
          </div>
        </div>

        <div style={{ padding: '0 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Name */}
          <div>
            <label className="label" htmlFor={fid('name')}>{t('name')} *</label>
            <input id={fid('name')} className="input" value={form.name} onChange={e => update('name', e.target.value)}
              placeholder={t('namePlaceholder')} />
          </div>

          {/* Title */}
          <div>
            <label className="label" htmlFor={fid('title-field')}>{t('title')} *</label>
            <input id={fid('title-field')} className="input" value={form.title} onChange={e => update('title', e.target.value)}
              placeholder={t('titlePlaceholder')} />
          </div>

          {/* Description */}
          <div>
            <label className="label" htmlFor={fid('description')}>{t('description')}</label>
            <textarea id={fid('description')} className="input" rows={2} value={form.description}
              onChange={e => update('description', e.target.value)}
              placeholder={t('descPromoPlaceholder')} style={{ resize: 'vertical' }} />
          </div>

          {/* Type */}
          <div role="group" aria-labelledby={fid('type')}>
            <span id={fid('type')} className="label">{t('type')} *</span>
            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
              {TYPES.map(tp => (
                <button type="button" key={tp} className={`chip${form.type === tp ? ' active' : ''}`}
                  aria-pressed={form.type === tp}
                  onClick={() => update('type', tp)}
                  style={{ fontSize: '0.72rem', padding: '0.3rem 0.65rem' }}>
                  {t(`dashboard:${TYPE_KEYS[tp]}`)}
                </button>
              ))}
            </div>
          </div>

          {/* Dish */}
          <div>
            <label className="label" htmlFor={fid('dish')}>{t('linkedDish')}</label>
            <select id={fid('dish')} className="input" value={form.dish_id}
              onChange={e => update('dish_id', e.target.value)} style={{ cursor: 'pointer' }}>
              <option value="">{t('none')}</option>
              {dishes.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          {/* Budget + daily limit */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <div>
              <label className="label" htmlFor={fid('budget')}>{t('budgetLabel')} *</label>
              <input id={fid('budget')} className="input" type="number" step="0.01" min="0" value={form.budget}
                disabled={budgetLocked} aria-describedby={budgetLocked ? 'promo-budget-hint' : undefined}
                onChange={e => update('budget', e.target.value)} placeholder="0.00" />
              {budgetLocked && <p id="promo-budget-hint" className="field-hint">{t('budgetLockedHint')}</p>}
            </div>
            <div>
              <label className="label" htmlFor={fid('daily')}>{t('dailyLimit')}</label>
              <input id={fid('daily')} className="input" type="number" step="0.01" min="0" value={form.daily_limit}
                onChange={e => update('daily_limit', e.target.value)} placeholder="–" />
            </div>
          </div>

          {/* Dates */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <div>
              <label className="label" htmlFor={fid('starts')}>{t('starts')} *</label>
              <input id={fid('starts')} className="input" type="datetime-local" value={form.starts_at}
                onChange={e => update('starts_at', e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor={fid('ends')}>{t('ends')} *</label>
              <input id={fid('ends')} className="input" type="datetime-local" value={form.ends_at}
                onChange={e => update('ends_at', e.target.value)} />
            </div>
          </div>

          {/* Status: only draft/paused here. Activate, Pause and Cancel are
              explicit manager-only buttons on the campaign card. */}
          <div>
            <label className="label" htmlFor={fid('status')}>{t('status')}</label>
            {statusLocked ? (
              <div id={fid('status')} className="input" style={{ display: 'flex', alignItems: 'center', color: 'var(--t3)', cursor: 'default' }}>
                {t(`dashboard:${STATUS_LABEL_KEYS[form.status]}`)}
              </div>
            ) : (
              <select id={fid('status')} className="input" value={form.status}
                onChange={e => update('status', e.target.value)} style={{ cursor: 'pointer' }}>
                {FORM_STATUSES.map(k => (
                  <option key={k} value={k}>{t(`dashboard:${STATUS_LABEL_KEYS[k]}`)}</option>
                ))}
              </select>
            )}
          </div>

          {error && <p role="alert" style={{ color: 'var(--red)', fontSize: '0.78rem' }}>{error}</p>}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', paddingTop: '0.25rem' }}>
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

function CancelConfirmModal({ campaignName, loading, onConfirm, onCancel }) {
  const { t } = useTranslation('dashboard')
  const uid = useId()
  const dialogRef = useDialog(() => { if (!loading) onCancel() })

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !loading && onCancel()}>
      <div className="modal" ref={dialogRef} role="dialog" aria-modal="true"
        aria-labelledby={`${uid}-title`} aria-describedby={`${uid}-body`} style={{ padding: '1.75rem' }}>
        <h2 id={`${uid}-title`} style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.75rem' }}>{t('cancelCampaign')}</h2>
        <p id={`${uid}-body`} style={{ fontSize: '0.88rem', color: 'var(--t2)', lineHeight: 1.5 }}>
          {t('cancelCampaignConfirm', { name: campaignName })}
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={loading}>{t('keep')}</button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? <><span className="spinner" /> {t('cancelling')}</> : t('cancelCampaign')}
          </button>
        </div>
      </div>
    </div>
  )
}
