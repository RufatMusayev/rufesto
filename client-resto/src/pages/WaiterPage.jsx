import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { debounce } from '../lib/debounce'
import { friendlyError } from '../lib/errors'
import { subscribeResync } from '../lib/realtime'
import CallsTab from '../components/waiter/CallsTab'
import MyTablesTab from '../components/waiter/MyTablesTab'
import AllTablesTab from '../components/waiter/AllTablesTab'

// Safety-net refresh for events realtime can't deliver (see the effect below).
const FALLBACK_POLL_MS = 60000
// waiter_overview() excludes tables nobody's at from "All tables".
const IDLE_STATES = ['free', 'maintenance', 'cleared']

export default function WaiterPage() {
  const { restaurantId } = useAuth()
  const { t } = useTranslation(['dashboard', 'common'])
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState(null) // null until the first load picks a default
  const [acting, setActing] = useState(null) // id of the request/table being acted on
  const [actionError, setActionError] = useState('')
  const [hasNewCall, setHasNewCall] = useState(false)
  const seenOpenIds = useRef(null) // null = no baseline yet (don't vibrate on first load)

  const load = useCallback(async () => {
    if (!restaurantId) return
    const { data, error } = await supabase.rpc('waiter_overview', { p_restaurant_id: restaurantId })
    if (error) {
      setActionError(friendlyError(error, t))
      setLoading(false)
      return
    }
    setTables(data?.tables || [])
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
        navigator.vibrate?.(200)
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
  const handleTake     = (tableId) => runAction(tableId, 'take_table', { p_table_id: tableId })
  const handleRelease  = (tableId) => runAction(tableId, 'release_table', { p_table_id: tableId })

  return (
    <div style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', paddingBottom: '1rem', borderBottom: '1px solid var(--border)' }}>
        <h1 className="page-title">{t('dashboard:navWaiter')}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.72rem', color: 'var(--green)' }}>
          <span className="dash-live-dot" /> {t('common:live')}
        </div>
      </div>

      {actionError && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
          padding: '0.6rem 0.85rem', borderRadius: 10, marginBottom: '0.85rem',
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          color: 'var(--red)', fontSize: '0.8rem', fontWeight: 500,
        }}>
          <span>{actionError}</span>
          <button onClick={() => setActionError('')} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>✕</button>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '1.25rem' }} className="no-scrollbar">
        <button className={`chip${tab === 'calls' ? ' active' : ''}`} style={{ position: 'relative' }} onClick={() => selectTab('calls')}>
          {t('dashboard:waiterTabCalls', { count: calls.length })}
          {hasNewCall && tab !== 'calls' && (
            <span style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: '50%', background: 'var(--red)' }} />
          )}
        </button>
        <button className={`chip${tab === 'mine' ? ' active' : ''}`} onClick={() => selectTab('mine')}>
          {t('dashboard:waiterTabMyTables')}
        </button>
        <button className={`chip${tab === 'all' ? ' active' : ''}`} onClick={() => selectTab('all')}>
          {t('dashboard:waiterTabAllTables')}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 80, borderRadius: 12 }} />)}
        </div>
      ) : tab === 'calls' ? (
        <CallsTab calls={calls} acting={acting} onAck={handleAck} onResolve={handleResolve} />
      ) : tab === 'mine' ? (
        <MyTablesTab tables={myTables} acting={acting} onRelease={handleRelease} />
      ) : (
        <AllTablesTab tables={activeTables} acting={acting} onTake={handleTake} />
      )}
    </div>
  )
}
