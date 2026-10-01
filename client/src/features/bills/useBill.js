import { useCallback, useEffect, useRef, useState } from 'react'
import { getBill, openMyBill, subscribeBill } from './api'

const POLL_MS = 20000
const EVENT_DEBOUNCE_MS = 250

// error code -> screen status
const STATUS_FOR = {
  nothing_due: 'nothing',
  no_session: 'ended',
  table_not_found: 'ended',
  bill_not_found: 'notFound',
  not_authenticated: 'signedout',
}

/**
 * The bill of the current table session (no billId: my_bill) or of a given bill (bill_detail), kept live:
 * realtime on bills / bill_shares / payment_intents / the table row, a refetch when the tab becomes visible
 * again, and a 20s poll while the realtime channel is down.
 *
 * status: 'loading' | 'ready' | 'nothing' | 'ended' | 'notFound' | 'signedout' | 'error'
 * Background refreshes never replace a loaded bill with an error.
 */
export default function useBill({ billId, tableId, enabled = true }) {
  const [state, setState] = useState({ status: 'loading', bill: null, error: null })
  const [tableEnded, setTableEnded] = useState(false)
  const idRef = useRef(billId || null)
  const billRef = useRef(null)
  const seq = useRef(0)

  const load = useCallback(async (silent = false) => {
    if (!enabled) return
    const mine = ++seq.current
    if (!silent) setState(s => (s.bill ? s : { status: 'loading', bill: null, error: null }))

    const prev = billRef.current
    // Without a bill id the first load opens the bill from the party's orders. While nobody has chosen a
    // split yet the lines are rebuilt from the orders on every refresh, so late orders show up.
    const reopen = !billId && (!idRef.current || (prev && prev.status === 'open' && prev.shares.length === 0))
    const res = reopen ? await openMyBill() : await getBill(idRef.current || billId)
    if (mine !== seq.current) return

    if (res.error) {
      if (silent && prev) return
      setState({ status: STATUS_FOR[res.error.code] || 'error', bill: null, error: res.error })
      return
    }
    idRef.current = res.data.id
    billRef.current = res.data
    setState({ status: 'ready', bill: res.data, error: null })
  }, [billId, enabled])

  const loadRef = useRef(load)
  loadRef.current = load

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

  useEffect(() => {
    if (!liveId) return undefined
    let timer = null
    let poll = null
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
      onTableEnded: () => setTableEnded(true),
      onStatus: status => {
        if (status === 'SUBSCRIBED') stopPoll()
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') startPoll()
      },
    })
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
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
  }
}
