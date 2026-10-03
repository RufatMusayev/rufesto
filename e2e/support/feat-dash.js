// Helpers for tests/feat-dash-ops.spec.js (dashboard operations, Sakura House staff + review4-6 guests).
// Passwords are never copied into the suite: they are read at run time from docs/REVIEW-ACCOUNTS.md (git-excluded),
// and every sign-in goes through the Supabase auth API (support/guest.js), never through a password field.
// Test data lives on Sakura House only (Bella Roma belongs to other agents); each test group owns its own tables.
const fs = require('fs')
const os = require('os')
const path = require('path')
const { CONSUMER_URL, RESTO_URL } = require('./env')
const { signInGuest, bakuDate } = require('./guest')

const DOC = path.join(__dirname, '..', '..', 'docs', 'REVIEW-ACCOUNTS.md')
const SAKURA_ID = '10000000-0000-0000-0000-000000000003'

/** { email, password } for an account row of docs/REVIEW-ACCOUNTS.md, or null when the doc / row is missing. */
function docAccount(email) {
  let raw
  try { raw = fs.readFileSync(DOC, 'utf8') } catch { return null }
  const row = raw.split(/\r?\n/).map(l => l.split('|').map(c => c.trim())).find(c => c[1] === email)
  return row && row[2] ? { email, password: row[2] } : null
}

const EMAILS = {
  admin: 'admin.sakura@rufesto.test', manager: 'manager.sakura@rufesto.test',
  waiter1: 'waiter1.sakura@rufesto.test', waiter2: 'waiter2.sakura@rufesto.test', kitchen: 'kitchen.sakura@rufesto.test',
  review4: 'review4@rufesto.test', review5: 'review5@rufesto.test', review6: 'review6@rufesto.test',
}
const accounts = Object.fromEntries(Object.entries(EMAILS).map(([k, e]) => [k, docAccount(e)]))
const haveAccounts = Object.values(accounts).every(Boolean)

// ---- sessions ---------------------------------------------------------------------------------------------------
// One auth-API sign-in per account and worker process; later tests re-seed the cached session (the Supabase auth
// endpoint is rate limited and this suite opens dozens of contexts).
const cache = {}
const STORAGE_KEY = who => `sb-${new URL(who.supabase.url).hostname.split('.')[0]}-auth-token`

async function authenticate(page, key) {
  const acct = accounts[key]
  if (!acct) throw new Error(`no credentials for ${key} (docs/REVIEW-ACCOUNTS.md)`)
  const hit = cache[key]
  if (hit && hit.session.expires_at - Date.now() / 1000 > 900) {
    await page.context().addInitScript(([k, v]) => {
      try { if (!localStorage.getItem(k)) localStorage.setItem(k, v) } catch { /* storage blocked */ }
    }, [STORAGE_KEY(hit), JSON.stringify(hit.session)])
    return hit
  }
  const who = await signInGuest(page, acct)
  cache[key] = who
  return who
}

/** Drop a cached session (a test that signs the account out server-side must not leave a revoked session behind). */
const forget = key => { delete cache[key] }

/** The project's device settings, so an extra context looks like the main one (viewport, UA, locale, touch). */
const contextOptions = (use, lang = 'en') => ({
  storageState: {
    cookies: [],
    origins: [CONSUMER_URL, RESTO_URL].map(u => ({ origin: new URL(u).origin, localStorage: [{ name: 'rufesto_lang', value: lang }] })),
  },
  viewport: use.viewport, locale: use.locale, userAgent: use.userAgent,
  deviceScaleFactor: use.deviceScaleFactor, isMobile: use.isMobile, hasTouch: use.hasTouch,
})

const NOISE = /static\.cloudflareinsights\.com/i
const SUPABASE = /supabase|\/(rest|auth|storage|realtime)\/v1\//i
/** Console errors + failed network calls of a page (same noise rules as support/fixtures.js). */
function watchPage(page) {
  const consoleErrors = []
  const failedCalls = []
  page.on('console', msg => {
    if (msg.type() !== 'error') return
    const url = msg.location()?.url || ''
    const text = msg.text()
    if (NOISE.test(text) || NOISE.test(url)) return
    if (/status of 401/.test(text) && SUPABASE.test(url)) return
    consoleErrors.push(`${text} [${url}]`)
  })
  page.on('pageerror', err => consoleErrors.push(`uncaught: ${err.message}`))
  page.on('response', res => { if (res.status() >= 400) failedCalls.push(`${res.status()} ${res.request().method()} ${res.url()}`) })
  return { consoleErrors, failedCalls }
}

/**
 * A browser context signed in as `key` over the auth API. Returns { context, page, who, watch, api, close }.
 * `opts`: { viewport, lang }.
 */
