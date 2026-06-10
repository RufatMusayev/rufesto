import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatPrice } from '@shared/helpers'

const FILTERS = ['all', 'draft', 'active', 'paused', 'completed', 'cancelled']

const STATUS_STYLE = {
  draft:     { label: 'Draft',     color: 'var(--t2)',  bg: 'var(--s3)',                border: 'var(--border)' },
  active:    { label: 'Active',    color: '#22c55e',    bg: 'rgba(34,197,94,0.08)',     border: 'rgba(34,197,94,0.18)' },
  paused:    { label: 'Paused',    color: '#BA7517',    bg: 'rgba(186,117,23,0.08)',    border: 'rgba(186,117,23,0.18)' },
  completed: { label: 'Completed', color: '#3b82f6',    bg: 'rgba(59,130,246,0.08)',    border: 'rgba(59,130,246,0.18)' },
  cancelled: { label: 'Cancelled', color: '#A32D2D',    bg: 'rgba(239,68,68,0.08)',     border: 'rgba(239,68,68,0.18)' },
}

const TYPES = [
  { value: 'feed_placement', label: 'Feed Placement' },
  { value: 'discount',       label: 'Discount' },
  { value: 'highlight',      label: 'Highlight' },
  { value: 'banner',         label: 'Banner' },
]
const TYPE_LABEL = Object.fromEntries(TYPES.map(t => [t.value, t.label]))

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export default function PromosPage() {
  const { restaurantId } = useAuth()
  const [campaigns, setCampaigns] = useState([])
  const [dishes, setDishes] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(null)

  const [showAdd, setShowAdd] = useState(false)
  const [editCampaign, setEditCampaign] = useState(null)
  const [cancelCampaign, setCancelCampaign] = useState(null)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    if (!restaurantId) return
    load()

    const channel = supabase
      .channel(`dash-promos-${restaurantId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'ad_campaigns',
        filter: `restaurant_id=eq.${restaurantId}`,
      }, () => load())
      .subscribe()

    return () => supabase.removeChannel(channel)
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
    const { error } = await supabase.from('ad_campaigns').update({ status }).eq('id', id)
    if (!error) {
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

  const filtered = filter === 'all' ? campaigns : campaigns.filter(c => c.status === filter)

  const statusCounts = {}
  for (const c of campaigns) statusCounts[c.status] = (statusCounts[c.status] || 0) + 1

  return (
    <div style={{ padding: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div>
          <h1 className="page-title">Promos</h1>
          <span style={{ fontSize: '0.75rem', color: 'var(--t3)' }}>
            {statusCounts.active || 0} active · {campaigns.length} total
          </span>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)} style={{ gap: '0.35rem' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Campaign
        </button>
      </div>

      {/* Status filter chips */}
      <div className="no-scrollbar" style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', marginBottom: '1.25rem' }}>
        {FILTERS.map(f => {
          const cnt = f === 'all' ? campaigns.length : (statusCounts[f] || 0)
          const sm = f !== 'all' ? STATUS_STYLE[f] : null
          return (
            <button key={f} className={`chip${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
              {sm && <span style={{ width: 6, height: 6, borderRadius: '50%', background: sm.color, display: 'inline-block', marginRight: 4 }} />}
              {f === 'all' ? 'All' : sm.label} ({cnt})
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
          {campaigns.length === 0 ? 'No campaigns yet. Create your first promotion.' : 'No campaigns match filter'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.map(c => (
            <CampaignCard key={c.id} campaign={c}
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
      {showAdd && (
        <PromoFormModal dishes={dishes} restaurantId={restaurantId}
          onClose={() => setShowAdd(false)} onSaved={load} />
      )}
      {editCampaign && (
        <PromoFormModal campaign={editCampaign} dishes={dishes} restaurantId={restaurantId}
          onClose={() => setEditCampaign(null)} onSaved={load} />
      )}
      {cancelCampaign && (
        <CancelConfirmModal campaignName={cancelCampaign.name} loading={cancelling}
          onConfirm={() => handleCancel(cancelCampaign.id)}
          onCancel={() => setCancelCampaign(null)} />
      )}
    </div>
  )
}

function CampaignCard({ campaign: c, acting, onEdit, onActivate, onPause, onCancel }) {
  const s = STATUS_STYLE[c.status] || STATUS_STYLE.draft
  const budget = Number(c.budget) || 0
  const spent = Number(c.spent) || 0
  const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0
  const canActivate = ['draft', 'paused'].includes(c.status)
  const canPause = c.status === 'active'
  const canCancel = ['draft', 'active', 'paused'].includes(c.status)

  return (
    <div style={{
      background: 'var(--s2)', borderRadius: 14,
      border: '1px solid var(--border)', overflow: 'hidden',
    }}>
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
            }}>{TYPE_LABEL[c.type] || c.type}</span>
            <span style={{
              fontSize: '0.58rem', fontWeight: 700, padding: '2px 7px', borderRadius: 4,
              background: s.bg, color: s.color, border: `1px solid ${s.border}`,
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>{s.label}</span>
          </div>
        </div>

        {/* Meta row */}
        <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.72rem', color: 'var(--t3)', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          <span>{fmtDate(c.starts_at)} → {fmtDate(c.ends_at)}</span>
          <span>{c.impressions || 0} impressions</span>
          <span>{c.clicks || 0} clicks</span>
          {c.dishes?.name && <span style={{ color: 'var(--gold)' }}>🍽 {c.dishes.name}</span>}
        </div>

        {/* Budget bar */}
        <div style={{ marginTop: '0.6rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--t2)', marginBottom: 3 }}>
            <span>{formatPrice(spent)} spent</span>
            <span>{formatPrice(budget)} budget{c.daily_limit ? ` · ${formatPrice(c.daily_limit)}/day` : ''}</span>
          </div>
          <div style={{ height: 4, borderRadius: 100, background: 'var(--s3)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, borderRadius: 100, background: s.color, opacity: 0.7, transition: 'width 0.3s' }} />
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.7rem', alignItems: 'center' }}>
          {canActivate && (
            <button className="btn btn-primary" style={{ fontSize: '0.74rem', padding: '0.35rem 0.85rem' }}
              onClick={onActivate} disabled={acting}>
              {acting ? <span className="spinner" style={{ width: 12, height: 12 }} /> : 'Activate'}
            </button>
          )}
          {canPause && (
            <button className="btn btn-ghost" style={{ fontSize: '0.74rem', padding: '0.35rem 0.85rem' }}
              onClick={onPause} disabled={acting}>
              {acting ? <span className="spinner" style={{ width: 12, height: 12 }} /> : 'Pause'}
            </button>
          )}
          {canCancel && (
            <button className="btn btn-danger" style={{ fontSize: '0.74rem', padding: '0.35rem 0.85rem' }}
              onClick={onCancel} disabled={acting}>Cancel</button>
          )}
          <button onClick={onEdit} title="Edit" style={{
            width: 30, height: 30, borderRadius: 8, marginLeft: 'auto',
            background: 'none', border: 'none', color: 'var(--t3)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'color 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--t1)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--t3)'}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

function PromoFormModal({ campaign, dishes, restaurantId, onClose, onSaved }) {
  const isEdit = !!campaign

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

  useEffect(() => {
    document.body.classList.add('modal-open')
    return () => document.body.classList.remove('modal-open')
  }, [])

  function update(key, val) {
    setForm(f => ({ ...f, [key]: val }))
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required'); return }
    if (!form.title.trim()) { setError('Title is required'); return }
    if (!form.budget || isNaN(Number(form.budget)) || Number(form.budget) <= 0) { setError('Budget must be greater than 0'); return }
    if (form.daily_limit && (isNaN(Number(form.daily_limit)) || Number(form.daily_limit) <= 0)) { setError('Daily limit must be greater than 0'); return }
    if (!form.starts_at || !form.ends_at) { setError('Start and end dates are required'); return }
    if (new Date(form.ends_at) <= new Date(form.starts_at)) { setError('End date must be after start date'); return }
    setSaving(true)
    setError('')

    const row = {
      restaurant_id: restaurantId,
      name: form.name.trim(),
      title: form.title.trim(),
      description: form.description.trim() || null,
      type: form.type,
      dish_id: form.dish_id || null,
      budget: Number(form.budget),
      daily_limit: form.daily_limit ? Number(form.daily_limit) : null,
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: new Date(form.ends_at).toISOString(),
      status: form.status,
    }

    const { error: err } = isEdit
      ? await supabase.from('ad_campaigns').update(row).eq('id', campaign.id)
      : await supabase.from('ad_campaigns').insert(row)

    if (err) {
      setError(err.message)
      setSaving(false)
      return
    }
    onSaved()
    onClose()
  }

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div style={{ padding: '1.25rem 1.25rem 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>
              {isEdit ? 'Edit Campaign' : 'New Campaign'}
            </h2>
            <button onClick={onClose} style={{
              background: 'none', border: 'none', color: 'var(--t3)',
              fontSize: '1.2rem', cursor: 'pointer', padding: 4,
            }}>✕</button>
          </div>
        </div>

        <div style={{ padding: '0 1.25rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Name */}
          <div>
            <label className="label">Name *</label>
            <input className="input" value={form.name} onChange={e => update('name', e.target.value)}
              placeholder="e.g. Summer Lunch Promo" />
          </div>

          {/* Title */}
          <div>
            <label className="label">Title *</label>
            <input className="input" value={form.title} onChange={e => update('title', e.target.value)}
              placeholder="Public headline shown to diners" />
          </div>

          {/* Description */}
          <div>
            <label className="label">Description</label>
            <textarea className="input" rows={2} value={form.description}
              onChange={e => update('description', e.target.value)}
              placeholder="Short promo description" style={{ resize: 'vertical' }} />
          </div>

          {/* Type */}
          <div>
            <label className="label">Type *</label>
            <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
              {TYPES.map(t => (
                <button key={t.value} className={`chip${form.type === t.value ? ' active' : ''}`}
                  onClick={() => update('type', t.value)}
                  style={{ fontSize: '0.72rem', padding: '0.3rem 0.65rem' }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Dish */}
          <div>
            <label className="label">Linked Dish</label>
            <select className="input" value={form.dish_id}
              onChange={e => update('dish_id', e.target.value)} style={{ cursor: 'pointer' }}>
              <option value="">None</option>
              {dishes.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>

          {/* Budget + daily limit */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <div>
              <label className="label">Budget (₼) *</label>
              <input className="input" type="number" step="0.01" min="0" value={form.budget}
                onChange={e => update('budget', e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <label className="label">Daily Limit (₼)</label>
              <input className="input" type="number" step="0.01" min="0" value={form.daily_limit}
                onChange={e => update('daily_limit', e.target.value)} placeholder="–" />
            </div>
          </div>

          {/* Dates */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <div>
              <label className="label">Starts *</label>
              <input className="input" type="datetime-local" value={form.starts_at}
                onChange={e => update('starts_at', e.target.value)} />
            </div>
            <div>
              <label className="label">Ends *</label>
              <input className="input" type="datetime-local" value={form.ends_at}
                onChange={e => update('ends_at', e.target.value)} />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="label">Status</label>
            <select className="input" value={form.status}
              onChange={e => update('status', e.target.value)} style={{ cursor: 'pointer' }}>
              {Object.entries(STATUS_STYLE).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>

          {error && <p style={{ color: 'var(--red)', fontSize: '0.78rem' }}>{error}</p>}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', paddingTop: '0.25rem' }}>
            <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? <><span className="spinner" /> Saving…</> : isEdit ? 'Save Changes' : 'Create Campaign'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CancelConfirmModal({ campaignName, loading, onConfirm, onCancel }) {
  useEffect(() => {
    document.body.classList.add('modal-open')
    return () => document.body.classList.remove('modal-open')
  }, [])

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="modal" style={{ padding: '1.75rem' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.75rem' }}>Cancel Campaign</h2>
        <p style={{ fontSize: '0.88rem', color: 'var(--t2)', lineHeight: 1.5 }}>
          Are you sure you want to cancel <strong style={{ color: 'var(--t1)' }}>{campaignName}</strong>?
          The campaign will stop running and cannot be reactivated.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.25rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-ghost" onClick={onCancel} disabled={loading}>Keep</button>
          <button className="btn btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? <><span className="spinner" /> Cancelling…</> : 'Cancel Campaign'}
          </button>
        </div>
      </div>
    </div>
  )
}
