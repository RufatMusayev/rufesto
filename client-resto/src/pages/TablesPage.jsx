import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatPrice, timeAgo } from '@shared/helpers'
import { TABLE_COLORS, TABLE_STATE_TRANSITIONS } from '@shared/constants'
import { debounce } from '../lib/debounce'

// Active-orders window for the table floor: 24h is generous for a single
// dine-in visit while still dropping stale open orders from earlier days.
const ACTIVE_ORDERS_WINDOW_MS = 24 * 60 * 60 * 1000

export default function TablesPage() {
  const { restaurantId } = useAuth()
  const { t } = useTranslation(['dashboard', 'common'])
  const [tables, setTables] = useState([])
  const [sections, setSections] = useState([])
  const [activeSection, setActiveSection] = useState(null)
  const [stateFilter, setStateFilter] = useState('all')
  const [orders, setOrders] = useState({})
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [updating, setUpdating] = useState(null)
  const [actionError, setActionError] = useState('')
  const [accessCodes, setAccessCodes] = useState({})

  useEffect(() => {
    if (!restaurantId) return
    loadAll()

    const debouncedLoad = debounce(loadAll, 400)
    const ch = supabase
      .channel(`dash-tables-${restaurantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables', filter: `restaurant_id=eq.${restaurantId}` }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` }, debouncedLoad)
      .subscribe()

    return () => { debouncedLoad.cancel(); supabase.removeChannel(ch) }
  }, [restaurantId])

  async function loadAll() {
    const [tablesR, sectionsR, ordersR, codesR] = await Promise.all([
      // Explicit columns only: `tables` may carry access_code / qr_code_token,
      // which must never be selected from the client.
      supabase.from('tables').select('id, table_number, state, capacity, section_id, sections(name)')
        .eq('restaurant_id', restaurantId).eq('is_active', true).order('table_number'),
      supabase.from('sections').select('id, name')
        .eq('restaurant_id', restaurantId).order('name'),
      supabase.from('orders').select('id, table_id, status, total_amount, placed_at, order_items(quantity, dishes(name))')
        .eq('restaurant_id', restaurantId)
        .not('status', 'in', '("paid","cancelled")')
        .gte('placed_at', new Date(Date.now() - ACTIVE_ORDERS_WINDOW_MS).toISOString())
        .order('placed_at', { ascending: false }),
      // access_code lives in table_access_codes (staff-only, RLS-gated) since
      // sql/31 moved it off `tables`. Never select qr_code_token here. This
      // query fails silently (table may not exist yet pre-migration) — the
      // page must keep working either way, just without the code chip.
      supabase.from('table_access_codes').select('table_id, access_code')
        .eq('restaurant_id', restaurantId),
    ])

    setTables(tablesR.data || [])
    setSections(sectionsR.data || [])

    const orderMap = {}
    for (const o of (ordersR.data || [])) {
      if (!orderMap[o.table_id]) orderMap[o.table_id] = []
      orderMap[o.table_id].push(o)
    }
    setOrders(orderMap)

    const codeMap = {}
    if (!codesR.error) {
      for (const c of (codesR.data || [])) codeMap[c.table_id] = c.access_code
    }
    setAccessCodes(codeMap)

    setLoading(false)
  }

  async function changeState(tableId, newState) {
    setUpdating(tableId)
    const prevState = tables.find(t => t.id === tableId)?.state
    setTables(prev => prev.map(t => t.id === tableId ? { ...t, state: newState } : t))
    const { error } = await supabase.from('tables').update({ state: newState }).eq('id', tableId)
    if (error) {
      setTables(prev => prev.map(t => t.id === tableId ? { ...t, state: prevState } : t))
      setActionError(t('dashboard:actionFailed'))
    }
    setUpdating(null)
  }

  const filtered = tables
    .filter(t => !activeSection || t.section_id === activeSection)
    .filter(t => stateFilter === 'all' || t.state === stateFilter)

  const stateCounts = {}
  for (const t of tables) stateCounts[t.state] = (stateCounts[t.state] || 0) + 1

  return (
    <div style={{ padding: '1.25rem' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem', paddingBottom:'1rem', borderBottom:'1px solid var(--border)' }}>
        <h1 className="page-title">{t('dashboard:tablesTitle')}</h1>
        <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:'0.72rem', color:'var(--green)' }}>
          <span className="dash-live-dot" /> {t('common:live')}
        </div>
      </div>

      {actionError && (
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between', gap:8,
          padding:'0.6rem 0.85rem', borderRadius:10, marginBottom:'0.85rem',
          background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)',
          color:'var(--red)', fontSize:'0.8rem', fontWeight:500,
        }}>
          <span>{actionError}</span>
          <button onClick={() => setActionError('')} style={{ background:'none', border:'none', color:'inherit', cursor:'pointer', fontSize:'1rem', lineHeight:1 }}>✕</button>
        </div>
      )}

      {sections.length > 1 && (
        <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', marginBottom: '0.75rem' }} className="no-scrollbar">
          <button className={`chip${!activeSection ? ' active' : ''}`} onClick={() => setActiveSection(null)}>
            {t('dashboard:allAreas', { count: tables.length })}
          </button>
          {sections.map(s => {
            const cnt = tables.filter(t => t.section_id === s.id).length
            return (
              <button key={s.id} className={`chip${activeSection === s.id ? ' active' : ''}`}
                onClick={() => setActiveSection(s.id)}>{s.name} ({cnt})</button>
            )
          })}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', marginBottom: '1.25rem' }} className="no-scrollbar">
        <button className={`chip${stateFilter === 'all' ? ' active' : ''}`} onClick={() => setStateFilter('all')}>
          {t('dashboard:filterAll')} ({tables.length})
        </button>
        {Object.entries(TABLE_COLORS).map(([key, s]) => {
          const cnt = stateCounts[key] || 0
          if (cnt === 0) return null
          return (
            <button key={key} className={`chip${stateFilter === key ? ' active' : ''}`}
              onClick={() => setStateFilter(key)}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.color, display: 'inline-block', marginRight: 4 }} />
              {s.label} ({cnt})
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '0.75rem' }}>
          {[1,2,3,4,5,6].map(i => <div key={i} className="skeleton" style={{ height: 140, borderRadius: 12 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty"><div className="empty-icon">🪑</div>{t('dashboard:noTablesMatch')}</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '0.75rem' }}>
          {filtered.map(t => (
            <TableCard key={t.id} table={t} orders={orders[t.id] || []}
              code={accessCodes[t.id]}
              expanded={expanded === t.id} onToggle={() => setExpanded(expanded === t.id ? null : t.id)}
              onChangeState={changeState} updating={updating === t.id} />
          ))}
        </div>
      )}

      <div style={{
        display:'flex', gap:'1.25rem', marginTop:'1.5rem', padding:'0.85rem 1rem',
        background:'var(--s2)', borderRadius:12, border:'1px solid var(--border)',
        flexWrap:'wrap', alignItems:'center',
      }}>
        <span className="dash-section-title">{t('dashboard:legend')}</span>
        {Object.entries(TABLE_COLORS).map(([key, s]) => (
          <div key={key} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ width:8, height:8, borderRadius:'50%', background: s.color, display:'inline-block' }} />
            <span style={{ fontSize:'0.75rem', color:'var(--t2)' }}>{s.label}</span>
            <span style={{ fontSize:'0.75rem', fontWeight:800, color:'var(--t1)' }}>{stateCounts[key] || 0}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TableCard({ table, orders, code, expanded, onToggle, onChangeState, updating }) {
  const { t } = useTranslation(['dashboard', 'common'])
  const s = TABLE_COLORS[table.state] || TABLE_COLORS.free
  const transitions = TABLE_STATE_TRANSITIONS[table.state] || []
  const totalSpend = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0)
  const [copied, setCopied] = useState(false)

  async function handleCopy(e) {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard API unavailable/denied — nothing sensible to show, ignore
    }
  }

  return (
    <div style={{
      background:'var(--s2)', borderRadius:14, overflow:'hidden',
      border:`1.5px solid ${s.border}`,
      transition:'border-color 0.2s, transform 0.15s',
    }}
      onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-1px)'}
      onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
    >
      {/* Top accent bar */}
      <div style={{ height:2, background: s.color, opacity: 0.6 }} />

      <div onClick={onToggle} style={{
        padding:'0.85rem 1rem', cursor:'pointer',
        display:'flex', alignItems:'center', justifyContent:'space-between',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{
            width:42, height:42, borderRadius:10,
            background: s.bg, border:`1.5px solid ${s.border}`,
            display:'flex', alignItems:'center', justifyContent:'center',
            fontWeight:900, fontSize:'0.9rem', color: s.color,
            fontFamily:"'Playfair Display', Georgia, serif",
          }}>
            {table.table_number}
          </div>
          <div>
            <div style={{ fontWeight:700, fontSize:'0.88rem' }}>{t('dashboard:tableLabel', { number: table.table_number })}</div>
            <div style={{ fontSize:'0.7rem', color:'var(--t3)', marginTop:1 }}>
              {table.sections?.name || '—'} · {t('dashboard:seatsCount', { count: table.capacity })}
              {orders.length > 0 && (
                <span style={{ color:'var(--t2)', marginLeft:4 }}>· {formatPrice(totalSpend)}</span>
              )}
            </div>
            {code && (
              <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:4 }}>
                <span style={{
                  fontFamily:"'JetBrains Mono','Courier New',monospace", fontSize:'0.62rem',
                  fontWeight:600, color:'var(--t2)', background:'var(--s3)',
                  border:'1px solid var(--border)', borderRadius:5,
                  padding:'1px 6px', letterSpacing:0.3,
                }}>{code}</span>
                <button
                  onClick={handleCopy}
                  title={copied ? t('dashboard:codeCopied') : t('dashboard:copyCode')}
                  style={{
                    background:'none', border:'none', cursor:'pointer', padding:2,
                    display:'flex', alignItems:'center', color: copied ? 'var(--green)' : 'var(--t3)',
                    transition:'color 0.15s',
                  }}
                >
                  {copied ? (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  ) : (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2"/>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{
            fontSize:'0.6rem', fontWeight:700, padding:'3px 8px', borderRadius:100,
            background: s.bg, color: s.color, border:`1px solid ${s.border}`,
            textTransform:'uppercase', letterSpacing:0.5,
          }}>{s.label}</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="2.5" strokeLinecap="round"
            style={{ transition:'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </div>

      {expanded && (
        <div style={{ borderTop:'1px solid var(--border)', padding:'0.75rem 1rem 0.85rem', animation:'fadeSlideUp 0.18s ease' }}>
          {orders.length > 0 && (
            <div style={{ marginBottom:'0.75rem' }}>
              <div className="dash-section-title" style={{ marginBottom:'0.4rem' }}>{t('dashboard:activeOrders')}</div>
              {orders.map(o => (
                <div key={o.id} style={{
                  padding:'0.45rem 0.65rem', borderRadius:8,
                  background:'var(--s3)', marginBottom:4, fontSize:'0.75rem',
                  border:'1px solid var(--border)',
                }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ color:'var(--t2)' }}>{timeAgo(o.placed_at)}</span>
                    <span style={{ fontWeight:700, color:'var(--t1)' }}>{formatPrice(o.total_amount)}</span>
                  </div>
                  <div style={{ fontSize:'0.68rem', color:'var(--t3)', marginTop:2 }}>
                    {(o.order_items || []).map(i => `${i.quantity}× ${i.dishes?.name || 'item'}`).join(', ')}
                  </div>
                </div>
              ))}
            </div>
          )}

          {transitions.length > 0 && (
            <div style={{ display:'flex', gap:'0.35rem', flexWrap:'wrap' }}>
              {transitions.map(next => {
                const ns = TABLE_COLORS[next] || TABLE_COLORS.free
                return (
                  <button key={next} onClick={() => onChangeState(table.id, next)}
                    disabled={updating}
                    style={{
                      flex:1, padding:'0.45rem 0.5rem', borderRadius:8,
                      background: ns.bg, border:`1px solid ${ns.border}`,
                      color: ns.color, fontSize:'0.72rem', fontWeight:600,
                      cursor: updating ? 'wait' : 'pointer',
                      opacity: updating ? 0.5 : 1,
                      fontFamily:"'DM Sans', system-ui, sans-serif",
                      transition:'opacity 0.15s, transform 160ms',
                      minWidth:80,
                    }}
                    onMouseEnter={e => !updating && (e.currentTarget.style.transform='scale(1.02)')}
                    onMouseLeave={e => (e.currentTarget.style.transform='scale(1)')}
                    onMouseDown={e => (e.currentTarget.style.transform='scale(0.97)')}
                    onMouseUp={e => (e.currentTarget.style.transform='scale(1)')}
                  >
                    {t('dashboard:transitionTo', { state: ns.label })}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
