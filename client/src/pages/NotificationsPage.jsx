import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { timeAgo } from '../lib/helpers'
import AuthModal from '../components/AuthModal'

const TYPE_ICON = {
  booking_confirmed: '📋',
  booking_cancelled: '❌',
  order_ready:       '🍽️',
  order_placed:      '🧾',
  review_reply:      '💬',
  promotion:         '🎉',
  system:            '🔔',
}

export default function NotificationsPage() {
  const { session } = useAuth()
  const [notifs,    setNotifs]    = useState([])
  const [loading,   setLoading]  = useState(true)
  const [showAuth,  setShowAuth] = useState(false)

  useEffect(() => {
    if (!session) { setLoading(false); return }
    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', session.user.id)
      .order('sent_at', { ascending: false })
      .limit(50)
      .then(({ data }) => { setNotifs(data || []); setLoading(false) })
  }, [session])

  async function markRead(id) {
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }

  async function markAllRead() {
    const unread = notifs.filter(n => !n.read).map(n => n.id)
    if (!unread.length) return
    await supabase.from('notifications').update({ read: true }).in('id', unread)
    setNotifs(prev => prev.map(n => ({ ...n, read: true })))
  }

  if (!session) return (
    <div style={{ padding: '3rem 14px', textAlign: 'center', maxWidth: 470, margin: '0 auto' }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: 'var(--s3)', margin: '0 auto 1rem',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="1.5" style={{ width: 28, height: 28 }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
      </div>
      <h2 style={{ fontWeight: 700, marginBottom: '0.4rem', fontSize: '1.15rem' }}>Activity</h2>
      <p style={{ color: 'var(--t3)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
        Sign in to see your booking updates and order notifications.
      </p>
      <button className="btn btn-primary" onClick={() => setShowAuth(true)}>Sign In / Register</button>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  )

  const unreadCount = notifs.filter(n => !n.read).length

  return (
    <div style={{ maxWidth: 470, margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.75rem 1rem',
        borderBottom: '1px solid var(--border)',
      }}>
        <h1 style={{ fontSize: '1.1rem', fontWeight: 700 }}>Activity</h1>
        {unreadCount > 0 && (
          <button onClick={markAllRead} style={{
            background: 'none', border: 'none', color: 'var(--blue)',
            fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
          }}>Mark all read</button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: '2rem', color: 'var(--t3)', textAlign: 'center' }}>Loading…</div>
      ) : notifs.length === 0 ? (
        <div className="empty">
          <div className="empty-icon">🔔</div>
          No notifications yet.<br />
          <span style={{ fontSize: '0.78rem', color: 'var(--t3)' }}>
            Book a table or place an order to start seeing activity here.
          </span>
        </div>
      ) : (
        <div>
          {notifs.map(n => (
            <div
              key={n.id}
              onClick={() => !n.read && markRead(n.id)}
              style={{
                display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
                padding: '0.85rem 1rem',
                borderBottom: '1px solid var(--border)',
                background: n.read ? 'transparent' : 'var(--s2)',
                cursor: n.read ? 'default' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: 'var(--s3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.15rem', flexShrink: 0,
              }}>
                {TYPE_ICON[n.type] || '🔔'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '0.88rem', lineHeight: 1.45, color: 'var(--t1)' }}>
                  {n.payload || formatType(n.type)}
                </p>
                <span style={{ fontSize: '0.72rem', color: 'var(--t3)' }}>
                  {timeAgo(n.sent_at)}
                </span>
              </div>
              {!n.read && (
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: 'var(--blue)', flexShrink: 0, marginTop: 6,
                }} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatType(type) {
  const map = {
    booking_confirmed: 'Your booking has been confirmed.',
    booking_cancelled: 'A booking was cancelled.',
    order_ready:       'Your order is ready!',
    order_placed:      'Your order has been placed.',
    review_reply:      'Someone replied to your review.',
    promotion:         'New promotion available!',
    system:            'System notification.',
  }
  return map[type] || type
}
