import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { formatPrice } from '../../lib/helpers'

export default function DashboardHome() {
  const { restaurantId } = useAuth()
  const [stats, setStats] = useState(null)

  useEffect(() => {
    if (!restaurantId) return
    loadStats()

    const channel = supabase
      .channel('dash-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` },
        () => loadStats())
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [restaurantId])

  async function loadStats() {
    const today = new Date(); today.setHours(0,0,0,0)

    const [{ data: orders }, { data: tables }, { data: dishes }] = await Promise.all([
      supabase.from('orders').select('total_amount,status').eq('restaurant_id', restaurantId).gte('placed_at', today.toISOString()),
      supabase.from('tables').select('state').eq('restaurant_id', restaurantId).eq('is_active', true),
      supabase.from('dishes').select('available').eq('restaurant_id', restaurantId),
    ])

    const revenue = (orders || []).reduce((s, o) => s + (o.total_amount || 0), 0)
    const active  = (tables  || []).filter(t => t.state !== 'free' && t.state !== 'cleared').length
    const avail   = (dishes  || []).filter(d => d.available).length

    setStats({ revenue, orderCount: orders?.length || 0, activeTables: active, availDishes: avail })
  }

  const STAT_CARDS = stats ? [
    { icon: '₼',  label: "Today's Revenue",  value: formatPrice(stats.revenue),     color: 'var(--accent)' },
    { icon: '📋', label: 'Orders Today',      value: stats.orderCount,               color: 'var(--blue)'  },
    { icon: '🪑', label: 'Active Tables',     value: stats.activeTables,             color: 'var(--green)' },
    { icon: '🍽', label: 'Available Dishes',  value: stats.availDishes,              color: 'var(--t1)'    },
  ] : []

  return (
    <div style={{ padding: '1.5rem 1.25rem' }}>
      <h1 className="page-title" style={{ marginBottom: '1.5rem' }}>Overview</h1>

      {!stats ? (
        <div style={{ color: 'var(--t3)' }}>Loading stats…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: '1rem' }}>
          {STAT_CARDS.map(s => (
            <div key={s.label} className="card" style={{ padding: '1.25rem' }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{s.icon}</div>
              <div style={{ fontSize: '1.8rem', fontWeight: 900, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--t3)', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      <p style={{ fontSize: '0.8rem', color: 'var(--t3)', marginTop: '1.5rem' }}>
        Go to <strong style={{ color: 'var(--t2)' }}>Kitchen</strong> to manage the order queue, or <strong style={{ color: 'var(--t2)' }}>Menu</strong> to toggle dish availability.
      </p>
    </div>
  )
}
