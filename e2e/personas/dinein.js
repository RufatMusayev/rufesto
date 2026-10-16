'use strict'
// One dine-in party, start to finish, through the calls the apps make: claim the table (QR code / chair code), the host
// approves friends, place_order rounds, the kitchen and the waiter work the tickets, the host requests the bill
// (split_bill), everyone pays (demo card with a tip, or reception settled by the cashier), everyone leaves, the table is freed.
const {
  sleep, log, count, fail, StepError, one, round2, pickWaiter, loadTables, loadMenu,
} = require('./world')
const { DINERS } = require('./roster')
const { kitchenCycle, serveOrders, settleReception, callWaiter, closeOut } = require('./staff')

const STARTERS = ['starter', 'soup', 'salad']
const LINE_NOTES = ['no onions', 'extra spicy please', 'sauce on the side', 'soğansız olsun', 'acı olsun', 'без лука', 'less salt']

const dishesOf = (menu, cats, veg) => {
  const list = menu.filter(d => d.available && cats.includes(d.category))
  if (!veg) return list
  const meatless = list.filter(d => d.is_vegetarian || d.is_vegan)
  return meatless.length ? meatless : list
}

/**
 * What one person orders in one round: [{ dish, qty, notes }]. `share` = how many people this account orders for
 * (a family or group table has more mouths than accounts). Real dishes of the venue's live menu, never sold-out ones.
 */
function composeOrder(rng, v, persona, menu, round, share) {
  const lines = []
  const veg = !!persona.vegetarian
  const add = (list, qty = 1) => {
    const pool = list.filter(d => !lines.some(l => l.dish.id === d.id))
    if (!pool.length) return false
    lines.push({ dish: rng.pick(pool), qty, notes: rng.chance(0.08) ? rng.pick(LINE_NOTES) : null })
    return true
  }
  const people = Math.max(1, Math.min(3, Math.round(share)))
  const mains = () => { for (let i = 0; i < people; i++) if (!add(dishesOf(menu, ['main'], veg)) && !add(dishesOf(menu, ['salad', 'soup', 'starter', 'side'], veg))) break }
  const drink = () => add(dishesOf(menu, ['beverage']), Math.min(people, rng.chance(0.2) ? 2 : 1))
  if (v.kind === 'coffee') {
    if (round === 0) {
      drink()
      if (rng.chance(persona.dessert ? 1 : 0.7)) add(dishesOf(menu, ['dessert', 'starter', 'side'], veg))
      if (v.cuisine === 'Brunch cafe' && rng.chance(0.45)) add(dishesOf(menu, ['main', 'salad', 'soup'], veg))
    }
  } else if (v.kind === 'quick') {
    if (round === 0) { mains(); if (rng.chance(0.5)) add(dishesOf(menu, ['side'], veg)); if (rng.chance(0.85)) drink() }
  } else if (round === 0) {
    if (rng.chance(0.75)) add(dishesOf(menu, STARTERS, veg), people > 1 && rng.chance(0.3) ? 2 : 1)
    mains()
    if (rng.chance(0.25)) add(dishesOf(menu, ['side'], veg))
    if (rng.chance(0.6)) drink()
  } else {
    if (rng.chance(persona.dessert ? 1 : 0.6)) add(dishesOf(menu, ['dessert'], veg))
    if (rng.chance(0.5)) drink()
  }
  if (!lines.length && round === 0) {   // a thin menu: anything the kitchen has
    add(menu.filter(d => d.available && !['alcoholic', 'kids'].includes(d.category)))
  }
  return lines
}

/** place_order; a dish that sold out meanwhile is dropped from the cart and the order is tried again (the cart does the same). */
async function placeOrder(g, tableId, lines) {
  let cart = lines
  for (let attempt = 0; attempt < 3 && cart.length; attempt++) {
    const items = cart.map(l => ({ dish_id: l.dish.id, qty: l.qty, ...(l.notes ? { notes: l.notes } : {}) }))
    const r = await g.rpc('place_order', { p_table_id: tableId, p_items: items, p_notes: null })
    if (r.ok) { count('place_order'); const row = one(r); return { orderId: row.order_id, total: Number(row.total), lines: cart } }
    if (r.code === 'dish_unavailable') {
      const bad = r.data && r.data.details
      const left = cart.filter(l => l.dish.id !== bad)
      fail('place_order', r)
      if (left.length === cart.length) return null
      cart = left
      continue
    }
    fail('place_order', r)
    return null
  }
  return null
}

