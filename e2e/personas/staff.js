'use strict'
// What the restaurant staff do on the dashboard, through the same calls: the kitchen board (KDSPage), serving orders
// (OrdersPage), the cashier confirming reception payments (Bills), tables back to free (Tables / Waiter), and the
// end-of-day sweep that leaves no open bill, ticket or occupied table behind.
const {
  sleep, log, count, fail, manager, kitchenActor, cashierActor, floorActor, loadTables,
} = require('./world')

const NEXT = { new: 'preparing', preparing: 'ready', ready: 'done' }
const NEXT_TO_FREE = { occupied: 'free', reserved: 'free', maintenance: 'free', ordering: 'awaiting_payment', awaiting_payment: 'cleared', cleared: 'free' }
const ACTIVE_ORDER = 'open,submitted,preparing,ready,served'

/** Kitchen tickets (id, status) of these orders, read the way the board does: order_items first, then their tickets. */
async function ticketsOf(actor, orderIds) {
  if (!orderIds.length) return []
  const items = await actor.rows(`order_items?order_id=in.(${orderIds.join(',')})&select=id`)
  if (!items.length) return []
  return actor.rows(`kds_tickets?order_item_id=in.(${items.map(i => i.id).join(',')})&select=id,status`)
}

/** KDSPage.advance(): one ticket one step forward (only if it is still in the status we saw). */
async function advanceTicket(actor, ticket, next) {
  const body = { status: next }
  if (next === 'preparing') body.started_at = new Date().toISOString()
  if (next === 'done') body.completed_at = new Date().toISOString()
  const r = await actor.patch(`kds_tickets?id=eq.${ticket.id}&status=eq.${ticket.status}`, body)
  if (!r.ok || !Array.isArray(r.data) || r.data.length !== 1) { fail(`kds ${ticket.status}->${next}`, r.ok ? { code: 'no_row' } : r); return false }
  ticket.status = next
  count(`kds_${next}`)
  return true
}

/** The kitchen starts every ticket of the orders, marks them ready, then done. Returns the tickets (with their final status). */
async function kitchenCycle(v, orderIds, pace = 0) {
  const k = kitchenActor(v)
  const tickets = await ticketsOf(k, orderIds)
  for (const next of ['preparing', 'ready', 'done']) {
    const from = Object.keys(NEXT).find(s => NEXT[s] === next)
    for (const t of tickets.filter(x => x.status === from)) await advanceTicket(k, t, next)
    if (pace) await sleep(pace * 1000)
  }
  return tickets
}

/** The waiter (or the manager) marks the orders served. */
async function serveOrders(v, orderIds) {
  const waiter = floorActor(v)
  for (const id of orderIds) {
    let r = await waiter.patch(`orders?id=eq.${id}`, { status: 'served' })
    if ((!r.ok || !r.data || !r.data.length) && waiter !== manager(v)) r = await manager(v).patch(`orders?id=eq.${id}`, { status: 'served' })
    if (r.ok && r.data && r.data.length) count('order_served')
    else fail('order served', r.ok ? { code: 'no_row' } : r)
  }
}

/** Reception payments: the cashier (or the manager) confirms each intent. */
async function settleReception(v, intentIds) {
  for (const id of intentIds) {
    let r = await cashierActor(v).rpc('mark_payment_paid', { p_intent_id: id })
    if (!r.ok && cashierActor(v) !== manager(v)) r = await manager(v).rpc('mark_payment_paid', { p_intent_id: id })
    if (r.ok) count('reception_settled')
    else fail('mark_payment_paid', r)
  }
}

/** A guest calls the waiter, the waiter acknowledges and resolves (WaiterPage). */
async function callWaiter(v, guest, tableId, waiter, rng) {
  const r = await guest.rpc('call_waiter', { p_table_id: tableId, p_kind: rng.pick(['assist', 'water', 'cutlery', 'clean']) })
  if (!r.ok) { fail('call_waiter', r); return }
  count('call_waiter')
  const id = r.data && r.data.id
  const staff = waiter || floorActor(v)
  if (!id) return
  const ack = await staff.rpc('ack_service_request', { p_id: id })
  if (!ack.ok) { fail('ack_service_request', ack); return }
  const done = await staff.rpc('resolve_service_request', { p_id: id })
  if (done.ok) count('service_resolved'); else fail('resolve_service_request', done)
}

/** release_table, then walk the table to `free` the way the Tables page does (cleared -> free is "Mark free"). */
async function freeTable(v, tableId) {
  const staff = floorActor(v)
  await manager(v).rpc('release_table', { p_table_id: tableId })   // whoever took the table: a manager may release any
  for (let i = 0; i < 5; i++) {
    const row = (await manager(v).rows(`tables?id=eq.${tableId}&select=state`))[0]
    if (!row) return false
    if (row.state === 'free') return true
    const next = NEXT_TO_FREE[row.state] || 'free'
    let r = await staff.patch(`tables?id=eq.${tableId}`, { state: next })
    if ((!r.ok || !r.data || !r.data.length) && staff !== manager(v)) r = await manager(v).patch(`tables?id=eq.${tableId}`, { state: next })
    if (!r.ok) { fail('table state', r); return false }
    if (next === 'free') { count('table_freed'); return true }
  }
  return false
}

