import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { rsrc } from '../lib/publicSource'
import { useCart, useTableLookup } from '../contexts/CartContext'
import { useAuth } from '../contexts/AuthContext'
import { formatPrice, cuisineEmoji, cuisineBackground } from '../lib/helpers'
import AuthModal from '../components/AuthModal'
import { BillEntry } from '../features/bills/mounts'
import { ActiveBookingBanner } from '../features/bookings/mounts'
import PendingJoin from '../components/table/PendingJoin'
import TableParty from '../components/table/TableParty'
import CallWaiterSheet from '../components/table/CallWaiterSheet'
import {
  LIVE_STATUSES, OrderCard, OrderTotals, SeatChip, claimErrorMessage, ratesFromOrders,
} from '../features/dinein/mounts'

// Orders that belong to the guest's CURRENT visit: still in flight or served, plus the ones staff cancelled
// (told to the guest as a notice, not listed as orders); never paid / refunded ones left over from an earlier
// visit to the same table.
const CURRENT_VISIT_STATUSES = [...LIVE_STATUSES, 'cancelled']

// Safety net for a dropped realtime connection: re-read the orders now and then while the screen is open.
const ORDERS_POLL_MS = 20000

// `startedAt` = table_sessions.started_at of the current visit (my_table_session().started_at).
// When it is not known the status filter alone applies. `orders` has no created_at column;
// placed_at (server default now()) is the equivalent creation timestamp.
function fetchVisitOrders(tableId, userId, startedAt) {
  let q = supabase
    .from('orders')
    .select('*, order_items(*, dishes(name, category, price))')
    .eq('table_id', tableId)
    .eq('user_id', userId)
    .in('status', CURRENT_VISIT_STATUSES)
  if (startedAt) q = q.gte('placed_at', startedAt)
  return q.order('placed_at', { ascending: true })
}

