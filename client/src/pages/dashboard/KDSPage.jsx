import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { timeAgo, formatPrice } from '../../lib/helpers'

const STATUS_ORDER = ['new', 'preparing', 'ready']
const STATUS_META  = {
  new:       { label: 'NEW',       color: 'var(--accent)', bg: 'rgba(245,158,11,0.1)',  next: 'preparing', action: 'Start' },
  preparing: { label: 'PREPARING', color: 'var(--blue)',   bg: 'rgba(59,130,246,0.1)',  next: 'ready',     action: 'Ready' },
  ready:     { label: 'READY ✓',   color: 'var(--green)',  bg: 'rgba(34,197,94,0.1)',   next: 'done',      action: 'Done'  },
}

export default function KDSPage() {
  const { restaurantId } = useAuth()
  const [tickets, setTickets] = useState([])
  const [filter,  setFilter]  = useState('all') // all | new | preparing | ready

  useEffect(() => {
    if (!restaurantId) return
    loadTickets()

    const channel = supabase
      .channel('kds-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kds_tickets', filter: `restaurant_id=eq.${restaurantId}` },
        () => loadTickets())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` },
        () => loadTickets())
      .subscribe()

    const interval = setInterval(loadTickets, 15000)
    return () => { supabase.removeChannel(channel); clearInterval(interval) }
  }, [restaurantId])

  async function loadTickets() {
    const { data } = await supabase
      .from('kds_tickets')
      .select(`
        *,
        order_items!order_item_id(
          id, quantity, special_request,
          dishes(name, category),
          orders(id, placed_at, tables(table_number))
        )
      `)
      .eq('restaurant_id', restaurantId)
      .in('status', ['new', 'preparing', 'ready'])
      .order('priority', { ascending: false })

    setTickets(data || [])
  }

  async function advance(ticket) {
    const next = STATUS_META[ticket.status]?.next
    if (!next) return

    const update = { status: next }
    if (next === 'preparing') update.started_at = new Date().toISOString()
    if (next === 'done')      update.completed_at = new Date().toISOString()

    await supabase.from('kds_tickets').update(update).eq('id', ticket.id)
    setTickets(prev => next === 'done'
      ? prev.filter(t => t.id !== ticket.id)
      : prev.map(t => t.id === ticket.id ? { ...t, ...update } : t)
    )
  }

  const filtered = filter === 'all' ? tickets : tickets.filter(t => t.status === filter)

  const counts = {
    new:       tickets.filter(t => t.status === 'new').length,
    preparing: tickets.filter(t => t.status === 'preparing').length,
    ready:     tickets.filter(t => t.status === 'ready').length,
  }

  return (
    <div style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <h1 className="page-title">Kitchen Display</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--green)' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
          Live
        </div>
      </div>

      {/* Status filter tabs */}
      <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {[['all', 'All', tickets.length], ...STATUS_ORDER.map(s => [s, STATUS_META[s].label, counts[s]])].map(([id, label, cnt]) => (
          <button key={id} onClick={() => setFilter(id)}
            className={`chip${filter === id ? ' active' : ''}`}>
            {label} {cnt > 0 && <span style={{ marginLeft: 4, background: 'var(--s4)', borderRadius: '50%', padding: '1px 6px', fontSize: '0.72rem' }}>{cnt}</span>}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty"><div className="empty-icon">🧑‍🍳</div>No active tickets</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '1rem' }}>
          {filtered.map(t => <KDSTicket key={t.id} ticket={t} onAdvance={() => advance(t)} />)}
        </div>
      )}
    </div>
  )
}

function KDSTicket({ ticket, onAdvance }) {
  const meta    = STATUS_META[ticket.status]
  const item    = ticket.order_items   // single object (many-to-one FK)
  const table   = item?.orders?.tables?.table_number || '?'
  const since   = item?.orders?.placed_at
  const elapsed = since ? Math.floor((Date.now() - new Date(since)) / 60000) : 0
  const urgent  = elapsed > 15

  return (
    <div style={{
      background: 'var(--s2)', borderRadius: 18,
      border: `1px solid ${urgent ? 'rgba(239,68,68,0.35)' : 'var(--border)'}`,
      overflow: 'hidden',
      boxShadow: urgent ? '0 0 0 1px rgba(239,68,68,0.2)' : 'none',
    }}>
      {/* Header */}
      <div style={{
        padding: '0.875rem 1rem',
        background: 'var(--s3)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: '1rem' }}>Table {table}</div>
          <div style={{ fontSize: '0.72rem', color: urgent ? 'var(--red)' : 'var(--t3)' }}>
            {urgent ? `⚠ ${elapsed}m — overdue!` : `${elapsed}m ago`}
          </div>
        </div>
        <span style={{
          fontSize: '0.7rem', fontWeight: 700,
          padding: '0.22rem 0.65rem', borderRadius: 100,
          background: meta.bg, color: meta.color,
        }}>{meta.label}</span>
      </div>

      {/* Item */}
      <div style={{ padding: '0.875rem 1rem' }}>
        {item ? (
          <div style={{ fontSize: '0.9rem' }}>
            <span style={{ fontWeight: 700 }}>{item.quantity}×</span>{' '}
            <span>{item.dishes?.name || 'Unknown dish'}</span>
            {item.special_request && (
              <div style={{ fontSize: '0.72rem', color: 'var(--accent)', marginTop: 4 }}>
                📝 {item.special_request}
              </div>
            )}
          </div>
        ) : (
          <div style={{ fontSize: '0.82rem', color: 'var(--t3)' }}>Loading…</div>
        )}
      </div>

      {/* Action */}
      {meta.next && (
        <div style={{ padding: '0 1rem 1rem' }}>
          <button className="btn" onClick={onAdvance} style={{
            width: '100%',
            background: meta.bg, color: meta.color,
            border: `1px solid ${meta.color}40`,
            fontWeight: 700,
          }}>
            {meta.action} →
          </button>
        </div>
      )}
    </div>
  )
}
