import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCart } from '../contexts/CartContext'
import { useAuth } from '../contexts/AuthContext'
import { formatPrice, cuisineEmoji, cuisineBackground, categoryEmoji } from '../lib/helpers'
import AuthModal from '../components/AuthModal'
import PaymentSheet from '../components/PaymentSheet'

export default function TablePage() {
  const { tableId, restaurantId, setTable, clearTable } = useCart()
  const { session } = useAuth()
  const navigate = useNavigate()
  const [tableInfo, setTableInfo] = useState(null)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [demoLoading, setDemoLoading] = useState(false)
  const [demoError, setDemoError] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [codeLoading, setCodeLoading] = useState(false)
  const [codeError, setCodeError] = useState('')
  const [paymentState, setPaymentState] = useState(null)
  const [showPayment, setShowPayment] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)

  function refetchOrders() {
    if (!session || !tableId) return
    supabase
      .from('orders')
      .select('*, order_items(*, dishes(name, category, price))')
      .eq('table_id', tableId)
      .eq('user_id', session.user.id)
      .order('placed_at', { ascending: true })
      .then(({ data }) => setOrders(data || []))
  }

  useEffect(() => {
    if (!tableId) { setLoading(false); return }

    let orderChannel
    let kdsChannel
    let tableChannel

    async function load() {
      setLoading(true)

      const { data: table } = await supabase
        .from('tables')
        .select('id, table_number, capacity, state, restaurant_id, sections(name), restaurants(name, slug, cuisine_type)')
        .eq('id', tableId)
        .single()

      if (table) {
        setTableInfo(table)
        if (table.state === 'awaiting_payment') setPaymentState('requested')
        // Self-heal: holding an active session but the table still reads free/reserved
        // (e.g. session started before this was wired up) — claim it as occupied.
        if (table.state === 'free' || table.state === 'reserved') {
          supabase.from('tables').update({ state: 'occupied' })
            .eq('id', tableId).in('state', ['free', 'reserved'])
            .then(() => setTableInfo(prev => prev ? { ...prev, state: 'occupied' } : prev))
        }
      }

      if (session) {
        const { data } = await supabase
          .from('orders')
          .select('*, order_items(*, dishes(name, category, price))')
          .eq('table_id', tableId)
          .eq('user_id', session.user.id)
          .order('placed_at', { ascending: true })
        setOrders(data || [])
      }

      setLoading(false)

      orderChannel = supabase
        .channel(`table-orders-${tableId}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'orders',
          filter: `table_id=eq.${tableId}`,
        }, () => refetchOrders())
        .subscribe()

      kdsChannel = supabase
        .channel(`kds-updates-${tableId}`)
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'kds_tickets',
        }, () => refetchOrders())
        .subscribe()

      tableChannel = supabase
        .channel(`table-state-${tableId}`)
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'tables',
          filter: `id=eq.${tableId}`,
        }, (payload) => {
          setTableInfo(prev => prev ? { ...prev, ...payload.new } : prev)
          if (payload.new.state === 'free' || payload.new.state === 'cleared') {
            clearTable()
            setTableInfo(null)
            setOrders([])
          }
        })
        .subscribe()
    }

    load()
    return () => {
      if (orderChannel) supabase.removeChannel(orderChannel)
      if (kdsChannel) supabase.removeChannel(kdsChannel)
      if (tableChannel) supabase.removeChannel(tableChannel)
    }
  }, [tableId, session])

  async function enterCode(e) {
    e.preventDefault()
    const code = codeInput.trim().toUpperCase()
    if (!code) return
    if (!session) {
      setShowAuthModal(true)
      return
    }
    setCodeLoading(true)
    setCodeError('')
    const { data: table } = await supabase
      .from('tables')
      .select('id, restaurant_id, table_number, is_active')
      .eq('access_code', code)
      .eq('is_active', true)
      .maybeSingle()
    setCodeLoading(false)
    if (!table) {
      setCodeError('Invalid table code. Check the code and try again.')
      return
    }
    setTable(table.id, table.restaurant_id)
  }

  async function startDemo() {
    if (!session) {
      setShowAuthModal(true)
      return
    }
    setDemoLoading(true)
    setDemoError('')

    const DEMO_TABLES = [
      { id: '30000001-0000-0000-0000-000000000002', restaurant_id: '10000000-0000-0000-0000-000000000001' },
      { id: '30000002-0000-0000-0000-000000000001', restaurant_id: '10000000-0000-0000-0000-000000000002' },
      { id: '30000003-0000-0000-0000-000000000005', restaurant_id: '10000000-0000-0000-0000-000000000003' },
    ]

    const { data: tables } = await supabase
      .from('tables')
      .select('id, table_number, capacity, restaurant_id, restaurants(name, slug, cuisine_type)')
      .eq('state', 'free')
      .limit(1)

    if (tables && tables.length > 0) {
      setTable(tables[0].id, tables[0].restaurant_id)
    } else {
      const fallback = DEMO_TABLES[Math.floor(Math.random() * DEMO_TABLES.length)]
      setTable(fallback.id, fallback.restaurant_id)
    }
    setDemoLoading(false)
  }

  function handleEndSession() {
    clearTable(true)
    setTableInfo(null)
    setOrders([])
    setPaymentState(null)
  }

  if (loading) return <TableSkeleton />
  if (!tableId) return (
    <>
      <EmptyTableState
        onStartDemo={startDemo} demoLoading={demoLoading} demoError={demoError}
        codeInput={codeInput} setCodeInput={setCodeInput}
        onEnterCode={enterCode} codeLoading={codeLoading} codeError={codeError}
      />
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </>
  )

  const allItems = orders.flatMap(o => o.order_items || [])
  const sessionSubtotal = orders.reduce((s, o) => s + (o.subtotal || 0), 0)
  const sessionTax = orders.reduce((s, o) => s + (o.tax_amount || 0), 0)
  const sessionService = orders.reduce((s, o) => s + (o.service_charge || 0), 0)
  const sessionTotal = orders.reduce((s, o) => s + (o.total_amount || 0), 0)

  const allServed = orders.length > 0 && orders.every(o =>
    o.status === 'served' || o.status === 'done' || o.status === 'ready'
  )

  const emoji = tableInfo?.restaurants ? cuisineEmoji(tableInfo.restaurants.cuisine_type) : '🍽️'
  const bgGrad = tableInfo?.restaurants ? cuisineBackground(tableInfo.restaurants.cuisine_type) : 'var(--s3)'

  return (
    <div>
      {/* Gradient header */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        background: bgGrad, padding: '44px 16px 28px',
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '14rem', opacity: 0.07, filter: 'blur(6px)',
          pointerEvents: 'none',
        }}>
          {emoji}
        </div>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, transparent 10%, rgba(0,0,0,0.9) 100%)',
        }} />

        <div style={{ position: 'relative', maxWidth: 470, margin: '0 auto' }}>
          <button onClick={() => navigate(-1)} style={{
            position: 'absolute', top: -24, left: 0,
            background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            border: 'none', borderRadius: '50%',
            width: 34, height: 34, color: '#F5F0E8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}>
            <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 16, height: 16 }}>
              <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10z" clipRule="evenodd" />
            </svg>
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 58, height: 58, borderRadius: '50%',
              background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.7rem', flexShrink: 0,
              border: '2px solid rgba(255,255,255,0.12)',
            }}>
              {emoji}
            </div>
            <div style={{ flex: 1 }}>
              <h1 style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: '1.25rem', fontWeight: 700, color: '#F5F0E8',
                lineHeight: 1.2,
              }}>
                Your Table
              </h1>
              <div style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)', marginTop: 2,
              }}>
                #{tableInfo?.table_number || '—'}
                {tableInfo?.restaurants?.name && ` · ${tableInfo.restaurants.name}`}
                {tableInfo?.sections?.name && ` · ${tableInfo.sections.name}`}
              </div>
            </div>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'rgba(34,197,94,0.12)', backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              borderRadius: 100, padding: '5px 11px',
              border: '1px solid rgba(34,197,94,0.25)',
            }}>
              <span className="table-pulse" style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#22C55E', boxShadow: '0 0 8px #22C55E',
              }} />
              <span style={{
                fontSize: '0.62rem', fontWeight: 700, color: '#22C55E',
                textTransform: 'uppercase', letterSpacing: 0.8,
              }}>
                Active
              </span>
            </div>
          </div>

          {/* Stats row */}
          <div style={{
            display: 'flex', gap: 24, marginTop: 20,
            paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)',
          }}>
            {[
              { val: orders.length, label: 'orders' },
              { val: allItems.length, label: 'items' },
              { val: formatPrice(sessionTotal), label: 'total', accent: true },
            ].map(s => (
              <div key={s.label}>
                <div style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '1.15rem', fontWeight: 800,
                  color: s.accent ? 'var(--accent)' : '#F5F0E8',
                }}>
                  {s.val}
                </div>
                <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.45)', marginTop: 1 }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 470, margin: '0 auto', padding: '16px 16px 40px' }}>

        {/* Browse menu CTA */}
        {tableInfo?.restaurants?.slug && !paymentState && (
          <Link to={`/restaurant/${tableInfo.restaurants.slug}`} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            width: '100%', padding: '11px 0', marginBottom: 20,
            background: 'var(--accent)', color: 'var(--t1)', fontWeight: 700,
            fontSize: '0.88rem', borderRadius: 8,
            textDecoration: 'none', transition: 'background 0.15s',
          }}>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.2" style={{ width: 17, height: 17, stroke: 'currentColor' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add More Items
          </Link>
        )}

        {/* Orders */}
        {orders.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '3rem 1.5rem',
            background: 'var(--s2)', borderRadius: 12,
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12, opacity: 0.35 }}>📋</div>
            <p style={{ fontFamily: "'Playfair Display', serif", fontSize: '1rem', fontWeight: 700, color: 'var(--t1)', marginBottom: 4 }}>
              No orders yet
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--t3)', lineHeight: 1.5 }}>
              {session
                ? 'Browse the menu and add dishes to start ordering.'
                : 'Sign in to place orders at this table.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {orders.map((order, idx) => (
              <OrderCard key={order.id} order={order} index={idx} number={idx + 1} />
            ))}
          </div>
        )}

        {/* Session summary */}
        {orders.length > 0 && (
          <div style={{
            marginTop: 16, background: 'var(--s2)', borderRadius: 12,
            padding: '14px 16px', border: '1px solid var(--border)',
          }}>
            <div style={{
              fontSize: '0.68rem', fontWeight: 700, color: 'var(--t3)',
              textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
            }}>
              Session Total
            </div>
            {[
              ['Subtotal', sessionSubtotal],
              ['VAT (18%)', sessionTax],
              ['Service (10%)', sessionService],
            ].map(([label, val]) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: '0.82rem', color: 'var(--t2)', marginBottom: 5,
              }}>
                <span>{label}</span>
                <span style={{ fontFamily: "'DM Mono', monospace" }}>{formatPrice(val)}</span>
              </div>
            ))}
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              paddingTop: 10, marginTop: 6, borderTop: '1px solid var(--border)',
              fontWeight: 800, fontSize: '1.05rem',
            }}>
              <span>Total</span>
              <span style={{ fontFamily: "'DM Mono', monospace", color: 'var(--accent)' }}>
                {formatPrice(sessionTotal)}
              </span>
            </div>
          </div>
        )}

        {/* Payment section */}
        {allServed && !paymentState && orders.length > 0 && (
          <button
            className="btn btn-primary payment-pulse"
            style={{ width: '100%', marginTop: 16, padding: '14px 0', fontSize: '0.92rem' }}
            onClick={() => setShowPayment(true)}
          >
            Request Bill · {formatPrice(sessionTotal)}
          </button>
        )}

        {/* End session */}
        <button onClick={handleEndSession} className="btn btn-danger" style={{ width: '100%', marginTop: 12 }}>
          End Session
        </button>
      </div>

      {showPayment && orders.length > 0 && (
        <PaymentSheet
          order={{ id: orders[0].id, total_amount: sessionTotal }}
          allOrderIds={orders.map(o => o.id)}
          onClose={() => setShowPayment(false)}
          onComplete={() => {
            setShowPayment(false)
            setPaymentState('completed')
            clearTable(true)
            setTableInfo(null)
            setOrders([])
          }}
        />
      )}
    </div>
  )
}

const STATUS_CONFIG = {
  open:      { label: 'Placed',    color: '#3b82f6', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.18)', accent: 'rgba(59,130,246,0.5)'  },
  preparing: { label: 'Preparing', color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.18)', accent: 'rgba(245,158,11,0.5)'  },
  ready:     { label: 'Ready',     color: '#22c55e', bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.18)',  accent: 'rgba(34,197,94,0.5)'   },
  served:    { label: 'Served',    color: '#22c55e', bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.18)',  accent: 'rgba(34,197,94,0.5)'   },
  done:      { label: 'Served',    color: '#22c55e', bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.18)',  accent: 'rgba(34,197,94,0.5)'   },
  cancelled: { label: 'Cancelled', color: '#ef4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.18)', accent: 'rgba(239,68,68,0.5)'   },
}

function OrderCard({ order, index, number }) {
  const status = order.status || 'open'
  const s = STATUS_CONFIG[status] || STATUS_CONFIG.open
  const items = order.order_items || []
  const time = order.placed_at
    ? new Date(order.placed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <div className="stagger-item" style={{
      background: 'var(--s2)', borderRadius: 12,
      border: '1px solid var(--border)', overflow: 'hidden',
      animationDelay: `${index * 0.08}s`,
      position: 'relative',
    }}>
      {/* Status accent bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: s.accent,
      }} />

      {/* Order header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '12px 14px 8px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 30, height: 30, borderRadius: '50%', background: 'var(--s3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.7rem', fontWeight: 800, color: 'var(--t2)',
            border: '1px solid var(--border)',
          }}>
            #{number}
          </span>
          <div>
            <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--t1)' }}>Order #{number}</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.68rem', color: 'var(--t3)' }}>{time}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <StatusDot status={status} color={s.color} />
          <span style={{
            padding: '3px 9px', borderRadius: 100,
            fontSize: '0.6rem', fontWeight: 700,
            background: s.bg, color: s.color,
            border: `1px solid ${s.border}`,
            textTransform: 'uppercase', letterSpacing: 0.6,
          }}>
            {s.label}
          </span>
        </div>
      </div>

      {/* Items list */}
      <div style={{ padding: '4px 14px 6px' }}>
        {items.map(item => (
          <div key={item.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '7px 0',
            borderBottom: '1px solid var(--border)',
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: 8, background: 'var(--s3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1rem', flexShrink: 0,
            }}>
              {categoryEmoji(item.dishes?.category)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '0.82rem', fontWeight: 500, color: 'var(--t1)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {item.dishes?.name || 'Dish'}
              </div>
              <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.68rem', color: 'var(--t3)' }}>
                {item.quantity}x {formatPrice(item.unit_price)}
              </div>
            </div>
            <span style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '0.82rem', color: 'var(--t1)', fontWeight: 600, flexShrink: 0,
            }}>
              {formatPrice(item.unit_price * item.quantity)}
            </span>
          </div>
        ))}
      </div>

      {/* Order total */}
      <div style={{
        padding: '10px 14px',
        display: 'flex', justifyContent: 'space-between',
        fontSize: '0.84rem',
      }}>
        <span style={{ color: 'var(--t3)', fontWeight: 600 }}>Order Total</span>
        <span style={{ fontFamily: "'DM Mono', monospace", color: 'var(--accent)', fontWeight: 800 }}>
          {formatPrice(order.total_amount)}
        </span>
      </div>
    </div>
  )
}

function StatusDot({ status, color }) {
  if (status === 'served' || status === 'done') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    )
  }
  if (status === 'preparing') {
    return (
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: color, display: 'inline-block',
        animation: 'statusShimmer 1.2s ease-in-out infinite alternate',
      }} />
    )
  }
  if (status === 'ready') {
    return (
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: color, display: 'inline-block',
        animation: 'statusPulse 1.5s ease-in-out infinite',
        boxShadow: `0 0 6px ${color}`,
      }} />
    )
  }
  if (status === 'open') {
    return (
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: color, display: 'inline-block',
        animation: 'statusPulse 2s ease-in-out infinite',
        boxShadow: `0 0 6px ${color}`,
      }} />
    )
  }
  return null
}

function EmptyTableState({
  onStartDemo, demoLoading, demoError,
  codeInput, setCodeInput, onEnterCode, codeLoading, codeError,
}) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '75vh', padding: '2rem',
      maxWidth: 400, margin: '0 auto',
    }}>
      {/* Icon */}
      <div style={{
        width: 96, height: 96, borderRadius: '50%',
        background: 'var(--s3)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 24,
      }}>
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
          <line x1="7" y1="10" x2="17" y2="10" strokeWidth="1.6" />
          <line x1="7" y1="13" x2="13" y2="13" strokeWidth="1.6" />
        </svg>
      </div>

      <h2 style={{
        fontFamily: "'Playfair Display', serif",
        fontSize: '1.3rem', fontWeight: 700, marginBottom: 8, color: 'var(--t1)',
      }}>
        No Active Table
      </h2>
      <p style={{
        fontSize: '0.84rem', color: 'var(--t3)', textAlign: 'center',
        lineHeight: 1.6, maxWidth: 280, marginBottom: 28,
      }}>
        Enter the table code shown on your table card to start a dining session and place orders.
      </p>

      {/* Code entry form — primary action */}
      <form
        onSubmit={onEnterCode}
        style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <input
          className="input"
          type="text"
          placeholder="e.g. BELLA-T2"
          value={codeInput}
          onChange={e => setCodeInput(e.target.value)}
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          style={{
            width: '100%', textAlign: 'center',
            fontSize: '1.1rem', fontWeight: 700, letterSpacing: 2,
            fontFamily: "'DM Mono', monospace",
            padding: '13px 16px', borderRadius: 10,
            boxSizing: 'border-box',
            textTransform: 'uppercase',
          }}
        />
        <button
          type="submit"
          disabled={codeLoading || !codeInput.trim()}
          className="btn btn-primary"
          style={{
            width: '100%', padding: '13px 0', fontSize: '0.88rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: (codeLoading || !codeInput.trim()) ? 0.6 : 1,
          }}
          onPointerDown={e => e.currentTarget.style.transform = 'scale(0.97)'}
          onPointerUp={e => e.currentTarget.style.transform = 'scale(1)'}
          onPointerLeave={e => e.currentTarget.style.transform = 'scale(1)'}
        >
          {codeLoading ? (
            <><span className="spinner" style={{ width: 14, height: 14 }} /> Checking...</>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              Join Table
            </>
          )}
        </button>
      </form>

      {codeError && (
        <p style={{ fontSize: '0.78rem', color: 'var(--red)', marginTop: 10, textAlign: 'center' }}>
          {codeError}
        </p>
      )}

      {/* Divider */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', margin: '24px 0 16px',
      }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ fontSize: '0.68rem', color: 'var(--t4)', fontWeight: 500 }}>or</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      {/* Demo session — secondary action */}
      <button
        onClick={onStartDemo}
        disabled={demoLoading}
        style={{
          background: 'none', border: '1px solid var(--border)', borderRadius: 8,
          padding: '10px 24px', fontSize: '0.82rem', color: 'var(--t3)',
          cursor: demoLoading ? 'default' : 'pointer',
          display: 'flex', alignItems: 'center', gap: 7,
          opacity: demoLoading ? 0.6 : 1,
          transition: 'border-color 150ms, color 150ms',
        }}
        onPointerEnter={e => { e.currentTarget.style.borderColor = 'var(--t3)'; e.currentTarget.style.color = 'var(--t2)' }}
        onPointerLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--t3)' }}
      >
        {demoLoading ? (
          <><span className="spinner" style={{ width: 12, height: 12 }} /> Setting up...</>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M4 8V6a2 2 0 012-2h12a2 2 0 012 2v2" />
              <rect x="6" y="8" width="12" height="8" rx="1" />
            </svg>
            Start Demo Session
          </>
        )}
      </button>

      {demoError && (
        <p style={{ fontSize: '0.78rem', color: 'var(--red)', marginTop: 8, textAlign: 'center' }}>{demoError}</p>
      )}

      <p style={{ fontSize: '0.65rem', color: 'var(--t4)', marginTop: 10, textAlign: 'center' }}>
        Demo mode assigns a free table for testing
      </p>
    </div>
  )
}

function TableSkeleton() {
  return (
    <div>
      <div className="skeleton" style={{ height: 200, borderRadius: 0 }} />
      <div style={{ maxWidth: 470, margin: '0 auto', padding: 16 }}>
        <div className="skeleton" style={{ height: 44, borderRadius: 8, marginBottom: 20 }} />
        {[1, 2].map(i => (
          <div key={i} className="skeleton" style={{ height: 150, borderRadius: 12, marginBottom: 12 }} />
        ))}
        <div className="skeleton" style={{ height: 120, borderRadius: 12 }} />
      </div>
    </div>
  )
}
