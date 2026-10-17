import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { debounce } from '../../lib/debounce'
import { subscribeResync } from '../../lib/realtime'
import { supabase } from '../../lib/supabase'
import { isNotReady } from './errors'
import { NotificationsContext } from './notifContext'
import { playChime, readChimePref, unlockAudio, writeChimePref } from './notifChime'
import {
  fetchStaffBadge, fetchStaffInbox, fetchTableNumbers, markStaffNotifications,
} from './notifApi'
import { CHIME_TYPES, mergeFirstPage } from './notifItems'
import NotificationPanel from './components/NotificationPanel'

// Staff notifications of the dashboard (V2-CONTRACT 21.5), mounted once in DashboardLayout so the bell in the sidebar
// and the one in the phone header share one badge, one realtime channel and one panel.
//
//  - The badge is notifications_badge().staff_unseen. A realtime INSERT on the caller's own notifications rows
//    (filter user_id; RLS lets a user see only their own) triggers a debounced re-read; a resync also runs when the
//    channel re-joins, when the tab becomes visible again and every minute.
//  - Before sql/64 is applied the badge call answers PGRST202: `available` becomes false and the bell is not rendered
//    (no error anywhere).
//  - Opening the panel sets the badge to 0 and calls mark_notifications(seen_only); an item tap marks that group's
//    ids read; "Mark all read" marks every staff row read.
//  - The chime plays for waiter_called / bill_requested / bill_paid rows that arrive live, only when switched on here.
//  - Waiter calls carry payload.request_id: while the panel is open their service_requests rows are read (floor staff
//    may; status + who took it) so a call somebody already took leaves "Needs you", and "On my way" runs
//    ack_service_request (sql/34) on them. Nothing is optimistic except the row the tap itself acknowledged.

const EMPTY = { items: [], nextCursor: null, unread: 0 }
const BELL_POLL_MS = 60000
const EVENT_DEBOUNCE_MS = 400
const REQUEST_LOOKUP_MAX = 60

const firstName = name => String(name || '').trim().split(/\s+/)[0] || ''

