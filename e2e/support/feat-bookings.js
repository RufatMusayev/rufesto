// Helpers of feat-bookings.spec.js and feat-discovery.spec.js (consumer discovery + booking feature tests).
// Everything signs in through the Supabase auth API (support/guest.js), never through a password field. Passwords of
// the accounts are read at run time from e2e/.env or the git-excluded docs/REVIEW-ACCOUNTS.md / docs/QA-ACCOUNTS.md,
// nothing is copied into the suite. All writes are undone by the callers' `finally` blocks.
const fs = require('fs')
const path = require('path')
const { CONSUMER_URL, creds, supabaseOverride } = require('./env')
const { bakuDate } = require('./guest')

const DOCS = path.join(__dirname, '..', '..', 'docs')
const LOCALES = path.join(__dirname, '..', '..', 'client', 'src', 'locales')

const BELLA = '10000000-0000-0000-0000-000000000001'
const SEDA = '10000000-0000-0000-0000-000000000002'
const SAKURA = '10000000-0000-0000-0000-000000000003'
const PHONE = '+994 50 123 45 67'
const CONSENT = 'Share my name and phone with the restaurant for this booking'

const url = p => CONSUMER_URL + p

/* ------------------------------------------------------------- anon REST API */

let sbCache = null
/**
 * Public (anon) read access to the preview database, for "what should the page show?" comparisons.
 * The Supabase URL and public anon key come from the app's own JS bundle (or QA_SUPABASE_*).
 * Returns { url, anonKey, get(path) -> rows, rpc(name, args) -> { ok, status, body } }.
 */
async function anonApi(page) {
  if (!sbCache) {
    if (supabaseOverride) sbCache = supabaseOverride
    else {
      const html = await (await page.request.get(CONSUMER_URL + '/')).text()
      for (const m of html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)) {
        const js = await (await page.request.get(CONSUMER_URL + m[1])).text()
        const u = js.match(/https:\/\/[a-z0-9]+\.supabase\.co/)
        const k = js.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/)
        if (u && k) { sbCache = { url: u[0], anonKey: k[0] }; break }
      }
    }
    if (!sbCache) throw new Error('Could not find the Supabase URL / anon key in the consumer bundle; set QA_SUPABASE_URL and QA_SUPABASE_ANON_KEY.')
  }
  const headers = { apikey: sbCache.anonKey, Authorization: `Bearer ${sbCache.anonKey}`, 'Content-Type': 'application/json' }
  return {
    ...sbCache,
    get: async p => {
      const res = await page.request.get(`${sbCache.url}/rest/v1/${p}`, { headers })
      const body = parse(await res.text())
      return res.ok() && Array.isArray(body) ? body : []
    },
    rpc: async (name, args = {}) => {
      const res = await page.request.post(`${sbCache.url}/rest/v1/rpc/${name}`, { headers, data: args })
      return { ok: res.ok(), status: res.status(), body: parse(await res.text()) }
    },
  }
}

/* ------------------------------------------------------------------ accounts */

/** { email, password } of `email` from the docs tables ("| ... | email | password | ..." rows), or null. */
function docAccount(email) {
  for (const f of ['REVIEW-ACCOUNTS.md', 'QA-ACCOUNTS.md']) {
    let raw
    try { raw = fs.readFileSync(path.join(DOCS, f), 'utf8') } catch { continue }
    for (const line of raw.split(/\r?\n/)) {
      const cells = line.split('|').map(c => c.trim())
      const i = cells.indexOf(email)
      if (i > 0 && cells[i + 1]) return { email, password: cells[i + 1] }
    }
  }
  return null
}

/**
 * The accounts the feature tests use. Each describe group of feat-bookings owns its own accounts so the groups can run
 * in parallel workers without touching each other's bookings. QA guest / manager are only used by the groups that
 * need the Bella Roma dashboard side (the manager) and are shared with the v2-* specs, so they never book.
 */
