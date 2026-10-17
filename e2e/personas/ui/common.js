'use strict'
// Shared helpers of the Leyla persona run (manager of Trattoria Bella Roma + her team + a diner).
// Sessions come from the Supabase auth API (password grant, never a password field); passwords and tokens are never printed or logged.
// Session cache + notes live outside the repo (scratchpad). Preview only.
const fs = require('fs')
const path = require('path')
const { chromium, devices } = require('@playwright/test')

const ROOT = path.join(__dirname, '..', '..', '..')
const SCRATCH = process.env.LEYLA_SCRATCH || 'C:/Users/musay/AppData/Local/Temp/claude/C--Users-musay-Desktop-claude/9308ea1d-0f9a-4965-b895-2223492297b4/scratchpad'
const ACCOUNTS = process.env.DEMO_ACCOUNTS || path.join(SCRATCH, 'demo-accounts.json')
const SESSIONS = path.join(SCRATCH, 'leyla-sessions.json')   // access/refresh tokens, outside the repo
const TAG = process.env.LEYLA_TAG ? '-' + process.env.LEYLA_TAG : ''
const NOTES = path.join(SCRATCH, `leyla-notes${TAG}.jsonl`)
const TIMINGS = path.join(SCRATCH, `leyla-timings${TAG}.jsonl`)
const OUT = path.join(ROOT, 'e2e', 'tour-out', 'personas', 'leyla', process.env.OUT_SUB || '')
fs.mkdirSync(OUT, { recursive: true })

const CONSUMER = 'https://rufat-server.com'
const RESTO = 'https://resto.rufat-server.com'
const SB_URL = 'https://qqwvtuckljwvwrvyrjbn.supabase.co'
const BELLA = '10000000-0000-0000-0000-000000000001'
const BAKU_GEO = { latitude: 40.3784, longitude: 49.8460 }
const sleep = ms => new Promise(r => setTimeout(r, ms))

let anon = null
async function anonKey() {
  if (anon) return anon
  const html = await (await fetch(CONSUMER + '/')).text()
  for (const m of html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)) {
    const js = await (await fetch(CONSUMER + m[1])).text()
    const k = js.match(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/)
    if (k) { anon = k[0]; return anon }
  }
  throw new Error('anon key not found in the consumer bundle')
}

function account(name) {
  const list = JSON.parse(fs.readFileSync(ACCOUNTS, 'utf8'))
  const a = list.find(x => x.name === name || x.name.startsWith(name))
  if (!a) throw new Error('no account ' + name)
  return a
}

function readSessions() { try { return JSON.parse(fs.readFileSync(SESSIONS, 'utf8')) } catch { return {} } }

/** { session, anonKey } for a demo account; reuses a cached session until 10 minutes before expiry. */
async function login(name) {
  const key = await anonKey()
  const a = account(name)
  const cache = readSessions()
  let s = cache[a.email]
  if (!s || s.expires_at * 1000 - Date.now() < 600_000) {
    for (let i = 0; i < 6; i++) {
      const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: a.email, password: a.password }),
      })
      if (res.ok) { s = await res.json(); break }
      if (res.status === 429) { await sleep(20_000 * (i + 1)); continue }
      throw new Error(`sign-in failed for ${name}: HTTP ${res.status}`)
    }
    if (!s) throw new Error('sign-in rate limited for ' + name)
    cache[a.email] = s
    fs.writeFileSync(SESSIONS, JSON.stringify(cache))
  }
  return { session: s, anonKey: key, account: { id: a.id, name: a.name, role: a.role } }
}

const storageKey = `sb-${new URL(SB_URL).hostname.split('.')[0]}-auth-token`

const NOISE = /static\.cloudflareinsights\.com/i
/** Console errors + failed calls of a page, tagged with the current stage. */
function watch(page, label, sink) {
  const push = (kind, text) => sink.push({ t: Date.now(), who: label, stage: sink.stage || '', kind, text: String(text).slice(0, 400) })
  page.on('console', m => {
    if (m.type() !== 'error') return
    const u = m.location()?.url || ''
    if (NOISE.test(m.text()) || NOISE.test(u)) return
    push('console', `${m.text()} [${u}]`)
  })
  page.on('pageerror', e => push('pageerror', e.message))
  page.on('response', r => {
    if (r.status() >= 400 && !NOISE.test(r.url())) push('http', `${r.status()} ${r.request().method()} ${r.url().replace(SB_URL, '')}`)
  })
  page.on('requestfailed', r => { if (!NOISE.test(r.url()) && !/realtime|websocket/i.test(r.url())) push('reqfail', `${r.failure()?.errorText} ${r.method()} ${r.url().replace(SB_URL, '').slice(0, 160)}`) })
}

