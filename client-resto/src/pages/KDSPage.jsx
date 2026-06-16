import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { KDS_STATUS } from '@shared/constants'

const COLUMNS = [
  { status: 'new',       label: 'New',       color: '#3b82f6', bg: 'rgba(59,130,246,0.1)',  textColor: '#fff' },
  { status: 'preparing', label: 'Preparing', color: '#BA7517', bg: 'rgba(186,117,23,0.1)',  textColor: '#1A1210' },
  { status: 'ready',     label: 'Ready',     color: '#2D7A1A', bg: 'rgba(45,122,26,0.1)',   textColor: '#fff' },
]

function ticketUrgency(minutesElapsed) {
  if (minutesElapsed < 5)  return { level: 'fresh',   color: 'var(--green)' }
  if (minutesElapsed < 12) return { level: 'normal',  color: 'var(--warning)' }
  if (minutesElapsed < 20) return { level: 'late',    color: '#F59E0B' }
  return { level: 'overdue', color: 'var(--red)' }
}

export default function KDSPage() {
  const { restaurantId } = useAuth()
  const [tickets, setTickets] = useState([])
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
      .select(`*, order_items!order_item_id(id, quantity, special_request, dishes(name, category), orders(id, placed_at, tables(table_number)))`)
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

  const allEmpty = tickets.length === 0

  return (
    <div style={{ padding: '1.25rem', minHeight: '100vh' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <h1 className="page-title">Kitchen</h1>
          <div style={{ display:'flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:100, background:'rgba(45,122,26,0.1)', border:'1px solid rgba(45,122,26,0.2)' }}>
            <span className="dash-live-dot" />
            <span style={{ fontSize:'0.68rem', fontWeight:700, color:'var(--green)' }}>LIVE</span>
          </div>
        </div>
        <span style={{ fontFamily:"'JetBrains Mono','Courier New',monospace", fontSize:'0.78rem', color:'var(--t2)' }}>
          {tickets.length} active
        </span>
      </div>

      <div className="kds-board">
        {allEmpty ? (
          <div className="empty" style={{ paddingTop:'4rem', gridColumn:'1/-1' }}>
            <div className="empty-icon" style={{ fontSize:'3.5rem' }}>🧑‍🍳</div>
            <div style={{ fontSize:'1rem', fontWeight:700, marginTop:4 }}>Kitchen is clear</div>
            <div style={{ fontSize:'0.82rem', color:'var(--t3)', marginTop:4 }}>No active tickets right now</div>
          </div>
        ) : COLUMNS.map((col) => {
          const colTickets = tickets.filter(t => t.status === col.status)
          return (
            <div className="kds-col" key={col.status}>
              <div className="kds-col-head">
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div className="kds-col-indicator" style={{ background: col.color }} />
                  <span className="kds-col-title" style={{ color: col.color }}>{col.label}</span>
                </div>
                <span className="kds-col-count" style={{ background: col.bg, color: col.color }}>
                  {colTickets.length}
                </span>
              </div>
              <div className="kds-tickets">
                {colTickets.length === 0
                  ? <div className="kds-empty-col">All clear</div>
                  : colTickets.map(t => (
                      <KDSTicket key={t.id} ticket={t} now={now} col={col} onAdvance={() => advance(t)} />
                    ))
                }
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function KDSTicket({ ticket, now, onAdvance, col }) {
  const meta = KDS_STATUS[ticket.status]
  const item = ticket.order_items
  const table = item?.orders?.tables?.table_number || '?'
  const since = item?.orders?.placed_at
  const elapsed = since ? Math.floor((now - new Date(since)) / 60000) : 0
  const urgency = ticketUrgency(elapsed)
  const urgencyClass = urgency.level === 'overdue' ? 'urgency-overdue' : urgency.level === 'late' ? 'urgency-late' : ''

  return (
    <div className={`kds-ticket ${urgencyClass}`}>
      <div className="kds-ticket-head">
        <div className="kds-table-num">T{table}</div>
        <div className="kds-elapsed" style={{ color: urgency.color }}>
          {urgency.level === 'overdue' ? `⚠ ${elapsed}m` : `${elapsed}m`}
        </div>
      </div>
      <div className="kds-ticket-body">
        {item ? (
          <>
            <div className="kds-item-row">
              <span className="kds-qty">{item.quantity}×</span>
              <span className="kds-dish-name">{item.dishes?.name || 'Unknown dish'}</span>
            </div>
            {item.special_request && (
              <div className="kds-special">📝 {item.special_request}</div>
            )}
          </>
        ) : (
          <div style={{ fontSize:'0.82rem', color:'var(--t3)' }}>Loading…</div>
        )}
      </div>
      {meta?.next && (
        <div className="kds-ticket-footer">
          <button className="kds-advance-btn" onClick={onAdvance}
            style={{ background: col.color, color: col.textColor }}>
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