const accounts = {
  wizardHost: () => docAccount('review5@rufesto.test'),
  inviteHost: () => docAccount('review6@rufesto.test'),
  inviteMember: () => docAccount('review3@rufesto.test'),
  inviteObserver: () => docAccount('waiter2.sakura@rufesto.test'),
  detailHost: () => docAccount('review4@rufesto.test'),
  // a guest whose booking list is still short: list_my_bookings answers only the newest 100 rows (cancelled ones included) and the busy hosts above hold 100+
  bannerHost: () => docAccount('waiter2.bella@rufesto.test'),
  detailMember: () => docAccount('review2@rufesto.test'),
  detailOutsider: () => docAccount('waiter2.seda@rufesto.test'),
  emptyGuest: () => docAccount('kitchen.sakura@rufesto.test'),
  coversHostA: () => docAccount('kitchen.seda@rufesto.test'),
  coversHostB: () => docAccount('waiter1.seda@rufesto.test'),
  coversHostC: () => docAccount('admin.seda@rufesto.test'),
  followGuest: () => docAccount('review1@rufesto.test') || creds.review1,
  bellaManager: () => docAccount('manager.bella@rufesto.test') || creds.manager,   // Manager Bella (the QA manager as a fallback)
  sakuraManager: () => docAccount('manager.sakura@rufesto.test'),
}

// Supabase limits password sign-ins per IP (and several QA agents share this machine), so a worker signs each account
// in once and reuses the session while it has more than 10 minutes left (supabase-js refreshes only near expiry).
const sessionCache = new Map()

/**
 * Signs `acct` in over the auth API without opening a browser context: { session, supabase } like signInGuest / openAs
 * (usable with call / req). For actors that only act through the API (setup, cleanup, "the other person").
 */
async function apiLogin(page, { email, password }) {
  const api = await anonApi(page)
  let session = sessionCache.get(email)
  if (!session || session.expires_at * 1000 - Date.now() < 600_000) {
    const res = await page.request.post(`${api.url}/auth/v1/token?grant_type=password`, {
      headers: { apikey: api.anonKey, 'Content-Type': 'application/json' }, data: { email, password },
    })
    if (!res.ok()) throw new Error(`API sign-in failed for ${email}: HTTP ${res.status()} ${(await res.text()).slice(0, 120)}`)
    session = await res.json()
    sessionCache.set(email, session)
  }
  return { session, supabase: { url: api.url, anonKey: api.anonKey } }
}

/** Signs `page`'s browser context in as `acct` (session seeded into localStorage, like support/guest.js). */
async function signIn(page, acct) {
  const who = await apiLogin(page, acct)
  const storageKey = `sb-${new URL(who.supabase.url).hostname.split('.')[0]}-auth-token`
  await page.context().addInitScript(([key, value]) => {
    try { if (!localStorage.getItem(key)) localStorage.setItem(key, value) } catch { /* storage blocked */ }
  }, [storageKey, JSON.stringify(who.session)])
  return who
}

/** The project's device settings for an extra context, so it looks like the first one (phone or desktop). */
const contextOptions = use => ({
  storageState: use.storageState, viewport: use.viewport, locale: use.locale, userAgent: use.userAgent,
  deviceScaleFactor: use.deviceScaleFactor, isMobile: use.isMobile, hasTouch: use.hasTouch,
})

/** A second browser context signed in as `acct`: { context, page, session, supabase, close }. Reuses cached sessions. */
async function openAs(browser, testInfo, acct) {
  const context = await browser.newContext(contextOptions(testInfo.project.use))
  const page = await context.newPage()
  const who = await signIn(page, acct)
  return { context, page, ...who, close: () => context.close() }
}

/** A signed-out second context. */
async function openAnon(browser, testInfo) {
  const context = await browser.newContext(contextOptions(testInfo.project.use))
  return { context, page: await context.newPage(), close: () => context.close() }
}

/** First missing account's name, or null when every one is available (used for `test.skip`). */
function missing(...names) {
  for (const n of names) if (!accounts[n]()) return n
  return null
}

/* --------------------------------------------------------------------- API */

const authHeaders = who => ({
  apikey: who.supabase.anonKey, Authorization: `Bearer ${who.session.access_token}`,
  'Content-Type': 'application/json', Prefer: 'return=representation',
})
const anonHeaders = who => ({
  apikey: who.supabase.anonKey, Authorization: `Bearer ${who.supabase.anonKey}`, 'Content-Type': 'application/json',
})

const parse = text => { try { return JSON.parse(text) } catch { return text } }

/** RPC as `who` ({ session, supabase } from openAs); who === null + `anonOf` = anon call. Never throws. */
async function call(page, who, name, args = {}, { anonOf } = {}) {
  const base = (who || anonOf).supabase
  const headers = who ? authHeaders(who) : anonHeaders(anonOf)
  const res = await page.request.post(`${base.url}/rest/v1/rpc/${name}`, { headers, data: args })
  const body = parse(await res.text())
  const code = res.ok() ? null : String((body && (body.message || body.code)) || 'error')
  return { ok: res.ok(), status: res.status(), body, code }
}

