// A "Discount" campaign says how much it takes off. `ad_campaigns` has no column for that (checked against the live
// schema 2026-10-17: id, restaurant_id, name, type, budget, spent, daily_limit, starts_at, ends_at, status,
// impressions, clicks, created_at, title, description, image_url, dish_id), so the value travels as a structured
// prefix of the description:
//
//   [discount:percent=15] Pasta night, 15 % off every pasta
//   [discount:amount=5]   Five manat off your bill
//
// The dashboard strips the prefix when it shows or edits the text. A reader that does not know the prefix (the
// consumer app today) shows it as plain text, so it is written to be readable on its own; a consumer that wants the
// value parses it with `parseDiscount` below (same regex). When the table gets a real column this file is the only
// place that changes.
import { formatPrice } from '../../lib/format'

const PREFIX = /^\s*\[discount:(percent|amount)=(\d+(?:\.\d{1,2})?)\]\s*/

export const DISCOUNT_KINDS = ['percent', 'amount']

/** { kind: 'percent'|'amount'|null, value: number|null, text } - `text` is the description without the prefix. */
export function parseDiscount(description) {
  const raw = String(description || '')
  const m = PREFIX.exec(raw)
  if (!m) return { kind: null, value: null, text: raw }
  return { kind: m[1], value: Number(m[2]), text: raw.slice(m[0].length) }
}

/** The description to store: the prefix for a discount campaign with a value, nothing for any other type. null when empty. */
export function composeDescription({ type, kind, value, text }) {
  const body = String(text || '').trim()
  const n = Number(value)
  const prefix = type === 'discount' && DISCOUNT_KINDS.includes(kind) && Number.isFinite(n) && n > 0
    ? `[discount:${kind}=${trimNumber(n)}]`
    : ''
  const out = [prefix, body].filter(Boolean).join(' ')
  return out || null
}

const trimNumber = n => String(Math.round(n * 100) / 100)

/** Why a discount value can't be saved ('percent' | 'amount'), or null when it is fine. */
export function discountProblem(kind, value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return kind === 'amount' ? 'amount' : 'percent'
  if (kind === 'percent' && n > 100) return 'percent'
  return null
}

/** Short label for a card: "-15 %" or "-₼5.00"; '' when the description carries no discount. */
export function discountBadge(description) {
  const { kind, value } = parseDiscount(description)
  if (!kind) return ''
  return kind === 'percent' ? `−${trimNumber(value)} %` : `−${formatPrice(value)}`
}
