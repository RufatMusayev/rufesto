import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { formatPrice, timeAgo } from '../lib/format'
import { dishName } from '../lib/dishName'
import DishThumb from '../components/DishThumb'
import { orderStatusStyle, orderStatusLabelKey } from '../lib/orderStatus'
import { bakuDayLabel, bakuTimeLabel } from '../lib/time'
import { debounce } from '../lib/debounce'
import { subscribeResync } from '../lib/realtime'
import { friendlyError, writeError } from '../lib/errors'
import { canAccess, roleCan } from '../lib/roles'
import ActionBanner from '../components/ActionBanner'
import ChipScroller from '../components/ChipScroller'
import DayRangeChips from '../features/v2/components/DayRangeChips'
import useDayRange from '../features/v2/hooks/useDayRange'
import { SUMMARY_PRESETS, isTodayRange, rangeInstants } from '../features/v2/historyRange'
import '../features/v2/styles.css'

// Real `order_status` values. `submitted` / `refunded` chips only appear while
// there is an order in that status (or the chip is selected).
const FILTERS = ['all', 'open', 'submitted', 'preparing', 'ready', 'served', 'paid', 'cancelled', 'refunded']
const OPTIONAL_FILTERS = ['submitted', 'refunded']
// Statuses a staff member can still cancel from.
const CANCELLABLE = ['open', 'submitted', 'preparing', 'ready']
// staff_guest_names() takes at most 200 ids per call (sql/52b).
const NAME_CHUNK = 200