/** Pick a free table that fits, claim it as the host, then the friends claim their chairs and the host approves them. */
async function seatParty(w, P, rng) {
  const { v, plan } = P
  const need = plan.headcount
  const tried = []
  for (let attempt = 0; attempt < 3; attempt++) {
    let table
    if (P.booking && attempt === 0) table = (await loadTables(v)).find(t => t.id === P.booking.tableId)
    if (!table) {
      let free = []
      for (let look = 0; look < 2 && !free.length; look++) {   // a second look after a moment: the first read may have failed
        if (look) await sleep(1500)
        free = (await loadTables(v)).filter(t => ['free', 'cleared'].includes(t.state) && t.capacity >= need && !tried.includes(t.id))
      }
      if (!free.length) { fail('seat', { code: 'no_free_table' }); throw new StepError('seat', 'no_free_table') }
      free.sort((a, b) => a.capacity - b.capacity || a.number.localeCompare(b.number, undefined, { numeric: true }))
      table = rng.pick(free.slice(0, 3))
    }
    tried.push(table.id)
    const seats = rng.shuffle(Array.from({ length: Math.max(table.capacity, P.guests.length) }, (_, i) => i + 1))
    const codeOf = i => (i === 0 && rng.chance(0.5) ? table.code : `${table.code}-S${seats[i]}`)
    const host = P.guests[0]
    const r = P.booking
      ? await host.rpc('claim_table_from_booking', { p_booking_id: P.booking.id, p_code: codeOf(0) })
      : await host.rpc('claim_table', { p_code: codeOf(0) })
    if (!r.ok) {
      fail(P.booking ? 'claim_table_from_booking' : 'claim_table', r)
      P.booking = null            // the booking could not be claimed: the party walks in at a free table instead
      continue
    }
    count(P.booking ? 'claim_from_booking' : 'claim_table')
    P.tableId = r.data.table_id
    P.tableNo = r.data.table_number
    P.seated = [host]
    for (let i = 1; i < P.guests.length; i++) {
      const g = P.guests[i]
      const c = await g.rpc('claim_table', { p_code: codeOf(i) })
      if (!c.ok) { fail('claim_table (friend)', c); continue }
      count('claim_table')
      if (c.data.session_status === 'pending') {
        const ok = await host.rpc('respond_join_request', { p_session_id: c.data.session_id, p_approve: true })
        if (!ok.ok) { fail('respond_join_request', ok); continue }
        count('join_approved')
      }
      P.seated.push(g)
    }
    return
  }
  fail('seat', { code: 'no_table_claimed' })
  throw new StepError('seat', 'no_table_claimed')
}

