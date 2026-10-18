// Helpers for tests/feat-dash-money.spec.js (dashboard money + settings QA on the SEDA OCAĞI review restaurant).
//
// Everything signs in through the Supabase auth API (support/guest.js, support/v2.js: openAs). Credentials are read at
// run time from the git-excluded docs/REVIEW-ACCOUNTS.md; nothing is copied into the suite and no password is typed.
// Writes are limited to the Seda review accounts (admin/manager/waiter1/waiter2/kitchen + guests review4..6) and
// every setting a test changes is put back by restoreBaseline().
const fs = require('fs')
const os = require('os')
const path = require('path')
const { CONSUMER_URL, RESTO_URL, supabaseOverride } = require('./env')
const { bakuDate } = require('./guest')

const SEDA = { id: '10000000-0000-0000-0000-000000000002', slug: 'seda-ocagi' }

const EMAIL = {
  admin: 'admin.seda@rufesto.test',
  manager: 'manager.seda@rufesto.test',
  waiter1: 'waiter1.seda@rufesto.test',
  waiter2: 'waiter2.seda@rufesto.test',
  kitchen: 'kitchen.seda@rufesto.test',
  sakura: 'manager.sakura@rufesto.test',   // another restaurant's manager: cross-tenant checks only
  g4: 'review4@rufesto.test',
  g5: 'review5@rufesto.test',
  g6: 'review6@rufesto.test',
}

const DOC = path.join(__dirname, '..', '..', 'docs', 'REVIEW-ACCOUNTS.md')
let docRows = null
function account(key) {
  if (!docRows) {
    let raw = ''
    try { raw = fs.readFileSync(DOC, 'utf8') } catch { /* doc missing: every account is null */ }
    docRows = raw.split(/\r?\n/).map(l => l.split('|').map(c => c.trim()))
  }
  const row = docRows.find(c => c[1] === EMAIL[key])
  return row && row[2] ? { email: row[1], password: row[2] } : null
}
const haveAccounts = () => Object.keys(EMAIL).every(k => account(k))

// ───────────────────────────── baseline of the Seda review restaurant ─────────────────────────────
// Read from the preview database on 2026-10-02 before the first run. restoreBaseline() puts exactly this back.
const BASE_HOURS = { 0: ['11:00', '23:00'], 1: ['11:00', '23:00'], 2: ['11:00', '23:00'], 3: ['11:00', '23:00'], 4: ['11:00', '23:00'], 5: ['11:00', '23:30'], 6: ['11:00', '23:30'] }
const BASE_SETTINGS = { max_party_size: 20, min_booking_notice: 30, auto_cancel_minutes: 15, allow_walk_in: true, group_booking_enabled: true }
const CLOSURE_REASON = 'QA money '   // every closure a test adds starts with this, so cleanup can find it

// ───────────────────────────── API ─────────────────────────────

/** PostgREST / RPC call as `who` ({ page, session, supabase }). Resolves { ok, status, json, text } and never throws. */
async function api(who, method, p, data, prefer) {
  const headers = { apikey: who.supabase.anonKey, Authorization: `Bearer ${who.session.access_token}`, 'Content-Type': 'application/json' }
  if (prefer) headers.Prefer = prefer
  const res = await who.page.request.fetch(`${who.supabase.url}/rest/v1/${p}`, { method, headers, data })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* empty body */ }
  return { ok: res.ok(), status: res.status(), json, text }
}

/** The error message an RPC raised ('bill_has_payments', 'forbidden', ...), or null when the call worked. */
const errOf = r => (r.ok ? null : String((r.json && (r.json.message || r.json.hint)) || r.text || r.status))

