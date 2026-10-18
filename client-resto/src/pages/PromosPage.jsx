import { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatPrice } from '../lib/format'
import { dishName } from '../lib/dishName'
import { localeTag } from '../lib/time'
import { debounce } from '../lib/debounce'
import { subscribeResync } from '../lib/realtime'
import { friendlyError, writeError } from '../lib/errors'
import ActionBanner from '../components/ActionBanner'
import useDialog from '../lib/useDialog'
import ChipScroller from '../components/ChipScroller'
import PromoFormModal from '../components/PromoFormModal'
import { discountBadge } from '../features/v2/promoDiscount'
import { MANAGERS_ONLY, STATUS_LABEL_KEYS, TYPE_KEYS } from '../features/v2/promoMeta'
import '../features/v2/styles.css'

const FILTERS = ['all', 'draft', 'active', 'paused', 'completed', 'cancelled']

const STATUS_STYLE = {
  draft:     { color: 'var(--t2)',  bg: 'var(--s3)',                border: 'var(--border)' },
  active:    { color: '#22c55e',    bg: 'rgba(34,197,94,0.08)',     border: 'rgba(34,197,94,0.18)' },
  paused:    { color: '#BA7517',    bg: 'rgba(186,117,23,0.08)',    border: 'rgba(186,117,23,0.18)' },
  completed: { color: '#3b82f6',    bg: 'rgba(59,130,246,0.08)',    border: 'rgba(59,130,246,0.18)' },
  cancelled: { color: '#A32D2D',    bg: 'rgba(239,68,68,0.08)',     border: 'rgba(239,68,68,0.18)' },
}

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
      supabase.from('ad_campaigns').select('*, dishes(name, name_az, name_i18n)')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false }),
      supabase.from('dishes').select('id, name, name_az, name_i18n')
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
      <ChipScroller role="group" aria-label={t('dashboard:promosTitle')}>
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
      </ChipScroller>

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
            {c.type === 'discount' && discountBadge(c.description) && (
              <span style={{
                fontSize: '0.6rem', fontWeight: 700, padding: '2px 7px', borderRadius: 100,
                background: 'rgba(196,154,44,0.15)', color: 'var(--gold)', border: '1px solid rgba(196,154,44,0.3)',
              }}>{discountBadge(c.description)}</span>
            )}
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
          {c.dishes?.name && <span style={{ color: 'var(--gold)' }}>🍽 {dishName(c.dishes, i18n.language)}</span>}
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