export function NotificationsProvider({ children }) {
  const { session, staffRows } = useAuth()
  const userId = session?.user?.id || null
  const { pathname } = useLocation()

  // 'unknown' until the first answer; 'no' = sql/64 is not deployed (no bell, no channel, no polling).
  const [avail, setAvail] = useState('unknown')
  const available = avail === 'yes'
  const [badge, setBadge] = useState(0)
  const [open, setOpen] = useState(false)
  const [list, setList] = useState(EMPTY)
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [loadError, setLoadError] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [actionError, setActionError] = useState(null)
  const [chime, setChimeState] = useState(readChimePref)
  const [tableNumbers, setTableNumbers] = useState({})
  const [requests, setRequests] = useState({}) // { [service request id]: { status, by: 'me' | 'other' | null } }
  const [ackingId, setAckingId] = useState(null) // id of the row whose "On my way" is running
  const [myName, setMyName] = useState('')
  const [reqTick, setReqTick] = useState(0)

  const openRef = useRef(false)
  const chimeRef = useRef(chime)
  const listRef = useRef(list)
  const reqRef = useRef(0)
  const tablesFor = useRef('')
  const myStaffIds = useRef([])
  const nameFor = useRef('')
  const requestsRef = useRef({})
  const ackingRef = useRef(null)
  openRef.current = open
  chimeRef.current = chime
  listRef.current = list
  requestsRef.current = requests
  myStaffIds.current = (staffRows || []).map(s => s.id)

  const loadBadge = useCallback(async () => {
    const { data, error } = await fetchStaffBadge()
    if (error) {
      if (isNotReady(error)) setAvail('no')
      return
    }
    setAvail('yes')
    setBadge(openRef.current ? 0 : data)
  }, [])

  const loadInbox = useCallback(async ({ silent = false } = {}) => {
    const req = ++reqRef.current
    if (!silent) setStatus(s => (s === 'ready' ? s : 'loading'))
    const { data, error } = await fetchStaffInbox()
    if (req !== reqRef.current) return // a newer load is on its way
    if (error) {
      if (isNotReady(error)) setAvail('no')
      setLoadError(error)
      setStatus(s => (s === 'ready' ? s : 'error'))
      return
    }
    setLoadError(null)
    setList(cur => mergeFirstPage(cur, data))
    setStatus('ready')
    setReqTick(n => n + 1)
  }, [])

  const markSeen = useCallback(async () => {
    setBadge(0)
    const { error } = await markStaffNotifications({ seenOnly: true })
    if (error) loadBadge()
  }, [loadBadge])

  // Probe on sign-in (and whenever the user changes).
  useEffect(() => {
    setAvail('unknown')
    setBadge(0)
    setOpen(false)
    setList(EMPTY)
    setStatus('idle')
    setRequests({})
    setMyName('')
    nameFor.current = ''
    if (userId) loadBadge()
  }, [userId, loadBadge])

  // Live feed: INSERTs of the caller's own rows. Only staff-audience rows matter here.
  useEffect(() => {
    if (!userId || avail === 'no') return undefined
    const onBadge = debounce(() => loadBadge(), EVENT_DEBOUNCE_MS)
    const onOpenFeed = debounce(() => { markSeen(); loadInbox({ silent: true }) }, EVENT_DEBOUNCE_MS)
    const resync = () => { if (openRef.current) onOpenFeed(); else onBadge() }

    const channel = supabase
      .channel(`staff-notifications:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, payload => {
        const row = payload?.new || {}
        if (row.audience !== 'staff') return
        resync()
        if (chimeRef.current && CHIME_TYPES.includes(row.type)) playChime()
      })
    const stop = subscribeResync(channel, resync, { pollMs: BELL_POLL_MS, onVisible: true })
    return () => {
      onBadge.cancel()
      onOpenFeed.cancel()
      stop()
    }
  }, [userId, avail, loadBadge, loadInbox, markSeen])

  // Browsers keep audio suspended until the page has had a tap: the first tap or key press after a reload wakes it.
  useEffect(() => {
    if (!chime) return undefined
    const wake = () => unlockAudio()
    document.addEventListener('pointerdown', wake, { once: true })
    document.addEventListener('keydown', wake, { once: true })
    return () => {
      document.removeEventListener('pointerdown', wake)
      document.removeEventListener('keydown', wake)
    }
  }, [chime])

  // Navigating (an item tap, the browser Back button) closes the panel.
  useEffect(() => { setOpen(false) }, [pathname])

  const restaurantKey = (staffRows || []).map(s => s.restaurant_id).filter(Boolean).sort().join(',')
  const loadTables = useCallback(async () => {
    if (!restaurantKey || tablesFor.current === restaurantKey) return
    tablesFor.current = restaurantKey
    const { data } = await fetchTableNumbers(restaurantKey.split(','))
    if (data) setTableNumbers(data)
    else tablesFor.current = ''
  }, [restaurantKey])

  const openPanel = useCallback(() => {
    setOpen(true)
    setActionError(null)
    markSeen()
    loadInbox()
    loadTables()
  }, [markSeen, loadInbox, loadTables])

  const closePanel = useCallback(() => setOpen(false), [])

  // The service requests behind the waiter calls on screen: still open, or taken (by me / by a colleague).
  const requestKey = useMemo(() => {
    const ids = []
    for (const item of list.items) for (const id of item.requestIds) if (!ids.includes(id)) ids.push(id)
    return ids.slice(0, REQUEST_LOOKUP_MAX).join(',')
  }, [list.items])

  const loadRequests = useCallback(async ids => {
    if (!ids.length) return
    let res
    try { res = await supabase.from('service_requests').select('id, status, acknowledged_by').in('id', ids) } catch { return }
    // A failed read leaves the status unknown: the button still shows, and a refused tap says why.
    if (res.error || !Array.isArray(res.data)) return
    setRequests(cur => {
      const next = { ...cur }
      for (const row of res.data) {
        const by = row.acknowledged_by ? (myStaffIds.current.includes(row.acknowledged_by) ? 'me' : 'other') : null
        next[row.id] = { status: row.status, by }
      }
      return next
    })
  }, [])

  useEffect(() => {
    if (open && available && requestKey) loadRequests(requestKey.split(','))
  }, [open, available, requestKey, reqTick, loadRequests])

  // My first name for the "✓ name" a tap on "On my way" leaves on the row (own users row; read once per sign-in).
  useEffect(() => {
    if (!open || !userId || nameFor.current === userId) return
    nameFor.current = userId
    ;(async () => {
      try {
        const { data } = await supabase.from('users').select('name').eq('id', userId).maybeSingle()
        if (data?.name) setMyName(firstName(data.name))
        else nameFor.current = ''
      } catch { nameFor.current = '' }
    })()
  }, [open, userId])

  const retry = useCallback(() => { setStatus('loading'); loadInbox() }, [loadInbox])

  const loadMore = useCallback(async () => {
    const cursor = listRef.current.nextCursor
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    const { data, error } = await fetchStaffInbox({ cursor })
    setLoadingMore(false)
    if (error) { setActionError(error); return }
    setList(cur => {
      const seen = new Set(cur.items.map(i => i.id))
      return { ...cur, items: [...cur.items, ...data.items.filter(i => !seen.has(i.id))], nextCursor: data.nextCursor }
    })
  }, [loadingMore])

  const markRead = useCallback(async item => {
    if (item.read) return
    const ids = new Set(item.ids) // a row the panel folded (x2) covers several inbox rows
    setList(cur => {
      let cleared = 0
      const items = cur.items.map(i => {
        if (i.read || !i.ids.some(id => ids.has(id))) return i
        cleared += 1
        return { ...i, read: true }
      })
      return { ...cur, items, unread: Math.max(0, cur.unread - cleared) }
    })
    const { error } = await markStaffNotifications({ ids: item.ids })
    if (error) { setActionError(error); loadInbox({ silent: true }) }
  }, [loadInbox])

  const markAllRead = useCallback(async () => {
    setActionError(null)
    setList(cur => ({ ...cur, items: cur.items.map(i => ({ ...i, read: true })), unread: 0 }))
    const { error } = await markStaffNotifications()
    if (error) { setActionError(error); loadInbox({ silent: true }) }
  }, [loadInbox])

  // "On my way": ack_service_request on every call of the row that is still open. The tapped row shows "✓ name" at
  // once; a call a colleague was faster on is read back (who took it) instead of shown as an error.
  const ackItem = useCallback(async item => {
    if (ackingRef.current) return
    const todo = (item.requestIds || []).filter(id => {
      const r = requestsRef.current[id]
      return !r || r.status === 'open'
    })
    if (!todo.length) { loadRequests(item.requestIds || []); return }
    ackingRef.current = item.id
    setAckingId(item.id)
    setActionError(null)
    const results = await Promise.all(todo.map(async id => {
      try {
        const { error } = await supabase.rpc('ack_service_request', { p_id: id })
        return { id, error }
      } catch (error) { return { id, error } }
    }))
    ackingRef.current = null
    setAckingId(null)
    const done = results.filter(r => !r.error).map(r => r.id)
    const failed = results.filter(r => r.error)
    if (done.length) {
      setRequests(cur => {
        const next = { ...cur }
        for (const id of done) next[id] = { status: 'acknowledged', by: 'me' }
        return next
      })
      markRead(item)
    }
    const hard = failed.find(r => String(r.error?.message || '').trim().toLowerCase() !== 'not_open')
    if (hard) setActionError(hard.error)
    if (failed.length) loadRequests(failed.map(r => r.id))
  }, [loadRequests, markRead])

  const setChime = useCallback(on => {
    writeChimePref(on)
    setChimeState(on)
    if (on) { unlockAudio(); playChime() } // the tap that switches it on also proves it works
  }, [])

  const dismissActionError = useCallback(() => setActionError(null), [])

  const value = useMemo(() => ({
    available, badge, open, openPanel, closePanel,
    items: list.items, unread: list.unread, hasMore: !!list.nextCursor, status, loadError, actionError,
    loadingMore, loadMore, retry, markRead, markAllRead, dismissActionError,
    chime, setChime, tableNumbers, requests, ackItem, ackingId, myName,
  }), [available, badge, open, openPanel, closePanel, list, status, loadError, actionError, loadingMore,
    loadMore, retry, markRead, markAllRead, dismissActionError, chime, setChime, tableNumbers, requests, ackItem,
    ackingId, myName])

  return (
    <NotificationsContext.Provider value={value}>
      {children}
      {open && available && <NotificationPanel />}
    </NotificationsContext.Provider>
  )
}
