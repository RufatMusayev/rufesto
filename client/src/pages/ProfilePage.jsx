import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { formatPrice, timeAgo } from '../lib/helpers'
import AuthModal from '../components/AuthModal'

export default function ProfilePage() {
  const { session, profile, signOut, updateProfile } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [tab,      setTab]      = useState('profile')
  const [editing,  setEditing]  = useState(false)
  const [name,     setName]     = useState(profile?.name || '')
  const [saving,   setSaving]   = useState(false)

  async function handleSave() {
    setSaving(true)
    await updateProfile({ name })
    setSaving(false)
    setEditing(false)
  }

  if (!session) return (
    <div style={{ padding: '3rem 14px', textAlign: 'center', maxWidth: 470, margin: '0 auto' }}>
      <div style={{
        width: 72, height: 72, borderRadius: '50%',
        background: 'var(--s3)', margin: '0 auto 1.25rem',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="1.5" style={{ width: 32, height: 32 }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0zM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
      </div>
      <h2 style={{ fontWeight: 700, marginBottom: '0.5rem', fontSize: '1.25rem' }}>Sign in to DineBaku</h2>
      <p style={{ color: 'var(--t3)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
        Book tables, place orders, and leave dish reviews.
      </p>
      <button className="btn btn-primary" onClick={() => setShowAuth(true)}>Sign In / Register</button>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  )

  const TABS = [
    { id: 'profile',  label: 'Profile'  },
    { id: 'bookings', label: 'Bookings' },
    { id: 'orders',   label: 'Orders'   },
  ]

  return (
    <div style={{ padding: '14px', maxWidth: 470, margin: '0 auto' }}>
      <h1 className="page-title" style={{ marginBottom: '1.25rem' }}>Profile</h1>

      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`chip${tab === t.id ? ' active' : ''}`}
            style={{ flex: 1, justifyContent: 'center' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <div>
          <div className="card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
              <div style={{
                width: 60, height: 60, borderRadius: '50%',
                background: 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.4rem', fontWeight: 800, color: '#0c0a09', flexShrink: 0,
                boxShadow: '0 4px 12px rgba(245,158,11,0.25)',
              }}>
                {(profile?.name || '?')[0].toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{profile?.name || 'No name set'}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--t3)', marginTop: 2 }}>{profile?.email || session.user.email}</div>
              </div>
            </div>

            {editing ? (
              <div>
                <input className="input" placeholder="Your name" value={name}
                  onChange={e => setName(e.target.value)} style={{ marginBottom: '0.75rem' }} />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                  <button className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <button className="btn btn-ghost" style={{ width: '100%' }}
                onClick={() => { setEditing(true); setName(profile?.name || '') }}>
                Edit Profile
              </button>
            )}
          </div>

          <button className="btn btn-danger" style={{ width: '100%' }} onClick={signOut}>
            Sign Out
          </button>
        </div>
      )}

      {tab === 'bookings' && <BookingsTab userId={session.user.id} />}
      {tab === 'orders'   && <OrdersTab   userId={session.user.id} />}
    </div>
  )
}

function BookingsTab({ userId }) {
  const [bookings, setBookings] = useState([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    supabase
      .from('bookings')
      .select('*, restaurants(name, cuisine_type, address), tables(table_number)')
      .eq('user_id', userId)
      .order('reserved_from', { ascending: false })
      .limit(20)
      .then(({ data }) => { setBookings(data || []); setLoading(false) })
  }, [userId])

  if (loading) return <div style={{ color: 'var(--t3)', padding: '1rem 0' }}>Loading bookings…</div>

  if (!bookings.length) return (
    <div className="empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 40, height: 40, margin: '0 auto 0.75rem', opacity: 0.4 }}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
      </svg>
      No bookings yet.
      <div style={{ fontSize: '0.82rem', color: 'var(--t4)', marginTop: 4 }}>Book a table from any restaurant page.</div>
    </div>
  )

  const STATUS_COLOR = {
    pending:   { color: 'var(--accent)', bg: 'rgba(245,158,11,0.08)' },
    confirmed: { color: 'var(--green)',  bg: 'rgba(34,197,94,0.08)'  },
    seated:    { color: 'var(--blue)',   bg: 'rgba(59,130,246,0.08)' },
    completed: { color: 'var(--t3)',     bg: 'var(--s3)'             },
    cancelled: { color: 'var(--red)',    bg: 'rgba(239,68,68,0.08)'  },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {bookings.map(b => {
        const sc = STATUS_COLOR[b.status] || STATUS_COLOR.pending
        const dt = new Date(b.reserved_from)
        return (
          <div key={b.id} className="card" style={{ padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{b.restaurants?.name}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--t3)', marginTop: 2 }}>
                  {b.restaurants?.cuisine_type} · {b.restaurants?.address}
                </div>
              </div>
              <span style={{
                fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                background: sc.bg, color: sc.color, flexShrink: 0, marginLeft: 8,
              }}>{b.status.toUpperCase()}</span>
            </div>
            <div style={{ display: 'flex', gap: '1rem', fontSize: '0.82rem', color: 'var(--t2)' }}>
              <span>{dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              <span>{dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
              <span>{b.party_size} guests</span>
            </div>
            {b.tables?.table_number && (
              <div style={{ fontSize: '0.78rem', color: 'var(--t4)', marginTop: 4 }}>
                Table {b.tables.table_number}
              </div>
            )}
            {b.special_requests && (
              <div style={{ fontSize: '0.78rem', color: 'var(--accent)', marginTop: 4, fontStyle: 'italic' }}>
                "{b.special_requests}"
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function OrdersTab({ userId }) {
  const [orders,  setOrders]  = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(new Set())

  useEffect(() => {
    supabase
      .from('orders')
      .select('*, order_items(quantity, unit_price, special_request, dishes(name, category)), tables(table_number)')
      .eq('user_id', userId)
      .order('placed_at', { ascending: false })
      .limit(20)
      .then(({ data }) => { setOrders(data || []); setLoading(false) })
  }, [userId])

  function toggleExpand(id) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  if (loading) return <div style={{ color: 'var(--t3)', padding: '1rem 0' }}>Loading orders…</div>

  if (!orders.length) return (
    <div className="empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 40, height: 40, margin: '0 auto 0.75rem', opacity: 0.4 }}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 1 0-7.5 0v4.5m11.356-1.993 1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 0 1-1.12-1.243l1.264-12A1.125 1.125 0 0 1 5.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0zm7.5 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0z" />
      </svg>
      No orders yet.
      <div style={{ fontSize: '0.82rem', color: 'var(--t4)', marginTop: 4 }}>Add items to cart from a restaurant.</div>
    </div>
  )

  const STATUS_COLOR = {
    open:      { color: 'var(--accent)', bg: 'rgba(245,158,11,0.08)' },
    submitted: { color: 'var(--blue)',   bg: 'rgba(59,130,246,0.08)' },
    completed: { color: 'var(--green)',  bg: 'rgba(34,197,94,0.08)'  },
    cancelled: { color: 'var(--red)',    bg: 'rgba(239,68,68,0.08)'  },
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {orders.map(o => {
        const sc   = STATUS_COLOR[o.status] || STATUS_COLOR.open
        const open = expanded.has(o.id)
        return (
          <div key={o.id} className="card" style={{ padding: '1rem', cursor: 'pointer' }}
            onClick={() => toggleExpand(o.id)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
              <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                {o.order_items?.length || 0} item{o.order_items?.length !== 1 ? 's' : ''}
                {o.tables?.table_number && <span style={{ color: 'var(--t3)', fontWeight: 400 }}> · Table {o.tables.table_number}</span>}
              </div>
              <span style={{
                fontSize: '0.65rem', fontWeight: 700, padding: '2px 8px', borderRadius: 100,
                background: sc.bg, color: sc.color,
              }}>{o.status.toUpperCase()}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', color: 'var(--t3)' }}>
              <span>{timeAgo(o.placed_at)}</span>
              <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{formatPrice(o.total_amount)}</span>
            </div>

            {open && o.order_items?.length > 0 && (
              <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                {o.order_items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.3rem' }}>
                    <span style={{ color: 'var(--t1)' }}>{item.quantity}× {item.dishes?.name}</span>
                    <span style={{ color: 'var(--t3)' }}>{formatPrice(item.unit_price * item.quantity)}</span>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.5rem', paddingTop: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--t4)' }}>
                    <span>Subtotal</span><span>{formatPrice(o.subtotal)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--t4)' }}>
                    <span>Tax (18%)</span><span>{formatPrice(o.tax_amount)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--t4)' }}>
                    <span>Service (10%)</span><span>{formatPrice(o.service_charge)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', fontWeight: 700, marginTop: 4 }}>
                    <span>Total</span><span style={{ color: 'var(--accent)' }}>{formatPrice(o.total_amount)}</span>
                  </div>
                </div>
              </div>
            )}
            <div style={{ textAlign: 'right', fontSize: '0.7rem', color: 'var(--t4)', marginTop: 4 }}>
              {open ? '▲ collapse' : '▼ details'}
            </div>
          </div>
        )
      })}
    </div>
  )
}
