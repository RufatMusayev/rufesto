import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatPrice, timeAgo, categoryEmoji } from '../../lib/helpers'

const TABLE_COLORS = {
  free:              { color: '#3B6D11', bg: 'rgba(59,109,17,0.12)',  border: 'rgba(59,109,17,0.25)' },
  reserved:          { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.25)' },
  occupied:          { color: '#8B2D42', bg: 'rgba(139,45,66,0.12)',  border: 'rgba(139,45,66,0.25)' },
  ordering:          { color: '#BA7517', bg: 'rgba(186,117,23,0.12)', border: 'rgba(186,117,23,0.25)' },
  awaiting_payment:  { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)' },
  cleared:           { color: '#6B5E56', bg: 'rgba(107,94,86,0.08)',  border: 'rgba(107,94,86,0.15)' },
}

const ORDER_STATUS = {
  open:      { label: 'Open',      color: '#3b82f6', bg: 'rgba(59,130,246,0.08)' },
  preparing: { label: 'Preparing', color: '#BA7517', bg: 'rgba(186,117,23,0.08)' },
  ready:     { label: 'Ready',     color: '#3B6D11', bg: 'rgba(59,109,17,0.08)' },
  served:    { label: 'Served',    color: '#22c55e', bg: 'rgba(34,197,94,0.08)' },
  done:      { label: 'Done',      color: '#6B5E56', bg: 'var(--s3)' },
  cancelled: { label: 'Cancelled', color: '#A32D2D', bg: 'rgba(239,68,68,0.08)' },
}

