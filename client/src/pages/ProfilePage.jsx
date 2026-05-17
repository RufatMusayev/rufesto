import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { supabase } from '../lib/supabase'
import { formatPrice, timeAgo, categoryEmoji, dishBackground } from '../lib/helpers'
import AuthModal from '../components/AuthModal'

function FeedbackForm({ userId, defaultName, defaultEmail }) {
  const [fbName,    setFbName]    = useState(defaultName || '')
  const [fbEmail,   setFbEmail]   = useState(defaultEmail || '')
  const [fbMsg,     setFbMsg]     = useState('')
  const [fbRating,  setFbRating]  = useState(0)
  const [fbLoading, setFbLoading] = useState(false)
  const [fbError,   setFbError]   = useState('')
  const [fbDone,    setFbDone]    = useState(false)

  async function handleFeedback(e) {
    e.preventDefault()
    if (!fbName.trim()) return setFbError('Name is required.')
    if (!fbRating)      return setFbError('Please select a rating.')
    if (!fbMsg.trim())  return setFbError('Please write a message.')
    setFbError('')
    setFbLoading(true)
    const { error } = await supabase.from('feedback').insert({
      user_id: userId || null,
      name: fbName.trim(),
      email: fbEmail.trim() || null,
      message: fbMsg.trim(),
      rating: fbRating || null,
    })
    setFbLoading(false)
    if (error) return setFbError(error.message || 'Could not send feedback. Try again.')
    setFbDone(true)
    setFbMsg('')
    setFbRating(0)
  }

  if (fbDone) return (
    <div style={{ textAlign: 'center', padding: '1rem 0' }}>
      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>&#10003;</div>
      <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '0.25rem' }}>Thanks for your feedback!</div>
      <p style={{ fontSize: '0.82rem', color: 'var(--t3)', marginBottom: '1rem' }}>We appreciate you taking the time.</p>
      <button className="btn btn-ghost" onClick={() => setFbDone(false)}>Send another</button>
    </div>
  )

  return (
    <form onSubmit={handleFeedback}>
      <label className="label">Name</label>
      <input className="input" value={fbName} onChange={e => setFbName(e.target.value)}
        placeholder="Your name" style={{ marginBottom: '0.75rem' }} />

      <label className="label">Email <span style={{ color: 'var(--t4)', fontWeight: 400 }}>(optional)</span></label>
      <input className="input" type="email" value={fbEmail} onChange={e => setFbEmail(e.target.value)}
        placeholder="your@email.com" style={{ marginBottom: '0.75rem' }} />

      <label className="label">Rating</label>
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.75rem' }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button" onClick={() => setFbRating(fbRating === n ? 0 : n)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
              fontSize: '1.5rem', color: n <= fbRating ? 'var(--gold)' : 'var(--s4)',
              transition: 'color 0.15s',
            }}>
            &#9733;
          </button>
        ))}
      </div>

      <label className="label">Message</label>
      <textarea className="input" value={fbMsg} onChange={e => setFbMsg(e.target.value)}
        placeholder="What's on your mind?" rows={4}
        style={{ marginBottom: '0.75rem', resize: 'vertical', fontFamily: 'inherit' }} />

      {fbError && <p style={{ color: 'var(--red)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{fbError}</p>}

      <button className="btn btn-primary" type="submit" style={{ width: '100%' }} disabled={fbLoading}>
        {fbLoading ? 'Sending…' : 'Send Feedback'}
      </button>
    </form>
  )
}

export default function ProfilePage() {
  const { session, profile, signOut, updateProfile } = useAuth()
  const { theme, toggle: toggleTheme } = useTheme()
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
      <h2 style={{ fontWeight: 700, marginBottom: '0.5rem', fontSize: '1.25rem' }}>Sign in to Rufesto</h2>
      <p style={{ color: 'var(--t3)', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
        Book tables, place orders, and leave dish reviews.
      </p>
      <button className="btn btn-primary" onClick={() => setShowAuth(true)}>Sign In / Register</button>
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}

      <div className="card" style={{ padding: '1.5rem', marginTop: '2rem', textAlign: 'left' }}>
        <h3 style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.25rem' }}>Share Feedback</h3>
        <p style={{ fontSize: '0.82rem', color: 'var(--t3)', marginBottom: '1rem' }}>
          Tell us what you think — no account needed.
        </p>
        <FeedbackForm />
      </div>
    </div>
  )

  const TABS = [
    { id: 'profile',  label: 'Profile'  },
    { id: 'reviews',  label: 'Reviews'  },
    { id: 'orders',   label: 'Orders'   },
    { id: 'bookings', label: 'Bookings' },
    { id: 'saved',    label: 'Saved'    },
  ]

  return (
    <div style={{ padding: '14px', maxWidth: 470, margin: '0 auto' }}>
      <h1 className="page-title" style={{ marginBottom: '1.25rem' }}>Profile</h1>

      <div className="no-scrollbar" style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem', overflowX: 'auto' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`chip${tab === t.id ? ' active' : ''}`}
            style={{ flex: '0 0 auto', justifyContent: 'center' }}>
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
                fontSize: '1.4rem', fontWeight: 800, color: '#F5F0E8', flexShrink: 0,
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

          {/* Settings */}
          <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>Appearance</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--t3)', marginTop: 2 }}>
                  {theme === 'dark' ? 'Dark mode' : 'Light mode'}
                </div>
              </div>
              <button onClick={toggleTheme} style={{
                width: 48, height: 28, borderRadius: 14,
                background: theme === 'dark' ? 'var(--accent)' : 'var(--s4)',
                border: 'none', cursor: 'pointer', position: 'relative',
                transition: 'background 0.2s',
              }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%',
                  background: 'var(--bg)',
                  position: 'absolute', top: 3,
                  left: theme === 'dark' ? 23 : 3,
                  transition: 'left 0.2s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.65rem',
                }}>
                  {theme === 'dark' ? '🌙' : '☀️'}
                </div>
              </button>
            </div>
          </div>

          <PointsCard userId={session.user.id} />

          <button className="btn btn-danger" style={{ width: '100%', marginTop: '1rem' }} onClick={signOut}>
            Sign Out
          </button>

          <div className="card" style={{ padding: '1.5rem', marginTop: '1.5rem' }}>
            <h3 style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '0.25rem' }}>Share Feedback</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--t3)', marginBottom: '1rem' }}>
              Tell us what you think — suggestions, issues, or compliments.
            </p>
            <FeedbackForm userId={session.user.id} defaultName={profile?.name} defaultEmail={profile?.email} />
          </div>
        </div>
      )}

      {tab === 'reviews'  && <ReviewsTab  userId={session.user.id} />}
      {tab === 'orders'   && <OrdersTab   userId={session.user.id} />}
      {tab === 'bookings' && <BookingsTab userId={session.user.id} />}
      {tab === 'saved'    && <SavedTab    userId={session.user.id} />}
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

