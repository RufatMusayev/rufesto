import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatPrice, timeAgo, categoryEmoji } from '../../lib/helpers'

const STATUS_META = {
  open:      { label: 'Open',      color: '#3b82f6', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.18)' },
  preparing: { label: 'Preparing', color: '#BA7517', bg: 'rgba(186,117,23,0.08)',  border: 'rgba(186,117,23,0.18)' },
  ready:     { label: 'Ready',     color: '#3B6D11', bg: 'rgba(59,109,17,0.08)',   border: 'rgba(59,109,17,0.18)' },
  served:    { label: 'Served',    color: '#22c55e', bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.18)' },
  done:      { label: 'Done',      color: '#6B5E56', bg: 'var(--s3)',              border: 'var(--border)' },
  cancelled: { label: 'Cancelled', color: '#A32D2D', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.18)' },
}

const FILTERS = ['all', 'open', 'preparing', 'ready', 'served', 'done', 'cancelled']

export default function OrdersPage() {
  const { restaurantId } = useAuth()
  const [orders, setOrders] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(new Set())
  const [acting, setActing] = useState(null)

  useEffect(() => {
    if (!restaurantId) return
    loadOrders()

    const ch = supabase
      .channel('dash-orders-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` }, () => loadOrders())
      .subscribe()

    return () => supabase.removeChannel(ch)
  }, [restaurantId])

  async function loadOrders() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { data } = await supabase
      .from('orders')
      .select('*, tables(table_number), users(name, email), order_items(id, quantity, unit_price, line_total, status, dishes(name, category, price))')
      .eq('restaurant_id', restaurantId)
      .gte('placed_at', today.toISOString())
      .order('placed_at', { ascending: false })

    setOrders(data || [])
    setLoading(false)
  }

  async function updateStatus(orderId, status) {
    setActing(orderId)
    await supabase.from('orders').update({ status }).eq('id', orderId)
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o))
    setActing(null)
  }

  function toggleExpand(id) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter)

  const statusCounts = {}
  for (const o of orders) statusCounts[o.status] = (statusCounts[o.status] || 0) + 1

  const todayRevenue = orders
    .filter(o => o.status !== 'cancelled')
    .reduce((s, o) => s + (o.total_amount || 0), 0)

  return (
    <div style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h1 className="page-title">Orders</h1>
        <div style={{ fontSize: '0.78rem', color: 'var(--t2)' }}>
          {orders.length} orders · {formatPrice(todayRevenue)}
        </div>
      </div>

      {/* Status filter */}
      <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', marginBottom: '1.25rem' }} className="no-scrollbar">
        {FILTERS.map(f => {
          const cnt = f === 'all' ? orders.length : (statusCounts[f] || 0)
          const sm = f !== 'all' ? STATUS_META[f] : null
          return (
            <button key={f} className={`chip${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
              {sm && <span style={{ width: 6, height: 6, borderRadius: '50%', background: sm.color, display: 'inline-block', marginRight: 4 }} />}
              {f === 'all' ? 'All' : sm.label} ({cnt})
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty"><div className="empty-icon">📋</div>No orders match filter</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.map(o => (
            <OrderCard key={o.id} order={o}
              expanded={expanded.has(o.id)}
              onToggle={() => toggleExpand(o.id)}
              onUpdateStatus={updateStatus}
              acting={acting === o.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function OrderCard({ order, expanded, onToggle, onUpdateStatus, acting }) {
  const s = STATUS_META[order.status] || STATUS_META.open
  const items = order.order_items || []
  const time = order.placed_at
    ? new Date(order.placed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <div style={{
      background: 'var(--s2)', borderRadius: 14,
      border: `1px solid var(--border)`, overflow: 'hidden',
    }}>
      {/* Status accent bar */}
      <div style={{ height: 2, background: s.color, opacity: 0.5 }} />

      {/* Header row */}
      <div onClick={onToggle} style={{
        padding: '0.75rem 1rem', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: '0.75rem',
      }}>
        {/* Table badge */}
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          background: 'var(--s3)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: '0.72rem', color: 'var(--t2)', flexShrink: 0,
        }}>
          T{order.tables?.table_number || '?'}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontWeight: 700, fontSize: '0.85rem' }}>
              {items.length} item{items.length !== 1 ? 's' : ''}
            </span>
            <span style={{ fontSize: '0.68rem', color: 'var(--t3)' }}>
              · {time} · {timeAgo(order.placed_at)}
            </span>
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--t3)', marginTop: 2 }}>
            {order.users?.name || order.users?.email || 'Guest'}
          </div>
        </div>

        {/* Total + status */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '0.92rem' }}>{formatPrice(order.total_amount)}</div>
          <span style={{
            fontSize: '0.58rem', fontWeight: 700, padding: '2px 7px', borderRadius: 4,
            background: s.bg, color: s.color, border: `1px solid ${s.border}`,
            textTransform: 'uppercase', letterSpacing: 0.5,
          }}>{s.label}</span>
        </div>

        {/* Expand indicator */}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="2.5" strokeLinecap="round"
          style={{ flexShrink: 0, transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* Expanded items */}
      {expanded && (
        <div style={{
          borderTop: '1px solid var(--border)', padding: '0.65rem 1rem 0.85rem',
          animation: 'fadeSlideUp 0.2s ease',
        }}>
          {/* Items list */}
          {items.map(item => (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '0.4rem 0', borderBottom: '1px solid var(--border)',
            }}>
              <span style={{ fontSize: '0.92rem', width: 28, textAlign: 'center' }}>
                {categoryEmoji(item.dishes?.category)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '0.8rem', fontWeight: 500,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{item.dishes?.name || 'Dish'}</div>
                <div style={{ fontSize: '0.65rem', color: 'var(--t3)' }}>
                  {item.quantity}× {formatPrice(item.unit_price)}
                </div>
              </div>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, flexShrink: 0 }}>
                {formatPrice(item.line_total || item.unit_price * item.quantity)}
              </span>
            </div>
          ))}

          {/* Order totals */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0 0.1rem',
            fontSize: '0.78rem', color: 'var(--t2)',
          }}>
            <span>Subtotal</span><span>{formatPrice(order.subtotal)}</span>
          </div>
          {(order.tax_amount || 0) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--t3)' }}>
              <span>Tax</span><span>{formatPrice(order.tax_amount)}</span>
            </div>
          )}
          {(order.service_charge || 0) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--t3)' }}>
              <span>Service</span><span>{formatPrice(order.service_charge)}</span>
            </div>
          )}
          <div style={{
            display: 'flex', justifyContent: 'space-between', padding: '0.45rem 0 0',
            borderTop: '1px solid var(--border)', marginTop: '0.3rem',
            fontWeight: 800, fontSize: '0.88rem',
          }}>
            <span>Total</span><span style={{ color: 'var(--accent)' }}>{formatPrice(order.total_amount)}</span>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.35rem', marginTop: '0.75rem' }}>
            {order.status === 'ready' && (
              <button className="btn btn-primary" style={{ flex: 1, fontSize: '0.78rem', padding: '0.4rem' }}
                onClick={() => onUpdateStatus(order.id, 'served')} disabled={acting}>
                {acting ? <span className="spinner" style={{ width: 12, height: 12 }} /> : 'Mark Served'}
              </button>
            )}
            {order.status === 'served' && (
              <button className="btn btn-ghost" style={{ flex: 1, fontSize: '0.78rem', padding: '0.4rem' }}
                onClick={() => onUpdateStatus(order.id, 'done')} disabled={acting}>
                {acting ? <span className="spinner" style={{ width: 12, height: 12 }} /> : 'Complete'}
              </button>
            )}
            {['open', 'preparing', 'ready'].includes(order.status) && (
              <button className="btn btn-danger" style={{ fontSize: '0.78rem', padding: '0.4rem 0.85rem' }}
                onClick={() => onUpdateStatus(order.id, 'cancelled')} disabled={acting}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
