import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { debounce } from '../lib/debounce'
import { friendlyError, writeError } from '../lib/errors'
import { roleCan } from '../lib/roles'
import { subscribeResync } from '../lib/realtime'
import CallsTab from '../components/waiter/CallsTab'
import MyTablesTab from '../components/waiter/MyTablesTab'
import AllTablesTab from '../components/waiter/AllTablesTab'
import { CLEARED_STATE, groupOrdersByTable, summariseTableOrders } from '../components/waiter/waiterHelpers'
import '../features/v2/styles.css'
import { MyTipsCard } from '../features/v2/mounts'
import ActionBanner from '../components/ActionBanner'
import ChipScroller from '../components/ChipScroller'

// Safety-net refresh for events realtime can't deliver (see the effect below).
const FALLBACK_POLL_MS = 60000
// Tables nobody is at stay out of "All tables". A cleared table is NOT idle: it still needs a hand (reset to free).
const IDLE_STATES = ['free', 'maintenance']
// Live orders older than this belong to an earlier visit and say nothing about the table now.
const ORDERS_WINDOW_MS = 24 * 60 * 60 * 1000

// A short buzz for a new call, with the same guard as the guest app's haptics: only a touch device that has no
// reduced-motion preference and that the user has already tapped (Chrome logs an error for vibrate() before the first
// tap, and a desktop has no motor).
function buzz(ms) {
  try {
    if (!('vibrate' in navigator)) return
    if (!window.matchMedia('(pointer: coarse)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    if (!navigator.userActivation?.hasBeenActive) return
    navigator.vibrate(ms)
  } catch { /* no vibration here */ }
}

export default function WaiterPage() {
  const { restaurantId, staffRow } = useAuth()
  const { t } = useTranslation(['dashboard', 'common'])
  // Resetting a cleared table writes tables.state, which the database allows for waiter, host, manager and admin only.
  const canReset = roleCan(staffRow?.role, 'tableState')
  // Marking an order served writes orders.status, allowed for waiter, host, manager and admin (the same rule as Orders).
  const canServe = roleCan(staffRow?.role, 'orderFlow')
  const [tables, setTables] = useState([])
  const [liveOrders, setLiveOrders] = useState([]) // orders not yet paid, with their items: facts per table + the My Tables list
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState(null) // null until the first load picks a default
  const [acting, setActing] = useState(null) // id of the request/table being acted on
  const [actionError, setActionError] = useState('')
  const [hasNewCall, setHasNewCall] = useState(false)
  const seenOpenIds = useRef(null) // null = no baseline yet (don't vibrate on first load)

  const load = useCallback(async () => {
    if (!restaurantId) return
    const [{ data, error }, ordersR] = await Promise.all([
      supabase.rpc('waiter_overview', { p_restaurant_id: restaurantId }),
      // Order state and age for the table cards. Not essential: when this read fails the cards simply have fewer lines.
      supabase.from('orders').select('id, table_id, status, placed_at, total_amount, order_items(quantity, dishes(name, name_az, name_i18n))')
        .eq('restaurant_id', restaurantId)
        .not('status', 'in', '("paid","cancelled","refunded")')
        .gte('placed_at', new Date(Date.now() - ORDERS_WINDOW_MS).toISOString()),
    ])
    if (error) {
      setActionError(friendlyError(error, t))
      setLoading(false)
      return
    }
    setTables(data?.tables || [])
    setLiveOrders(ordersR.error ? [] : (ordersR.data || []))
    setLoading(false)
  }, [restaurantId, t])

  useEffect(() => {
    if (!restaurantId) return
    load()

    // Everything waiter_overview() aggregates, so any of these means a stale
    // view: calls (service_requests), who has the table (table_service), table
    // state and outstanding bills (orders), guest counts (table_sessions).
    const debouncedLoad = debounce(load, 400)
    const filter = `restaurant_id=eq.${restaurantId}`
    const main = supabase
      .channel(`waiter-${restaurantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_requests', filter }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_service', filter }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables', filter }, debouncedLoad)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter }, debouncedLoad)
    // table_sessions gets its own channel: while it is missing from the
    // supabase_realtime publication, subscribing to it fails the channel it is
    // on, and that must not take the bindings above down with it.
    const sessions = supabase
      .channel(`waiter-sessions-${restaurantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_sessions', filter }, debouncedLoad)

    // The 60s poll covers what realtime cannot: DELETE events are not delivered
    // for filtered subscriptions under RLS, so release_table (which deletes the
    // table_service row) never reaches the other waiters by event. Visibility
    // resync = a phone coming back from the lock screen / another app.
    const stopMain = subscribeResync(main, debouncedLoad, { pollMs: FALLBACK_POLL_MS, onVisible: true })
    const stopSessions = subscribeResync(sessions, debouncedLoad)

    return () => {
      debouncedLoad.cancel()
      stopMain()
      stopSessions()
    }
  }, [restaurantId, load])

  // New-open-call detection (vibrate + tab badge), independent of render.
  useEffect(() => {
    const openIds = new Set()
    for (const tbl of tables) {
      for (const req of tbl.requests) {
        if (req.status === 'open') openIds.add(req.id)
      }
    }
    if (seenOpenIds.current) {
      let sawNew = false
      for (const id of openIds) {
        if (!seenOpenIds.current.has(id)) { sawNew = true; break }
      }
      if (sawNew) {
        buzz(200)
        setHasNewCall(true)
      }
    }
    seenOpenIds.current = openIds
  }, [tables])

  const calls = useMemo(() => {
    const list = []
    for (const tbl of tables) {
      for (const req of tbl.requests) {
        list.push({
          id: req.id, kind: req.kind, status: req.status, createdAt: req.created_at,
          tableId: tbl.table_id, tableNumber: tbl.table_number, section: tbl.section,
          assignedName: tbl.assigned_name,
        })
      }
      if (tbl.state === 'awaiting_payment') {
        list.push({
          id: `bill-${tbl.table_id}`, kind: 'bill', status: 'open', createdAt: null,
          tableId: tbl.table_id, tableNumber: tbl.table_number, section: tbl.section,
          assignedName: tbl.assigned_name, outstanding: tbl.outstanding,
        })
      }
    }
    // Oldest first; bill entries carry no request timestamp, so they sort last.
    return list.sort((a, b) => {
      if (!a.createdAt) return 1
      if (!b.createdAt) return -1
      return new Date(a.createdAt) - new Date(b.createdAt)
    })
  }, [tables])

  const myTables = useMemo(() => tables.filter(tbl => tbl.is_mine), [tables])
  const activeTables = useMemo(
    () => tables.filter(tbl => tbl.guests > 0 || !IDLE_STATES.includes(tbl.state)),
    [tables]
  )
  const orderFacts = useMemo(() => summariseTableOrders(liveOrders), [liveOrders])
  const ordersByTable = useMemo(() => groupOrdersByTable(liveOrders), [liveOrders])
  const clearedCount = useMemo(() => tables.filter(tbl => tbl.state === CLEARED_STATE).length, [tables])

  // Pick the default tab once, right after the first load resolves.
  useEffect(() => {
    if (loading || tab !== null) return
    setTab(calls.length > 0 ? 'calls' : 'mine')
  }, [loading, tab, calls.length])

  function selectTab(next) {
    setTab(next)
    if (next === 'calls') setHasNewCall(false)
  }

  async function runAction(id, rpcName, params) {
    setActing(id)
    setActionError('')
    const { error } = await supabase.rpc(rpcName, params)
    if (error) setActionError(friendlyError(error, t))
    await load() // never optimistic — always reflect what the DB actually did
    setActing(null)
  }

  const handleAck     = (id) => runAction(id, 'ack_service_request', { p_id: id })
  const handleResolve = (id) => runAction(id, 'resolve_service_request', { p_id: id })
  // Same write the Orders page makes for "Mark Served" (orders.status = 'served'); the table card shows the new state
  // once the reload has read it back.
  async function handleServe(orderId) {
    setActing(orderId)
    setActionError('')
    const err = writeError(await supabase.from('orders').update({ status: 'served' }).eq('id', orderId).select('id'))
    if (err) setActionError(friendlyError(err, t))
    await load()
    setActing(null)
  }
  // A paid, emptied table goes cleared -> free (the table state machine allows exactly that step).
  async function handleReset(tableId) {
    setActing(tableId)
    setActionError('')
    const err = writeError(await supabase.from('tables').update({ state: 'free' }).eq('id', tableId).select('id'))
    if (err) setActionError(friendlyError(err, t))
    await load()
    setActing(null)
  }
  const handleTake     = (tableId) => runAction(tableId, 'take_table', { p_table_id: tableId })
  const handleRelease  = (tableId) => runAction(tableId, 'release_table', { p_table_id: tableId })

  return (
    <div className="wt-page">
      <div className="wt-head">
        <h1 className="page-title">{t('dashboard:navWaiter')}</h1>
        <div className="page-live wt-live">
          <span className="dash-live-dot" /> {t('common:live')}
        </div>
      </div>

      {actionError && <ActionBanner message={actionError} onClose={() => setActionError('')} />}

      <MyTipsCard />

      <ChipScroller role="group" aria-label={t('dashboard:navWaiter')}>
        <button type="button" className={`chip wt-tab${tab === 'calls' ? ' active' : ''}`} onClick={() => selectTab('calls')}>
          {t('dashboard:waiterTabCalls', { count: calls.length })}
          {hasNewCall && tab !== 'calls' && <span className="wt-dot wt-dot--red" aria-hidden="true" />}
        </button>
        <button type="button" className={`chip${tab === 'mine' ? ' active' : ''}`} onClick={() => selectTab('mine')}>
          {t('dashboard:waiterTabMyTables')}
        </button>
        <button type="button" className={`chip${tab === 'all' ? ' active' : ''}`} onClick={() => selectTab('all')}>
          {t('dashboard:waiterTabAllTables')}
          {clearedCount > 0 && (
            <span className="wt-count" title={t('dashboard:waiterNeedsReset', { count: clearedCount })} aria-label={t('dashboard:waiterNeedsReset', { count: clearedCount })}>
              {clearedCount}
            </span>
          )}
        </button>
      </ChipScroller>

      {loading ? (
        <div className="wt-skels" aria-hidden="true">
          {[1, 2, 3].map(i => <div key={i} className="skeleton wt-skel" />)}
        </div>
      ) : tab === 'calls' ? (
        <CallsTab calls={calls} acting={acting} onAck={handleAck} onResolve={handleResolve} />
      ) : tab === 'mine' ? (
        <MyTablesTab tables={myTables} facts={orderFacts} orders={ordersByTable} acting={acting} canServe={canServe}
          onServe={handleServe} onRelease={handleRelease} />
      ) : (
        <AllTablesTab tables={activeTables} facts={orderFacts} acting={acting} canReset={canReset} onTake={handleTake} onReset={handleReset} />
      )}
    </div>
  )
}