function PointsCard({ userId }) {
  const [points, setPoints] = useState(null)

  useEffect(() => {
    supabase
      .from('loyalty_accounts')
      .select('points_balance, lifetime_points, tier')
      .eq('user_id', userId)
      .single()
      .then(({ data }) => setPoints(data))
  }, [userId])

  if (!points) return null

  const TIER_COLORS = {
    bronze: { color: '#CD7F32', bg: 'rgba(205,127,50,0.08)' },
    silver: { color: '#A0A0A0', bg: 'rgba(160,160,160,0.08)' },
    gold:   { color: 'var(--gold)', bg: 'rgba(196,154,44,0.08)' },
  }
  const tc = TIER_COLORS[points.tier] || TIER_COLORS.bronze

  return (
    <div className="card" style={{ padding: '1rem', marginBottom: '1rem', marginTop: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1.3rem' }}>🪙</span>
          <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>Resto-Credits</span>
        </div>
        <span style={{
          fontSize: '0.62rem', fontWeight: 700, padding: '3px 8px', borderRadius: 100,
          background: tc.bg, color: tc.color, textTransform: 'uppercase', letterSpacing: 0.5,
        }}>
          {points.tier}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 20 }}>
        <div>
          <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--gold)' }}>
            {points.points_balance}
          </div>
          <div style={{ fontSize: '0.68rem', color: 'var(--t3)' }}>Available</div>
        </div>
        <div>
          <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--t2)' }}>
            {points.lifetime_points}
          </div>
          <div style={{ fontSize: '0.68rem', color: 'var(--t3)' }}>Lifetime</div>
        </div>
      </div>
      <p style={{ fontSize: '0.72rem', color: 'var(--t4)', marginTop: 10 }}>
        Earn credits by posting dish reviews. Redeem for discounts.
      </p>
    </div>
  )
}