/** The host requests the bill, then everyone pays their share. */
async function payBill(w, P, rng) {
  const { v, plan } = P
  const host = P.seated[0]
  const my = await host.rpc('my_bill')
  if (!my.ok) { fail('my_bill', my); throw new StepError('my_bill', my.code) }
  const billId = my.data.bill_id || my.data.id
  const mode = P.seated.length === 1 ? 'own' : plan.split
  const plan2 = await host.rpc('split_bill', { p_bill_id: billId, p_mode: mode, p_assignments: {} })
  if (!plan2.ok) { fail('split_bill', plan2); throw new StepError('split_bill', plan2.code) }
  count('bill_requested')
  P.billId = billId

  let waiterId = null
  const lw = await host.rpc('list_table_waiters', { p_table_id: P.tableId })
  if (lw.ok && Array.isArray(lw.data) && lw.data.length) waiterId = (lw.data.find(x => x.is_assigned || x.assigned) || lw.data[0]).staff_id

  const payers = mode === 'all' ? [host] : P.seated
  const reception = []
  for (const g of payers) {
    const view = await g.rpc('my_bill')
    const share = view.ok && view.data && view.data.my_share
    if (!share || share.status !== 'pending') continue
    let method = plan.pay[g.first] || 'card'
    if (method === 'card' && v.demoOn === false) method = 'reception'
    if (method === 'card') {
      const pct = plan.tip[g.first] != null ? plan.tip[g.first] : 8
      const tip = waiterId ? round2(Number(share.amount) * pct / 100) : (rng.chance(0.4) ? round2(Number(share.amount) * 0.05) : 0)
      const intent = await g.rpc('create_payment_intent', { p_bill_id: billId, p_method: 'demo', p_tip: tip, p_tip_staff_id: waiterId, p_mode: null })
      if (intent.ok) {
        const paid = await g.rpc('demo_settle_payment', { p_intent_id: intent.data.intent_id })
        if (paid.ok) { count('card_payment'); if (tip > 0) count('tip'); continue }
        fail('demo_settle_payment', paid)
        continue
      }
      if (intent.code === 'demo_disabled') v.demoOn = false
      fail('create_payment_intent (demo)', intent)
      method = 'reception'
    }
    const ask = await g.rpc('create_payment_intent', { p_bill_id: billId, p_method: 'reception', p_tip: 0, p_tip_staff_id: null, p_mode: null })
    if (ask.ok) reception.push(ask.data.intent_id)
    else fail('create_payment_intent (reception)', ask)
  }
  await settleReception(v, reception)

  const detail = await host.rpc('bill_detail', { p_bill_id: billId })
  if (detail.ok && detail.data && detail.data.status === 'settled') {
    count('bill_settled')
    if (detail.data.receipt) count('receipt')
    P.settled = true
    P.total = Number(detail.data.total) || 0
  } else {
    fail('bill_settled', detail.ok ? { code: `status_${detail.data && detail.data.status}` } : detail)
  }
}

/**
 * One party. Never throws and always leaves the table free: whatever a step did not finish, closeOut() does.
 * plan = a party of plan.js; opts.booking = { id, tableId } for a party that arrives through its booking.
 */
async function runParty(w, plan, rng, opts = {}) {
  const v = w.venues[plan.venue]
  const guests = plan.diners.map(n => w.diners[n]).filter(Boolean)
  const P = { plan, v, guests, seated: [], tableId: null, tableNo: null, orders: [], eaten: new Map(), billId: null, settled: false, booking: opts.booking || null, total: 0 }
  if (guests.length !== plan.diners.length) { fail(`party ${plan.id}`, { code: 'no_account' }); return P }
  log(`${plan.id} ${plan.slot} @ ${v.name}: ${plan.diners.join(' + ')}${P.booking ? ' (booking)' : ''}`)
  try {
    await seatParty(w, P, rng)
    count('party_seated')
    const waiter = pickWaiter(v, rng)
    if (waiter) { const t = await waiter.rpc('take_table', { p_table_id: P.tableId }); if (t.ok) count('take_table'); else fail('take_table', t) }
    const menu = await loadMenu(v)
    const base = Math.floor(plan.headcount / P.seated.length), extra = plan.headcount % P.seated.length
    for (let round = 0; round < plan.rounds; round++) {
      const placed = []
      for (let i = 0; i < P.seated.length; i++) {
        const g = P.seated[i]
        const lines = composeOrder(rng, v, DINERS[g.first], round === 0 ? menu : await loadMenu(v), round, base + (i < extra ? 1 : 0))
        if (!lines.length) continue
        const o = await placeOrder(g, P.tableId, lines)
        if (!o) continue
        P.orders.push(o); placed.push(o.orderId)
        const list = P.eaten.get(g.first) || []
        o.lines.forEach(l => list.push(l.dish)); P.eaten.set(g.first, list)
      }
      if (!placed.length) { if (round === 0) { fail('order', { code: 'nothing_ordered' }); throw new StepError('order', 'nothing_ordered') }; continue }
      if (round === 0 && plan.callWaiter) await callWaiter(v, rng.pick(P.seated), P.tableId, waiter, rng)
      await kitchenCycle(v, placed, w.pace)
      await serveOrders(v, placed)
    }
    await payBill(w, P, rng)
  } catch (e) {
    if (!e.recorded) fail(`party ${plan.id}`, e)
    log(`  ${plan.id} stopped (${e.message}); staff close it out`)
  } finally {
    await closeOut(v, P.tableId, P.guests, w.pace)
  }
  if (P.settled) count('party_completed')
  return P
}

module.exports = { runParty, composeOrder, placeOrder }
