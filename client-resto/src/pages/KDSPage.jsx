import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { KDS_STATUS } from '@shared/constants'

const STATUS_ORDER = ['new', 'preparing', 'ready']

function ticketUrgency(minutesElapsed) {
  if (minutesElapsed < 5)  return { level: 'fresh',   color: '#3B6D11', glow: 'none' }
  if (minutesElapsed < 12) return { level: 'normal',  color: '#BA7517', glow: 'none' }
  if (minutesElapsed < 20) return { level: 'late',    color: '#F59E0B', glow: '0 0 0 1px rgba(245,158,11,0.3)' }
  return { level: 'overdue', color: '#A32D2D', glow: '0 0 0 2px rgba(163,45,45,0.3)' }
}

export default function KDSPage() {
  const { restaurantId } = useAuth()
  const [tickets, setTickets] = useState([])
  const [filter, setFilter] = useState('all')
  const now = useNow(10000)

  useEffect(() => {
    if (!restaurantId) return
    loadTickets()

    const channel = supabase
      .channel(`kds-live-${restaurantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kds_tickets', filter: `restaurant_id=eq.${restaurantId}` }, () => loadTickets())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` }, () => loadTickets())
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [restaurantId])

  async function loadTickets() {
    const { data } = await supabase
      .from('kds_tickets')
      .select(`*, order_items!order_item_id(
        id, quantity, special_request,
        dishes(name, category),
        orders(id, placed_at, tables(table_number))
      )`)
      .eq('restaurant_id', restaurantId)
      .in('status', ['new', 'preparing', 'ready'])
      .order('priority', { ascending: false })

    setTickets(data || [])
  }

  async function advance(ticket) {
    const next = KDS_STATUS[ticket.status]?.next
    if (!next) return

    const update = { status: next }
    if (next === 'preparing') update.started_at = new Date().toISOString()
    if (next === 'done') update.completed_at = new Date().toISOString()

    await supabase.from('kds_tickets').update(update).eq('id', ticket.id)
    setTickets(prev => next === 'done'
      ? prev.filter(t => t.id !== ticket.id)
      : prev.map(t => t.id === ticket.id ? { ...t, ...update } : t)
    )
  }

  const filtered = filter === 'all' ? tickets : tickets.filter(t => t.status === filter)
  const counts = {
    all: tickets.length,
    new: tickets.filter(t => t.status === 'new').length,
    preparing: tickets.filter(t => t.status === 'preparing').length,
    ready: tickets.filter(t => t.status === 'ready').length,
  }

  return (
    <div style={{ padding: '1.25rem', minHeight: '100vh' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '1rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <h1 className="page-title">Kitchen Display</h1>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '3px 10px', borderRadius: 100,
            background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
          }}>
            <span className="dash-live-dot" />
            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--green)' }}>LIVE</span>
          </div>
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--t2)', fontFamily: 'monospace' }}>
          {tickets.length} active
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {[['all', 'All'], ...STATUS_ORDER.map(s => [s, KDS_STATUS[s].label])].map(([id, label]) => (
          <button key={id} onClick={() => setFilter(id)} style={{
            padding: '0.4rem 1rem', borderRadius: 8,
            background: filter === id ? (id === 'all' ? 'var(--t1)' : KDS_STATUS[id]?.bg || 'var(--s3)') : 'var(--s2)',
            color: filter === id ? (id === 'all' ? 'var(--bg)' : KDS_STATUS[id]?.color || 'var(--t1)') : 'var(--t2)',
            border: `1px solid ${filter === id ? 'transparent' : 'var(--border)'}`,
            fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer',
            fontFamily: "'DM Sans', system-ui, sans-serif",
            transition: 'all 0.15s',
          }}>
            {label}
            <span style={{
              marginLeft: 6, fontSize: '0.72rem', fontWeight: 800,
              background: filter === id ? 'rgba(0,0,0,0.15)' : 'var(--s3)',
              padding: '1px 7px', borderRadius: 100,
            }}>
              {counts[id]}
            </span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty" style={{ paddingTop: '4rem' }}>
          <div className="empty-icon" style={{ fontSize: '3.5rem' }}>🧑‍🍳</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, marginTop: 4 }}>Kitchen is clear</div>
          <div style={{ fontSize: '0.82rem', color: 'var(--t3)', marginTop: 4 }}>No active tickets right now</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '0.85rem' }}>
          {filtered.map(t => (
            <KDSTicket key={t.id} ticket={t} now={now} onAdvance={() => advance(t)} />
          ))}
        </div>
      )}
    </div>
  )
}

