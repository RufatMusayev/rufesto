// Helpers for tests/feat-table.spec.js and tests/feat-bills.spec.js: the guest's table screen, cart, bill and payments
// against the Bella Roma review accounts (docs/REVIEW-ACCOUNTS.md). Passwords are read at run time from that git-excluded
// doc and every sign-in goes through the Supabase auth API, never through a password field.
//   guests   review1 (Aysel, host) / review2 (Murad) / review3 (Leyla)         staff   manager.bella / waiter1.bella / kitchen.bella
// Tables: every test picks a FREE Bella Roma table by itself (never QA_TABLE_CODE's T5, which v2-bills / v2-tips use), owns it
// while it holds the guest lock, and resets it in `finally`, so the tests are independent of each other and of the order.
const fs = require('fs')
const os = require('os')
const path = require('path')
const base = require('./fixtures')
const { CONSUMER_URL, RESTO_URL, creds, supabaseOverride, tableCode: QA_TABLE_CODE } = require('./env')

const BELLA = '10000000-0000-0000-0000-000000000001'
const DOC = path.join(__dirname, '..', '..', 'docs', 'REVIEW-ACCOUNTS.md')

function docAccount(email) {
  let raw
  try { raw = fs.readFileSync(DOC, 'utf8') } catch { return null }
  const row = raw.split(/\r?\n/).map(l => l.split('|').map(c => c.trim())).find(c => c[1] === email)
  return row && row[2] ? { email, password: row[2] } : null
}
const EMAILS = {
  g1: 'review1@rufesto.test', g2: 'review2@rufesto.test', g3: 'review3@rufesto.test',
  manager: 'manager.bella@rufesto.test', waiter: 'waiter1.bella@rufesto.test', kitchen: 'kitchen.bella@rufesto.test',
}
const accounts = Object.fromEntries(Object.entries(EMAILS).map(([k, e]) => [k, (k === 'g1' && creds.review1) || docAccount(e)]))
const haveAccounts = Object.values(accounts).every(Boolean)

// ---- API clients ------------------------------------------------------------------------------------------------------
let supabaseCfg = null
/** Supabase URL + public anon key: QA_SUPABASE_* when set, else read from the consumer bundle (it is public by design). */
async function supabase() {
  if (supabaseOverride) return supabaseOverride
  if (supabaseCfg) return supabaseCfg
  const html = await (await fetch(CONSUMER_URL + '/')).text()
  for (const src of [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1])) {
    const text = await (await fetch(new URL(src, CONSUMER_URL + '/'))).text()
    const url = text.match(/https:\/\/[a-z0-9]+\.supabase\.co/)
    const key = text.match(/eyJ[\w-]{20,}\.[\w-]{20,}\.[\w-]{20,}/)
    if (url && key) return (supabaseCfg = { url: url[0], anonKey: key[0] })
  }
  throw new Error('Could not find the Supabase URL / anon key in the consumer bundle; set QA_SUPABASE_URL and QA_SUPABASE_ANON_KEY.')
}

