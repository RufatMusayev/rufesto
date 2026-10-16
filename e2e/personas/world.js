'use strict'
// The world the simulator lives in: configuration, HTTP, signed-in actors (diners and staff), venues, tables and menus.
// Everything talks to Supabase the way the apps do (PostgREST + RPC + Storage with a user's access token, never the
// service key). Passwords and tokens are never printed.
const fs = require('fs')
const path = require('path')
const { VENUES, FALLBACK_STAFF, DINERS } = require('./roster')

const ROOT = path.join(__dirname, '..', '..')
const PREVIEW_REF = 'qqwvtuckljwvwrvyrjbn'
const PROD_REF = 'bjohnoaezfmrgunvjixt'
const TOKENS_FILE = path.join(__dirname, '.tokens.json')

const sleep = ms => new Promise(r => setTimeout(r, ms))
const log = msg => console.log(msg)

// ---- statistics: what the day summary prints -------------------------------------------------------------------------
const stats = { ok: {}, errors: {}, samples: [] }
const count = (name, n = 1) => { stats.ok[name] = (stats.ok[name] || 0) + n }
/** Records a failed step. `what` is a result of Actor.* ({ code, msg }) or an Error. Returns the code. */
function fail(step, what) {
  const code = (what && (what.code || what.message)) || 'error'
  const msg = (what && what.msg) || (what && what.message) || ''
  const kind = `${step}: ${code}`
  stats.errors[kind] = (stats.errors[kind] || 0) + 1
  if (stats.samples.length < 25) stats.samples.push(`${kind}${msg && msg !== code ? ` (${String(msg).slice(0, 120)})` : ''}`)
  log(`  ! ${kind}${msg && msg !== code ? ` - ${String(msg).slice(0, 100)}` : ''}`)
  return code
}
/** A failure that was already recorded: thrown to leave a party or a flow early. */
class StepError extends Error { constructor(step, code) { super(`${step}: ${code}`); this.step = step; this.code = code; this.recorded = true } }

// ---- configuration ---------------------------------------------------------------------------------------------------
/** Supabase URL + anon key from client/.env (tiny parser, like e2e/support/env.js). Refuses anything but the preview project. */
function loadConfig() {
  const vars = {}
  let raw = ''
  try { raw = fs.readFileSync(path.join(ROOT, 'client', '.env'), 'utf8') } catch { /* then the two variables must be in the environment */ }
  for (const line of raw.split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (m) vars[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
  const url = (process.env.VITE_SUPABASE_URL || vars.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || vars.VITE_SUPABASE_ANON_KEY || ''
  if (!url || !anonKey) throw new Error('no VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (client/.env or the environment)')
  if (url.includes(PROD_REF) || !url.includes(PREVIEW_REF)) throw new Error(`refusing to run: the Supabase URL is not the preview project (${PREVIEW_REF})`)
  return { url, anonKey }
}

// ---- HTTP --------------------------------------------------------------------------------------------------------------
function shape(res, text) {
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (res.ok) return { ok: true, status: res.status, data, code: null, msg: '' }
  const retryAfter = Number(res.headers.get('retry-after')) || 0
  const d = data && typeof data === 'object' ? data : {}
  const pg = typeof d.code === 'string' ? d.code : ''
  const code = pg === 'P0001' && d.message ? d.message : (d.error_code || pg || d.message || d.error || `http_${res.status}`)
  return { ok: false, status: res.status, retryAfter, data, code: String(code), msg: String(d.message || d.msg || d.error_description || (typeof data === 'string' ? data : '') || '') }
}

// How far the Supabase server clock is ahead of this machine's: measured once from the Date header of a response
// (1 s resolution, so half a second is added to sit in the middle of the truncation). Row timestamps are server time.
const clock = { skewMs: null }
function noteClock(res, url) {
  if (clock.skewMs !== null || !/supabase/.test(url)) return
  const server = Date.parse(res.headers.get('date') || '')
  if (!Number.isNaN(server)) clock.skewMs = server + 500 - Date.now()
}

/**
 * Measures the server clock precisely: polls the auth health endpoint until the second in the Date header changes (the flip
 * happens at an exact server second), which pins the offset to about a tenth of a second. Falls back to the middle of the
 * second when no flip is seen in ~10 s. Sets clock.skewMs = server - this machine, in ms.
 */
async function measureClock(cfg) {
  let prev = null
  for (let i = 0; i < 50; i++) {
    const t1 = Date.now()
    let res
    try { res = await fetch(`${cfg.url}/auth/v1/health`, { headers: { apikey: cfg.anonKey }, signal: AbortSignal.timeout(10_000) }) } catch { break }
    const mid = (t1 + Date.now()) / 2
    const server = Date.parse(res.headers.get('date') || '')
    if (Number.isNaN(server)) break
    if (prev && server > prev.server) { clock.skewMs = Math.round(server + (mid - prev.mid) / 2 - mid); return clock.skewMs }
    prev = { server, mid }
    await sleep(150)
  }
  if (prev) clock.skewMs = Math.round(prev.server + 500 - prev.mid)
  return clock.skewMs
}

/**
 * One HTTP call. Throttled answers (429) wait and retry; network errors and 502/503/504 are retried only for requests that
 * are safe to repeat (never POST: a repeated place_order would be a second order). Resolves { ok, status, data, code, msg }.
 */
async function request(method, url, { headers = {}, body, retry429 = true } = {}) {
  const safe = method !== 'POST'
  for (let attempt = 1; ; attempt++) {
    let res, text
    try {
      res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(45_000) })
      text = await res.text()
      noteClock(res, url)
    } catch (e) {
      if (safe && attempt < 3) { await sleep(1500 * attempt); continue }
      return { ok: false, status: 0, data: null, code: 'network', msg: String((e.cause && e.cause.code) || e.message) }
    }
    if (res.status === 429 && retry429 && attempt < 6) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 3000 * attempt
      await sleep(Math.min(wait, 30_000))
      continue
    }
    if ([502, 503, 504].includes(res.status) && safe && attempt < 3) { await sleep(1500 * attempt); continue }
    return shape(res, text)
  }
}