function KDSTicket({ ticket, now, onAdvance }) {
  const meta = KDS_STATUS[ticket.status]
  const item = ticket.order_items
  const table = item?.orders?.tables?.table_number || '?'
  const since = item?.orders?.placed_at
  const elapsed = since ? Math.floor((now - new Date(since)) / 60000) : 0
  const urgency = ticketUrgency(elapsed)

  return (
    <div style={{
      background: 'var(--s2)', borderRadius: 16, overflow: 'hidden',
      border: `1.5px solid ${urgency.level === 'overdue' ? 'rgba(163,45,45,0.4)' : urgency.level === 'late' ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`,
      boxShadow: urgency.glow,
      transition: 'border-color 0.3s, box-shadow 0.3s',
    }}>
      <div style={{
        padding: '0.75rem 1rem', background: 'var(--s3)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: -0.3 }}>
            Table {table}
          </div>
          <div style={{
            fontSize: '0.75rem', fontWeight: 600,
            color: urgency.color,
            fontFamily: 'monospace',
            marginTop: 2,
          }}>
            {urgency.level === 'overdue' ? `⚠ ${elapsed}m — OVERDUE` :
             urgency.level === 'late' ? `⏱ ${elapsed}m — getting late` :
             `${elapsed}m ago`}
          </div>
        </div>

        <span style={{
          fontSize: '0.68rem', fontWeight: 800, letterSpacing: 0.8,
          padding: '4px 10px', borderRadius: 6,
          background: meta.bg, color: meta.color,
          border: `1px solid ${meta.color}33`,
        }}>
          {meta.label}
        </span>
      </div>

      <div style={{ padding: '0.85rem 1rem' }}>
        {item ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{
                fontSize: '1.35rem', fontWeight: 900, color: 'var(--t1)',
                fontFamily: 'monospace', lineHeight: 1,
              }}>
                {item.quantity}×
              </span>
              <span style={{ fontSize: '1rem', fontWeight: 700 }}>
                {item.dishes?.name || 'Unknown dish'}
              </span>
            </div>
            {item.special_request && (
              <div style={{
                marginTop: 8, padding: '6px 10px', borderRadius: 6,
                background: 'rgba(139,45,66,0.08)', border: '1px solid rgba(139,45,66,0.15)',
                fontSize: '0.78rem', color: 'var(--accent)', fontWeight: 500,
              }}>
                📝 {item.special_request}
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: '0.85rem', color: 'var(--t3)' }}>Loading…</div>
        )}
      </div>

      {meta.next && (
        <div style={{ padding: '0 1rem 1rem' }}>
          <button onClick={onAdvance} style={{
            width: '100%', padding: '0.6rem 0', borderRadius: 10,
            background: meta.color, color: '#fff', border: 'none',
            fontWeight: 700, fontSize: '0.85rem',
            cursor: 'pointer', transition: 'opacity 0.15s',
            fontFamily: "'DM Sans', system-ui, sans-serif",
          }}>
            {meta.action} →
          </button>
        </div>
      )}
    </div>
  )
}

function useNow(interval = 10000) {
  const [now, setNow] = useState(Date.now())
  const ref = useRef()
  useEffect(() => {
    ref.current = setInterval(() => setNow(Date.now()), interval)
    return () => clearInterval(ref.current)
  }, [interval])
  return now
}
