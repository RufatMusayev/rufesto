'use strict'
// Cold-load timings (fresh browser context = empty HTTP cache), 3 runs each, medians printed. Leyla desktop + a signed-out visitor phone.
const C = require('./common')

const med = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]
const perf = page => page.evaluate(() => {
  const nav = performance.getEntriesByType('navigation')[0]
  const paint = Object.fromEntries(performance.getEntriesByType('paint').map(p => [p.name, Math.round(p.startTime)]))
  const res = performance.getEntriesByType('resource')
  const bytes = res.reduce((s, r) => s + (r.transferSize || 0), 0)
  const js = res.filter(r => /\.js(\?|$)/.test(r.name)).reduce((s, r) => s + (r.transferSize || 0), 0)
  return { dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), fcp: paint['first-contentful-paint'], kb: Math.round(bytes / 1024), jskb: Math.round(js / 1024), reqs: res.length }
})

async function run(label, n, mk) {
  const out = []
  for (let i = 0; i < n; i++) {
    const browser = await C.launch()
    try { out.push(await mk(browser)) } finally { await browser.close() }
  }
  const pick = k => med(out.map(o => o[k]).filter(v => v !== undefined))
  const line = `ready ${pick('ready')} ms (runs ${out.map(o => o.ready).join('/')}) | FCP ${pick('fcp')} | DCL ${pick('dcl')} | load ${pick('load')} | ${pick('kb')} KB (${pick('jskb')} KB js, ${pick('reqs')} req)`
  C.timing('COLD ' + label, pick('ready'), line)
  return out
}

;(async () => {
  const dash = (path, readyFn) => async browser => {
    const L = await C.open(browser, 'leyla', { who: 'Leyla' })
    const t0 = Date.now()
    await L.page.goto(C.RESTO + path, { waitUntil: 'domcontentloaded' })
    await readyFn(L.page)
    const ready = Date.now() - t0
    await L.page.waitForLoadState('load').catch(() => {})
    return { ready, ...(await perf(L.page)) }
  }
  if (process.env.ONLY !== 'consumer') {
  await run('dashboard Overview (/)', 3, dash('/', p => p.getByText('Recent orders', { exact: false }).first().waitFor({ timeout: 30_000 })))
  await run('dashboard Bills (/bills)', 3, dash('/bills', p => p.getByText(/Active bills/).first().waitFor({ timeout: 30_000 })))
  await run('dashboard Tips (/tips)', 3, dash('/tips', p => p.getByText(/Total tips/).first().waitFor({ timeout: 30_000 })))
  await run('dashboard Orders (/orders)', 3, dash('/orders', p => p.getByText(/orders today/).first().waitFor({ timeout: 30_000 })))
  await run('dashboard Menu (/menu)', 3, dash('/menu', p => p.locator('.avail-toggle').first().waitFor({ timeout: 30_000 })))
  await run('dashboard KDS (/kds)', 3, dash('/kds', p => p.getByText(/active/).first().waitFor({ timeout: 30_000 })))
  }
  const visitor = (path, readyFn) => async browser => {
    const V = await C.open(browser, 'anon', { geo: true })
    const t0 = Date.now()
    await V.page.goto(C.CONSUMER + path, { waitUntil: 'domcontentloaded' })
    await readyFn(V.page)
    const ready = Date.now() - t0
    await V.page.waitForLoadState('load').catch(() => {})
    return { ready, ...(await perf(V.page)) }
  }
  await run('consumer Home (first post card)', 3, visitor('/', p => p.locator('article').first().waitFor({ timeout: 30_000 })))
  await run('consumer restaurant page (header + Reserve button)', 3, visitor('/restaurant/bella-roma', p => p.getByRole('button', { name: /Reserve a table/ }).or(p.getByText('Reserve a table')).first().waitFor({ timeout: 30_000 })))
  await run('consumer Discover tab (via Home, tab click -> Trending dishes)', 3, async browser => {
    const V = await C.open(browser, 'anon', { geo: true })
    await V.page.goto(C.CONSUMER + '/', { waitUntil: 'domcontentloaded' })
    await V.page.locator('article').first().waitFor({ timeout: 30_000 })
    const t0 = Date.now()
    await V.page.getByRole('tab', { name: /Discover/i }).first().click()
    await V.page.getByText('Trending dishes').first().waitFor({ timeout: 30_000 })
    return { ready: Date.now() - t0, ...(await perf(V.page)) }
  })
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