async function openAs(browser, testInfo, key, opts = {}) {
  const use = testInfo.project.use
  const base = contextOptions(use, opts.lang || 'en')
  if (opts.viewport) base.viewport = opts.viewport
  const context = await browser.newContext(base)
  const page = await context.newPage()
  const who = await authenticate(page, key)
  const watch = watchPage(page)
  return { context, page, who, watch, api: apiFor(page, who), close: () => context.close().catch(() => {}) }
}

// ---- REST / RPC as a signed-in account --------------------------------------------------------------------------
function apiFor(page, who) {
  const headers = () => ({
    apikey: who.supabase.anonKey, Authorization: `Bearer ${who.session.access_token}`, 'Content-Type': 'application/json',
    Prefer: 'return=representation',
  })
  const call = async (method, p, data) => {
    const res = await page.request.fetch(`${who.supabase.url}/rest/v1/${p}`, { method, headers: headers(), data, failOnStatusCode: false })
    const text = await res.text()
    let body = text
    try { body = text ? JSON.parse(text) : null } catch { /* keep text */ }
    return { ok: res.ok(), status: res.status(), body }
  }
  return {
    who,
    userId: who.session.user.id,
    get: p => call('GET', p),
    rows: async p => { const r = await call('GET', p); return Array.isArray(r.body) ? r.body : [] },
    post: (p, d) => call('POST', p, d),
    patch: (p, d) => call('PATCH', p, d),
    del: p => call('DELETE', p),
    rpc: (name, args = {}) => call('POST', `rpc/${name}`, args),
  }
}

// ---- Sakura fixtures --------------------------------------------------------------------------------------------
const PATH_TO_FREE = {
  free: [], reserved: ['free'], occupied: ['free'], ordering: ['awaiting_payment', 'cleared', 'free'],
  awaiting_payment: ['cleared', 'free'], cleared: ['free'], maintenance: ['free'],
}

/** { id, number, state, code } of a Sakura table; the access code is readable by staff only. */
async function tableInfo(mgr, number) {
  const [t] = await mgr.rows(`tables?restaurant_id=eq.${SAKURA_ID}&table_number=eq.${encodeURIComponent(number)}&select=id,table_number,state,capacity`)
  if (!t) throw new Error(`Sakura table ${number} not found`)
  const [c] = await mgr.rows(`table_access_codes?table_id=eq.${t.id}&select=access_code`)
  return { id: t.id, number: t.table_number, state: t.state, capacity: t.capacity, code: c?.access_code }
}

/**
 * Put a Sakura table back to a clean state over the API: the guests leave (their draft orders are cancelled first),
 * staff cancels whatever order is still in flight (there is no delete for staff, so those stay as cancelled history),
 * the claim is released and the table walks the state machine back to 'free' (the end_table_party trigger then closes
 * every open session).
 */
async function resetTable(mgr, number, guests = []) {
  const t = await tableInfo(mgr, number)
  for (const g of guests) {
    const open = await g.rows(`orders?table_id=eq.${t.id}&user_id=eq.${g.userId}&status=in.(open,submitted)&select=id`)
    for (const o of open) await g.rpc('cancel_order_draft', { p_order_id: o.id })
    await g.rpc('leave_table', { p_table_id: t.id })
  }
  const live = await mgr.rows(`orders?table_id=eq.${t.id}&status=in.(open,submitted,preparing,ready,served)&select=id`)
  for (const o of live) await mgr.patch(`orders?id=eq.${o.id}`, { status: 'cancelled' })
  await clearKitchen(mgr, t.id)
  await mgr.rpc('release_table', { p_table_id: t.id })
  let state = (await mgr.rows(`tables?id=eq.${t.id}&select=state`))[0]?.state
  for (const next of PATH_TO_FREE[state] || []) await mgr.patch(`tables?id=eq.${t.id}`, { state: next })
  state = (await mgr.rows(`tables?id=eq.${t.id}&select=state`))[0]?.state
  return { ...t, state }
}

/**
 * Take the active kitchen tickets (new / preparing / ready) of a table, or of the whole restaurant, off the board.
 * Cancelling an order in the dashboard leaves its tickets on the KDS (an app bug, see docs/qa/dashboard-ops.md), so
 * test cleanup has to cancel them itself; 'cancelled' is a real ticket_status and the done-trigger does not fire for it.
 */
async function clearKitchen(mgr, tableId) {
  const scope = tableId ? `&order_items.orders.table_id=eq.${tableId}` : ''
  const tickets = await mgr.rows(`kds_tickets?restaurant_id=eq.${SAKURA_ID}&status=in.(new,preparing,ready)&select=id,order_items!order_item_id!inner(orders!inner(table_id))${scope}`)
  if (tickets.length) await mgr.patch(`kds_tickets?id=in.(${tickets.map(t => t.id).join(',')})`, { status: 'cancelled' })
  return tickets.length
}

