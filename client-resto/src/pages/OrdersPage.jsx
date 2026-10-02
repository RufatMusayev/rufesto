import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatPrice, timeAgo, categoryEmoji } from '@shared/helpers'
import { orderStatusStyle, orderStatusLabelKey } from '../lib/orderStatus'
import { bakuTodayStartISO } from '../lib/time'
import { debounce } from '../lib/debounce'
import { subscribeResync } from '../lib/realtime'
import { friendlyError, writeError } from '../lib/errors'
import { roleCan } from '../lib/roles'

// Real `order_status` values. `submitted` / `refunded` chips only appear while
// there is an order in that status (or the chip is selected).
const FILTERS = ['all', 'open', 'submitted', 'preparing', 'ready', 'served', 'paid', 'cancelled', 'refunded']
const OPTIONAL_FILTERS = ['submitted', 'refunded']
// Statuses a staff member can still cancel from.
const CANCELLABLE = ['open', 'submitted', 'preparing', 'ready']
// Other orders in these statuses don't hold a table back from being cleared.
const SETTLED = ['paid', 'cancelled', 'refunded'] // served = delivered but still unpaid
// staff_guest_names() takes at most 200 ids per call (sql/52b).
const NAME_CHUNK = 200

// Marking an order paid fires the DB trigger that clears its table, and the table
// state machine only allows that from awaiting_payment. So "Mark Paid" is offered
// only when the order has no table, or the table is awaiting payment and nothing
// else on it is still in progress. Returns the i18n key of the reason it is not
// available yet, or null when it is. `orders` is today's list (what this page loads).
function markPaidBlockReason(order, orders) {
  if (!order.table_id) return null
  if (order.tables?.state !== 'awaiting_payment') return 'markPaidNeedsBill'
  const othersInProgress = orders.some(o =>
    o.id !== order.id && o.table_id === order.table_id && !SETTLED.includes(o.status))
  return othersInProgress ? 'markPaidOthersOpen' : null
}