function makeApi(key, sb, session) {
  const headers = { apikey: sb.anonKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }
  async function call(method, route, body, prefer) {
    const res = await fetch(`${sb.url}/rest/v1/${route}`, {
      method, headers: prefer ? { ...headers, Prefer: prefer } : headers, body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await res.text()
    let json = null
    try { json = text ? JSON.parse(text) : null } catch { json = text }
    return { ok: res.ok, status: res.status, body: json, error: res.ok ? '' : String(json?.message || text).slice(0, 200) }
  }
  return {
    key, email: session.user.email, uid: session.user.id, session, supabase: sb,
    get: route => call('GET', route),
    /** Rows of a GET; an error is thrown, never swallowed. */
    rows: async route => {
      const r = await call('GET', route)
      if (!r.ok) throw new Error(`GET ${route}: HTTP ${r.status} ${r.error}`)
      return r.body
    },
    patch: (route, body) => call('PATCH', route, body, 'return=representation'),
    del: route => call('DELETE', route, undefined, 'return=representation'),
    rpc: (name, args = {}) => call('POST', `rpc/${name}`, args),
  }
}

// One auth sign-in per account and HOUR: the Supabase auth endpoint answers 429 over_request_rate_limit after a few dozen sign-ins
// and every QA agent and every restarted worker shares this IP. Sessions (access + refresh token, never the password) are kept in
// the OS temp directory so the worker processes of one run, and the next run, reuse them; a 429 is retried after a pause.
const SESSION_FILE = path.join(os.tmpdir(), 'rufesto-feat-table-sessions.json')
const sessions = {}
const readSessions = () => { try { return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8')) } catch { return {} } }
const fresh = s => s && s.expires_at - Date.now() / 1000 > 900
async function login(key) {
  if (sessions[key]) return sessions[key]
  const acct = accounts[key]
  if (!acct) throw new Error(`no credentials for ${key} (docs/REVIEW-ACCOUNTS.md)`)
  const sb = await supabase()
  const stored = readSessions()[acct.email]
  if (fresh(stored)) return (sessions[key] = makeApi(key, sb, stored))
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${sb.url}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: sb.anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(acct),
    })
    if (res.status === 429 && attempt < 8) { await new Promise(r => setTimeout(r, 15_000 * attempt)); continue }
    if (!res.ok) throw new Error(`sign-in as ${key} failed: HTTP ${res.status} ${(await res.json().catch(() => ({}))).error_code || ''}`)
    const session = await res.json()
    try {   // atomic write: other workers read this file while we replace it
      const tmp = `${SESSION_FILE}.${process.pid}`
      fs.writeFileSync(tmp, JSON.stringify({ ...readSessions(), [acct.email]: session }))
      fs.renameSync(tmp, SESSION_FILE)
    } catch { /* the cache is an optimisation only */ }
    return (sessions[key] = makeApi(key, sb, session))
  }
}

/** Seeds the cached session of `key` into every page of `context`, exactly where supabase-js keeps it. */
async function seed(context, key) {
  const api = await login(key)
  const storageKey = `sb-${new URL(api.supabase.url).hostname.split('.')[0]}-auth-token`
  await context.addInitScript(([k, v]) => {
    try { if (!localStorage.getItem(k)) localStorage.setItem(k, v) } catch { /* storage blocked */ }
  }, [storageKey, JSON.stringify(api.session)])
  return api
}

// ---- cross-process lock for the shared guests ---------------------------------------------------------------------------
// claim_table() ends a guest's open session at any OTHER table, so two tests seating review1-3 at the same time break each
// other. Every test that seats them holds this directory lock (mkdir is atomic); the owner touches it every 20 s, so a
// lock nobody has touched for 90 s belongs to a dead run.
const LOCK = path.join(os.tmpdir(), 'rufesto-review123.lock')
async function acquireGuestLock(maxWaitMs = 30 * 60_000) {
  const t0 = Date.now()
  for (;;) {
    try { fs.mkdirSync(LOCK); break } catch (e) {
      if (e.code !== 'EEXIST') throw e
      try { if (Date.now() - fs.statSync(LOCK).mtimeMs > 90_000) { fs.rmdirSync(LOCK); continue } } catch { /* raced with the owner */ }
      if (Date.now() - t0 > maxWaitMs) throw new Error(`could not get ${LOCK} within ${maxWaitMs / 1000}s`)
      await new Promise(r => setTimeout(r, 500 + Math.random() * 700))
    }
  }
  const beat = setInterval(() => { try { const n = new Date(); fs.utimesSync(LOCK, n, n) } catch { /* released */ } }, 20_000)
  beat.unref()
  return () => { clearInterval(beat); try { fs.rmdirSync(LOCK) } catch { /* already gone */ } }
}

// ---- tables -------------------------------------------------------------------------------------------------------------
/** Bella Roma tables that have an access code: [{ id, number, capacity, state, code }]. */
async function bellaTables(mgr) {
  const [tables, codes] = await Promise.all([
    mgr.rows(`tables?restaurant_id=eq.${BELLA}&is_active=eq.true&select=id,table_number,capacity,state`),
    mgr.rows(`table_access_codes?restaurant_id=eq.${BELLA}&select=table_id,access_code`),
  ])
  return tables
    .map(t => ({ id: t.id, number: t.table_number, capacity: t.capacity, state: t.state, code: codes.find(c => c.table_id === t.id)?.access_code }))
    .filter(t => t.code)
}

/**
 * A free Bella Roma table for this test, or null. Never QA_TABLE_CODE's table. place_order allows 5 orders per user and table
 * in 10 minutes, so a table where a guest has already used up the budget (`orders` more are needed) is skipped.
 */
async function pickTable({ mgr, guests = [], minCapacity = 2, orders = 1, prefer = [], exclude = [] }) {
  const since = new Date(Date.now() - 10 * 60_000).toISOString()
  // claim_table answers join_declined for 10 minutes to a guest the host declined at that table: such a table is no use to them
  const declined = guests.length ? (await mgr.rows('table_sessions?status=eq.declined&ended_at=gte.' + since + '&user_id=in.(' + guests.map(g => g.uid).join(',') + ')&select=table_id')).map(r => r.table_id) : []
  // call_waiter refuses a guest for 2 minutes after their last call at that table (too_soon)
  const called = guests.length ? (await mgr.rows('service_requests?user_id=in.(' + guests.map(g => g.uid).join(',') + ')&created_at=gte.' + new Date(Date.now() - 130_000).toISOString() + '&select=table_id')).map(r => r.table_id) : []
  const candidates = (await bellaTables(mgr)).filter(t =>
    t.code !== QA_TABLE_CODE && !exclude.includes(t.id) && !declined.includes(t.id) && !called.includes(t.id) && t.capacity >= minCapacity && ['free', 'cleared'].includes(t.state))
  const budget = await Promise.all(candidates.map(async t => {
    const used = await Promise.all(guests.map(g => mgr.rows('orders?table_id=eq.' + t.id + '&user_id=eq.' + g.uid + '&placed_at=gte.' + since + '&select=id')))
    return used.every(rows => rows.length + orders <= 5)
  }))
  const usable = candidates.filter((t, i) => budget[i])
  const rank = t => { const i = prefer.indexOf(t.number); return i < 0 ? 99 : i }
  usable.sort((x, y) => rank(x) - rank(y) || y.capacity - x.capacity)
  return usable[0] || null
}

const tableState = async (mgr, tableId) => (await mgr.rows(`tables?id=eq.${tableId}&select=state`))[0]?.state
const NEXT_TO_FREE = { occupied: 'free', reserved: 'free', maintenance: 'free', ordering: 'awaiting_payment', awaiting_payment: 'cleared', cleared: 'free' }

/**
 * Puts a table back to `free` over the API (session tokens only): resolves its service requests, voids a bill that is still
 * active, cancels the guests' unpaid orders, makes the guests leave, releases the waiter assignment and walks the table
 * state to free (the dashboard's own state machine). Never throws: it runs in `finally`.
 */
async function resetTable({ mgr, waiter, kitchen, guests, tableId }) {
  const attempt = async fn => { try { return await fn() } catch { return null } }
  const ids = guests.map(g => g.uid).join(',')
  const since = new Date(Date.now() - 2 * 3600_000).toISOString()
  const [requests, bills, orders] = await Promise.all([
    attempt(() => mgr.rows('service_requests?table_id=eq.' + tableId + '&status=in.(open,acknowledged)&select=id')),
    attempt(() => mgr.rows('bills?table_id=eq.' + tableId + '&status=in.(open,requested,paying)&select=id')),
    attempt(() => mgr.rows('orders?table_id=eq.' + tableId + '&user_id=in.(' + ids + ')&placed_at=gte.' + since + '&status=in.(open,submitted,preparing,ready,served,cancelled)&select=id,user_id,status')),
  ])
  await Promise.all([
    ...(requests || []).map(r => attempt(() => waiter.rpc('resolve_service_request', { p_id: r.id }))),
    ...(bills || []).map(b => attempt(() => mgr.rpc('void_bill', { p_bill_id: b.id, p_reason: 'e2e reset' }))),
  ])
  // Unpaid orders are cancelled. An open order goes away with its kitchen tickets (cancel_order_draft); for the others the
  // tickets would stay on the kitchen board forever (cancelling an order does not touch them), so they are finished first.
  await Promise.all((orders || []).map(async o => {
    if (o.status === 'open') {
      const r = await attempt(() => guests.find(g => g.uid === o.user_id).rpc('cancel_order_draft', { p_order_id: o.id }))
      if (r && r.ok) return
    }
    const left = (await attempt(() => tickets(kitchen, o.id))) || []
    const active = left.filter(t => ['new', 'preparing', 'ready'].includes(t.status))
    await Promise.all(active.map(t => attempt(() => kitchen.patch('kds_tickets?id=eq.' + t.id, { status: 'done' }))))
    if (o.status !== 'cancelled' || active.length) await attempt(() => mgr.patch('orders?id=eq.' + o.id, { status: 'cancelled' }))
  }))
  await Promise.all(guests.map(g => attempt(() => g.rpc('leave_table', { p_table_id: tableId }))))
  await attempt(() => mgr.rpc('release_table', { p_table_id: tableId }))
  for (let i = 0; i < 4; i++) {
    const state = await attempt(() => tableState(mgr, tableId))
    if (!state || state === 'free') break
    await attempt(() => mgr.patch('tables?id=eq.' + tableId, { state: NEXT_TO_FREE[state] || 'free' }))
  }
  return attempt(() => tableState(mgr, tableId))
}

/** The six accounts as API clients (cached per worker), plus `guests` = [g1, g2, g3]. */
async function actors() {
  const [g1, g2, g3, mgr, waiter, kitchen] = await Promise.all(['g1', 'g2', 'g3', 'manager', 'waiter', 'kitchen'].map(login))
  return { g1, g2, g3, mgr, waiter, kitchen, guests: [g1, g2, g3] }
}

/**
 * The shape of every test: guest lock, a FREE table (never T5), a clean start, `body({ ...actors, table })`, and the table reset
 * afterwards (also when `body` throws). Screenshots of every open page are attached before the reset when the test failed,
 * soft assertions included. Skips the test when no table is free.
 */
async function withTable(ui, { minCapacity = 2, orders = 1, prefer = [], exclude = [] } = {}, body) {
  await ui.lock()
  const A = await actors()
  await Promise.all(A.guests.map(async g => {   // a guest left seated by an aborted run (anywhere) must not leak into this test
    const s = (await g.rpc('my_table_session')).body
    if (s?.table_id) { await g.rpc('leave_table', { p_table_id: s.table_id }); await resetTable({ ...A, tableId: s.table_id }) }
  }))
  const table = await pickTable({ mgr: A.mgr, guests: A.guests, minCapacity, orders, prefer, exclude })
  test.skip(!table, 'no free Bella Roma table (other than QA_TABLE_CODE) right now')
  await resetTable({ ...A, tableId: table.id })
  try {
    const out = await body({ ...A, table })
    if (test.info().errors.length) await ui.snap('soft-failure')   // evidence before the reset empties the screens
    return out
  } catch (e) { await ui.snap('failure'); throw e } finally { await resetTable({ ...A, tableId: table.id }) }
}

// ---- API-side scenario helpers --------------------------------------------------------------------------------------------
/** claim_table as `guest` (a table code or "<code>-S<n>"); a pending guest is approved by `host`. Returns the claim body. */
async function seatGuest(guest, code, host) {
  const r = await guest.rpc('claim_table', { p_code: code })
  if (!r.ok) throw new Error(`claim_table ${code} as ${guest.key}: ${r.error}`)
  if (r.body.session_status === 'pending' && host) {
    const party = await host.rpc('table_party', { p_table_id: r.body.table_id })
    const me = (party.body?.members || []).find(m => m.session_id === r.body.session_id)
    const ok = await host.rpc('respond_join_request', { p_session_id: me?.session_id, p_approve: true })
    if (!ok.ok) throw new Error(`respond_join_request for ${guest.key}: ${ok.error}`)
  }
  return r.body
}

const dishes = {}
/** The dish named `name` of Bella Roma: { id, name, price }. */
async function dish(api, name) {
  if (!dishes[name]) {
    const [d] = await api.rows(`dishes?restaurant_id=eq.${BELLA}&name=eq.${encodeURIComponent(name)}&available=eq.true&select=id,name,price`)
    if (!d) throw new Error(`dish "${name}" is not available at Bella Roma`)
    dishes[name] = d
  }
  return dishes[name]
}

/** place_order as `guest`: lines are [[dishName, qty], ...]. Returns { orderId, total, subtotal }. */
async function placeOrder(guest, tableId, lines) {
  const items = []
  for (const [name, qty] of lines) items.push({ dish_id: (await dish(guest, name)).id, qty })
  const r = await guest.rpc('place_order', { p_table_id: tableId, p_items: items, p_notes: null })
  if (!r.ok) throw new Error(`place_order as ${guest.key}: ${r.error}`)
  const row = Array.isArray(r.body) ? r.body[0] : r.body
  return { orderId: row.order_id, total: Number(row.total), subtotal: Number(row.subtotal) }
}

/** The kitchen tickets of an order, as the kitchen sees them. */
async function tickets(kitchen, orderId) {
  const items = await kitchen.rows(`order_items?order_id=eq.${orderId}&select=id`)
  if (!items.length) return []
  return kitchen.rows(`kds_tickets?order_item_id=in.(${items.map(i => i.id).join(',')})&select=id,status`)
}
/**
 * Moves every ticket of the order to `status` (kitchen account, the KDS board's own PATCH). Resolves to '' or the database's error:
 * `done` deducts stock (deduct_stock_fifo) and fails with `unrecognized format() type specifier "."` while an ingredient crosses
 * its low threshold (check_stock_threshold uses `%.2f` in format()), see docs/qa/consumer-table.md BUG-10.
 */
async function setTickets(kitchen, orderId, status) {
  for (const t of await tickets(kitchen, orderId)) {
    const r = await kitchen.patch('kds_tickets?id=eq.' + t.id, { status })
    if (!r.ok) return `kds_tickets -> ${status}: ${r.error}`
  }
  return ''
}
const orderStatus = async (api, orderId) => (await api.rows('orders?id=eq.' + orderId + '&select=status'))[0]?.status

/** Kitchen preparing -> ready -> done (the order becomes `ready`; `done` is best effort, see setTickets), then the manager marks it served. */
async function serveOrder({ kitchen, mgr }, orderId) {
  for (const status of ['preparing', 'ready', 'done']) await setTickets(kitchen, orderId, status)
  const r = await mgr.patch('orders?id=eq.' + orderId, { status: 'served' })
  if (!r.ok) throw new Error(`orders -> served: ${r.error}`)
}

const money = n => `₼${Number(n).toFixed(2)}`
/**
 * The total the cart shows for a food subtotal: VAT (and service charge, when the restaurant has one) on top, rounded like
 * recalculate_order_total (rates from restaurant_settings, defaults 18 % / 0 %). Read through `api` (a manager: guests cannot read the settings).
 */
async function withVat(api, subtotal) {
  const [s] = await api.rows(`restaurant_settings?restaurant_id=eq.${BELLA}&select=tax_rate,service_charge`)
  const tax = Number(s?.tax_rate ?? 18), service = Number(s?.service_charge ?? 0)
  return Math.round(Math.round(subtotal * 100) * (100 + tax + service) / 100 + 1e-9) / 100
}
const num = text => Number(String(text).replace(/[^\d.]/g, ''))
const close = (a, b, eps = 0.011) => Math.abs(a - b) <= eps

// ---- test fixture -------------------------------------------------------------------------------------------------------
const deviceOptions = use => ({
  storageState: use.storageState, viewport: use.viewport, locale: use.locale, userAgent: use.userAgent,
  deviceScaleFactor: use.deviceScaleFactor, isMobile: use.isMobile, hasTouch: use.hasTouch,
})
const desktopOptions = use => ({ storageState: use.storageState, viewport: { width: 1280, height: 800 }, locale: use.locale })

/**
 * `test` with an `ui` fixture: ui.open(key, { staff, blockRealtime }) gives a signed-in page in its own context (guests look like the project's
 * device, staff get a desktop window: the dashboard is desktop-only), ui.lock() takes the guest lock for the rest of the test.
 * ui.snap(label) attaches a screenshot of every page the test opened; all contexts and the lock are released afterwards.
 */
const test = base.test.extend({
  ui: async ({ browser }, use, testInfo) => {
    const opened = []
    let release = null
    const ui = {
      async open(key, { staff = false, blockRealtime = false } = {}) {
        const use = testInfo.project.use
        const context = await browser.newContext(staff ? desktopOptions(use) : deviceOptions(use))
        // a flaky connection: the realtime socket opens but nothing ever arrives on it (the screens must still work)
        if (blockRealtime) await context.routeWebSocket(/realtime\/v1\/websocket/, () => {})
        const api = await seed(context, key)
        const page = await context.newPage()
        const consoleErrors = []
        page.on('console', m => { if (m.type() === 'error' && !/status of 40[01]|cloudflareinsights/i.test(m.text() + (m.location()?.url || ''))) consoleErrors.push(m.text()) })
        page.on('pageerror', e => consoleErrors.push(`uncaught: ${e.message}`))
        opened.push({ key, page, context })
        return { page, api, context, consoleErrors }
      },
      /** Seeds a signed-in session into the test's own `page` (the one the standard watchers observe). */
      async adopt(page, key) { return seed(page.context(), key) },
      async lock() { if (!release) release = await acquireGuestLock() },
      /** Screenshots of every page this test opened, attached to the report (call it before the table is reset). */
      async snap(label) {
        for (const o of opened) {
          try {
            const file = testInfo.outputPath(`${label}-${o.key}.png`)
            await o.page.screenshot({ path: file })
            await testInfo.attach(`${label}-${o.key}`, { path: file, contentType: 'image/png' })
          } catch { /* page already closed */ }
        }
      },
    }
    await use(ui)
    await Promise.all(opened.map(o => o.context.close().catch(() => {})))
    if (release) release()
  },
})

// ---- UI helpers (guest app and dashboard) ---------------------------------------------------------------------------------
const { expect } = base
const url = p => CONSUMER_URL + p
const rurl = p => RESTO_URL + p

/** Opens the QR deep link and taps Join (the explicit action). */
async function claimByLink(page, code) {
  await page.goto(url(`/t/${code}`))
  await expect(page.getByRole('heading', { name: 'Join this table?' })).toBeVisible()
  await page.getByRole('button', { name: 'Join', exact: true }).click()
}
/** claimByLink and wait for the table screen. */
async function joinTable(page, code) {
  await claimByLink(page, code)
  await expect(page).toHaveURL(url('/table'))
  await expect(page.getByRole('heading', { name: 'Your Table' })).toBeVisible()
}
/** Table screen -> restaurant page (menu). */
async function openMenu(page) {
  await page.getByRole('link', { name: 'Add More Items' }).click()
  await expect(page).toHaveURL(/\/restaurant\/[\w-]+$/)
  await expect(page.locator('.menu-card').first()).toBeVisible()
}
const cartSheet = page => page.locator('.overlay').last().locator('.sheet')
/** Dish sheet of `name` -> "Add to Order" (the cart sheet opens by itself). */
async function addToCart(page, name) {
  await page.locator('.menu-card').filter({ hasText: name }).first().click()
  await page.getByRole('button', { name: /^Add to Order/ }).click()
  await expect(cartSheet(page).getByRole('heading', { name: 'Your Order' })).toBeVisible()
}

/** A dashboard card (inline-styled 14px-radius root: orders, waiter calls). */
const dashCard = page => page.locator('div[style*="border-radius: 14px"]')
/** A fresh kitchen ticket for table `number` and `dishName` (stale tickets of earlier runs show an elapsed time of many minutes). */
const kdsTicket = (page, number, dishName) => page.locator('.kds-ticket')
  .filter({ has: page.locator('.kds-table-num').filter({ hasText: new RegExp(`^${number}$`) }) })
  .filter({ hasText: dishName })
  .filter({ has: page.locator('.kds-elapsed').filter({ hasText: /^[0-2]m$/ }) })

module.exports = {
  url, rurl, claimByLink, joinTable, openMenu, cartSheet, addToCart, dashCard, kdsTicket,
  test, expect: base.expect, accounts, haveAccounts, BELLA, CONSUMER_URL, RESTO_URL, QA_TABLE_CODE,
  login, seed, acquireGuestLock, actors, withTable, bellaTables, pickTable, tableState, resetTable, seatGuest, dish, placeOrder,
  tickets, setTickets, orderStatus, serveOrder, money, withVat, num, close,
}