export default function OrdersPage() {
  const { restaurantId, staffRow } = useAuth()
  const { t } = useTranslation(['dashboard', 'common'])
  // Role matrix (sql/52b): served / cancelled for waiter, host, manager, admin. An order is never marked paid
  // here: the DB only accepts that through the table's bill (sql/54, use_bill_settlement), so a served order
  // links to Bills for the roles that can open it (admin, manager, cashier).
  const role = staffRow?.role
  const canFlow = roleCan(role, 'orderFlow')
  const canSettle = canAccess(role, '/bills')
  const rangeState = useDayRange('today')
  const { range } = rangeState
  const rangeRef = useRef(range)
  rangeRef.current = range
  const loadRef = useRef(null)
  const loadSeq = useRef(0)
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

  // Realtime: the handlers always load whichever range is on screen (loadRef), so switching range never needs a
  // new channel.
  useEffect(() => {
    if (!restaurantId) return undefined
    askedIds.current = new Set()
    setGuestNames({})

    const debouncedLoad = debounce(() => loadRef.current(), 400)
    const ch = supabase
      .channel(`dash-orders-${restaurantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` }, debouncedLoad)
      // order_items has no restaurant_id column and isn't in the
      // supabase_realtime publication, so it can never fire here. kds_tickets
      // is what actually reflects item/KDS progress (started/ready/done) —
      // listen to that instead to keep expanded order rows live.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kds_tickets', filter: `restaurant_id=eq.${restaurantId}` }, debouncedLoad)

    const stop = subscribeResync(ch, debouncedLoad)
    return () => { debouncedLoad.cancel(); stop() }
  }, [restaurantId])

  // First load, and again whenever the range (or restaurant) changes.
  useEffect(() => {
    if (!restaurantId) return
    setLoading(true)
    loadOrders()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, rangeState.key])

  async function loadOrders() {
    const mine = ++loadSeq.current
    const { fromISO, toISO } = rangeInstants(rangeRef.current)
    const { data } = await supabase
      .from('orders')
      .select('*, tables(table_number), order_items(id, quantity, unit_price, line_total, status, dishes(name, name_az, name_i18n, category, price, photo))')
      .eq('restaurant_id', restaurantId)
      .gte('placed_at', fromISO)
      .lt('placed_at', toISO)
      .order('placed_at', { ascending: false })
      .limit(1000)
    if (mine !== loadSeq.current) return   // the user has moved to another range meanwhile

    setOrders(data || [])
    setLoading(false)
    loadGuestNames(data || [])
  }
  loadRef.current = loadOrders

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

  // The value of the orders placed (VAT included), cancelled and refunded ones left out. This is NOT money
  // collected: that is the Overview's revenue and the Bills page.
  const orderValue = orders
    .filter(o => o.status !== 'cancelled' && o.status !== 'refunded')
    .reduce((s, o) => s + (o.total_amount || 0), 0)
  const today = isTodayRange(range)

  return (
    <div className="ord-page">
      <div className="ord-head">
        <div className="ord-head-main">
          <h1 className="page-title">{t('dashboard:ordersTitle')}</h1>
          <span className="ord-sub">
            {t(today ? 'dashboard:ordersToday' : 'dashboard:ordersInRange', { count: orders.length })}
          </span>
        </div>
        <div className="ord-value">
          <div className="ord-value-num">{formatPrice(orderValue)}</div>
          <div className="ord-value-label">{t('dashboard:ordersValueLabel')}</div>
        </div>
      </div>

      <DayRangeChips state={rangeState} presets={SUMMARY_PRESETS} />

      {actionError && <ActionBanner message={actionError} onClose={() => setActionError('')} />}

      <ChipScroller role="group" aria-label={t('dashboard:ordersTitle')}>
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
      </ChipScroller>

      {loading ? (
        <div className="ord-list" aria-hidden="true">
          {[1,2,3,4].map(i => <div key={i} className="skeleton ord-skel" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty"><div className="empty-icon">📋</div>{t('dashboard:noOrdersMatch')}</div>
      ) : (
        <div className="ord-list">
          {filtered.map(o => (
            <OrderCard key={o.id} order={o} showDate={!today}
              expanded={expanded.has(o.id)}
              onToggle={() => toggleExpand(o.id)}
              onUpdateStatus={updateStatus}
              acting={acting === o.id}
              guestName={guestNames[o.user_id]}
              canFlow={canFlow}
              canSettle={canSettle}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function OrderCard({ order, expanded, onToggle, onUpdateStatus, acting, guestName, canFlow, canSettle, showDate }) {
  const { t, i18n } = useTranslation(['dashboard', 'common'])
  const s = orderStatusStyle(order.status)
  const items = order.order_items || []
  // Restaurant time (Baku), like "today" above, whatever zone the viewer's device is set to.
  const clock = order.placed_at ? bakuTimeLabel(order.placed_at, i18n.language) : ''
  const time = showDate && order.placed_at ? `${bakuDayLabel(order.placed_at, i18n.language)} ${clock}` : clock
  const showServed = canFlow && order.status === 'ready'
  const showSettle = canSettle && order.status === 'served'
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
          {/* Wraps: the Russian item count and "N мин назад" are longer than the English, and the count must not break. */}
          <div style={{ display:'flex', alignItems:'center', flexWrap:'wrap', columnGap:6 }}>
            <span style={{ fontWeight:700, fontSize:'0.85rem', whiteSpace:'nowrap' }}>
              {t('dashboard:itemCount', { count: items.length })}
            </span>
            <span style={{ fontSize:'0.68rem', color:'var(--t3)' }}>
              · {time} · {timeAgo(order.placed_at, i18n.language)}
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
              <DishThumb size="sm" photo={item.dishes?.photo} category={item.dishes?.category} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:'0.8rem', fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {dishName(item.dishes, i18n.language, t('unknownDish'))}
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

          {(showServed || showSettle || showCancel) && (
          <div style={{ display:'flex', gap:'0.35rem', marginTop:'0.75rem' }}>
            {showServed && (
              <button className="btn btn-primary btn-sm" style={{ flex:1 }}
                onClick={() => onUpdateStatus(order.id, 'served')} disabled={acting}>
                {acting ? <span className="spinner" style={{ width:12, height:12 }} /> : t('dashboard:markServed')}
              </button>
            )}
            {showSettle && (
              <Link className="btn btn-ghost btn-sm" style={{ flex:1 }}
                to={order.table_id ? `/bills?table=${encodeURIComponent(order.table_id)}` : '/bills'}>
                {t('dashboard:settleOnBills')}
              </Link>
            )}
            {showCancel && (
              <button className="btn btn-danger btn-sm" style={{ minWidth:80 }}
                onClick={() => onUpdateStatus(order.id, 'cancelled')} disabled={acting}>
                {t('dashboard:cancel')}
              </button>
            )}
          </div>
          )}
        </div>
      )}
    </div>
  )
}
