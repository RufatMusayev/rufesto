// Supabase calls behind the history views (Overview numbers, Bills over a range, served-but-unbilled tables).
// Same rules as api.js: every function resolves { data, error } and never throws; screens only see the view-models
// documented here. Each call names the contract it relies on. Until the DB side (V2-CONTRACT 20) is deployed the
// calls fall back to what exists today, so a screen never shows an error just because an RPC is missing.
import { supabase } from '../../lib/supabase'
import { subscribeResync } from '../../lib/realtime'
import { mapBill } from './api'
import { eachDay } from './dates'
import { isNotReady } from './errors'
import { rangeInstants } from './historyRange'

async function run(fn) {
  try {
    const res = await fn()
    return { data: res?.data ?? null, error: res?.error ?? null }
  } catch (error) {
    return { data: null, error }
  }
}

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const optNum = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

// ───────────────────────── Day stats (Overview) ─────────────────────────
// View-model DayStats { revenue, tips, orders, bills, guests, avgBill|null, busiest: { day, orders, revenue }|null }
//   revenue = money collected from settled bills (VAT included, tips excluded); tips are separate; orders = orders placed
//   (not cancelled / refunded / unsent drafts); busiest = the day with the most orders (ties: more revenue).
// CONTRACT: restaurant_day_stats(p_restaurant_id, p_from, p_to) (sql/63 2c): admin / manager only, at most 31 days,
//   -> { days: [...per day], totals: { orders, guests, bills, revenue_collected, tips, avg_bill },
//        busiest_day: { day, orders, revenue_collected } | null }

function mapDayStats(raw) {
  const d = (Array.isArray(raw) ? raw[0] : raw) || null
  const t = d && typeof d === 'object' ? d.totals : null
  if (!t) return null
  const b = d.busiest_day
  const bills = num(t.bills)
  return {
    revenue: num(t.revenue_collected),
    tips: num(t.tips),
    orders: num(t.orders),
    bills,
    guests: optNum(t.guests),
    // An average over no bills is not a number: the card is hidden instead of showing 0.00.
    avgBill: bills > 0 ? optNum(t.avg_bill) : null,
    busiest: b && b.day ? { day: String(b.day).slice(0, 10), orders: num(b.orders), revenue: num(b.revenue_collected) } : null,
  }
}

// Once the server says the RPC does not exist, this page load stops asking (a reload picks up a deploy), so the
// console and the network tab do not fill with 404s on every realtime event.
let dayStatsMissing = false

/** { data: DayStats|null, error, notReady } - `notReady` = the RPC is not deployed here (use the fallback). */
export async function fetchDayStats(restaurantId, { from, to }) {
  if (dayStatsMissing) return { data: null, error: null, notReady: true }
  const res = await run(() => supabase.rpc('restaurant_day_stats', { p_restaurant_id: restaurantId, p_from: from, p_to: to }))
  if (res.error) {
    const notReady = isNotReady(res.error)
    if (notReady) dayStatsMissing = true
    return { data: null, error: res.error, notReady }
  }
  return { data: mapDayStats(res.data), error: null, notReady: false }
}

/** Tips of a range (the existing tip_report RPC; managers and admins). Used when restaurant_day_stats is not there. */
export async function fetchTipTotal(restaurantId, { from, to }) {
  const res = await run(() => supabase.rpc('tip_report', { p_restaurant_id: restaurantId, p_from: from, p_to: to }))
  if (res.error) return { data: null, error: res.error }
  const d = (Array.isArray(res.data) ? res.data[0] : res.data) || {}
  return { data: num(d.total), error: null }
}

/** Orders of a range, newest first, with what the Overview list and numbers need. */
export async function fetchRangeOrders(restaurantId, range, limit = 1000) {
  const { fromISO, toISO } = rangeInstants(range)
  return run(() => supabase.from('orders')
    .select('id, status, total_amount, placed_at, tables(table_number), order_items(quantity, dishes(name, category))')
    .eq('restaurant_id', restaurantId)
    .gte('placed_at', fromISO)
    .lt('placed_at', toISO)
    .order('placed_at', { ascending: false })
    .limit(limit))
}

// ───────────────────────── Bills over a range ─────────────────────────
// CONTRACT: restaurant_bills(p_restaurant_id, p_day, p_status, p_from, p_to) (sql/63 2a):
//   - no p_day, no range: today's bills plus every bill still open (any day)
//   - p_day: only the bills of that Baku day (finished or voided that day, else opened that day)
//   - p_from / p_to (at most 31 days, not together with p_day): the bills of the range plus every bill still open
// Before sql/63 only the first two exist, so a multi-day range is asked for day by day (the answer is the same list,
// minus the still-open older bills).

const MAX_RANGE_CALLS = 31
let rangeRpcMissing = false

