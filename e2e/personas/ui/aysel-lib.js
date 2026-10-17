// Shared helpers for the Aysel persona walk (UI only; sessions are obtained over the auth API, never typed into a form).
// Passwords are read at run time from the demo-accounts JSON and never printed. Session tokens are cached in the OS temp dir.
const fs = require('fs')
const os = require('os')
const path = require('path')
const { chromium, devices } = require('@playwright/test')

const ACCOUNTS = process.env.DEMO_ACCOUNTS || 'C:/Users/musay/AppData/Local/Temp/claude/C--Users-musay-Desktop-claude/9308ea1d-0f9a-4965-b895-2223492297b4/scratchpad/demo-accounts.json'
const CONSUMER = 'https://rufat-server.com'
const RESTO = 'https://resto.rufat-server.com'
const OUT = path.join(__dirname, '..', '..', 'tour-out', 'personas', 'aysel')
const FINCAN = '10000000-0000-0000-0000-000000000004'
const SESS_FILE = path.join(os.tmpdir(), 'aysel-persona-sessions.json')
fs.mkdirSync(OUT, { recursive: true })

const accounts = () => JSON.parse(fs.readFileSync(ACCOUNTS, 'utf8'))
const find = (name) => { const a = accounts().find(x => x.name === name); if (!a) throw new Error('no account ' + name); return a }

let sb = null
async function supabase() {
  if (sb) return sb
  const html = await (await fetch(CONSUMER + '/')).text()
  for (const src of [...html.matchAll(/src="([^"]+\.js)"/g)].map(m => m[1])) {
    const text = await (await fetch(new URL(src, CONSUMER + '/'))).text()
    const url = text.match(/https:\/\/[a-z0-9]+\.supabase\.co/)
    const key = text.match(/eyJ[\w-]{20,}\.[\w-]{20,}\.[\w-]{20,}/)
    if (url && key) return (sb = { url: url[0], anonKey: key[0] })
  }
  throw new Error('no supabase config in bundle')
}
const readSess = () => { try { return JSON.parse(fs.readFileSync(SESS_FILE, 'utf8')) } catch { return {} } }
async function session(name) {
  const acct = find(name)
  const s = readSess()[acct.email]
  if (s && s.expires_at - Date.now() / 1000 > 900) return s
  const c = await supabase()
  for (let i = 1; ; i++) {
    const res = await fetch(`${c.url}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: c.anonKey, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: acct.email, password: acct.password }) })
    if (res.status === 429 && i < 6) { await new Promise(r => setTimeout(r, 15000 * i)); continue }
    if (!res.ok) throw new Error(`sign-in ${name}: HTTP ${res.status}`)
    const sess = await res.json()
    fs.writeFileSync(SESS_FILE, JSON.stringify({ ...readSess(), [acct.email]: sess }))
    return sess
  }
}
const storageKey = c => `sb-${new URL(c.url).hostname.split('.')[0]}-auth-token`

/** REST/RPC as a named account (API only for things a real person would physically have). */
async function api(name) {
  const c = await supabase(); const s = await session(name)
  const h = { apikey: c.anonKey, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' }
  const j = async r => { const t = await r.text(); try { return JSON.parse(t) } catch { return t } }
  return {
    uid: s.user.id,
    get: async p => j(await fetch(`${c.url}/rest/v1/${p}`, { headers: h })),
    rpc: async (n, a = {}) => j(await fetch(`${c.url}/rest/v1/rpc/${n}`, { method: 'POST', headers: h, body: JSON.stringify(a) })),
  }
}

const launch = () => chromium.launch({ headless: true })

/** A Pixel 7 context signed in as `name`. opts: lang ('en'|'az'), geo, storage (extra localStorage seeds). */
async function phone(browser, name, opts = {}) {
  const c = await supabase(); const s = name ? await session(name) : null
  const ctx = await browser.newContext({
    ...devices['Pixel 7'], locale: opts.lang === 'az' ? 'az-AZ' : 'en-US',
    ...(opts.geo ? { geolocation: opts.geo, permissions: ['geolocation'] } : {}),
    ...(opts.colorScheme ? { colorScheme: opts.colorScheme } : {}),
  })
  await ctx.addInitScript(([key, val, lang, extra]) => {
    try { if (val && !localStorage.getItem(key)) localStorage.setItem(key, val) } catch {}
    try { if (!localStorage.getItem('rufesto_lang')) localStorage.setItem('rufesto_lang', lang) } catch {}
    try { for (const [k, v] of Object.entries(extra || {})) if (!localStorage.getItem(k)) localStorage.setItem(k, v) } catch {}
  }, [storageKey(c), s ? JSON.stringify(s) : '', opts.lang || 'en', opts.storage || {}])
  const page = await ctx.newPage()
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
  page.on('pageerror', e => errors.push('pageerror: ' + String(e.message).slice(0, 300)))
  page.on('requestfailed', r => { if (!/analytics|favicon|notifications\?select=id/.test(r.url())) errors.push('reqfailed: ' + r.method() + ' ' + r.url().slice(0, 140) + ' ' + (r.failure() || {}).errorText) })
  return { ctx, page, errors }
}
/** Desktop window for a staff member (dashboard). */
async function desk(browser, name) {
  const c = await supabase(); const s = await session(name)
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 800 }, locale: 'en-US' })
  await ctx.addInitScript(([key, val]) => {
    try { if (!localStorage.getItem(key)) localStorage.setItem(key, val) } catch {}
    try { if (!localStorage.getItem('rufesto_lang')) localStorage.setItem('rufesto_lang', 'en') } catch {}
  }, [storageKey(c), JSON.stringify(s)])
  const page = await ctx.newPage()
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
  page.on('pageerror', e => errors.push('pageerror: ' + String(e.message).slice(0, 300)))
  return { ctx, page, errors }
}

const shot = async (page, name, opts = {}) => { const f = path.join(OUT, name + '.png'); await page.screenshot({ path: f, ...opts }); return f }
const sleep = ms => new Promise(r => setTimeout(r, ms))
const log = (...a) => console.log(...a)

module.exports = { launch, phone, desk, api, session, shot, sleep, log, find, supabase, CONSUMER, RESTO, OUT, FINCAN, devices, fs, path }
