import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import AuthModal from '../../components/AuthModal'
import {
  getBookingDetail, getInvitePreview, listMyBookings, subscribeBooking, subscribeMyBookings,
} from './api'

const POLL_MS = 20000
const BAD_CHANNEL = ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']

/**
 * Gate for actions that need a signed-in guest. `requireAuth()` returns true when signed in; otherwise it
 * opens AuthModal and returns false. Render `authModal` once in the screen. `onSignedIn` (optional) runs once
 * after a sign-in that this gate asked for.
 */
export function useRequireAuth(onSignedIn) {
  const { session, loading } = useAuth()
  const [open, setOpen] = useState(false)
  const asked = useRef(false)
  const cb = useRef(onSignedIn)
  cb.current = onSignedIn

  useEffect(() => {
    if (session && asked.current) {
      asked.current = false
      setOpen(false)
      cb.current?.()
    }
  }, [session])

  const requireAuth = useCallback(() => {
    if (session) return true
    asked.current = true
    setOpen(true)
    return false
  }, [session])

  const authModal = open && !session
    ? <AuthModal onClose={() => { asked.current = false; setOpen(false) }} onSuccess={() => setOpen(false)} />
    : null
  return { session, authLoading: loading, requireAuth, authModal }
}

/** Calls `fn` every `ms` while `active` and the tab is visible (the realtime fallback). */
export function useVisiblePoll(fn, active, ms = POLL_MS) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    if (!active) return undefined
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') ref.current()
    }, ms)
    return () => clearInterval(id)
  }, [active, ms])
}

/** Runs `fn` when the tab becomes visible again. */
function useOnVisible(fn) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    const onChange = () => { if (document.visibilityState === 'visible') ref.current() }
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])
}

/** A `Date.now()` that ticks every `ms` (drives the "We're here" window). */
export function useNow(ms = 30000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}

/**
 * Loads a list or record with request sequencing: a stale answer never overwrites a newer one, and a failed
 * silent refetch keeps what is already shown.
 */
function useLoader(fetcher, deps) {
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const seq = useRef(0)
  const fetchRef = useRef(fetcher)
  fetchRef.current = fetcher
  const hasData = useRef(false)

  const load = useCallback(async ({ silent = false } = {}) => {
    const mine = ++seq.current
    if (!silent) setState(s => ({ ...s, loading: true, error: null }))
    const { data, error } = await fetchRef.current()
    if (mine !== seq.current) return
    if (error) {
      setState(s => (hasData.current && silent ? s : { loading: false, data: null, error }))
      return
    }
    hasData.current = true
    setState({ loading: false, data, error: null })
  }, [])

  useEffect(() => {
    hasData.current = false
    load()
    return () => { seq.current += 1 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return [state, load]
}

/** Debounced refetch for bursts of realtime events (a booking update usually touches several rows). */
function useBurst(fn, ms = 300) {
  const ref = useRef(fn)
  ref.current = fn
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  return useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => ref.current(), ms)
  }, [ms])
}

/** One booking (host, member or staff view): fetch + realtime + visibility refetch + 20 s poll if the channel fails. */
export function useBooking(id, enabled = true) {
  const { session } = useAuth()
  const uid = session?.user?.id || null
  // The answer depends on who asks (host sees phones, members do not), so a new sign-in refetches.
  const [state, load] = useLoader(
    () => (enabled && id ? getBookingDetail(id) : Promise.resolve({ data: null, error: null })),
    [id, enabled, uid],
  )
  const [live, setLive] = useState(true)
  const refetch = useCallback(() => load({ silent: true }), [load])
  const onEvent = useBurst(refetch)

  useEffect(() => {
    if (!enabled || !id) return undefined
    setLive(true)
    return subscribeBooking(id, onEvent, status => { if (BAD_CHANNEL.includes(status)) setLive(false) })
  }, [id, enabled, onEvent])

  useVisiblePoll(refetch, !live)
  useOnVisible(refetch)

  return { booking: state.data, loading: state.loading, error: state.error, reload: load, refetch }
}

/** The invite preview for a code. Refetches when the guest signs in or out (already_member depends on it). */
export function useInvitePreview(code) {
  const { session, loading: authLoading } = useAuth()
  const uid = session?.user?.id || null
  const [state, load] = useLoader(
    () => (code && !authLoading ? getInvitePreview(code) : Promise.resolve({ data: null, error: null })),
    [code, uid, authLoading],
  )
  const waiting = authLoading || state.loading
  return { preview: state.data, loading: waiting, error: state.error, reload: load }
}

/** The guest's bookings (host or member), live. */
export function useMyBookings(userId) {
  const [state, load] = useLoader(
    () => (userId ? listMyBookings() : Promise.resolve({ data: [], error: null })),
    [userId],
  )
  const [live, setLive] = useState(true)
  const refetch = useCallback(() => load({ silent: true }), [load])
  const onEvent = useBurst(refetch)

  useEffect(() => {
    if (!userId) return undefined
    setLive(true)
    return subscribeMyBookings(userId, onEvent, status => { if (BAD_CHANNEL.includes(status)) setLive(false) })
  }, [userId, onEvent])

  useVisiblePoll(refetch, !live)
  useOnVisible(refetch)

  return { bookings: state.data || [], loading: state.loading, error: state.error, reload: load }
}
