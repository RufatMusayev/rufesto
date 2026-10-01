import { useEffect, useState } from 'react'
import { listWaiters } from './api'
import { addMoney, parseTip, tipForShare } from './money'

/**
 * Everything the guest chooses before paying (split mode, tip, waiter, method) and the numbers derived from
 * it. The amounts of the three split modes come from the server (`bill.modes`, or the stored share once a
 * plan exists); only the tip and the "pay now" sum are computed here.
 */
export default function usePayPlan(bill, tableId) {
  const [modeSel, setModeSel] = useState(null)              // null = follow the server's plan
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
  const mode = !multi ? 'own' : locked ? (serverMode || 'own') : (modeSel || serverMode || 'own')

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
    multi, locked, mode, serverMode, share, tip, tipValid, tipStaffId, coveredBy,
    total: addMoney(share, tip),
    method, demoOff, waiters, waiterId,
    tipSel, customOn,
    setMode: setModeSel,
    setMethod,
    disableDemo: () => setDemoOff(true),
    setTipPct: pct => setTipSel({ pct, custom: null }),
    setTipCustom: text => setTipSel({ pct: 0, custom: text }),
    setWaiter: setWaiterSel,
  }
}
