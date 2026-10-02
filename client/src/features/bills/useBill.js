import { useCallback, useEffect, useRef, useState } from 'react'
import { getBill, openMyBill, subscribeBill } from './api'
import { applySettlement } from './settlement'

const POLL_MS = 20000
const EVENT_DEBOUNCE_MS = 250
// Realtime can be up and still silent (the WebSocket opens, no event arrives). While a payment is in flight or just
// went through, the bill is therefore re-read on a short timer whatever the channel says.
const PAYMENT_POLL_MS = 5000
const PAYMENT_WATCH_MS = 60000

// error code -> screen status
const STATUS_FOR = {
  nothing_due: 'nothing',
  no_session: 'ended',
  table_not_found: 'ended',
  bill_not_found: 'notFound',
  not_authenticated: 'signedout',
}

const failure = error => ({ status: STATUS_FOR[error.code] || 'error', bill: null, error })

/**
 * The bill of the current table session (no billId: opened once from the party's orders) or of a given bill
 * (bill_detail), kept live: realtime on bills / bill_shares / payment_intents / the table row, a refetch when
 * the tab becomes visible again, and a 20s poll while the realtime channel is down.
 *
 * A bill is only ever OPENED (my_bill -> open_bill, which creates one when none is open) by the guest's own
 * action: the first load of /bill (View bill), `openMine` (Start a new bill, Add new orders) and the retry of
 * a screen that never had a bill. Every refresh (realtime, poll, visibility, after paying) reads the bill
 * already on screen by id, so a bill staff voided or closed stays what it is: void shows the cancelled screen,
 * settled shows the receipt, and nothing is created behind the guest's back.
 *
 * Paying: `markPaid({ intent, settle })` puts the settlement the RPCs returned on screen at once (see
 * settlement.js). From then on, and while a payment intent of mine is pending, the bill is also re-read every 5 s
 * until the server confirms it (a settled bill, or one minute), so a missing realtime event never leaves an
 * "Open + Pay" screen behind a payment that went through.
 *
 * status: 'loading' | 'ready' | 'nothing' | 'ended' | 'notFound' | 'signedout' | 'error'
 * Background refreshes never replace a loaded bill with an error.
 */
export default function useBill({ billId, tableId, enabled = true }) {
  const [state, setState] = useState({ status: 'loading', bill: null, error: null })
  const [tableEnded, setTableEnded] = useState(false)
  const [watching, setWatching] = useState(false)      // just paid: poll fast until the server confirms
  const watchTimer = useRef(null)
  const idRef = useRef(billId || null)
  const billRef = useRef(null)
  const seq = useRef(0)

  const load = useCallback(async (silent = false) => {
    if (!enabled) return
    const mine = ++seq.current
    if (!silent) setState(s => (s.bill ? s : { status: 'loading', bill: null, error: null }))

    const knownId = idRef.current || billId
    const res = knownId ? await getBill(knownId) : await openMyBill()
    if (mine !== seq.current) return

    if (res.error) {
      if (silent && billRef.current) return
      setState(failure(res.error))
      return
    }
    idRef.current = res.data.id
    billRef.current = res.data
    setState({ status: 'ready', bill: res.data, error: null })
    if (res.data.status === 'paid') setWatching(false)     // the server itself says settled: nothing left to confirm
  }, [billId, enabled])

  const loadRef = useRef(load)
  loadRef.current = load

  // The guest asks for a bill (Start a new bill after a void, Add new orders to an unsplit bill): the one
  // place besides the first load that may open one. Resolves { error } or { data }; errors also set the screen.
  const openMine = useCallback(async () => {
    const mine = ++seq.current
    const res = await openMyBill()
    if (mine !== seq.current) return res
    if (res.error) {
      setState(failure(res.error))
      return res
    }
    idRef.current = res.data.id
    billRef.current = res.data
    setTableEnded(false)
    setState({ status: 'ready', bill: res.data, error: null })
    return res
  }, [])

  // My demo payment went through: show it now. A read that started before this answer must not bring the old
  // bill back, so it is dropped (seq); the next read (the caller's reload, the poll, realtime) confirms it.
  const markPaid = useCallback(({ intent, settle }) => {
    const next = applySettlement(billRef.current, { intent, settle })
    if (!next || next === billRef.current) return
    seq.current += 1
    idRef.current = next.id
    billRef.current = next
    setState({ status: 'ready', bill: next, error: null })
    setWatching(true)
    clearTimeout(watchTimer.current)
    watchTimer.current = setTimeout(() => setWatching(false), PAYMENT_WATCH_MS)
  }, [])

  useEffect(() => () => clearTimeout(watchTimer.current), [])

  // first load / bill changed
  useEffect(() => {
    idRef.current = billId || null
    billRef.current = null
    setTableEnded(false)
    if (enabled) load(false)
    return () => { seq.current += 1 }
  }, [billId, enabled, load])

  const liveId = state.bill?.id || null
  const liveTable = state.bill?.table?.id || tableId || null
  const paymentPending = !!state.bill?.myPayments?.some(p => p.status === 'requires_action')
  const fastPoll = paymentPending || watching

  // a payment is pending or just succeeded: re-read on a short timer, whatever the realtime channel does
  useEffect(() => {
    if (!liveId || !fastPoll) return undefined
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') loadRef.current(true)
    }, PAYMENT_POLL_MS)
    return () => clearInterval(timer)
  }, [liveId, fastPoll])

  useEffect(() => {
    if (!liveId) return undefined
    let timer = null
    let poll = null
    let alive = true
    const refresh = () => loadRef.current(true)
    const onChange = () => {
      clearTimeout(timer)
      timer = setTimeout(refresh, EVENT_DEBOUNCE_MS)
    }
    const stopPoll = () => { if (poll) { clearInterval(poll); poll = null } }
    const startPoll = () => {
      if (poll) return
      poll = setInterval(() => { if (document.visibilityState === 'visible') refresh() }, POLL_MS)
    }
    const unsubscribe = subscribeBill({
      billId: liveId,
      tableId: liveTable,
      onChange,
      // Staff close a bill and free the table in one go: read the bill first, so a settled bill shows
      // "Bill settled" + the receipt and not "Your table session has ended".
      onTableEnded: async () => {
        clearTimeout(timer)
        await loadRef.current(true)
        // a settled bill is never "session ended": it shows the receipt until the guest taps Leave
        if (alive && billRef.current?.status !== 'paid') setTableEnded(true)
      },
      onStatus: status => {
        if (status === 'SUBSCRIBED') stopPoll()
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') startPoll()
      },
    })
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      clearTimeout(timer)
      stopPoll()
      unsubscribe()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [liveId, liveTable])

  return {
    ...state,
    tableEnded,
    reload: () => load(true),
    retry: () => load(false),
    openMine,
    markPaid,
  }
}