/**
 * Open a browser context for a persona. kind: 'leyla' (1280x800), 'orxan' (Pixel 7), 'rauf' (Pixel 7), 'tural' (tablet 1024x768),
 * 'anon' (Pixel 7, signed out), 'leyla-phone' (390x844). geo: spoof the Baku geolocation.
 */
async function open(browser, kind, { who = null, geo = false, camera = false, lang = 'en', sink = [], viewport } = {}) {
  const base = { locale: 'en-US', timezoneId: 'Asia/Baku', storageState: { cookies: [], origins: [CONSUMER, RESTO].map(u => ({ origin: new URL(u).origin, localStorage: [{ name: 'rufesto_lang', value: lang }] })) } }
  let opts
  if (['orxan', 'rauf', 'anon'].includes(kind)) opts = { ...devices['Pixel 7'], ...base }
  else if (kind === 'leyla-phone') opts = { ...devices['Pixel 7'], ...base, viewport: { width: 390, height: 844 } }
  else if (kind === 'tural') opts = { ...devices['Desktop Chrome'], ...base, viewport: { width: 1024, height: 768 } }
  else opts = { ...devices['Desktop Chrome'], ...base, viewport: { width: 1280, height: 800 } }
  if (viewport) opts.viewport = viewport
  if (geo) opts.geolocation = BAKU_GEO
  opts.permissions = [...(geo ? ['geolocation'] : []), ...(camera ? ['camera'] : [])]
  const context = await browser.newContext(opts)
  const page = await context.newPage()
  let auth = null
  if (who) {
    auth = await login(who)
    await context.addInitScript(([k, v]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, v) } catch {} }, [storageKey, JSON.stringify(auth.session)])
  }
  watch(page, kind, sink)
  const api = auth ? makeApi(auth) : null
  return { context, page, auth, api, kind, close: () => context.close().catch(() => {}) }
}

function makeApi(auth) {
  const h = () => ({ apikey: auth.anonKey, Authorization: `Bearer ${auth.session.access_token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' })
  const call = async (method, p, body) => {
    const res = await fetch(`${SB_URL}/rest/v1/${p}`, { method, headers: h(), body: body === undefined ? undefined : JSON.stringify(body) })
    const text = await res.text(); let data = text
    try { data = text ? JSON.parse(text) : null } catch {}
    return { ok: res.ok, status: res.status, data }
  }
  return { userId: auth.session.user.id, get: p => call('GET', p), rows: async p => { const r = await call('GET', p); return Array.isArray(r.data) ? r.data : [] }, post: (p, b) => call('POST', p, b), patch: (p, b) => call('PATCH', p, b), rpc: (n, a = {}) => call('POST', `rpc/${n}`, a) }
}

/** Screenshot into the persona folder; fullPage grows the viewport so fixed bars sit where they should. */
async function shot(page, name, { full = true } = {}) {
  await page.waitForLoadState('networkidle', { timeout: 4_000 }).catch(() => {})
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {})
  const file = path.join(OUT, name.endsWith('.png') ? name : name + '.png')
  const vp = page.viewportSize()
  let grown = false
  if (full) {
    const h = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight)).catch(() => 0)
    const main = await page.evaluate(() => { const m = document.querySelector('.dash-content'); return m ? Math.ceil(m.scrollHeight) : 0 }).catch(() => 0)
    const target = Math.max(h, main)
    if (target > vp.height) { await page.setViewportSize({ width: vp.width, height: Math.min(target + 20, 5000) }); grown = true; await sleep(500) }
  }
  await page.screenshot({ path: file, animations: 'disabled' })
  if (grown) await page.setViewportSize(vp)
  return path.relative(ROOT, file).replace(/\\/g, '/')
}

function note(sev, area, text, extra = {}) {
  fs.appendFileSync(NOTES, JSON.stringify({ at: new Date().toISOString(), sev, area, text, ...extra }) + '\n')
  console.log(`  NOTE [${sev}] ${area}: ${text}`)
}
function timing(label, ms, extra = '') {
  fs.appendFileSync(TIMINGS, JSON.stringify({ at: new Date().toISOString(), label, ms: Math.round(ms), extra }) + '\n')
  console.log(`  TIME ${label}: ${Math.round(ms)} ms ${extra}`)
}
async function timed(label, fn) { const t0 = Date.now(); const r = await fn(); timing(label, Date.now() - t0); return r }

const launch = () => chromium.launch({ headless: true })

/** Visible text of an element of the page (whitespace collapsed). */
const text = (page, sel = 'body') => page.locator(sel).first().innerText().then(t => t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n')).catch(() => '')

module.exports = { ROOT, SCRATCH, OUT, CONSUMER, RESTO, SB_URL, BELLA, BAKU_GEO, sleep, login, account, open, makeApi, shot, note, timing, timed, launch, text, storageKey }