/** Anonymous RPC (the anon key as bearer), e.g. get_available_slots. */
async function anonRpc(who, name, args) {
  const res = await who.page.request.fetch(`${who.supabase.url}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: { apikey: who.supabase.anonKey, Authorization: `Bearer ${who.supabase.anonKey}`, 'Content-Type': 'application/json' }, data: args,
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* empty */ }
  return { ok: res.ok(), status: res.status(), json, text }
}

/** Console errors and failed calls of a page, same noise rules as support/fixtures.js (for pages the fixture does not watch). */
function watchPage(page) {
  const consoleErrors = []
  const failedCalls = []
  const noise = (text, url) => /static\.cloudflareinsights\.com/i.test(text + url) || (/status of 401/.test(text) && /supabase|\/(rest|auth|storage|realtime)\/v1\//i.test(url))
  page.on('console', msg => {
    if (msg.type() !== 'error') return
    const url = msg.location()?.url || ''
    if (!noise(msg.text(), url)) consoleErrors.push(`${msg.text()} [${url}]`)
  })
  page.on('pageerror', err => consoleErrors.push(`uncaught: ${err.message}`))
  page.on('response', res => { if (res.status() >= 400) failedCalls.push(`${res.status()} ${res.request().method()} ${res.url()}`) })
  return { consoleErrors, failedCalls }
}

// Supabase URL + public anon key: read once from the consumer app's own requests (like support/guest.js), kept in the
// temp folder so a worker that Playwright restarts after a failed test does not have to rediscover them (the discovery
// is the one step that flakes when the preview server is slow). Both values are public by design.
const CFG_FILE = path.join(os.tmpdir(), 'rufesto-feat-money-supabase.json')
let cfg = null
async function supabaseCfg(page) {
  if (supabaseOverride) return supabaseOverride
  if (cfg) return cfg
  try { const c = JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')); if (c.url && c.anonKey) return (cfg = c) } catch { /* no cache yet */ }
  for (let attempt = 0; attempt < 3; attempt++) {
    let found = null
    const onRequest = req => {
      if (found || !/\/rest\/v1\//.test(req.url())) return
      const anonKey = req.headers().apikey
      if (anonKey) found = { url: new URL(req.url()).origin, anonKey }
    }
    page.on('request', onRequest)
    await page.goto(CONSUMER_URL + '/').catch(() => {})
    const deadline = Date.now() + 25_000
    while (!found && Date.now() < deadline) await page.waitForTimeout(250)
    page.off('request', onRequest)
    if (found) { cfg = found; try { fs.writeFileSync(CFG_FILE, JSON.stringify(found)) } catch { /* read-only temp */ } return cfg }
  }
  throw new Error('Could not find the Supabase URL/anon key in consumer traffic after 3 tries; set QA_SUPABASE_URL and QA_SUPABASE_ANON_KEY.')
}

// One auth-API sign-in per account and worker process: the Supabase auth endpoint answers 429 (over_request_rate_limit)
// when every test of a suite (and the suites of other agents) signs in again. Later contexts re-seed the cached session.
const sessions = {}   // key -> { session, supabase }
const storageKeyOf = c => `sb-${new URL(c.url).hostname.split('.')[0]}-auth-token`
async function signInCached(page, key) {
  const creds = account(key)
  if (!creds) throw new Error(`no ${key} account (${EMAIL[key]}) in docs/REVIEW-ACCOUNTS.md`)
  const supabase = await supabaseCfg(page)
  let hit = sessions[key]
  if (!hit || hit.session.expires_at - Date.now() / 1000 < 900) {
    let session
    for (let attempt = 0; attempt < 6 && !session; attempt++) {
      const res = await page.request.post(`${supabase.url}/auth/v1/token?grant_type=password`, {
        headers: { apikey: supabase.anonKey, 'Content-Type': 'application/json' }, data: { email: creds.email, password: creds.password },
      })
      if (res.ok()) { session = await res.json(); break }
      const body = await res.json().catch(() => ({}))
      if (res.status() !== 429) throw new Error(`Sign-in of ${key} failed: HTTP ${res.status()} ${body.error_code || body.error || ''}`)
      await new Promise(r => setTimeout(r, 4000 * (attempt + 1)))
    }
    if (!session) throw new Error(`Sign-in of ${key} is still rate limited after 6 tries`)
    hit = sessions[key] = { session, supabase }
  }
  await page.context().addInitScript(([k, v]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, v) } catch { /* storage blocked */ } }, [storageKeyOf(supabase), JSON.stringify(hit.session)])
  return hit
}

/** A signed-in browser context for one of the Seda review accounts: { page, session, supabase, api, rpc, userId, close, watch }. */
async function as(browser, testInfo, key) {
  const use = testInfo.project.use
  const context = await browser.newContext({
    storageState: use.storageState, viewport: use.viewport, locale: use.locale, userAgent: use.userAgent,
    deviceScaleFactor: use.deviceScaleFactor, isMobile: use.isMobile, hasTouch: use.hasTouch,
  })
  const page = await context.newPage()
  const { session, supabase } = await signInCached(page, key)
  const who = { context, page, session, supabase, close: () => context.close() }
  who.key = key
  who.userId = session.user.id
  who.api = (method, p, data, prefer) => api(who, method, p, data, prefer)
  who.rpc = (name, args) => api(who, 'POST', `rpc/${name}`, args || {})
  who.watch = watchPage(page)
  return who
}

// ───────────────────────────── review4..6 lock ─────────────────────────────
// claim_table() ends a guest's open session at any other table, and the feat-dash-ops suite seats the same guests at
// Sakura House. A directory in the temp folder (mkdir is atomic) serialises every test that seats them; a lock older
// than STALE_MS belongs to a dead run and is taken over.
const LOCK = path.join(os.tmpdir(), 'rufesto-review456.lock')
const STALE_MS = 6 * 60_000
async function acquireGuestLock(maxWaitMs = 12 * 60_000) {
  const deadline = Date.now() + maxWaitMs
  for (;;) {
    try { fs.mkdirSync(LOCK); return } catch (e) { if (e.code !== 'EEXIST') throw e }
    try { if (Date.now() - fs.statSync(LOCK).mtimeMs > STALE_MS) { fs.rmdirSync(LOCK); continue } } catch { /* released meanwhile */ }
    if (Date.now() > deadline) throw new Error(`review4..6 lock ${LOCK} is held by another run for more than ${maxWaitMs / 60000} minutes`)
    await new Promise(r => setTimeout(r, 1500))
  }
}
function releaseGuestLock() { try { fs.rmdirSync(LOCK) } catch { /* not held */ } }

// ───────────────────────────── Seda facts ─────────────────────────────

/** Active tables of Seda with their codes, sorted the way the QR sheet sorts them. */
async function sedaTables(mgr) {
  const t = await mgr.api('GET', `tables?restaurant_id=eq.${SEDA.id}&is_active=eq.true&select=id,table_number,capacity,section_id,state,sections(name)`)
  const c = await mgr.api('GET', `table_access_codes?restaurant_id=eq.${SEDA.id}&select=table_id,access_code`)
  const codes = new Map((c.json || []).map(r => [r.table_id, r.access_code]))
  return (t.json || [])
    .map(r => ({ id: r.id, number: String(r.table_number), capacity: Number(r.capacity) || 0, sectionId: r.section_id || '', section: r.sections?.name || '', state: r.state, code: codes.get(r.id) || null }))
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))
}

/** list_staff as the manager: [{ staff_id, user_id, display_name, role, active, created_at }]. */
async function sedaStaff(mgr) {
  const r = await mgr.rpc('list_staff', { p_restaurant_id: SEDA.id })
  return Array.isArray(r.json) ? r.json : []
}

/** Two cheap, available dishes of Seda ({ id, price }); readable by anyone. */
async function cheapDishes(who) {
  const r = await who.api('GET', `dishes?restaurant_id=eq.${SEDA.id}&available=eq.true&select=id,price&order=price.asc&limit=4`)
  return (r.json || []).map(d => ({ id: d.id, price: Number(d.price) }))
}

// ───────────────────────────── table / bill scenarios (API only) ─────────────────────────────

const held = state => !['free', 'cleared'].includes(state)

/** claim_table as `guest` (a table code or "<code>-S<n>"); when the table asks the host to approve, `host` approves. */
async function seat(guest, code, host) {
  const r = await guest.rpc('claim_table', { p_code: code })
  if (!r.ok) throw new Error(`claim_table ${code} as ${guest.key}: ${errOf(r)}`)
  if (r.json.session_status === 'pending' && host) {
    const a = await host.rpc('respond_join_request', { p_session_id: r.json.session_id, p_approve: true })
    if (!a.ok) throw new Error(`respond_join_request as ${host.key}: ${errOf(a)}`)
  }
  return r.json
}

/** place_order with `qty` of each dish. Returns { order_id, total }. */
async function placeOrder(guest, tableId, dishes, qty = 1) {
  const r = await guest.rpc('place_order', { p_table_id: tableId, p_items: dishes.map(d => ({ dish_id: d.id, qty })), p_notes: null })
  if (!r.ok) throw new Error(`place_order as ${guest.key}: ${errOf(r)}`)
  return r.json
}

/** my_bill of the table `guest` sits at (opens the bill from the party's orders). Returns the bill view-model. */
async function myBill(guest) {
  const r = await guest.rpc('my_bill')
  if (!r.ok) throw new Error(`my_bill as ${guest.key}: ${errOf(r)}`)
  return r.json
}

/** A guest pays their share with the demo card (create + settle the intent). Returns { intent, settled }. */
async function demoPay(guest, billId, { tip = 0, tipStaffId = null, mode = null } = {}) {
  const i = await guest.rpc('create_payment_intent', { p_bill_id: billId, p_method: 'demo', p_tip: tip, p_tip_staff_id: tipStaffId, p_mode: mode })
  if (!i.ok) throw new Error(`create_payment_intent(demo) as ${guest.key}: ${errOf(i)}`)
  const s = await guest.rpc('demo_settle_payment', { p_intent_id: i.json.intent_id })
  if (!s.ok) throw new Error(`demo_settle_payment as ${guest.key}: ${errOf(s)}`)
  return { intent: i.json, settled: s.json }
}

/** A guest asks to pay at reception (a pending reception intent staff then confirm). */
async function askReception(guest, billId, mode = null) {
  const r = await guest.rpc('create_payment_intent', { p_bill_id: billId, p_method: 'reception', p_tip: 0, p_tip_staff_id: null, p_mode: mode })
  if (!r.ok) throw new Error(`create_payment_intent(reception) as ${guest.key}: ${errOf(r)}`)
  return r.json
}

/** restaurant_bills as the manager, newest first. */
async function bills(mgr) {
  const r = await mgr.rpc('restaurant_bills', { p_restaurant_id: SEDA.id, p_status: 'all' })
  if (!r.ok) throw new Error(`restaurant_bills: ${errOf(r)}`)
  return r.json || []
}

/** Closes out whatever bill is left on `tableId` so no active bill stays behind: void when nothing was paid, else mark the rest paid. */
async function finishBills(mgr, tableId) {
  const all = await bills(mgr)
  for (const b of all.filter(x => x.table?.id === tableId && ['open', 'requested', 'paying'].includes(x.status))) {
    const v = await mgr.rpc('void_bill', { p_bill_id: b.bill_id, p_reason: 'QA money cleanup' })
    if (!v.ok) await mgr.rpc('close_bill', { p_bill_id: b.bill_id })
  }
}

/** Frees a table the way a finished party would: bills closed, guests cancel drafts and leave, the manager releases it. */
async function freeTable(mgr, tableId, guests = []) {
  await finishBills(mgr, tableId)
  for (const g of guests) {
    const open = await g.api('GET', `orders?table_id=eq.${tableId}&user_id=eq.${g.userId}&status=in.(open,submitted)&select=id`)
    for (const o of open.json || []) await g.rpc('cancel_order_draft', { p_order_id: o.id })
    await g.rpc('leave_table', { p_table_id: tableId })
  }
  const state = async () => (await mgr.api('GET', `tables?id=eq.${tableId}&select=state`)).json?.[0]?.state
  if (held(await state())) {
    await mgr.rpc('release_table', { p_table_id: tableId })
    if (held(await state())) await mgr.api('PATCH', `tables?id=eq.${tableId}`, { state: 'free' })
  }
  if ((await state()) === 'cleared') await mgr.api('PATCH', `tables?id=eq.${tableId}`, { state: 'free' })   // what "Mark free" does on the Tables page
  return state()
}

/** Puts the tables this suite uses back to 'free' (a settled bill leaves them 'cleared'). T1 / T5 belong to nobody here and are left alone. */
async function tidyTables(mgr) {
  for (const t of await sedaTables(mgr)) {
    if (['T2', 'T3', 'T4', 'VIP1'].includes(t.number) && t.state === 'cleared') await mgr.api('PATCH', `tables?id=eq.${t.id}`, { state: 'free' })
  }
}

// ───────────────────────────── money maths on restaurant_bills rows ─────────────────────────────

const cents = n => Math.round((Number(n) || 0) * 100)
const fmt = n => `₼${(Math.round(cents(n)) / 100).toFixed(2)}`
const num = text => Number(String(text).replace(/[^\d.]/g, ''))
const isActive = b => ['open', 'requested', 'paying'].includes(b.status)
const bakuDay = iso => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baku' }).format(new Date(iso))

/** What the Bills page should show for these restaurant_bills rows. */
function expectedBillStats(rows) {
  const active = rows.filter(isActive)
  const today = bakuDate()
  return {
    all: rows.length,
    active: active.length,
    paid: rows.filter(b => b.status === 'settled').length,
    void: rows.filter(b => b.status === 'void').length,
    toCollect: active.reduce((s, b) => s + Math.max(0, cents(b.total) - cents(b.collected)), 0) / 100,
    collected: rows.filter(b => b.status !== 'void' && bakuDay(b.created_at) === today).reduce((s, b) => s + cents(b.collected), 0) / 100,
  }
}

// ───────────────────────────── settings baseline ─────────────────────────────

/** Compares the live Seda hours / closures / rules / settings with the baseline. Returns a list of differences ([] = baseline). */
async function baselineDiff(mgr) {
  const diffs = []
  const h = await mgr.api('GET', `operating_hours?restaurant_id=eq.${SEDA.id}&select=day_of_week,open_time,close_time,is_closed`)
  for (const [dow, [open, close]] of Object.entries(BASE_HOURS)) {
    const r = (h.json || []).find(x => String(x.day_of_week) === dow)
    const got = r ? `${r.is_closed ? 'closed' : 'open'} ${String(r.open_time).slice(0, 5)}-${String(r.close_time).slice(0, 5)}` : 'no row'
    if (got !== `open ${open}-${close}`) diffs.push(`hours day ${dow}: ${got} (baseline open ${open}-${close})`)
  }
  const c = await mgr.api('GET', `special_closures?restaurant_id=eq.${SEDA.id}&select=id,closed_date,reason`)
  if ((c.json || []).length) diffs.push(`closures: ${c.json.map(x => `${x.closed_date} ${x.reason || ''}`).join(', ')}`)
  const s = await mgr.api('GET', `restaurant_settings?restaurant_id=eq.${SEDA.id}&select=${Object.keys(BASE_SETTINGS).join(',')}`)
  for (const [k, v] of Object.entries(BASE_SETTINGS)) if (s.json?.[0]?.[k] !== v) diffs.push(`settings.${k}: ${s.json?.[0]?.[k]} (baseline ${v})`)
  const r = await mgr.api('GET', `availability_rules?restaurant_id=eq.${SEDA.id}&select=restaurant_id`)
  if ((r.json || []).length) diffs.push('availability_rules row exists (baseline: none, defaults apply)')
  return diffs
}

/** Puts hours, closures, settings and availability rules of Seda back to the baseline (idempotent). */
async function restoreBaseline(mgr) {
  const rows = Object.entries(BASE_HOURS).map(([dow, [open, close]]) => ({ restaurant_id: SEDA.id, day_of_week: Number(dow), open_time: open, close_time: close, is_closed: false }))
  await mgr.api('POST', 'operating_hours?on_conflict=restaurant_id,day_of_week', rows, 'resolution=merge-duplicates,return=minimal')
  await mgr.api('DELETE', `special_closures?restaurant_id=eq.${SEDA.id}`)
  await mgr.api('PATCH', `restaurant_settings?restaurant_id=eq.${SEDA.id}`, BASE_SETTINGS, 'return=minimal')
  const del = await mgr.api('DELETE', `availability_rules?restaurant_id=eq.${SEDA.id}`, undefined, 'return=representation')
  if (!del.ok) {
    // no delete policy: write the defaults, which behave the same as "no row"
    await mgr.api('PATCH', `availability_rules?restaurant_id=eq.${SEDA.id}`, {
      slot_step_minutes: 30, turn_minutes_1_2: 75, turn_minutes_3_4: 90, turn_minutes_5_6: 105, turn_minutes_7_plus: 120,
      buffer_minutes: 10, max_covers_per_slot: null, online_section_ids: null,
    }, 'return=minimal')
  }
  return baselineDiff(mgr)
}

// ───────────────────────────── slot maths ─────────────────────────────

const addDays = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10) }
const mondayOf = ymd => addDays(ymd, -((new Date(`${ymd}T00:00:00Z`).getUTCDay() + 6) % 7))   // weeks start on Monday (the app's "This week")
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
const dowOf = ymd => new Date(`${ymd}T00:00:00Z`).getUTCDay()   // 0 = Sunday, like operating_hours.day_of_week
const toMin = hhmm => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))
const toHhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** The slot times get_available_slots should list for open..close, a table time of `turn` minutes and a `step`: open, open+step, ... <= close - turn. */
function expectedSlots(open, close, turn, step) {
  const out = []
  for (let m = toMin(open); m <= toMin(close) - turn; m += step) out.push(toHhmm(m))
  return out
}

// ───────────────────────────── QR decoding (the suite has no jsqr) ─────────────────────────────
// The dashboard draws each QR with `qrcode` (width 640, margin 2, level M). The check below encodes the URL the card
// SHOULD carry with the same library and compares the module grid of the PNG on the page, module by module: if the grid
// is identical, every reader returns that URL. A wrong URL gives a different grid (the checker proves this on itself).
const QRCode = require('../../client-resto/node_modules/qrcode')
const { PNG } = require('../../client-resto/node_modules/pngjs')

/** Number of modules in the data-URL PNG that differ from the QR of `url` (Infinity when the image is unreadable). */
function qrMismatch(dataUrl, url) {
  const m = /^data:image\/png;base64,(.+)$/.exec(dataUrl || '')
  if (!m) return Infinity
  let png
  try { png = PNG.sync.read(Buffer.from(m[1], 'base64')) } catch { return Infinity }
  const expected = QRCode.create(url, { errorCorrectionLevel: 'M' })
  const n = expected.modules.size
  const margin = 2
  const scale = png.width / (n + margin * 2)
  let bad = 0
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const x = Math.floor((margin + c + 0.5) * scale)
      const y = Math.floor((margin + r + 0.5) * scale)
      const dark = png.data[((png.width * y) + x) << 2] < 128
      if (dark !== !!expected.modules.get(r, c)) bad++
    }
  }
  return bad
}

/** The consumer link a table card should carry: <consumer origin>/t/<code> (lib/qr.js tableQrUrl). */
const qrLink = code => `${CONSUMER_URL}/t/${encodeURIComponent(code)}`

// ───────────────────────────── PDF ─────────────────────────────
const pdfPages = buf => (buf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) || []).length
const pdfMediaBox = buf => {
  const m = /\/MediaBox\s*\[\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(buf.toString('latin1'))
  return m ? { w: Number(m[3]) - Number(m[1]), h: Number(m[4]) - Number(m[2]) } : null
}

module.exports = {
  SEDA, EMAIL, account, haveAccounts, CONSUMER_URL, RESTO_URL,
  BASE_HOURS, BASE_SETTINGS, CLOSURE_REASON,
  api, errOf, anonRpc, watchPage, as, acquireGuestLock, releaseGuestLock,
  sedaTables, sedaStaff, cheapDishes,
  held, tidyTables, seat, placeOrder, myBill, demoPay, askReception, bills, finishBills, freeTable,
  cents, fmt, num, isActive, bakuDay, expectedBillStats,
  baselineDiff, restoreBaseline,
  addDays, mondayOf, daysBetween, dowOf, toMin, toHhmm, expectedSlots,
  qrMismatch, qrLink, pdfPages, pdfMediaBox,
}
