// Order pricing as the server does it, so the cart can show what will be charged BEFORE the order exists.
// Source of truth: recalculate_order_total (sql/_prod_baseline_part3.sql), run on every order_items change:
//   tax_amount     = ROUND(subtotal * tax_rate / 100, 2)
//   service_charge = ROUND(subtotal * service_charge / 100, 2)
//   total_amount   = ROUND(subtotal * (1 + tax_rate/100 + service_charge/100), 2)
// with COALESCE(tax_rate, 18) and COALESCE(service_charge, 0) from restaurant_settings. The rates are not
// readable by guests (no client policy on restaurant_settings), so the screens use the rates read back from
// the guest's own earlier orders (useOrderRates) and only fall back to these defaults when there is none.
export const DEFAULT_TAX_RATE = 18
export const DEFAULT_SERVICE_RATE = 0

const EPS = 1e-9
const toCents = n => Math.round((Number(n) || 0) * 100)
const fromCents = c => c / 100
const roundCents = x => Math.round(x + EPS)

/** { subtotal, tax, service, total, taxRate, serviceRate } for a food subtotal, rounded like the server. */
export function priceOrder(subtotal, { taxRate = DEFAULT_TAX_RATE, serviceRate = DEFAULT_SERVICE_RATE } = {}) {
  const sub = toCents(subtotal)
  return {
    subtotal: fromCents(sub),
    tax: fromCents(roundCents(sub * taxRate / 100)),
    service: fromCents(roundCents(sub * serviceRate / 100)),
    total: fromCents(roundCents(sub * (100 + taxRate + serviceRate) / 100)),
    taxRate,
    serviceRate,
  }
}

/**
 * The restaurant's rates, read back from server-computed orders ({ subtotal, tax_amount, service_charge }, snake or
 * camel case). The largest order is the most precise (cent rounding moves the ratio least); the ratio is snapped
 * to the nearest half percent. null when there is no order with a subtotal.
 */
export function ratesFromOrders(orders) {
  let best = null
  for (const o of orders || []) {
    const sub = Number(o?.subtotal) || 0
    if (sub > 0 && (!best || sub > best.sub)) {
      best = { sub, tax: Number(o.tax_amount ?? o.taxAmount) || 0, service: Number(o.service_charge ?? o.serviceCharge) || 0 }
    }
  }
  if (!best) return null
  const snap = amount => Math.round((amount / best.sub) * 200) / 2
  return { taxRate: snap(best.tax), serviceRate: snap(best.service) }
}

/** The rates behind one server answer (place_order's { subtotal, tax_amount, service_charge }), or null. */
export const ratesFromAnswer = answer => ratesFromOrders([answer])

/**
 * The lines of an order as the BILL prints them. bill_lines.line_total = net + VAT + service charge, the order's
 * tax_amount / service_charge shared out by each line's part of the subtotal, every share rounded to a qepik and the
 * rounding left over landing on the first line (sql/42_v2_bills.sql, bill lines of an order; items by created_at, id;
 * cancelled items take no part). The table screen uses this so a dish costs the same there as on the bill.
 * Returns Map(order item id -> { line, unit }); `unit` = line / quantity. Empty when the order has no subtotal
 * (no breakdown to share out): the caller then falls back to the net prices.
 */
export function inclusiveLines(order) {
  const out = new Map()
  const subC = toCents(order?.subtotal)
  if (subC <= 0) return out
  const taxC = toCents(order.tax_amount)
  const svcC = toCents(order.service_charge)
  const key = i => `${i.created_at || ''}|${i.id}`
  const rows = (order.order_items || [])
    .filter(i => i.status !== 'cancelled')
    .sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
    .map(item => {
      const net = toCents(item.line_total ?? (Number(item.unit_price) || 0) * (Number(item.quantity) || 0))
      return { item, net, tax: roundCents(taxC * net / subC), svc: roundCents(svcC * net / subC) }
    })
  if (rows.length) {
    rows[0].tax += taxC - rows.reduce((s, r) => s + r.tax, 0)
    rows[0].svc += svcC - rows.reduce((s, r) => s + r.svc, 0)
  }
  for (const r of rows) {
    const qty = Math.max(1, Number(r.item.quantity) || 1)
    const lineC = r.net + r.tax + r.svc
    out.set(r.item.id, { line: fromCents(lineC), unit: fromCents(Math.round(lineC / qty)) })
  }
  return out
}