function ReviewsTab({ userId }) {
  const navigate = useNavigate()
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('reviews')
      .select('*, dishes(name, category, price, restaurant_id, restaurants(name, slug))')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30)
      .then(({ data }) => { setReviews(data || []); setLoading(false) })
  }, [userId])

  if (loading) return <div style={{ color: 'var(--t3)', padding: '1rem 0' }}>Loading reviews…</div>

  if (!reviews.length) return (
    <div className="empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 40, height: 40, margin: '0 auto 0.75rem', opacity: 0.4 }}>
        <path d="M7 2v8a3 3 0 006 0V2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10 2v20" strokeLinecap="round" />
        <path d="M17 2v6c0 1.1.9 2 2 2h0c0 1.1-.9 2-2 2v10" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      No reviews yet.
      <div style={{ fontSize: '0.82rem', color: 'var(--t4)', marginTop: 4 }}>
        Review dishes after dining to earn Resto-Credits.
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {reviews.map(r => (
        <div key={r.id} className="card" style={{ padding: '12px', cursor: 'pointer' }}
          onClick={() => r.dishes?.restaurants?.slug && navigate(`/restaurant/${r.dishes.restaurants.slug}`)}>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 8, flexShrink: 0,
              background: dishBackground(r.dishes?.category),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.3rem',
            }}>
              {categoryEmoji(r.dishes?.category)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{
                  fontWeight: 700, fontSize: '0.88rem',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {r.dishes?.name || 'Dish'}
                </div>
                <span style={{ color: 'var(--gold)', fontSize: '0.78rem', flexShrink: 0, marginLeft: 8 }}>
                  {'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}
                </span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--t3)', marginTop: 1 }}>
                {r.dishes?.restaurants?.name} · {timeAgo(r.created_at)}
              </div>
              {r.body && (
                <p style={{ fontSize: '0.82rem', color: 'var(--t2)', marginTop: 4, lineHeight: 1.4 }}>
                  {r.body}
                </p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function SavedTab({ userId }) {
  const navigate = useNavigate()
  const [saved, setSaved] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('saved_dishes')
      .select('*, dishes(id, name, category, price, available, restaurant_id, restaurants(name, slug))')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setSaved(data || []); setLoading(false) })
  }, [userId])

  async function handleRemove(id) {
    setSaved(prev => prev.filter(s => s.id !== id))
    await supabase.from('saved_dishes').delete().eq('id', id)
  }

  if (loading) return <div style={{ color: 'var(--t3)', padding: '1rem 0' }}>Loading saved…</div>

  if (!saved.length) return (
    <div className="empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} style={{ width: 40, height: 40, margin: '0 auto 0.75rem', opacity: 0.4 }}>
        <ellipse cx="12" cy="14" rx="8" ry="4" />
        <path d="M12 3v7" strokeLinecap="round" />
        <circle cx="12" cy="3" r="1.5" />
      </svg>
      No saved dishes yet.
      <div style={{ fontSize: '0.82rem', color: 'var(--t4)', marginTop: 4 }}>
        Tap the plate icon on any dish to save it for later.
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {saved.map(s => {
        const dish = s.dishes
        if (!dish) return null
        return (
          <div key={s.id} className="card" style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
            cursor: 'pointer',
          }} onClick={() => dish.restaurants?.slug && navigate(`/restaurant/${dish.restaurants.slug}`)}>
            <div style={{
              width: 44, height: 44, borderRadius: 8, flexShrink: 0,
              background: dishBackground(dish.category),
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.3rem',
              opacity: dish.available ? 1 : 0.5,
            }}>
              {categoryEmoji(dish.category)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontWeight: 600, fontSize: '0.88rem',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {dish.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--t3)' }}>
                  {dish.restaurants?.name}
                </span>
                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--accent)' }}>
                  {formatPrice(dish.price)}
                </span>
                {!dish.available && (
                  <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--red)' }}>SOLD OUT</span>
                )}
              </div>
            </div>
            <button onClick={e => { e.stopPropagation(); handleRemove(s.id) }} style={{
              background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)',
              padding: 4,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )
      })}
    </div>
  )
}