/**
 * Leaves nothing open at a table, whatever happened before: unfinished tickets are completed, ready orders served, an
 * unsettled bill closed by the manager (every unpaid share cash), the guests leave, the table goes back to free.
 * Never throws: it runs in `finally`.
 */
async function closeOut(v, tableId, guests = [], pace = 0) {
  if (!tableId) return
  const m = manager(v)
  try {
    const orders = await m.rows(`orders?table_id=eq.${tableId}&status=in.(${ACTIVE_ORDER})&select=id,status`)
    if (orders.length) {
      await kitchenCycle(v, orders.map(o => o.id), pace)
      const ready = (await m.rows(`orders?id=in.(${orders.map(o => o.id).join(',')})&select=id,status`)).filter(o => o.status === 'ready')
      if (ready.length) await serveOrders(v, ready.map(o => o.id))
    }
    let bills = await m.rows(`bills?table_id=eq.${tableId}&status=in.(open,requested,paying)&select=id`)
    const served = (await m.rows(`orders?table_id=eq.${tableId}&status=eq.served&select=id`)).length
    if (!bills.length && served) {
      const opened = await m.rpc('open_bill', { p_table_id: tableId })
      if (opened.ok) bills = [{ id: opened.data && (opened.data.bill_id || opened.data.id) }]
      else fail('open_bill (cleanup)', opened)
    }
    for (const b of bills) {
      const r = await m.rpc('close_bill', { p_bill_id: b.id })
      if (r.ok) count('bill_closed_by_staff'); else fail('close_bill', r)
    }
    const stuck = await m.rows(`orders?table_id=eq.${tableId}&status=in.(open,submitted,preparing,ready)&select=id`)
    for (const o of stuck) await m.patch(`orders?id=eq.${o.id}`, { status: 'cancelled' })   // could not be served: not left hanging
  } catch (e) { fail('closeOut', e) }
  try {
    for (const g of guests) await g.rpc('leave_table', { p_table_id: tableId })
    await freeTable(v, tableId)
  } catch (e) { fail('closeOut (leave)', e) }
}

/**
 * End of the day, per venue: close any bill still active, finish stray tickets, resolve open calls, free every table that
 * is not free. Returns { tablesLeft: [...], billsLeft: n, unpaid: n } so the summary can say whether the day ended clean.
 */
async function sweep(w) {
  const report = { tablesLeft: [], billsLeft: 0, unpaid: 0 }
  for (const v of Object.values(w.venues)) {
    const m = manager(v)
    if (!m) continue
    const bills = await m.rows(`bills?restaurant_id=eq.${v.id}&status=in.(open,requested,paying)&select=id,table_id`)
    for (const b of bills) {
      const r = await m.rpc('close_bill', { p_bill_id: b.id })
      if (r.ok) count('bill_closed_by_sweep'); else { fail('close_bill (sweep)', r); await m.rpc('void_bill', { p_bill_id: b.id, p_reason: 'demo sweep' }) }
    }
    const tickets = await m.rows(`kds_tickets?restaurant_id=eq.${v.id}&status=in.(new,preparing,ready)&select=id,status`)
    const k = kitchenActor(v)
    for (const t of tickets) { while (NEXT[t.status]) { if (!await advanceTicket(k, t, NEXT[t.status])) break } }
    const calls = await m.rows(`service_requests?restaurant_id=eq.${v.id}&status=in.(open,acknowledged)&select=id`)
    for (const c of calls) await floorActor(v).rpc('resolve_service_request', { p_id: c.id })
    // tables that are not free, and tables where an order is still unpaid even though the table looks free
    const stray = await m.rows(`orders?restaurant_id=eq.${v.id}&status=in.(${ACTIVE_ORDER})&select=table_id`)
    const busy = (await loadTables(v)).filter(x => x.state !== 'free')
    const ids = new Set([...busy.map(t => t.id), ...stray.map(o => o.table_id)])
    for (const id of ids) {
      await closeOut(v, id, [])
      const state = (await m.rows(`tables?id=eq.${id}&select=table_number,state`))[0]
      if (state && state.state !== 'free') report.tablesLeft.push(`${v.key} T${state.table_number} (${state.state})`)
    }
    const unpaid = await m.rows(`orders?restaurant_id=eq.${v.id}&status=in.(${ACTIVE_ORDER})&select=id`)
    report.unpaid += unpaid.length
    report.billsLeft += (await m.rows(`bills?restaurant_id=eq.${v.id}&status=in.(open,requested,paying)&select=id`)).length
  }
  log(`sweep: ${report.tablesLeft.length} tables not free, ${report.billsLeft} bills still active, ${report.unpaid} unpaid orders`)
  return report
}

module.exports = { ticketsOf, advanceTicket, kitchenCycle, serveOrders, settleReception, callWaiter, freeTable, closeOut, sweep }
