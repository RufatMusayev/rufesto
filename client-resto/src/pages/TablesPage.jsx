import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatPrice, timeAgo } from '@shared/helpers'
import { TABLE_COLORS, TABLE_STATE_TRANSITIONS } from '@shared/constants'

export default function TablesPage() {
  const { restaurantId } = useAuth()
  const [tables, setTables] = useState([])
  const [sections, setSections] = useState([])
  const [activeSection, setActiveSection] = useState(null)
  const [stateFilter, setStateFilter] = useState('all')
  const [orders, setOrders] = useState({})
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [updating, setUpdating] = useState(null)

  useEffect(() => {
    if (!restaurantId) return
    loadAll()

    const ch = supabase
      .channel(`dash-tables-${restaurantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables', filter: `restaurant_id=eq.${restaurantId}` }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` }, () => loadAll())
      .subscribe()

    return () => supabase.removeChannel(ch)
  }, [restaurantId])

  async function loadAll() {
    const [tablesR, sectionsR, ordersR] = await Promise.all([
      supabase.from('tables').select('*, sections(name)')
        .eq('restaurant_id', restaurantId).eq('is_active', true).order('table_number'),
      supabase.from('sections').select('id, name')
        .eq('restaurant_id', restaurantId).order('name'),
      supabase.from('orders').select('id, table_id, status, total_amount, placed_at, order_items(quantity, dishes(name))')
        .eq('restaurant_id', restaurantId)
        .not('status', 'in', '("done","cancelled")')
        .order('placed_at', { ascending: false }),
    ])

    setTables(tablesR.data || [])
    setSections(sectionsR.data || [])

    const orderMap = {}
    for (const o of (ordersR.data || [])) {
      if (!orderMap[o.table_id]) orderMap[o.table_id] = []
      orderMap[o.table_id].push(o)
    }
    setOrders(orderMap)
    setLoading(false)
  }

  async function changeState(tableId, newState) {
    setUpdating(tableId)
    await supabase.from('tables').update({ state: newState }).eq('id', tableId)
    setTables(prev => prev.map(t => t.id === tableId ? { ...t, state: newState } : t))
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
        <h1 className="page-title">Tables</h1>
        <div style={{ display:'flex', alignItems:'center', gap:5, fontSize:'0.72rem', color:'var(--green)' }}>
          <span className="dash-live-dot" /> Live
        </div>
      </div>

      {sections.length > 1 && (
        <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', marginBottom: '0.75rem' }} className="no-scrollbar">
          <button className={`chip${!activeSection ? ' active' : ''}`} onClick={() => setActiveSection(null)}>
            All Areas ({tables.length})
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
          All ({tables.length})
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
        <div className="empty"><div className="empty-icon">🪑</div>No tables match filters</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '0.75rem' }}>
          {filtered.map(t => (
            <TableCard key={t.id} table={t} orders={orders[t.id] || []}
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
        <span className="dash-section-title">Legend</span>
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

function TableCard({ table, orders, expanded, onToggle, onChangeState, updating }) {
  const s = TABLE_COLORS[table.state] || TABLE_COLORS.free
  const transitions = TABLE_STATE_TRANSITIONS[table.state] || []
  const totalSpend = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0)

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
            <div style={{ fontWeight:700, fontSize:'0.88rem' }}>Table {table.table_number}</div>
            <div style={{ fontSize:'0.7rem', color:'var(--t3)', marginTop:1 }}>
              {table.sections?.name || '—'} · {table.capacity} seats
              {orders.length > 0 && (
                <span style={{ color:'var(--t2)', marginLeft:4 }}>· {formatPrice(totalSpend)}</span>
              )}
            </div>
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
              <div className="dash-section-title" style={{ marginBottom:'0.4rem' }}>Active Orders</div>
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
                    → {ns.label}
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
