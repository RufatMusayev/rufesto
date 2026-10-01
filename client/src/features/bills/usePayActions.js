import { useRef, useState } from 'react'
import { createIntent, requestReception, settleDemo } from './api'
import { sameAmount } from './money'

const DEMO_PROCESSING_MS = 1200
const sleep = ms => new Promise(r => setTimeout(r, ms))
const receptionKey = billId => `rufesto_bill_reception_${billId}`

function readReception(billId) {
  try {
    const raw = sessionStorage.getItem(receptionKey(billId))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}
function writeReception(billId, value) {
  try { sessionStorage.setItem(receptionKey(billId), JSON.stringify(value)) } catch { /* private mode */ }
}

/**
 * The two ways to pay. Each guards itself with a ref so a double tap runs once: the demo path creates one
 * payment intent per tap (and the server updates that same intent if it is called again for the share).
 *
 *   payDemo()   -> { error } | { changed: amount } | { ok: true }
 *   askStaff()  -> { error } | { ok: true }
 */
export default function usePayActions({ bill, plan, tableId, reload }) {
  const busy = useRef(false)
  const [processing, setProcessing] = useState(false)
  const [reception, setReception] = useState(() => (bill ? readReception(bill.id) : null))

  async function guarded(fn) {
    if (busy.current) return { skipped: true }
    busy.current = true
    setProcessing(true)
    try { return await fn() } finally { busy.current = false; setProcessing(false) }
  }

  // The amount the guest saw is share + tip. If the server's share differs (cent rounding of an equal split),
  // nothing is settled: the screen shows the corrected amount and the guest taps again.
  const payDemo = () => guarded(async () => {
    const started = Date.now()
    const intent = await createIntent({
      billId: bill.id, tip: plan.tip, tipStaffId: plan.tipStaffId, mode: plan.mode,
    })
    if (intent.error) { await reload(); return { error: intent.error } }
    if (!sameAmount(intent.data.amount, plan.total)) {
      await reload()
      return { changed: intent.data.amount }
    }
    await sleep(Math.max(0, DEMO_PROCESSING_MS - (Date.now() - started)))
    const settled = await settleDemo(intent.data.intentId)
    await reload()
    if (settled.error) return { error: settled.error }
    return { ok: true, settled: settled.data }
  })

  const askStaff = () => guarded(async () => {
    const res = await requestReception({ billId: bill.id, mode: plan.mode })
    if (res.error) return { error: res.error }
    const value = { amount: res.data.amount }
    writeReception(bill.id, value)
    setReception(value)
    await reload()
    return { ok: true }
  })

  return { processing, reception, payDemo, askStaff }
}
