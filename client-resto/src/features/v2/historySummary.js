// Pure helpers behind the Overview numbers. Money is taken from orders only as a fallback while
// restaurant_day_stats (V2-CONTRACT 20, sql/63) is not deployed; the definitions are the same ones the RPC uses:
//   revenue      = money collected: orders settled through their bill (status 'paid'), VAT included, tips NOT included
//   open orders  = placed but not yet paid (not cancelled / refunded); NOT part of revenue
//   busiest day  = the Baku day with the most orders placed (ties: more money collected, then the earlier day)
import { bakuDateString } from './dates'

const NOT_COUNTED = ['cancelled', 'refunded']
const round2 = n => Math.round((Number(n) || 0) * 100) / 100

/** An order that still waits for its bill to be settled. */
export const isOpenOrder = o => !['paid', 'cancelled', 'refunded'].includes(o.status)

/**
 * { revenue, paidCount, openAmount, openCount, orderCount, busiest } for a list of orders
 * ({ status, total_amount, placed_at }). Cancelled and refunded orders count nowhere.
 * `busiest` = { day, orders, revenue }, null for an empty list.
 */
export function summariseOrders(orders) {
  let revenue = 0
  let paidCount = 0
  let openAmount = 0
  let openCount = 0
  let orderCount = 0
  const byDay = new Map()
  for (const o of orders || []) {
    if (NOT_COUNTED.includes(o.status)) continue
    orderCount += 1
    const amount = Number(o.total_amount) || 0
    const day = o.placed_at ? bakuDateString(new Date(o.placed_at)) : ''
    const cur = byDay.get(day) || { day, revenue: 0, orders: 0 }
    cur.orders += 1
    if (o.status === 'paid') {
      revenue += amount
      paidCount += 1
      cur.revenue += amount
    } else {
      openAmount += amount
      openCount += 1
    }
    byDay.set(day, cur)
  }
  let busiest = null
  for (const d of byDay.values()) {
    if (!d.day) continue
    const better = !busiest
      || d.orders > busiest.orders
      || (d.orders === busiest.orders && (d.revenue > busiest.revenue || (d.revenue === busiest.revenue && d.day < busiest.day)))
    if (better) busiest = d
  }
  return {
    revenue: round2(revenue),
    paidCount,
    openAmount: round2(openAmount),
    openCount,
    orderCount,
    busiest: busiest ? { ...busiest, revenue: round2(busiest.revenue) } : null,
  }
}