/** PostgREST request as `who`; returns { ok, status, rows | body }. */
async function req(page, who, method, p, data) {
  const res = await page.request.fetch(`${who.supabase.url}/rest/v1/${p}`, { method, headers: authHeaders(who), data })
  const body = parse(await res.text())
  return { ok: res.ok(), status: res.status(), body, rows: Array.isArray(body) ? body : [] }
}

/* -------------------------------------------------------------------- time */

const bakuClock = (d = new Date()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Baku', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
  }).formatToParts(d).map(x => [x.type, x.value]))
  return { h: +p.hour, m: +p.minute, minutes: +p.hour * 60 + +p.minute, weekday: p.weekday }
}
const hm = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const weekdayOf = date => new Date(`${date}T12:00:00Z`).getUTCDay()   // 0 = Sunday, like operating_hours.day_of_week

/**
 * The first slot get_available_slots offers (anon call) for `party` guests between day offsets [from, to] from today
 * (Baku). `minStartMs` / `maxStartMs` bound the start instant. Returns { date, time, startsAt (ms), tablesFree } or null.
 */
async function findSlot(page, anonOf, { restaurantId = BELLA, party = 2, from = 1, to = 12, minStartMs = 0, maxStartMs = Infinity, skip = 0 } = {}) {
  let seen = 0
  for (let d = from; d <= to; d++) {
    const date = bakuDate(d)
    const r = await call(page, null, 'get_available_slots', { p_restaurant_id: restaurantId, p_date: date, p_party_size: party }, { anonOf })
    if (!r.ok || !Array.isArray(r.body)) continue
    for (const s of r.body) {
      const at = Date.parse(s.starts_at)
      if (s.available && at >= minStartMs && at <= maxStartMs && seen++ >= skip) {
        return { date, time: s.slot_time, startsAt: at, tablesFree: s.tables_free }
      }
    }
  }
  return null
}

/* ---------------------------------------------------------------- bookings */

/** create_group_booking through the API. Returns { ok, code, booking } (booking = the RPC's JSON). */
async function createBooking(page, who, { restaurantId = BELLA, slot, party = 2, invites = true, note = null, name = 'QA Host', phone = PHONE, consent = true }) {
  const r = await call(page, who, 'create_group_booking', {
    p_restaurant_id: restaurantId, p_date: slot.date, p_time: slot.time, p_party_size: party, p_note: note,
    p_host_name: name, p_host_phone: phone, p_consent: consent, p_invites: invites,
  })
  return { ok: r.ok, code: r.code, booking: r.ok ? r.body : null, status: r.status }
}

/**
 * The caller's live bookings: host bookings are cancelled, memberships left. Idempotent, never throws.
 * list_my_bookings answers only the newest 100 rows by start time (sql/52d), and the QA accounts have hundreds of cancelled
 * far-future ones, so a live booking made earlier would be missed: the live rows are read straight from the tables instead.
 */
async function releaseAll(page, who) {
  let n = 0
  try {
    const me = who.session.user.id
    const hosted = (await req(page, who, 'GET', `bookings?user_id=eq.${me}&status=in.(pending,confirmed)&select=id`)).rows
    for (const b of hosted) { n++; await call(page, who, 'cancel_booking', { p_booking_id: b.id }) }
    const joined = (await req(page, who, 'GET', `booking_members?user_id=eq.${me}&status=in.(joined,arrived,invited)&select=booking_id,bookings(status,user_id)`)).rows
    for (const m of joined) {
      if (m.bookings && ['pending', 'confirmed'].includes(m.bookings.status) && m.bookings.user_id !== me) { n++; await call(page, who, 'leave_group_booking', { p_booking_id: m.booking_id }) }
    }
  } catch { /* cleanup must never mask the test result */ }
  const list = await call(page, who, 'list_my_bookings')   // and whatever the RPC still shows (idempotent)
  const rows = list.ok && Array.isArray(list.body) ? list.body : []
  for (const b of rows) {
    if (!['pending', 'confirmed'].includes(b.status)) continue
    n++
    if (b.my_role === 'host') await call(page, who, 'cancel_booking', { p_booking_id: b.booking_id })
    else if (['joined', 'arrived', 'invited'].includes(b.my_status)) await call(page, who, 'leave_group_booking', { p_booking_id: b.booking_id })
  }
  return n
}

/** The caller's live bookings (host or member) from list_my_bookings. */
async function myBookings(page, who) {
  const list = await call(page, who, 'list_my_bookings')
  return list.ok && Array.isArray(list.body) ? list.body : []
}

