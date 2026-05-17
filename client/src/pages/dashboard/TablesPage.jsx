import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatPrice, timeAgo } from '../../lib/helpers'

const STATES = {
  free:              { label: 'Free',       color: '#3B6D11', bg: 'rgba(59,109,17,0.1)',   border: 'rgba(59,109,17,0.22)' },
  reserved:          { label: 'Reserved',   color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  border: 'rgba(59,130,246,0.22)' },
  occupied:          { label: 'Occupied',   color: '#8B2D42', bg: 'rgba(139,45,66,0.1)',   border: 'rgba(139,45,66,0.22)' },
  ordering:          { label: 'Ordering',   color: '#BA7517', bg: 'rgba(186,117,23,0.1)',  border: 'rgba(186,117,23,0.22)' },
  awaiting_payment:  { label: 'Awaiting Pay', color: '#F59E0B', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.22)' },
  cleared:           { label: 'Cleared',    color: '#6B5E56', bg: 'rgba(107,94,86,0.08)',  border: 'rgba(107,94,86,0.15)' },
}

const STATE_TRANSITIONS = {
  free:              ['reserved', 'occupied'],
  reserved:          ['occupied', 'free'],
  occupied:          ['ordering', 'free'],
  ordering:          ['awaiting_payment', 'occupied'],
  awaiting_payment:  ['cleared'],
  cleared:           ['free'],
}

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
      .channel('dash-tables-live')
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h1 className="page-title">Tables</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: 'var(--green)' }}>
          <span className="dash-live-dot" /> Live
        </div>
      </div>

      {/* Section filter */}
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

      {/* State filter */}
      <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', marginBottom: '1.25rem' }} className="no-scrollbar">
        <button className={`chip${stateFilter === 'all' ? ' active' : ''}`} onClick={() => setStateFilter('all')}>
          All ({tables.length})
        </button>
        {Object.entries(STATES).map(([key, s]) => {
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

      {/* Summary bar */}
      <div style={{
        display: 'flex', gap: '1.25rem', marginTop: '1.5rem', padding: '0.85rem 1rem',
        background: 'var(--s2)', borderRadius: 10, border: '1px solid var(--border)',
        flexWrap: 'wrap',
      }}>
        {Object.entries(STATES).map(([key, s]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
            <span style={{ fontSize: '0.75rem', color: 'var(--t2)' }}>{s.label}</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--t1)' }}>{stateCounts[key] || 0}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function TableCard({ table, orders, expanded, onToggle, onChangeState, updating }) {
  const s = STATES[table.state] || STATES.free
  const transitions = STATE_TRANSITIONS[table.state] || []
  const totalSpend = orders.reduce((sum, o) => sum + (o.total_amount || 0), 0)

  return (
    <div style={{
      background: 'var(--s2)', borderRadius: 14, overflow: 'hidden',
      border: `1.5px solid ${s.border}`,
      transition: 'border-color 0.2s',
    }}>
      {/* Header */}
      <div onClick={onToggle} style={{
        padding: '0.85rem 1rem', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 10,
            background: s.bg, border: `1px solid ${s.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: '0.85rem', color: s.color,
          }}>
            {table.table_number}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>Table {table.table_number}</div>
            <div style={{ fontSize: '0.68rem', color: 'var(--t3)' }}>
              {table.sections?.name || '—'} · {table.capacity} seats
            </div>
          </div>
        </div>
        <span style={{
          fontSize: '0.6rem', fontWeight: 700, padding: '3px 8px', borderRadius: 100,
          background: s.bg, color: s.color, border: `1px solid ${s.border}`,
          textTransform: 'uppercase', letterSpacing: 0.5,
        }}>{s.label}</span>
      </div>

      {/* Order info (if occupied/ordering) */}
      {orders.length > 0 && (
        <div style={{ padding: '0 1rem 0.6rem', fontSize: '0.75rem', color: 'var(--t2)' }}>
          {orders.length} active order{orders.length > 1 ? 's' : ''} · {formatPrice(totalSpend)}
        </div>
      )}

      {/* Expanded details */}
      {expanded && (
        <div style={{
          padding: '0.75rem 1rem', borderTop: '1px solid var(--border)',
          animation: 'fadeSlideUp 0.2s ease',
        }}>
          {/* Active orders */}
          {orders.length > 0 && (
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--t3)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                Orders
              </div>
              {orders.map(o => (
                <div key={o.id} style={{
                  padding: '0.45rem 0.6rem', borderRadius: 6,
                  background: 'var(--s3)', marginBottom: 4, fontSize: '0.75rem',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--t2)' }}>{timeAgo(o.placed_at)}</span>
                    <span style={{ fontWeight: 700 }}>{formatPrice(o.total_amount)}</span>
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--t3)', marginTop: 2 }}>
                    {(o.order_items || []).map(i => `${i.quantity}× ${i.dishes?.name || 'item'}`).join(', ')}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* State transitions */}
          {transitions.length > 0 && (
            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              {transitions.map(next => {
                const ns = STATES[next] || STATES.free
                return (
                  <button key={next} onClick={() => onChangeState(table.id, next)}
                    disabled={updating}
                    style={{
                      flex: 1, padding: '0.4rem 0.5rem', borderRadius: 6,
                      background: ns.bg, border: `1px solid ${ns.border}`,
                      color: ns.color, fontSize: '0.72rem', fontWeight: 600,
                      cursor: updating ? 'wait' : 'pointer',
                      opacity: updating ? 0.5 : 1,
                      fontFamily: "'DM Sans', system-ui, sans-serif",
                      transition: 'opacity 0.15s',
                    }}>
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