export default function TablePage() {
  const { t } = useTranslation(['table', 'booking', 'common'])
  const { tableId, restaurantId, setTable, claimTable, clearTable, sessionStatus, startedAt, syncStartedAt, seatNo } = useCart()
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
  const [showAuthModal, setShowAuthModal] = useState(false)
  // The table lives on the server: a new tab (or another device) learns it from my_table_session, so the
  // "no active table" screen waits until that read has answered.
  const lookingForTable = useTableLookup()
  // A table that arrives after this screen mounted starts a load: never paint the empty page before it.
  const [seenTable, setSeenTable] = useState(tableId)
  if (seenTable !== tableId) {
    setSeenTable(tableId)
    if (tableId) setLoading(true)
  }

  // Realtime callbacks outlive the render that created them: read the visit start via a ref.
  const startedAtRef = useRef(startedAt)
  startedAtRef.current = startedAt

  function refetchOrders() {
    if (!session || !tableId) return
    fetchVisitOrders(tableId, session.user.id, startedAtRef.current)
      .then(({ data }) => setOrders(data || []))
  }

  useEffect(() => {
    // A guest still waiting on host approval has no RLS access to place orders and
    // shouldn't be querying/subscribing here — PendingJoin owns that screen instead.
    if (!tableId || sessionStatus === 'pending') { setLoading(false); return }

    let orderChannel
    let ordersPoll
    let kdsChannel
    let tableChannel
    let cancelled = false

    async function load() {
      setLoading(true)

      const { data: table } = await supabase
        .from('tables')
        .select(`id, table_number, capacity, state, restaurant_id, sections(name), ${rsrc()}(name, slug, cuisine_type)`)
        .eq('id', tableId)
        .single()

      if (cancelled) return
      if (table) {
        setTableInfo(table)
        if (table.state === 'awaiting_payment') setPaymentState('requested')
        // Table state is now owned entirely by claim_table()/leave_table() server-side —
        // the client never writes `tables` directly, so there's no self-heal here.
      }

      if (session) {
        // A booking/QR path may have seated the guest without the visit start; fetch it once
        // so earlier (paid) orders at this table never show up in this visit.
        const started = startedAtRef.current || await syncStartedAt()
        if (cancelled) return
        const { data } = await fetchVisitOrders(tableId, session.user.id, started)
        if (cancelled) return
        setOrders(data || [])
      }

      if (cancelled) return
      setLoading(false)

      orderChannel = supabase
        .channel(`table-orders-${tableId}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'orders',
          filter: `table_id=eq.${tableId}`,
        }, () => refetchOrders())
        .subscribe(status => {
          if (status === 'SUBSCRIBED') refetchOrders()   // catch up on whatever happened before the channel came up
        })
      ordersPoll = setInterval(() => {
        if (document.visibilityState === 'visible') refetchOrders()
      }, ORDERS_POLL_MS)

      kdsChannel = supabase
        .channel(`kds-updates-${tableId}`)
        .on('postgres_changes', {
          // Scoped to this table's own restaurant — without this filter every
          // restaurant's kitchen ticket updates triggered a refetch here.
          event: 'UPDATE', schema: 'public', table: 'kds_tickets',
          filter: `restaurant_id=eq.${restaurantId}`,
        }, () => refetchOrders())
        .subscribe()

      tableChannel = supabase
        .channel(`table-state-${tableId}`)
        .on('postgres_changes', {
          event: 'UPDATE', schema: 'public', table: 'tables',
          filter: `id=eq.${tableId}`,
        }, (payload) => {
          // Realtime broadcasts the whole row regardless of our select() column list, so
          // merge only the fields we actually render — never access_code/qr_code_token.
          const { state, table_number, capacity } = payload.new
          setTableInfo(prev => prev ? { ...prev, state, table_number, capacity } : prev)
          if (state === 'free') {
            clearTable()
            setTableInfo(null)
            setOrders([])
          } else if (state === 'cleared') {
            // The bill was settled and staff cleared the table. The guest's session is still theirs until they
            // tap Leave: keep the table (receipt, review prompt and Leave stay reachable) instead of dropping it.
            refetchOrders()
          }
        })
        .subscribe()
    }

    load()
    return () => {
      cancelled = true
      if (orderChannel) supabase.removeChannel(orderChannel)
      if (ordersPoll) clearInterval(ordersPoll)
      if (kdsChannel) supabase.removeChannel(kdsChannel)
      if (tableChannel) supabase.removeChannel(tableChannel)
    }
    // Depend on the stable user id, not the whole `session` object (which gets a new
    // identity on every token refresh and would otherwise re-subscribe needlessly).
    // Also re-run when sessionStatus flips pending -> active (host just approved).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, session?.user?.id, sessionStatus])

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
    const { error } = await claimTable(code)
    setCodeLoading(false)
    if (error) {
      setCodeError(claimErrorMessage(error, t))
      return
    }
    setCodeInput('')
  }

  // Dev-only convenience: seats the caller at any free table so the ordering flow can
  // be exercised without a real QR code or access code. Never rendered in production
  // (see the `import.meta.env.DEV` guard around EmptyTableState below).
  async function startDemo() {
    if (!import.meta.env.DEV) return
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
      .select(`id, table_number, capacity, restaurant_id, ${rsrc()}(name, slug, cuisine_type)`)
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

  if (loading || lookingForTable) return <TableSkeleton />
  if (!tableId) return (
    <>
      <div className="table-empty-banner"><ActiveBookingBanner /></div>
      <EmptyTableState
        onStartDemo={startDemo} demoLoading={demoLoading} demoError={demoError}
        codeInput={codeInput} setCodeInput={setCodeInput}
        onEnterCode={enterCode} codeLoading={codeLoading} codeError={codeError}
        showDemo={import.meta.env.DEV}
      />
      {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
    </>
  )
  if (sessionStatus === 'pending') return <PendingJoin tableId={tableId} />

  // `orders` also holds the ones staff cancelled: those are a notice, never a card, never part of the amounts.
  const liveOrders = orders.filter(o => o.status !== 'cancelled')
  const cancelledNotes = orders
    .map((o, i) => ({ id: o.id, number: i + 1, status: o.status }))
    .filter(o => o.status === 'cancelled')
  const allItems = liveOrders.flatMap(o => o.order_items || [])
  const sessionSubtotal = liveOrders.reduce((s, o) => s + (o.subtotal || 0), 0)
  const sessionTax = liveOrders.reduce((s, o) => s + (o.tax_amount || 0), 0)
  const sessionService = liveOrders.reduce((s, o) => s + (o.service_charge || 0), 0)
  const sessionTotal = liveOrders.reduce((s, o) => s + (o.total_amount || 0), 0)
  // Labels show the restaurant's actual configured rate, derived from the server-computed
  // amounts (orders.tax_amount / service_charge), never a hardcoded percentage — different
  // restaurants can have different restaurant_settings.tax_rate / service_charge.
  const rates = ratesFromOrders(liveOrders)
  // The bill was settled and staff cleared the table, but the guest has not left yet.
  const tableCleared = tableInfo?.state === 'cleared'

  const allServed = liveOrders.length > 0 && liveOrders.every(o =>
    o.status === 'served' || o.status === 'ready'
  )

  const emoji = tableInfo?.restaurants ? cuisineEmoji(tableInfo.restaurants.cuisine_type) : '🍽️'
  const bgGrad = tableInfo?.restaurants ? cuisineBackground(tableInfo.restaurants.cuisine_type) : 'var(--s3)'

  return (
    <div>
      {/* Gradient header */}
      <div style={{
        position: 'relative', overflow: 'hidden',
        background: bgGrad, padding: '16px 16px 28px',
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
          <button className="table-back-btn" onClick={() => navigate(-1)} aria-label={t('common:back')}>
            <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
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
                {t('table:yourTable')}
              </h1>
              <div style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: '0.82rem', color: 'rgba(255,255,255,0.7)', marginTop: 2,
              }}>
                #{tableInfo?.table_number || '—'}
                {tableInfo?.restaurants?.name && ` · ${tableInfo.restaurants.name}`}
                {tableInfo?.sections?.name && ` · ${tableInfo.sections.name}`}
              </div>
              {seatNo ? <div className="dn-table-seat"><SeatChip seatNo={seatNo} /></div> : null}
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
                {t('common:active')}
              </span>
            </div>
          </div>

          {/* Stats row */}
          <div style={{
            display: 'flex', gap: 24, marginTop: 20,
            paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)',
          }}>
            {[
              { val: liveOrders.length, label: t('table:statOrders') },
              { val: allItems.length, label: t('table:statItems') },
              { val: formatPrice(sessionTotal), label: t('table:statTotal'), accent: true },
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
        {tableInfo?.restaurants?.slug && !paymentState && !tableCleared && (
          <Link to={`/restaurant/${tableInfo.restaurants.slug}`} className="tap-h" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            width: '100%', padding: '11px 0', marginBottom: 20,
            background: 'var(--accent)', color: 'var(--t1)', fontWeight: 700,
            fontSize: '0.88rem', borderRadius: 8,
            textDecoration: 'none', transition: 'background 0.15s',
          }}>
            <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.2" style={{ width: 17, height: 17, stroke: 'currentColor' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {t('table:addMoreItems')}
          </Link>
        )}

        {/* Who's at the table + join requests (host only) */}
        {!paymentState && !tableCleared && <TableParty tableId={tableId} />}

        {/* Call waiter */}
        {!paymentState && !tableCleared && <CallWaiterSheet tableId={tableId} />}

        {/* Orders staff cancelled: said once, the order itself is gone from the list */}
        {cancelledNotes.length > 0 && (
          <div className="dn-notices" role="status">
            {cancelledNotes.map(n => (
              <p key={n.id} className="dn-notice">{t('table:orderCancelledNote', { number: n.number })}</p>
            ))}
          </div>
        )}

        {tableCleared && <p className="dn-cleared" role="status">{t('table:tableCleared')}</p>}

        {/* Orders */}
        {liveOrders.length === 0 ? (tableCleared ? null : (
          <div style={{
            textAlign: 'center', padding: '3rem 1.5rem',
            background: 'var(--s2)', borderRadius: 12,
            border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 12, opacity: 0.35 }}>📋</div>
            <p style={{ fontFamily: "'Playfair Display', serif", fontSize: '1rem', fontWeight: 700, color: 'var(--t1)', marginBottom: 4 }}>
              {t('table:noOrdersYet')}
            </p>
            <p style={{ fontSize: '0.8rem', color: 'var(--t3)', lineHeight: 1.5 }}>
              {session
                ? t('table:noOrdersHintSignedIn')
                : t('table:noOrdersHintSignedOut')}
            </p>
          </div>
        )) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {orders.map((order, idx) => (order.status === 'cancelled' ? null : (
              <OrderCard key={order.id} order={order} number={idx + 1} rates={rates} />
            )))}
          </div>
        )}

        {/* Session summary: the server's amounts, VAT and service charge itemised */}
        {liveOrders.length > 0 && (
          <div className="dn-session-card">
            <div className="dn-session-title">{t('table:sessionTotal')}</div>
            <OrderTotals
              subtotal={sessionSubtotal} tax={sessionTax} service={sessionService} total={sessionTotal}
              taxPct={rates?.taxRate ?? null} servicePct={rates?.serviceRate ?? null}
            />
          </div>
        )}

        {/* Payment section: the v2 bill screen (split, tip, pay) replaces the old PaymentSheet. */}
        {((allServed && liveOrders.length > 0) || tableCleared) && (
          <BillEntry total={liveOrders.length > 0 ? sessionTotal : undefined} />
        )}

        {/* End session */}
        <button onClick={handleEndSession} className="btn btn-danger" style={{ width: '100%', marginTop: 12 }}>
          {t('table:endSession')}
        </button>
      </div>
    </div>
  )
}

function EmptyTableState({
  onStartDemo, demoLoading, demoError,
  codeInput, setCodeInput, onEnterCode, codeLoading, codeError,
  showDemo,
}) {
  const { t } = useTranslation(['table', 'common'])
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
        {t('table:noActiveTable')}
      </h2>
      <p style={{
        fontSize: '0.84rem', color: 'var(--t3)', textAlign: 'center',
        lineHeight: 1.6, maxWidth: 280, marginBottom: 28,
      }}>
        {t('table:noActiveTableHint')}
      </p>

      {/* Code entry form — primary action */}
      <form
        onSubmit={onEnterCode}
        style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <input
          className="input"
          type="text"
          placeholder={t('table:codePlaceholder')}
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
            <><span className="spinner" style={{ width: 14, height: 14 }} /> {t('table:checking')}</>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              {t('table:joinTable')}
            </>
          )}
        </button>
      </form>

      {codeError && (
        <p style={{ fontSize: '0.78rem', color: 'var(--red)', marginTop: 10, textAlign: 'center' }}>
          {codeError}
        </p>
      )}

      {showDemo && (
        <>
          {/* Divider */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            width: '100%', margin: '24px 0 16px',
          }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: '0.68rem', color: 'var(--t4)', fontWeight: 500 }}>{t('common:or')}</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          {/* Demo session — secondary action, dev builds only */}
          <button
            onClick={onStartDemo}
            disabled={demoLoading}
            className="tap-h"
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
              <><span className="spinner" style={{ width: 12, height: 12 }} /> {t('table:settingUp')}</>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M4 8V6a2 2 0 012-2h12a2 2 0 012 2v2" />
                  <rect x="6" y="8" width="12" height="8" rx="1" />
                </svg>
                {t('table:startDemoSession')}
              </>
            )}
          </button>

          {demoError && (
            <p style={{ fontSize: '0.78rem', color: 'var(--red)', marginTop: 8, textAlign: 'center' }}>{demoError}</p>
          )}

          <p style={{ fontSize: '0.65rem', color: 'var(--t4)', marginTop: 10, textAlign: 'center' }}>
            {t('table:demoHint')}
          </p>
        </>
      )}
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