function collectBills(results) {
  const failed = results.find(r => r.error)
  if (failed) return { data: null, error: failed.error }
  const seen = new Set()
  const bills = []
  for (const r of results) {
    for (const row of r.data || []) {
      if (seen.has(row.bill_id)) continue
      seen.add(row.bill_id)
      bills.push(mapBill(row))
    }
  }
  bills.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
  return { data: bills, error: null }
}

/** Bills of a day range, newest first (Bill view-models of api.js). Today alone keeps the old "plus open older bills". */
export async function fetchBillsRange(restaurantId, { from, to }, today) {
  const days = eachDay(from, to, MAX_RANGE_CALLS)
  if (!days) return { data: null, error: { code: 'invalid_range', message: 'invalid_range' } }
  const base = { p_restaurant_id: restaurantId, p_status: 'all' }

  if (days.length > 1 && !rangeRpcMissing) {
    const res = await run(() => supabase.rpc('restaurant_bills', { ...base, p_from: from, p_to: to }))
    if (!res.error) return collectBills([res])
    if (!isNotReady(res.error)) return { data: null, error: res.error }
    rangeRpcMissing = true // the 3-argument function: fall through to one call per day
  }

  const calls = days.map(day => run(() => supabase.rpc('restaurant_bills', {
    ...base,
    // The plain "today" call also returns older bills that are still open, so the floor never loses one.
    ...(day === today && days.length === 1 ? {} : { p_day: day }),
  })))
  return collectBills(await Promise.all(calls))
}

// ───────────────────────── Served but not billed ─────────────────────────
// View-model UnbilledTable { tableId, tableNumber, sectionName, orders, inKitchen, amount, since }
// Tables with served orders that are on no live bill (a bill row only exists once a guest opens the bill), so a
// cashier can see who still has to pay. `inKitchen` = the table's orders still being cooked (0 = fully served).
// CONTRACT: restaurant_unbilled_tables(p_restaurant_id) (sql/63 2b) -> [{ table_id, table_number, section, orders,
//   in_kitchen, amount_due, since }], floor staff, longest waiting first. Fallback while it is not deployed: the
//   orders table (staff read it under RLS), tables whose every live order is served.

const LIVE_STATUSES = ['open', 'submitted', 'preparing', 'ready', 'served']
const WINDOW_MS = 24 * 60 * 60 * 1000

let unbilledRpcMissing = false

export async function fetchUnbilledTables(restaurantId, billedTableIds) {
  if (!unbilledRpcMissing) {
    const rpcRes = await run(() => supabase.rpc('restaurant_unbilled_tables', { p_restaurant_id: restaurantId }))
    if (!rpcRes.error) {
      return {
        data: (Array.isArray(rpcRes.data) ? rpcRes.data : []).map(r => ({
          tableId: r.table_id,
          tableNumber: String(r.table_number ?? ''),
          sectionName: r.section || '',
          orders: num(r.orders),
          inKitchen: num(r.in_kitchen),
          amount: num(r.amount_due),
          since: r.since || null,
        })),
        error: null,
      }
    }
    if (!isNotReady(rpcRes.error)) return rpcRes
    unbilledRpcMissing = true
  }
  const res = await run(() => supabase.from('orders')
    .select('id, table_id, status, total_amount, placed_at, tables(table_number, sections(name))')
    .eq('restaurant_id', restaurantId)
    .in('status', LIVE_STATUSES)
    .gte('placed_at', new Date(Date.now() - WINDOW_MS).toISOString())
    .order('placed_at'))
  if (res.error) return res
  const byTable = new Map()
  for (const o of res.data || []) {
    if (!o.table_id) continue
    const cur = byTable.get(o.table_id) || {
      tableId: o.table_id,
      tableNumber: String(o.tables?.table_number ?? ''),
      sectionName: o.tables?.sections?.name || '',
      orders: 0, inKitchen: 0, amount: 0, since: o.placed_at, allServed: true,
    }
    cur.orders += 1
    cur.amount += num(o.total_amount)
    if (o.status !== 'served') { cur.allServed = false; cur.inKitchen += 1 }
    byTable.set(o.table_id, cur)
  }
  const billed = new Set(billedTableIds)
  const list = [...byTable.values()]
    .filter(t => t.allServed && !billed.has(t.tableId))
    .map(({ allServed, ...t }) => ({ ...t, amount: Math.round(t.amount * 100) / 100 }))
    .sort((a, b) => String(a.since).localeCompare(String(b.since)))
  return { data: list, error: null }
}

// ───────────────────────── Realtime for the unbilled list ─────────────────────────
// A table becomes "served, not billed" when an order is marked served, which touches orders only.
let seq = 0
export function subscribeOrdersResync(restaurantId, resync) {
  const channel = supabase
    .channel(`v2-orders-resync-${restaurantId}-${++seq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` }, resync)
  return subscribeResync(channel, resync, { onVisible: true, pollMs: 30000 })
}
