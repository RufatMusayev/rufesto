import { useCallback, useEffect, useRef, useState } from 'react'
import { listWaiters, splitBill } from './api'
import { toError } from './errors'
import { addMoney, parseTip, tipForShare } from './money'

const SPLIT_DEBOUNCE_MS = 250      // rapid taps on the picker: the last one wins, one request goes out
const SAVED_GRACE_MS = 8000        // how long a saved choice may wait for the bill read to show it

/**
 * Everything the guest chooses before paying (split mode, tip, waiter, method) and the numbers derived from
 * it. The amounts of the three split modes come from the server (`bill.modes`, or the stored share once a
 * plan exists); only the tip and the "pay now" sum are computed here.
 *
 * The split plan belongs to the table host: their tap shows at once (optimistic) and is saved with split_bill
 * after a short pause, so table mates, who follow `bill.splitMode` read-only, see it live instead of when the
 * host pays. A failed save rolls the picker back to the server's plan and sets `splitError`.
 */
export default function usePayPlan(bill, tableId, reload) {
  // The host's choice that the bill on screen does not show yet: { mode, saved }. null = follow the server's plan.
  const [sel, setSel] = useState(null)
  const [saving, setSaving] = useState(false)               // a split_bill request is in flight
  const [splitError, setSplitError] = useState(null)        // { code, key } of the last failed save
  const [tipSel, setTipSel] = useState({ pct: 0, custom: null })   // custom: null = a % chip, string = custom input
  const [waiterSel, setWaiterSel] = useState(null)          // null = the assigned waiter, else staff id | 'team'
  // Reception is the default: the bill view-model does not say whether the restaurant allows the demo card,
  // so the card row is only offered, never preselected (it can still turn out to be demo_disabled).
  const [methodSel, setMethod] = useState('reception')
  const [demoOff, setDemoOff] = useState(false)          // the restaurant switched demo payments off (demo_disabled)
  const [waiters, setWaiters] = useState([])

  const active = !!bill && ['open', 'requested', 'paying'].includes(bill.status)
  const waiterTable = bill?.table?.id || tableId || null

  // Waiters only matter for the tip picker. A failed read leaves the list empty (tip goes to the whole team).
  useEffect(() => {
    if (!active || !waiterTable) return undefined
    let cancelled = false
    listWaiters(waiterTable).then(({ data }) => { if (!cancelled) setWaiters(data || []) })
    return () => { cancelled = true }
  }, [active, waiterTable])

  const method = demoOff ? 'reception' : methodSel
  const multi = (bill?.memberCount ?? 1) > 1
  const locked = !!bill?.shares?.some(s => s.status !== 'pending')
  const serverMode = bill?.splitMode || null
  // Only the host (or whoever opened the bill) sets the split; a table mate follows the plan on the server and
  // always pays their own share inside it (create_payment_intent ignores their p_mode).
  const canSplit = !!bill?.canSplit
  const choosing = canSplit && multi && !locked && active
  const choice = choosing ? sel?.mode : null
  const mode = !multi ? 'own' : (locked || !canSplit) ? (serverMode || 'own') : (choice || serverMode || 'own')

  /* ---- saving the host's choice ---- */
  const billId = bill?.id || null
  const billIdRef = useRef(billId)
  const reloadRef = useRef(reload)
  const knownRef = useRef(serverMode || 'own')      // the plan the server is known to hold
  const wantedRef = useRef(null)                    // the latest tap not yet sent (last choice wins)
  const flightRef = useRef(false)                   // one request at a time
  const timerRef = useRef(null)
  const timerLive = useRef(false)
  const aliveRef = useRef(true)
  billIdRef.current = billId
  reloadRef.current = reload

  // keep the known plan in step with every bill read, unless a save is running (its answer is newer)
  useEffect(() => {
    if (!flightRef.current) knownRef.current = serverMode || 'own'
  }, [serverMode, billId])

  // another bill (a new one after a void): nothing of the old choice applies
  useEffect(() => {
    clearTimeout(timerRef.current)
    timerLive.current = false
    wantedRef.current = null
    setSel(null)
    setSplitError(null)
  }, [billId])

  // a saved choice goes once the bill read shows it; if the read never does (someone changed the plan again,
  // or the read failed), the server's plan wins after a short grace
  useEffect(() => {
    if (!sel?.saved) return undefined
    if (serverMode === sel.mode) { setSel(null); return undefined }
    const timer = setTimeout(() => setSel(null), SAVED_GRACE_MS)
    return () => clearTimeout(timer)
  }, [sel, serverMode])

  const flush = useCallback(async () => {
    if (flightRef.current) return                       // the running request picks the latest choice up when it ends
    try {
      for (;;) {
        const id = billIdRef.current
        const target = wantedRef.current
        if (!id || !target) return
        if (target === knownRef.current) {              // tapped back to what the server holds: nothing to save
          wantedRef.current = null
          if (aliveRef.current) setSel(null)
          return
        }
        flightRef.current = true
        if (aliveRef.current) setSaving(true)
        const res = await splitBill({ billId: id, mode: target })
          .catch(err => ({ data: null, error: toError(err, 'split_failed') }))
        flightRef.current = false
        if (id !== billIdRef.current) return
        const newer = wantedRef.current !== target      // tapped again while the request ran: that choice decides
        if (!res.error) {
          knownRef.current = target
          if (!newer) {
            wantedRef.current = null
            if (aliveRef.current) setSel({ mode: target, saved: true })
            if (aliveRef.current) reloadRef.current?.()
            return
          }
        } else if (!newer) {
          wantedRef.current = null                      // roll back to the plan the server really holds
          if (aliveRef.current) {
            setSel(null)
            setSplitError(res.error)
            reloadRef.current?.()                       // it may be locked, closed or replanned by now
          }
          return
        }
        if (timerLive.current) return                   // the newer tap is still inside its pause: its timer sends it
      }
    } finally {
      flightRef.current = false
      if (aliveRef.current) setSaving(false)
    }
  }, [])

  const chooseMode = useCallback(id => {
    if (!choosing || !['own', 'equal', 'all'].includes(id)) return
    wantedRef.current = id
    setSel({ mode: id, saved: false })
    setSplitError(null)
    clearTimeout(timerRef.current)
    timerLive.current = true
    timerRef.current = setTimeout(() => { timerLive.current = false; flush() }, SPLIT_DEBOUNCE_MS)
  }, [choosing, flush])

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      clearTimeout(timerRef.current)
      // leaving the screen inside the pause must not drop the host's choice
      if (timerLive.current) { timerLive.current = false; flush() }
    }
  }, [flush])

  // the plan stops being the host's to change (somebody paid, the bill closed): drop an unsent choice
  useEffect(() => {
    if (choosing || !sel || sel.saved) return
    clearTimeout(timerRef.current)
    timerLive.current = false
    wantedRef.current = null
    setSel(null)
  }, [choosing, sel])

  const splitBusy = !!choice && !sel.saved           // the choice is not on the server yet: do not pay against it

  const planned = !!bill?.myShare && bill.myShare.status === 'pending' && serverMode === mode
  const share = planned ? bill.myShare.amount : (bill?.modes?.[mode] ?? 0)
  // "Pay for everyone" was chosen by somebody else: nothing for me to pay unless I change the plan.
  const coveredBy = serverMode === 'all' && mode === 'all' && !bill?.myShare
    ? (bill.shares.find(s => s.mode === 'all')?.name || '')
    : null

  const customOn = tipSel.custom !== null
  const parsed = customOn ? parseTip(tipSel.custom) : tipForShare(share, tipSel.pct)
  // No tip is collected at reception, so a half-typed custom tip must not block paying there.
  const tipValid = method === 'reception' || parsed !== null
  const tipWanted = parsed !== null ? parsed : 0
  const tip = method === 'reception' ? 0 : tipWanted

  const assigned = waiters.find(w => w.isAssigned)?.staffId ?? null
  const waiterId = waiterSel || assigned || 'team'
  const tipStaffId = tip > 0 && waiterId !== 'team' ? waiterId : null

  return {
    multi, locked, canSplit, mode, serverMode, share, tip, tipValid, tipStaffId, coveredBy,
    total: addMoney(share, tip),
    method, demoOff, waiters, waiterId,
    tipSel, customOn,
    setMode: chooseMode,
    splitBusy, splitSaving: saving, splitError,
    setMethod,
    disableDemo: () => setDemoOff(true),
    setTipPct: pct => setTipSel({ pct, custom: null }),
    setTipCustom: text => setTipSel({ pct: 0, custom: text }),
    setWaiter: setWaiterSel,
  }
}