/**
 * The first `n` available Sakura dishes (cheapest first), ids + names + prices. Only dishes WITHOUT recipe ingredients:
 * marking a ticket Done deducts ingredient stock, and when that crosses an ingredient's low-stock threshold the
 * `check_stock_threshold` trigger fails (format('%.2f') is not valid in Postgres) and the PATCH is rolled back, so a
 * dish with ingredients makes the kitchen flow depend on the stock level (bug, see docs/qa/dashboard-ops.md).
 */
async function sakuraDishes(mgr, n = 2) {
  const rows = await mgr.rows(`dishes?restaurant_id=eq.${SAKURA_ID}&available=eq.true&select=id,name,price,dish_ingredients(id)&order=price.asc,name.asc`)
  return rows.filter(d => !(d.dish_ingredients || []).length).slice(0, n).map(({ id, name, price }) => ({ id, name, price }))
}

/** Seat `guest` at a table (claim_table RPC) and place one order of `items` [{dish_id, qty}]. */
async function seatAndOrder(guest, code, items) {
  const claim = await guest.rpc('claim_table', { p_code: code })
  if (!claim.ok) throw new Error(`claim_table failed: ${claim.status} ${JSON.stringify(claim.body)}`)
  const order = await guest.rpc('place_order', { p_table_id: claim.body.table_id, p_items: items, p_notes: null })
  if (!order.ok) throw new Error(`place_order failed: ${order.status} ${JSON.stringify(order.body)}`)
  return { tableId: claim.body.table_id, orderId: (Array.isArray(order.body) ? order.body[0] : order.body).order_id }
}

/**
 * Book a Sakura slot as `guest` (create_group_booking RPC, the consumer wizard's own call). `pick` chooses the n-th
 * available slot of the day so two tests never fight over the same tables; the host phone is a fake number.
 * Returns { id, code, date, time, status, party, invites }.
 */
async function bookSlot(guest, { party = 2, invites = false, daysAhead = 3, pick = 0, note = null } = {}) {
  // a closed day (or a fully booked one) moves the booking to the next day that has a free slot
  let date, slots, open
  for (let d = daysAhead; d < daysAhead + 8; d++) {
    date = bakuDate(d)
    slots = await guest.rpc('get_available_slots', { p_restaurant_id: SAKURA_ID, p_date: date, p_party_size: party })
    open = (Array.isArray(slots.body) ? slots.body : []).filter(s => s.available)
    if (open.length) break
  }
  if (!open.length) throw new Error(`no free Sakura slot from ${bakuDate(daysAhead)} on for ${party}: ${JSON.stringify(slots.body).slice(0, 200)}`)
  const slot = open[Math.min(pick, open.length - 1)]
  const r = await guest.rpc('create_group_booking', {
    p_restaurant_id: SAKURA_ID, p_date: date, p_time: slot.slot_time, p_party_size: party, p_note: note,
    p_host_name: null, p_host_phone: '+994501234567', p_consent: true, p_invites: invites,
  })
  if (!r.ok) throw new Error(`create_group_booking failed: ${r.status} ${JSON.stringify(r.body)}`)
  return { id: r.body.booking_id, code: r.body.invite_code, date, time: slot.slot_time, status: r.body.status, party, invites }
}

// ---- cross-process lock for the shared guests -------------------------------------------------------------------
// review4-6 are shared with other QA runs and claim_table() ends a guest's open session at any OTHER table, so two
// runs seating the same guests at the same time break each other. Every test that seats them holds this directory
// lock (mkdir is atomic; agreed with qa-dash-money, same path, a lock older than 6 minutes is stale).
const LOCK = path.join(os.tmpdir(), 'rufesto-review456.lock')
const STALE_MS = 6 * 60_000
/** Resolves with the milliseconds waited. */
async function acquireGuestLock(maxWaitMs = 20 * 60_000) {
  const t0 = Date.now()
  for (;;) {
    try { fs.mkdirSync(LOCK); return Date.now() - t0 } catch (e) {
      if (e.code !== 'EEXIST') throw e
      try { if (Date.now() - fs.statSync(LOCK).mtimeMs > STALE_MS) { fs.rmdirSync(LOCK); continue } } catch { /* raced with the owner */ }
      if (Date.now() - t0 > maxWaitMs) throw new Error(`could not get ${LOCK} within ${maxWaitMs / 1000}s`)
      await new Promise(r => setTimeout(r, 400 + Math.random() * 600))
    }
  }
}
const releaseGuestLock = () => { try { fs.rmdirSync(LOCK) } catch { /* already gone */ } }

module.exports = {
  accounts, haveAccounts, SAKURA_ID, CONSUMER_URL, RESTO_URL, bakuDate,
  authenticate, forget, openAs, watchPage, apiFor, contextOptions,
  tableInfo, resetTable, clearKitchen, sakuraDishes, seatAndOrder, bookSlot, acquireGuestLock, releaseGuestLock,
}
