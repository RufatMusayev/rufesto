// The bill this guest settled most recently, kept for the tab session so /bill can still say "Paid" and link the
// receipt once the table is gone (the server clears the table when the bill settles, and with it the page's reason
// to show a bill: a reload used to land on "Nothing to pay yet"). Nothing but the bill id, the venue name and the
// guest's own paid amount is stored; it expires after 12 hours.
const KEY = 'rufesto_last_settled_bill'
const MAX_AGE_MS = 12 * 60 * 60 * 1000

export function rememberSettled({ billId, restaurant, amount }) {
  if (!billId) return
  try {
    sessionStorage.setItem(KEY, JSON.stringify({
      billId, restaurant: restaurant || '', amount: amount == null ? null : Number(amount), at: Date.now(),
    }))
  } catch { /* private mode: the "Paid" memo is just not there after a reload */ }
}

/** { billId, restaurant, amount } of the last settled bill of this tab session, or null. */
export function readSettled(now = Date.now()) {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const v = JSON.parse(raw)
    if (!v?.billId || !v.at || now - v.at > MAX_AGE_MS) { sessionStorage.removeItem(KEY); return null }
    return { billId: String(v.billId), restaurant: v.restaurant || '', amount: v.amount == null ? null : Number(v.amount) }
  } catch { return null }
}

export function forgetSettled() {
  try { sessionStorage.removeItem(KEY) } catch { /* nothing to forget */ }
}