export default function OrdersPage() {
  const { restaurantId, staffRow } = useAuth()
  const { t } = useTranslation(['dashboard', 'common'])
  // Role matrix (sql/52b): served / cancelled for waiter, host, manager, admin; paid for cashier, manager, admin.
  const role = staffRow?.role
  const canFlow = roleCan(role, 'orderFlow')
  const canPay = roleCan(role, 'orderPaid')
  const [orders, setOrders] = useState([])
  // Guest names by user id. Only floor staff may ask, and only through the RPC: a waiter no longer reads `users`,
  // and nobody here needs a guest's e-mail or phone. askedIds stops a realtime reload re-asking known guests.
  const [guestNames, setGuestNames] = useState({})
  const askedIds = useRef(new Set())
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(new Set())
  const [acting, setActing] = useState(null)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    if (!restaurantId) return
    askedIds.current = new Set()
    setGuestNames({})
    loadOrders()

    const debouncedLoad = debounce(loadOrders, 400)
    const ch = supabase
      .channel(`dash-orders-${restaurantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` }, debouncedLoad)
      // order_items has no restaurant_id column and isn't in the
      // supabase_realtime publication, so it can never fire here. kds_tickets
      // is what actually reflects item/KDS progress (started/ready/done) —
      // listen to that instead to keep expanded order rows live.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kds_tickets', filter: `restaurant_id=eq.${restaurantId}` }, debouncedLoad)
      // The Mark Paid button depends on the table's state (awaiting_payment).
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables', filter: `restaurant_id=eq.${restaurantId}` }, debouncedLoad)

    const stop = subscribeResync(ch, debouncedLoad)
    return () => { debouncedLoad.cancel(); stop() }
  }, [restaurantId])

  async function loadOrders() {
    const { data } = await supabase
      .from('orders')
      .select('*, tables(table_number, state), order_items(id, quantity, unit_price, line_total, status, dishes(name, category, price))')
      .eq('restaurant_id', restaurantId)
      .gte('placed_at', bakuTodayStartISO())
      .order('placed_at', { ascending: false })

    setOrders(data || [])
    setLoading(false)
    loadGuestNames(data || [])
  }

  async function loadGuestNames(rows) {
    const ids = [...new Set(rows.map(o => o.user_id).filter(id => id && !askedIds.current.has(id)))]
    if (!ids.length) return
    ids.forEach(id => askedIds.current.add(id))
    const found = {}
    for (let i = 0; i < ids.length; i += NAME_CHUNK) {
      const chunk = ids.slice(i, i + NAME_CHUNK)
      const { data, error } = await supabase.rpc('staff_guest_names', { p_restaurant_id: restaurantId, p_user_ids: chunk })
      if (error) { chunk.forEach(id => askedIds.current.delete(id)); continue }   // retried on the next reload
      for (const g of data || []) if (g?.user_id && g.name) found[g.user_id] = g.name
    }
    if (Object.keys(found).length) setGuestNames(prev => ({ ...prev, ...found }))
  }

  async function updateStatus(orderId, status) {
    setActing(orderId)
    const prevStatus = orders.find(o => o.id === orderId)?.status
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o))
    const error = writeError(await supabase.from('orders').update({ status }).eq('id', orderId).select('id'))
    if (error) {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: prevStatus } : o))
      setActionError(friendlyError(error, t))
    }
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
    .filter(o => o.status !== 'cancelled' && o.status !== 'refunded')
    .reduce((s, o) => s + (o.total_amount || 0), 0)

  return (
    <div style={{ padding: '1.25rem' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1.25rem', paddingBottom:'1rem', borderBottom:'1px solid var(--border)' }}>
        <div>
          <h1 className="page-title">{t('dashboard:ordersTitle')}</h1>
          <span style={{ fontSize:'0.72rem', color:'var(--t3)', marginTop:2, display:'block' }}>
            {t('dashboard:ordersToday', { count: orders.length })}
          </span>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:'1.35rem', fontWeight:900, color:'var(--gold)', lineHeight:1.1 }}>
            {formatPrice(todayRevenue)}
          </div>
          <div style={{ fontSize:'0.68rem', color:'var(--t3)', marginTop:2 }}>{t('dashboard:todaysRevenue')}</div>
        </div>
      </div>

      {actionError && (
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between', gap:8,
          padding:'0.6rem 0.85rem', borderRadius:10, marginBottom:'0.85rem',
          background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)',
          color:'var(--red)', fontSize:'0.8rem', fontWeight:500,
        }}>
          <span>{actionError}</span>
          <button onClick={() => setActionError('')} style={{ background:'none', border:'none', color:'inherit', cursor:'pointer', fontSize:'1rem', lineHeight:1 }}>✕</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', marginBottom: '1.25rem' }} className="no-scrollbar">
        {FILTERS.map(f => {
          const cnt = f === 'all' ? orders.length : (statusCounts[f] || 0)
          if (OPTIONAL_FILTERS.includes(f) && cnt === 0 && filter !== f) return null
          const sm = f !== 'all' ? orderStatusStyle(f) : null
          return (
            <button key={f} className={`chip${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
              {sm && <span style={{ width: 6, height: 6, borderRadius: '50%', background: sm.color, display: 'inline-block', marginRight: 4 }} />}
              {f === 'all' ? t('dashboard:filterAll') : t(`dashboard:${orderStatusLabelKey(f)}`)} ({cnt})
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty"><div className="empty-icon">📋</div>{t('dashboard:noOrdersMatch')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.map(o => (
            <OrderCard key={o.id} order={o}
              expanded={expanded.has(o.id)}
              onToggle={() => toggleExpand(o.id)}
              onUpdateStatus={updateStatus}
              acting={acting === o.id}
              payBlock={markPaidBlockReason(o, orders)}
              guestName={guestNames[o.user_id]}
              canFlow={canFlow}
              canPay={canPay}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function OrderCard({ order, expanded, onToggle, onUpdateStatus, acting, payBlock, guestName, canFlow, canPay }) {
  const { t } = useTranslation(['dashboard', 'common'])
  const s = orderStatusStyle(order.status)
  const items = order.order_items || []
  const time = order.placed_at
    ? new Date(order.placed_at).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
    : ''
  const showServed = canFlow && order.status === 'ready'
  const showPaid = canPay && order.status === 'served'
  const showCancel = canFlow && CANCELLABLE.includes(order.status)

  return (
    <div style={{
      background:'var(--s2)', borderRadius:14,
      border:'1px solid var(--border)', overflow:'hidden',
      transition:'border-color 0.2s, transform 0.15s',
    }}
      onMouseEnter={e => e.currentTarget.style.transform='translateY(-1px)'}
      onMouseLeave={e => e.currentTarget.style.transform='translateY(0)'}
    >
      {/* Status accent bar */}
      <div style={{ height:2, background: s.color, opacity:0.6 }} />

      <div onClick={onToggle} style={{
        padding:'0.75rem 1rem', cursor:'pointer',
        display:'flex', alignItems:'center', gap:'0.75rem',
      }}>
        <div style={{
          width:40, height:40, borderRadius:10,
          background:'var(--s3)', border:'1px solid var(--border)',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontWeight:900, fontSize:'0.8rem',
          color: s.color, flexShrink:0,
          fontFamily:"'Playfair Display', Georgia, serif",
        }}>
          {order.tables?.table_number || '?'}
        </div>

        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontWeight:700, fontSize:'0.85rem' }}>
              {t('dashboard:itemCount', { count: items.length })}
            </span>
            <span style={{ fontSize:'0.68rem', color:'var(--t3)' }}>
              · {time} · {timeAgo(order.placed_at)}
            </span>
          </div>
          <div style={{ fontSize:'0.7rem', color:'var(--t3)', marginTop:2 }}>
            {guestName || t('dashboard:guest')}
          </div>
        </div>

        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontWeight:900, fontSize:'0.92rem' }}>{formatPrice(order.total_amount)}</div>
            <span style={{
              fontSize:'0.58rem', fontWeight:700, padding:'2px 7px', borderRadius:4,
              background: s.bg, color: s.color, border:`1px solid ${s.border}`,
              textTransform:'uppercase', letterSpacing:0.5,
            }}>{t(`dashboard:${orderStatusLabelKey(order.status)}`)}</span>
          </div>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="2.5" strokeLinecap="round"
            style={{ flexShrink:0, transition:'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'rotate(0)' }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
      </div>

      {expanded && (
        <div style={{
          borderTop:'1px solid var(--border)', padding:'0.65rem 1rem 0.85rem',
          animation:'fadeSlideUp 0.18s ease',
        }}>
          {items.map(item => (
            <div key={item.id} style={{
              display:'flex', alignItems:'center', gap:8,
              padding:'0.4rem 0', borderBottom:'1px solid var(--border)',
            }}>
              <span style={{ fontSize:'0.95rem', width:28, textAlign:'center', flexShrink:0 }}>
                {categoryEmoji(item.dishes?.category)}
              </span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:'0.8rem', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {item.dishes?.name || 'Dish'}
                </div>
                <div style={{ fontSize:'0.65rem', color:'var(--t3)' }}>
                  {item.quantity}× {formatPrice(item.unit_price)}
                </div>
              </div>
              <span style={{ fontSize:'0.8rem', fontWeight:600, flexShrink:0 }}>
                {formatPrice(item.line_total || item.unit_price * item.quantity)}
              </span>
            </div>
          ))}

          <div style={{ display:'flex', justifyContent:'space-between', padding:'0.55rem 0 0.1rem', fontSize:'0.78rem', color:'var(--t2)' }}>
            <span>{t('common:subtotal')}</span><span>{formatPrice(order.subtotal)}</span>
          </div>
          {(order.tax_amount || 0) > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.72rem', color:'var(--t3)' }}>
              <span>{t('dashboard:tax')}</span><span>{formatPrice(order.tax_amount)}</span>
            </div>
          )}
          {(order.service_charge || 0) > 0 && (
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.72rem', color:'var(--t3)' }}>
              <span>{t('dashboard:service')}</span><span>{formatPrice(order.service_charge)}</span>
            </div>
          )}
          <div style={{
            display:'flex', justifyContent:'space-between', padding:'0.45rem 0 0',
            borderTop:'1px solid var(--border)', marginTop:'0.3rem',
            fontWeight:900, fontSize:'0.9rem',
          }}>
            <span>{t('dashboard:total')}</span>
            <span style={{ color:'var(--accent)' }}>{formatPrice(order.total_amount)}</span>
          </div>

          {(showServed || showPaid || showCancel) && (
          <div style={{ display:'flex', gap:'0.35rem', marginTop:'0.75rem' }}>
            {showServed && (
              <button className="btn btn-primary btn-sm" style={{ flex:1 }}
                onClick={() => onUpdateStatus(order.id, 'served')} disabled={acting}>
                {acting ? <span className="spinner" style={{ width:12, height:12 }} /> : t('dashboard:markServed')}
              </button>
            )}
            {showPaid && (
              <button className="btn btn-ghost btn-sm" style={{ flex:1 }}
                onClick={() => onUpdateStatus(order.id, 'paid')} disabled={acting || !!payBlock}
                title={payBlock ? t(`dashboard:${payBlock}`) : undefined}>
                {acting ? <span className="spinner" style={{ width:12, height:12 }} /> : t('dashboard:markPaid')}
              </button>
            )}
            {showCancel && (
              <button className="btn btn-danger btn-sm" style={{ minWidth:80 }}
                onClick={() => onUpdateStatus(order.id, 'cancelled')} disabled={acting}>
                {t('dashboard:cancel')}
              </button>
            )}
          </div>
          )}
          {showPaid && payBlock && (
            <div className="order-pay-hint">{t(`dashboard:${payBlock}`)}</div>
          )}
        </div>
      )}
    </div>
  )
}
