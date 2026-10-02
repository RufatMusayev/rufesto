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