/** The caller's pending / confirmed bookings (host or member). */
async function liveBookings(page, who) {
  return (await myBookings(page, who)).filter(b => ['pending', 'confirmed'].includes(b.status))   // newest 100 only, like the app
}

/** Dashboard view of a booking as a staff member: { booking, members, contacts } rows read through REST. */
async function dashboardView(page, mgr, bookingId) {
  const [b, m, c] = await Promise.all([
    req(page, mgr, 'GET', `bookings?id=eq.${bookingId}&select=*`),
    req(page, mgr, 'GET', `booking_members?booking_id=eq.${bookingId}&select=*`),
    req(page, mgr, 'GET', `booking_contacts?booking_id=eq.${bookingId}&select=*`),
  ])
  return { booking: b.rows[0] || null, members: m.rows, contacts: c.rows, status: b.status }
}

/**
 * Moves a booking of `mgr`'s restaurant into the "We're here" window (what a restaurant can do from the dashboard:
 * bookings_staff_update). Needs the restaurant open now. Returns { ok, why }.
 */
async function moveIntoWindow(page, mgr, bookingId, { startedMinutesAgo = 5, lengthMin = 75 } = {}) {
  const from = new Date(Math.floor((Date.now() - startedMinutesAgo * 60_000) / 60_000) * 60_000)
  const until = new Date(from.getTime() + lengthMin * 60_000)
  const times = { reserved_from: from.toISOString(), reserved_until: until.toISOString() }
  let r = await req(page, mgr, 'PATCH', `bookings?id=eq.${bookingId}`, times)
  if (!r.ok && /exclusion|23P01/.test(JSON.stringify(r.body))) {
    // the booked table has another booking in the new window: move to any other table that takes the party (the dashboard can too)
    const b = (await req(page, mgr, 'GET', `bookings?id=eq.${bookingId}&select=restaurant_id,party_size,table_id`)).rows[0]
    const tables = (await req(page, mgr, 'GET', `tables?restaurant_id=eq.${b.restaurant_id}&is_active=eq.true&capacity=gte.${b.party_size}&min_capacity=lte.${b.party_size}&select=id&order=capacity`)).rows
    for (const t of tables.filter(t => t.id !== b.table_id)) {
      r = await req(page, mgr, 'PATCH', `bookings?id=eq.${bookingId}`, { ...times, table_id: t.id })
      if (r.ok) break
    }
  }
  return { ok: r.ok && r.rows.length === 1, why: r.ok ? 'no row updated' : JSON.stringify(r.body).slice(0, 200), from, until }
}

/** Put a seated QA booking away: guests leave the table, the dashboard cancels the booking and frees the table. Never throws. */
async function closeSeated(page, mgr, bookingId, guests = []) {
  try {
    const b = (await req(page, mgr, 'GET', `bookings?id=eq.${bookingId}&select=table_id,status`)).rows[0]
    for (const g of guests) {
      if (!b?.table_id) break
      await call(page, g, 'leave_table', { p_table_id: b.table_id })
    }
    if (b && ['pending', 'confirmed', 'seated'].includes(b.status)) {
      // 'cancelled', not 'completed': a completed booking inside the current window keeps blocking its table (exclusion
      // constraint bookings_table_id_tstzrange_excl) for the next run, a cancelled one does not
      await req(page, mgr, 'PATCH', `bookings?id=eq.${bookingId}`, { status: 'cancelled', cancel_reason: 'cancelled_by_host' })
    }
    if (b?.table_id) {
      await call(page, mgr, 'release_table', { p_table_id: b.table_id })
      await req(page, mgr, 'PATCH', `tables?id=eq.${b.table_id}`, { state: 'free' })
    }
  } catch { /* cleanup must never mask the test result */ }
}

/* ------------------------------------------------------------ UI utilities */

/**
 * Steps 1 of the wizard: set the party size, find a day with a free slot from `fromDay` and click the slot at `index`
 * among the enabled ones. Returns { date (aria label of the day), time } or null when none in `days` days.
 */
