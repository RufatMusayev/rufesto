// loyalty_transactions.reason is a machine string: `bill_paid:<bill id>` (sql/42c), `review_posted:<review id>`
// (sql/31), `review_posted` and `redeemed` (older rows), maybe `bonus` / `adjustment` from staff. The id is only
// used to look up a name for the row; it is never shown.
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const UUID_ALL = new RegExp(UUID.source, 'gi')

/** { kind, ref, text }. kind: 'bill' | 'review' | 'redeemed' | 'bonus' | 'adjustment' | 'other'.
 *  ref: the bill / review id behind the reason, or null. text: a readable fallback for 'other' (everything after
 *  a colon and any uuid removed); an empty or unreadable reason is an 'adjustment'. */
export function parseReason(reason) {
  const raw = typeof reason === 'string' ? reason.trim() : ''
  const colon = raw.indexOf(':')
  const ref = colon >= 0 ? raw.slice(colon + 1).match(UUID)?.[0] || null : null
  const head = (colon >= 0 ? raw.slice(0, colon) : raw).replace(UUID_ALL, ' ').trim().toLowerCase()
  const key = head.replace(/[\s-]+/g, '_')

  if (key.startsWith('bill_paid')) return { kind: 'bill', ref, text: '' }
  if (key.startsWith('review')) return { kind: 'review', ref, text: '' }
  if (key.startsWith('redeem')) return { kind: 'redeemed', ref: null, text: '' }
  if (key.includes('bonus')) return { kind: 'bonus', ref: null, text: '' }

  const text = key.replace(/_+/g, ' ').trim()
  if (!text || text.includes('adjust')) return { kind: 'adjustment', ref: null, text: '' }
  return { kind: 'other', ref: null, text: text[0].toUpperCase() + text.slice(1) }
}
