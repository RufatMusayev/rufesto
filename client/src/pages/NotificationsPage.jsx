import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { timeAgo } from '../lib/helpers'
import AuthModal from '../components/AuthModal'

const TYPE_META = {
  booking_confirmed: { icon: '📋', color: 'var(--sage)',       bg: 'var(--sage-bg)'             },
  booking_cancelled: { icon: '✕',  color: 'var(--red)',        bg: 'rgba(239,68,68,0.08)'        },
  order_ready:       { icon: '🍽️', color: 'var(--sage)',       bg: 'var(--sage-bg)'             },
  order_placed:      { icon: '🧾', color: '#3b82f6',           bg: 'rgba(59,130,246,0.08)'       },
  review_reply:      { icon: '💬', color: 'var(--accent)',     bg: 'rgba(139,45,66,0.08)'        },
  promotion:         { icon: '🎉', color: 'var(--gold)',       bg: 'rgba(196,154,44,0.08)'       },
  system:            { icon: '🔔', color: 'var(--t3)',         bg: 'var(--s3)'                   },
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

function groupByDate(notifs) {
  const groups = []
  const map = {}
  const now = new Date()
  const today = now.toDateString()
  const yesterday = new Date(now - 86400000).toDateString()

  notifs.forEach(n => {
    const d = new Date(n.sent_at)
    const ds = d.toDateString()
    let label
    if (ds === today) label = 'Today'
    else if (ds === yesterday) label = 'Yesterday'
    else label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

    if (!map[label]) {
      map[label] = { label, items: [] }
      groups.push(map[label])
    }
    map[label].items.push(n)
  })
  return groups
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
    <div style={{ maxWidth: 470, margin: '0 auto', textAlign: 'center', padding: '60px 24px' }}>
      <div style={{
        width: 64, height: 64, borderRadius: '50%',
        background: 'var(--s3)', margin: '0 auto 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="1.5" style={{ width: 28, height: 28 }}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
        </svg>
      </div>
      <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.3rem', fontWeight: 700, marginBottom: 8 }}>Notifications</h2>
      <p style={{ color: 'var(--t3)', fontSize: '0.875rem', marginBottom: '1.5rem', lineHeight: 1.6 }}>
        Sign in to see your booking updates and order notifications.
      </p>
      <button className="btn btn-primary" onClick={() => setShowAuth(true)}>Sign in</button>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  )

  const unreadCount = notifs.filter(n => !n.read).length

  return (
    <div style={{ maxWidth: 470, margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 16px 12px',
        borderBottom: '1px solid var(--border)',
        position: 'sticky', top: 'var(--nav-h)', background: 'var(--bg)', zIndex: 5,
      }}>
        <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: '1.2rem', fontWeight: 700, color: 'var(--t1)' }}>
          Notifications
          {unreadCount > 0 && (
            <span style={{
              marginLeft: 8, fontSize: '0.65rem', fontWeight: 700,
              background: 'var(--accent)', color: '#F5F0E8',
              padding: '2px 7px', borderRadius: 100,
              verticalAlign: 'middle',
            }}>
              {unreadCount}
            </span>
          )}
        </h1>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            className="btn btn-ghost"
            style={{ fontSize: '0.76rem', padding: '5px 12px' }}
          >
            Mark all read
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[1,2,3,4,5].map(i => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: '14px 16px', alignItems: 'center' }}>
              <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ height: 13, width: '80%', marginBottom: 6, borderRadius: 4 }} />
                <div className="skeleton" style={{ height: 10, width: '40%', borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>
      ) : notifs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 24px', color: 'var(--t3)' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'var(--s3)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--sage)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--t2)', marginBottom: 4 }}>You're all caught up</div>
          <div style={{ fontSize: '0.82rem' }}>Book a table or place an order to start seeing activity here.</div>
        </div>
      ) : (
        <div>
          {groupByDate(notifs).map(group => (
            <div key={group.label}>
              {/* Date group label */}
              <div style={{
                padding: '10px 16px 6px',
                fontSize: '0.68rem', fontWeight: 700,
                color: 'var(--t4)', textTransform: 'uppercase',
                letterSpacing: 0.8,
                background: 'var(--bg)',
                position: 'sticky', top: 'calc(var(--nav-h) + 49px)', zIndex: 4,
                borderBottom: '1px solid var(--border)',
              }}>
                {group.label}
              </div>

              {group.items.map((n, idx) => {
                const meta = TYPE_META[n.type] || TYPE_META.system
                return (
                  <div
                    key={n.id}
                    className="stagger-item"
                    onClick={() => !n.read && markRead(n.id)}
                    style={{
                      display: 'flex', gap: 12, alignItems: 'flex-start',
                      padding: '14px 16px',
                      borderBottom: '1px solid var(--border)',
                      borderLeft: `3px solid ${n.read ? 'transparent' : 'var(--accent)'}`,
                      background: n.read ? 'transparent' : 'var(--s2)',
                      cursor: n.read ? 'default' : 'pointer',
                      transition: 'background 200ms var(--ease-out), border-color 200ms',
                      animationDelay: `${idx * 40}ms`,
                    }}
                  >
                    {/* Icon circle */}
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%',
                      background: meta.bg, border: `1px solid ${meta.color}22`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.1rem', flexShrink: 0,
                    }}>
                      {meta.icon}
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontSize: '0.86rem', lineHeight: 1.45,
                        color: n.read ? 'var(--t2)' : 'var(--t1)',
                        fontWeight: n.read ? 400 : 500,
                        marginBottom: 3,
                      }}>
                        {n.payload || formatType(n.type)}
                      </p>
                      <span style={{
                        fontFamily: "'DM Mono', monospace",
                        fontSize: '0.68rem', color: 'var(--t4)',
                      }}>
                        {timeAgo(n.sent_at)}
                      </span>
                    </div>

                    {/* Unread dot */}
                    {!n.read && (
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: 'var(--accent)', flexShrink: 0, marginTop: 6,
                      }} />
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      )}

      <div style={{ height: 80 }} />
    </div>
  )
}