export default function DashboardHome() {
  const { restaurantId } = useAuth()
  const [stats, setStats] = useState(null)
  const [recentOrders, setRecentOrders] = useState([])
  const [tables, setTables] = useState([])
  const [pendingBookings, setPendingBookings] = useState(0)

  useEffect(() => {
    if (!restaurantId) return
    loadAll()

    const ch = supabase
      .channel('dash-home-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables', filter: `restaurant_id=eq.${restaurantId}` }, () => loadAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings', filter: `restaurant_id=eq.${restaurantId}` }, () => loadAll())
      .subscribe()

    return () => supabase.removeChannel(ch)
  }, [restaurantId])

  async function loadAll() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [ordersR, tablesR, dishesR, bookingsR, recentR] = await Promise.all([
      supabase.from('orders').select('total_amount,status').eq('restaurant_id', restaurantId).gte('placed_at', today.toISOString()),
      supabase.from('tables').select('id,table_number,state,capacity,sections(name)').eq('restaurant_id', restaurantId).eq('is_active', true).order('table_number'),
      supabase.from('dishes').select('available').eq('restaurant_id', restaurantId),
      supabase.from('bookings').select('id').eq('restaurant_id', restaurantId).eq('status', 'pending'),
      supabase.from('orders')
        .select('id,status,total_amount,placed_at,tables(table_number),order_items(quantity,dishes(name,category))')
        .eq('restaurant_id', restaurantId)
        .order('placed_at', { ascending: false })
        .limit(8),
    ])

    const orders = ordersR.data || []
    const tbl = tablesR.data || []
    const dishes = dishesR.data || []

    setStats({
      revenue: orders.reduce((s, o) => s + (o.total_amount || 0), 0),
      orderCount: orders.length,
      activeTables: tbl.filter(t => t.state !== 'free' && t.state !== 'cleared').length,
      totalTables: tbl.length,
      availDishes: dishes.filter(d => d.available).length,
      totalDishes: dishes.length,
      kdsActive: orders.filter(o => ['open', 'preparing'].includes(o.status)).length,
    })
    setTables(tbl)
    setRecentOrders(recentR.data || [])
    setPendingBookings(bookingsR.data?.length || 0)
  }

  if (!stats) return (
    <div style={{ padding: '2rem', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--t3)' }}>
      <span className="spinner" /> Loading dashboard…
    </div>
  )

  return (
    <div style={{ padding: '1.25rem 1.25rem 2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <h1 className="page-title">Overview</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: 'var(--green)' }}>
          <span className="dash-live-dot" />
          Live · {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(155px,1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {[
          { icon: '₼', label: "Today's Revenue", value: formatPrice(stats.revenue), color: 'var(--accent)' },
          { icon: '📋', label: 'Orders Today', value: stats.orderCount, color: 'var(--blue)' },
          { icon: '🪑', label: 'Active Tables', value: `${stats.activeTables}/${stats.totalTables}`, color: 'var(--green)' },
          { icon: '🍽', label: 'Dishes Available', value: `${stats.availDishes}/${stats.totalDishes}`, color: 'var(--t1)' },
        ].map(s => (
          <div key={s.label} className="dash-stat">
            <div style={{ fontSize: '1.15rem' }}>{s.icon}</div>
            <div className="dash-stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="dash-stat-label">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Alert badges */}
      {(stats.kdsActive > 0 || pendingBookings > 0) && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          {stats.kdsActive > 0 && (
            <Link to="/dashboard/kds" style={alertStyle('#F59E0B')}>
              🔥 {stats.kdsActive} in kitchen →
            </Link>
          )}
          {pendingBookings > 0 && (
            <Link to="/dashboard/bookings" style={alertStyle('#3b82f6')}>
              📅 {pendingBookings} pending booking{pendingBookings > 1 ? 's' : ''} →
            </Link>
          )}
        </div>
      )}

      {/* Two-column grid */}
      <div className="dash-grid">
        {/* Left: recent orders */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div className="dash-section-title">Recent Orders</div>
            <Link to="/dashboard/orders" style={{ fontSize: '0.72rem', color: 'var(--accent)', fontWeight: 600 }}>View all →</Link>
          </div>

          {recentOrders.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--t3)', fontSize: '0.82rem', background: 'var(--s2)', borderRadius: 10, border: '1px solid var(--border)' }}>
              No orders today yet
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {recentOrders.map(o => <OrderRow key={o.id} order={o} />)}
            </div>
          )}
        </div>

        {/* Right: table overview + quick actions */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div className="dash-section-title">Tables</div>
            <Link to="/dashboard/tables" style={{ fontSize: '0.72rem', color: 'var(--accent)', fontWeight: 600 }}>Manage →</Link>
          </div>

          <div style={{ background: 'var(--s2)', borderRadius: 10, padding: '0.85rem', border: '1px solid var(--border)', marginBottom: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(48px, 1fr))', gap: '0.4rem' }}>
              {tables.map(t => {
                const tc = TABLE_COLORS[t.state] || TABLE_COLORS.cleared
                return (
                  <div key={t.id} title={`T${t.table_number} · ${t.state} · ${t.capacity} seats`} style={{
                    aspectRatio: '1', borderRadius: 8,
                    background: tc.bg, border: `1.5px solid ${tc.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.72rem', fontWeight: 700, color: tc.color,
                    cursor: 'default',
                  }}>
                    {t.table_number}
                  </div>
                )
              })}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', marginTop: '0.75rem', paddingTop: '0.6rem', borderTop: '1px solid var(--border)' }}>
              {[['free', 'Free'], ['occupied', 'Busy'], ['ordering', 'Ordering'], ['reserved', 'Reserved']].map(([k, label]) => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.6rem', color: 'var(--t3)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: TABLE_COLORS[k].color }} />
                  {label}
                </div>
              ))}
            </div>
          </div>

          <div className="dash-section-title" style={{ marginBottom: '0.6rem' }}>Quick Actions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            {[
              { to: '/dashboard/kds', icon: '🧑‍🍳', label: 'Open Kitchen Display' },
              { to: '/dashboard/menu', icon: '📋', label: 'Toggle Menu Items' },
              { to: '/dashboard/bookings', icon: '📅', label: 'Manage Bookings' },
            ].map(a => (
              <Link key={a.to} to={a.to} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '0.55rem 0.75rem', borderRadius: 8,
                background: 'var(--s2)', border: '1px solid var(--border)',
                fontSize: '0.8rem', fontWeight: 500, color: 'var(--t1)',
                transition: 'background 0.15s',
              }}>
                <span>{a.icon}</span> {a.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function OrderRow({ order }) {
  const s = ORDER_STATUS[order.status] || ORDER_STATUS.open
  const items = order.order_items || []
  const itemNames = items.slice(0, 2).map(i => `${i.quantity}× ${i.dishes?.name || 'item'}`).join(', ')
  const more = items.length > 2 ? ` +${items.length - 2}` : ''

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.65rem',
      padding: '0.6rem 0.75rem', borderRadius: 10,
      background: 'var(--s2)', border: '1px solid var(--border)',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8, background: 'var(--s3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '0.85rem', flexShrink: 0,
      }}>
        {items[0] ? categoryEmoji(items[0].dishes?.category) : '📋'}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {itemNames || 'Order'}{more}
        </div>
        <div style={{ fontSize: '0.68rem', color: 'var(--t3)', marginTop: 1 }}>
          Table {order.tables?.table_number || '—'} · {timeAgo(order.placed_at)}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 700 }}>{formatPrice(order.total_amount)}</div>
        <span style={{
          fontSize: '0.58rem', fontWeight: 700, padding: '1px 6px', borderRadius: 4,
          background: s.bg, color: s.color, textTransform: 'uppercase',
        }}>{s.label}</span>
      </div>
    </div>
  )
}

function alertStyle(color) {
  return {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '0.45rem 0.8rem', borderRadius: 8,
    background: `${color}14`, border: `1px solid ${color}33`,
    fontSize: '0.76rem', fontWeight: 600, color,
    textDecoration: 'none', transition: 'background 0.15s',
  }
}
