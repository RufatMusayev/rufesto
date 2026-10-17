// Shared helpers of the "newcomer" persona walk-throughs (e2e/personas/ui/newcomer-*.js).
// Phone profile = Playwright "Pixel 7" (Chromium). Sessions are exchanged over the Supabase auth API (support/guest.js) so
// no password is ever typed into a form; passwords are read from the demo-accounts JSON at run time and never printed.
// Run: node personas/ui/newcomer-anon.js (from e2e/). Screenshots land in e2e/tour-out/personas/newcomer/.
const fs = require('fs')
const path = require('path')
const { chromium, devices } = require('@playwright/test')
const { signInGuest } = require('../../support/guest')

const BASE = (process.env.CONSUMER_URL || 'https://rufat-server.com').replace(/\/+$/, '')
const ROUND = process.env.ROUND || ''   // ROUND=round2 -> screenshots in tour-out/personas/newcomer/round2, numbers in results/round2
const OUT = path.join(__dirname, '..', '..', 'tour-out', 'personas', 'newcomer', ROUND)
const RES = path.join(__dirname, 'results', ROUND)
const ACCOUNTS = process.env.DEMO_ACCOUNTS ||
  'C:/Users/musay/AppData/Local/Temp/claude/C--Users-musay-Desktop-claude/9308ea1d-0f9a-4965-b895-2223492297b4/scratchpad/demo-accounts.json'
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(RES, { recursive: true })

// never dump request headers (they hold keys) when a call times out: one short line instead of the stack
process.on('unhandledRejection', e => { console.error('ERR', String((e && e.message) || e).split(/\r?\n/)[0].slice(0, 200)); process.exit(1) })
const sessCache = {}
const GEO = {
  sabuncu: { latitude: 40.442, longitude: 49.948 },
  fountains: { latitude: 40.371, longitude: 49.838 },
}

function account(name) {
  const list = JSON.parse(fs.readFileSync(ACCOUNTS, 'utf8'))
  const a = list.find(x => x.name === name)
  if (!a) throw new Error('no demo account named ' + name)
  return { email: a.email, password: a.password, id: a.id, name: a.name }
}

/** Opens a Pixel 7 context. opts: { lang, theme, geo, perms, as } */
async function open(opts = {}) {
  const browser = await chromium.launch({ headless: true })
  const device = devices['Pixel 7']
  const ctx = await browser.newContext({
    ...device,
    locale: opts.locale || 'en-US',
    timezoneId: 'Asia/Baku',
    geolocation: opts.geo || undefined,
    permissions: [...(opts.geo ? ['geolocation'] : []), ...(opts.perms || [])],
    serviceWorkers: opts.sw ? 'allow' : 'block',
  })
  const init = []
  if (opts.lang) init.push(['rufesto_lang', opts.lang])
  if (opts.theme) init.push(['rufesto_theme', opts.theme])
  if (init.length) await ctx.addInitScript(items => { try { for (const [k, v] of items) localStorage.setItem(k, v) } catch {} }, init)
  const page = await ctx.newPage()
  const watch = watchPage(page)
  if (opts.as) {
    // one token exchange per person and process (the auth API rate-limits password sign-ins per IP); later contexts reuse it
    let c = sessCache[opts.as]
    if (!c) {
      const a = account(opts.as)
      let who = null, err = null
      for (let i = 0; i < 4 && !who; i++) { try { who = await signInGuest(page, { email: a.email, password: a.password }) } catch (e) { err = e; await new Promise(r => setTimeout(r, 4000)) } }   // the auth API sometimes stalls
      if (!who) throw err
      c = sessCache[opts.as] = { key: `sb-${new URL(who.supabase.url).hostname.split('.')[0]}-auth-token`, value: JSON.stringify(who.session) }
    } else {
      await ctx.addInitScript(([k, v]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, v) } catch { } }, [c.key, c.value])
    }
    watch.reset()
  }
  return { browser, ctx, page, watch, close: () => browser.close() }
}

/** console errors / warnings, page errors, failed + slow requests. */
function watchPage(page) {
  const w = { console: [], pageErrors: [], bad: [], reqs: [] }
  page.on('console', m => { if (['error', 'warning'].includes(m.type())) w.console.push(`${m.type()}: ${m.text().slice(0, 300)}`) })
  page.on('pageerror', e => w.pageErrors.push(String(e).slice(0, 300)))
  page.on('response', r => {
    const req = r.request()
    const t = req.timing()
    w.reqs.push({ url: r.url().replace(/^https?:\/\/[^/]+/, '').slice(0, 140), host: new URL(r.url()).host, status: r.status(), method: req.method(), ms: t && t.responseEnd > 0 ? Math.round(t.responseEnd) : null })
    if (r.status() >= 400) w.bad.push(`${r.status()} ${req.method()} ${r.url().replace(/\?.*$/, '').slice(0, 160)}`)
  })
  page.on('requestfailed', r => w.bad.push(`FAILED ${r.method()} ${r.url().replace(/\?.*$/, '').slice(0, 160)} ${r.failure()?.errorText || ''}`))
  w.reset = () => { w.console.length = 0; w.pageErrors.length = 0; w.bad.length = 0; w.reqs.length = 0 }
  return w
}

let n = 0
async function shot(page, name, { full = false } = {}) {
  const file = path.join(OUT, `${name}.png`)
  await page.screenshot({ path: file, fullPage: full })
  return file
}

const save = (name, data) => fs.writeFileSync(path.join(RES, name + '.json'), JSON.stringify(data, null, 2))
const sleep = ms => new Promise(r => setTimeout(r, ms))

/** Visible text of the tab panel / page, trimmed. */
async function text(page, sel = 'body') {
  return (await page.locator(sel).first().innerText()).replace(/\n{3,}/g, '\n\n')
}

module.exports = { BASE, OUT, RES, GEO, account, open, watchPage, shot, save, sleep, text }