// ---- actors: one signed-in person --------------------------------------------------------------------------------------
// Sessions live in .tokens.json (git-ignored, never printed): { <email>: { access_token, refresh_token, expires_at, user_id } }.
// A token is reused until 60 s before it expires, then refreshed with its refresh token; the password is only used when there
// is no stored session or the refresh is refused. The auth API throttles password sign-ins hard, so nothing signs in eagerly.
let tokenStore = null
const tokens = () => tokenStore || (tokenStore = (() => { try { return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8')) } catch { return {} } })())
function saveToken(email, entry) {
  tokens()[email] = entry
  try {
    const tmp = `${TOKENS_FILE}.${process.pid}`
    fs.writeFileSync(tmp, JSON.stringify(tokens()))
    fs.renameSync(tmp, TOKENS_FILE)
  } catch { /* the store is an optimisation only */ }
}

class Actor {
  constructor(cfg, acct) {
    this.cfg = cfg
    this.acct = acct
    this.name = acct.name
    this.first = String(acct.name || '').normalize('NFC').split(' ')[0]
    this.kind = acct.kind
    this.role = acct.role || null
    this.venueKey = acct.restaurant || null
    this.uid = acct.id
    this.session = null
    this._signing = null
  }

  /** The access token, fetched lazily: stored session, else refresh, else password sign-in. */
  async token() {
    if (this.session && this.session.expires_at - Date.now() / 1000 > 60) return this.session.access_token
    if (!this._signing) this._signing = this._obtain().finally(() => { this._signing = null })
    return this._signing
  }

  /** Token endpoint call; a 429 waits (Retry-After, else 30 s doubling, at most 5 min) and tries again. */
  async _grant(type, body) {
    let wait = 30_000
    for (let attempt = 1; attempt <= 8; attempt++) {
      const r = await request('POST', `${this.cfg.url}/auth/v1/token?grant_type=${type}`, {
        headers: { apikey: this.cfg.anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify(body), retry429: false,
      })
      if (r.status !== 429 && r.code !== 'over_request_rate_limit') return r
      const ms = Math.min(r.retryAfter ? r.retryAfter * 1000 : wait, 300_000)
      log(`  (auth API throttled, waiting ${Math.round(ms / 1000)} s)`)
      await sleep(ms)
      wait = Math.min(wait * 2, 300_000)
    }
    return { ok: false, status: 429, code: 'over_request_rate_limit', msg: 'still throttled after 8 tries' }
  }

  _keep(data) {
    this.session = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at, user_id: data.user && data.user.id }
    if (this.session.user_id) this.uid = this.session.user_id
    saveToken(this.acct.email, this.session)
    return this.session.access_token
  }

  async _obtain() {
    const email = this.acct.email
    const s = this.session || tokens()[email]
    if (s && s.expires_at - Date.now() / 1000 > 60) { this.session = s; if (s.user_id) this.uid = s.user_id; return s.access_token }
    if (s && s.refresh_token) {
      const r = await this._grant('refresh_token', { refresh_token: s.refresh_token })
      if (r.ok && r.data && r.data.access_token) { count('token_refresh'); return this._keep(r.data) }
    }
    const r = await this._grant('password', { email, password: this.acct.password })
    if (r.ok && r.data && r.data.access_token) { count('sign_in'); return this._keep(r.data) }
    throw new Error(`sign-in of ${this.name} (${this.role || 'diner'}) failed: ${r.code}`)
  }

  /** The server refused our token: mark it expired so the next call refreshes it. */
  _expire() {
    if (this.session) this.session.expires_at = 0
    const t = tokens()[this.acct.email]
    if (t) t.expires_at = 0
  }

  async call(method, p, body, prefer) {
    let token
    try { token = await this.token() } catch (e) { return { ok: false, status: 0, data: null, code: 'sign_in_failed', msg: e.message } }
    const headers = { apikey: this.cfg.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    if (prefer) headers.Prefer = prefer
    const r = await request(method, `${this.cfg.url}/rest/v1/${p}`, { headers, body: body === undefined ? undefined : JSON.stringify(body) })
    if (r.status === 401 && !this._retried401) {   // token revoked or expired early: sign in once more
      this._retried401 = true; this._expire()
      const again = await this.call(method, p, body, prefer)
      this._retried401 = false
      return again
    }
    return r
  }
  get(p) { return this.call('GET', p) }
  rpc(name, args = {}) { return this.call('POST', `rpc/${name}`, args) }
  post(p, body, prefer = 'return=representation') { return this.call('POST', p, body, prefer) }
  patch(p, body) { return this.call('PATCH', p, body, 'return=representation') }
  del(p) { return this.call('DELETE', p, undefined, 'return=representation') }
  /** GET that resolves the rows ([] on any error, which is recorded). */
  async rows(p) {
    const r = await this.get(p)
    if (!r.ok) { fail(`read ${p.split('?')[0]}`, r); return [] }
    return Array.isArray(r.data) ? r.data : []
  }
  /** Upload bytes into a Storage bucket as this person. Resolves { ok, code }. */
  async upload(bucket, objectPath, bytes, contentType) {
    let token
    try { token = await this.token() } catch (e) { return { ok: false, status: 0, code: 'sign_in_failed', msg: e.message } }
    return request('POST', `${this.cfg.url}/storage/v1/object/${bucket}/${objectPath}`, {
      headers: { apikey: this.cfg.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': contentType, 'x-upsert': 'false' }, body: bytes,
    })
  }
}

/** Signs the actor in now (so its user id is known). False, with the failure recorded, when that is not possible. */
async function ready(actor) {
  try { await actor.token(); return true } catch (e) { fail('sign-in', e); return false }
}

/** The first row of a PostgREST / RPC answer (RPCs that return a record come back as an object or as a one-row array). */
const one = r => (r && r.data ? (Array.isArray(r.data) ? r.data[0] : r.data) : null)

// ---- the world: diners, staff, venues -----------------------------------------------------------------------------------
function loadAccounts(file) {
  const fixed = fs.existsSync(file) ? file : file.replace(/^\/([a-zA-Z])\//, '$1:/')   // /c/Users/... from Git Bash
  const list = JSON.parse(fs.readFileSync(fixed, 'utf8'))
  if (!Array.isArray(list)) throw new Error('DEMO_ACCOUNTS must be a JSON array')
  return list
}

/**
 * w = { cfg, dry, diners: { <first name>: Actor }, venues: { <key>: Venue } }.
 * Venue = roster entry + staff { manager, waiters[], kitchen[], cashiers[], hosts[], admins[] }.
 * With `accounts` null (dry run without a file) the staff comes from the roster's fallback list.
 */
function buildWorld({ cfg, accounts, dry }) {
  const w = { cfg, dry: !!dry, diners: {}, venues: {}, synthetic: !accounts }
  for (const key of Object.keys(VENUES)) {
    w.venues[key] = { ...VENUES[key], staff: { manager: null, waiters: [], kitchen: [], cashiers: [], hosts: [], admins: [] }, demoOn: null, _codes: null }
  }
  const list = accounts || [
    ...FALLBACK_STAFF.map(([first, role, restaurant]) => ({ kind: 'staff', name: first, role, restaurant })),
    ...Object.keys(DINERS).map(first => ({ kind: 'diner', name: first })),
  ]
  const slot = { manager: 'manager', waiter: 'waiters', kitchen: 'kitchen', cashier: 'cashiers', host: 'hosts', admin: 'admins' }
  for (const acct of list) {
    const actor = new Actor(cfg, acct)
    if (acct.kind === 'diner') { w.diners[actor.first] = actor; continue }
    const v = w.venues[acct.restaurant]
    if (!v || !slot[acct.role]) continue
    if (acct.role === 'manager') v.staff.manager = v.staff.manager || actor
    else v.staff[slot[acct.role]].push(actor)
  }
  return w
}

// Who does what at a venue. Every venue has a manager, who stands in for a missing role (a coffee shop without a kitchen
// account has its manager run the board).
const manager = v => v.staff.manager || v.staff.admins[0]
const kitchenActor = v => v.staff.kitchen[0] || manager(v)
const cashierActor = v => v.staff.cashiers[0] || v.staff.hosts[0] || manager(v)
const floorActor = v => v.staff.waiters[0] || v.staff.hosts[0] || manager(v)     // table states, serving
const bookingActor = v => v.staff.hosts[0] || manager(v)
const pickWaiter = (v, rng) => (v.staff.waiters.length ? rng.pick(v.staff.waiters) : null)

// ---- tables and menus -----------------------------------------------------------------------------------------------------
/** Active tables with their access code and CURRENT state: [{ id, number, capacity, min, state, code }]. */
async function loadTables(v) {
  const m = manager(v)
  const [tables, codes] = await Promise.all([
    m.rows(`tables?restaurant_id=eq.${v.id}&is_active=eq.true&select=id,table_number,capacity,min_capacity,state`),
    v._codes ? [] : m.rows(`table_access_codes?restaurant_id=eq.${v.id}&select=table_id,access_code`),
  ])
  if (!v._codes && codes.length) v._codes = new Map(codes.map(c => [c.table_id, c.access_code]))
  return tables
    .map(t => ({ id: t.id, number: String(t.table_number), capacity: Number(t.capacity) || 0, min: Number(t.min_capacity) || 1, state: t.state, code: v._codes && v._codes.get(t.id) }))
    .filter(t => t.code)
}
const tableState = async (v, id) => ((await manager(v).rows(`tables?id=eq.${id}&select=state`))[0] || {}).state

/** The venue's dishes (the whole menu, available or not): [{ id, name, price, category, photo, available, is_vegetarian, description }]. */
async function loadMenu(v) {
  return manager(v).rows(`dishes?restaurant_id=eq.${v.id}&select=id,name,price,category,photo,available,is_vegetarian,is_vegan,description&order=sort_order.asc,name.asc`)
}

// ---- dates (Asia/Baku calendar) -------------------------------------------------------------------------------------------------
const ymdBaku = (date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baku' }).format(date)
const addDays = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10) }
const weekdayOf = ymd => new Date(`${ymd}T12:00:00Z`).getUTCDay()   // 0 = Sunday
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback } }
const writeJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 1))
const round2 = n => Math.round(n * 100) / 100

module.exports = {
  ROOT, clock, measureClock, sleep, log, stats, count, fail, StepError, loadConfig, request, Actor, one, ready, loadAccounts, buildWorld,
  manager, kitchenActor, cashierActor, floorActor, bookingActor, pickWaiter, loadTables, tableState, loadMenu,
  ymdBaku, addDays, weekdayOf, WEEKDAYS, readJson, writeJson, round2,
}
