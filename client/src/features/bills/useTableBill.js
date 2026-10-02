import { useEffect, useState } from 'react'
import { subscribeTableBills, tableBillStatus } from './api'

const EVENT_DEBOUNCE_MS = 250

/**
 * What the server says about this table's bill, for the entry on the Table screen: { id, status } with status
 * 'open' | 'requested' | 'paying' | 'paid' | 'void', or null while unknown / when the visit has no bill yet.
 * Read-only (it never opens a bill) and live: refetched on realtime events for the table's bills and when the
 * tab becomes visible again. A failed read keeps what is shown.
 */
export default function useTableBill({ tableId, since = null, enabled = true }) {
  const [bill, setBill] = useState(null)

  useEffect(() => {
    if (!enabled || !tableId) { setBill(null); return undefined }
    let alive = true
    let timer = null
    let seq = 0
    const refresh = async () => {
      const mine = ++seq
      const res = await tableBillStatus(tableId, since)
      if (!alive || mine !== seq || res.error) return
      setBill(res.data)
    }
    const onChange = () => {
      clearTimeout(timer)
      timer = setTimeout(refresh, EVENT_DEBOUNCE_MS)
    }
    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    refresh()
    const unsubscribe = subscribeTableBills({ tableId, onChange })
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      clearTimeout(timer)
      unsubscribe()
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [tableId, since, enabled])

  return bill
}