async function wizardPick(page, { party = 2, fromDay = 1, days = 10, index = 0, dayIndex = null, time = null } = {}) {
  const num = page.locator('.bk-stepper-num')
  await num.waitFor()
  for (let guard = 0; guard < 14 && +(await num.innerText()) !== party; guard++) {
    const cur = +(await num.innerText())
    await page.getByRole('button', { name: cur < party ? 'More guests' : 'Fewer guests' }).click()
  }
  const chips = page.locator('.bk-day')
  const range = dayIndex != null ? [dayIndex] : Array.from({ length: days }, (_, i) => fromDay + i)
  for (const d of range) {
    const loaded = page.waitForResponse(r => /get_available_slots/.test(r.url()), { timeout: 8_000 }).catch(() => null)
    await chips.nth(d).click()
    await loaded
    await page.locator('.slot-btn, .bk-slot-empty, .bk-load-error').first().waitFor({ timeout: 8_000 }).catch(() => {})
    const ok = time ? page.locator('.slot-btn:enabled', { hasText: time }) : page.locator('.slot-btn:enabled')
    const at = time ? 0 : index
    if ((await ok.count()) > at) {
      const label = await chips.nth(d).getAttribute('aria-label')
      const picked = (await ok.nth(at).innerText()).trim()
      await ok.nth(at).click()
      return { day: d, label, time: picked }
    }
  }
  return null
}

/** Texts (and aria-label / placeholder / title values) on the page that look like a raw i18n key or an open {{placeholder}}. */
async function rawKeys(page) {
  return page.evaluate(() => {
    const keyLike = s => /^[a-z][A-Za-z0-9]*:[A-Za-z0-9_.]+$/.test(s) || /^[a-z][A-Za-z0-9]*(\.[A-Za-z0-9_]+){1,}$/.test(s) || /\{\{.*\}\}/.test(s)
    const out = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const p = n.parentElement
      if (!p || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(p.tagName)) continue
      const s = (n.textContent || '').trim()
      if (s && !/\s/.test(s) && keyLike(s)) out.push(s)
      else if (/\{\{.*\}\}/.test(s)) out.push(s)
    }
    for (const el of document.querySelectorAll('[aria-label], [placeholder], [title]')) {
      for (const a of ['aria-label', 'placeholder', 'title']) {
        const v = (el.getAttribute(a) || '').trim()
        if (v && !/\s/.test(v) && keyLike(v)) out.push(`${a}=${v}`)
      }
    }
    return [...new Set(out)]
  })
}

/* --------------------------------------------------------------- locale data */

const readLocale = (lng, ns) => JSON.parse(fs.readFileSync(path.join(LOCALES, lng, `${ns}.json`), 'utf8'))
/** The string of dotted `key` in client/src/locales/<lng>/<ns>.json (plural suffixes: pass `key_other`). */
function locale(lng, ns, key) {
  let v = readLocale(lng, ns)
  for (const part of key.split('.')) v = v?.[part]
  return typeof v === 'string' ? v : null
}
const flatten = (o, prefix = '') => Object.entries(o).flatMap(([k, v]) =>
  v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`, String(v)]])

// The preview can lag behind the working tree (other people are editing the locale files), so an expected string only counts
// when the deployed bundle actually contains it. The consumer bundle carries every locale as plain string literals.
let bundleText = null
async function deployedBundle(page) {
  if (bundleText) return bundleText
  const seen = new Set()
  const queue = []
  const html = await (await page.request.get(CONSUMER_URL + '/')).text()
  for (const m of html.matchAll(/\/assets\/[A-Za-z0-9._-]+\.js/g)) queue.push(m[0])
  let text = ''
  while (queue.length && seen.size < 40) {
    const f = queue.shift()
    if (seen.has(f)) continue
    seen.add(f)
    const js = await (await page.request.get(CONSUMER_URL + f)).text()
    text += js
    if (seen.size <= 2) for (const m of js.matchAll(/assets\/[A-Za-z0-9._-]+\.js/g)) queue.push('/' + m[0])
  }
  bundleText = text
  return text
}
/** Is `str` a string literal of the deployed app? */
async function deployed(page, str) {
  if (!str) return false
  const text = await deployedBundle(page)
  return text.includes(str) || text.includes(str.replace(/"/g, '\\"'))
}
/** The Azerbaijani string of ns:key when it exists in the repo AND in the deployed bundle, else null (not deployed yet). */
async function azStr(page, ns, key) {
  const v = locale('az', ns, key)
  return (await deployed(page, v)) ? v : null
}

/** Every namespace file name of the consumer locales. */
const localeNamespaces = () => fs.readdirSync(path.join(LOCALES, 'en')).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''))

module.exports = {
  BELLA, SEDA, SAKURA, PHONE, CONSENT, url,
  docAccount, accounts, missing, anonApi, apiLogin, signIn, openAs, openAnon,
  call, req, bakuClock, hm, weekdayOf, findSlot,
  createBooking, releaseAll, myBookings, liveBookings, dashboardView, moveIntoWindow, closeSeated,
  wizardPick, rawKeys, readLocale, locale, flatten, localeNamespaces, deployed, azStr,
}
