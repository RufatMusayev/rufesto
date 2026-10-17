// Timing walk: all numbers are milliseconds measured inside the page with performance.now() / rAF polling.
// node personas/ui/aysel-16-speed-run.js [--throttle]   (--throttle = CPU 4x + ~1.6 Mbit/s, 150 ms latency, a mid-range phone on 4G)
const L = require('./aysel-lib')
const fs = require('fs')
const THROTTLE = process.argv.includes('--throttle')
const N = 5
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null }
const rnd = x => (x == null ? null : Math.round(x))
const stat = a => ({ n: a.length, median: rnd(med(a)), min: rnd(Math.min(...a)), max: rnd(Math.max(...a)), all: a.map(rnd) })
const results = {}
const push = (k, v) => { if (v != null) (results[k] = results[k] || []).push(v) }

const INIT = () => {
  window.__m = { firstCard: null, firstImg: null, lcp: null, fcp: null }
  const tick = () => {
    const m = window.__m
    if (!m.firstCard) { const a = document.querySelector('.soc-feed-slot article, .soc-feed article'); if (a && a.getBoundingClientRect().height > 50) m.firstCard = performance.now() }
    if (!m.firstImg) { const i = document.querySelector('.soc-feed-slot article .soc-photo img'); if (i && i.complete && i.naturalWidth > 0) m.firstImg = performance.now() }
    if (!(m.firstCard && m.firstImg) && performance.now() < 60000) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__m.lcp = e.startTime }).observe({ type: 'largest-contentful-paint', buffered: true }) } catch (e) {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__m.fcp = e.startTime }).observe({ type: 'paint', buffered: true }) } catch (e) {}
}

/** Runs clickSrc in the page (starts the clock first), resolves ms until doneSrc() is truthy (null on timeout). */
const timeAction = (page, clickSrc, doneSrc, timeout) => page.evaluate(([c, d, to]) => new Promise(res => {
  const click = new Function('return (' + c + ')()'), done = new Function('return (' + d + ')()')
  const t0 = performance.now()
  click()
  const tick = () => { if (done()) return res(performance.now() - t0); if (performance.now() - t0 > to) return res(null); requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
}), [clickSrc, doneSrc, timeout || 15000])

async function newPhone(b, opts) {
  const A = await L.phone(b, 'Aysel Məmmədova', opts)
  await A.ctx.addInitScript(INIT)
  if (THROTTLE) {
    const cdp = await A.ctx.newCDPSession(A.page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })
  }
  return A
}
const homeMetrics = async page => {
  await page.waitForFunction(() => window.__m && window.__m.firstImg, null, { timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(600)
  return page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; const m = window.__m; return { ttfb: n.responseStart, dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd, firstCard: m.firstCard, firstImg: m.firstImg, lcp: m.lcp, fcp: m.fcp } })
}
const show = m => JSON.stringify(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, rnd(v)])))

;(async () => {
  const b = await L.launch()
  // Home cold: a fresh browser context (empty HTTP cache) each time
  for (let i = 0; i < N; i++) {
    const A = await newPhone(b)
    await A.page.goto(L.CONSUMER + '/')
    const m = await homeMetrics(A.page)
    for (const k of Object.keys(m)) push('home_cold_' + k, m[k])
    L.log('cold', i, show(m))
    await A.ctx.close()
  }
  // Home warm: same context, repeated navigation (HTTP cache warm)
  {
    const A = await newPhone(b)
    await A.page.goto(L.CONSUMER + '/'); await homeMetrics(A.page)
    for (let i = 0; i < N; i++) {
      await A.page.goto(L.CONSUMER + '/profile'); await A.page.waitForTimeout(700)
      await A.page.goto(L.CONSUMER + '/')
      const m = await homeMetrics(A.page)
      for (const k of Object.keys(m)) push('home_warm_' + k, m[k])
      L.log('warm', i, show(m))
    }
    await A.ctx.close()
  }
  // Tab switches, restaurant page, dish sheet (fresh load each round, then repeats)
  const tabClick = name => `() => [...document.querySelectorAll('[role=tab]')].find(t => t.innerText.trim() === '${name}').click()`
  const friendsDone = `() => { const f = [...document.querySelectorAll('.soc-feed')].find(e => e.offsetParent); return f && f.querySelector('article') && f.querySelector('article').getBoundingClientRect().height > 50 }`
  const discDone = `() => { const d = document.querySelector('.dsc'); return d && d.offsetParent && d.querySelector('.dsc-rc') && d.querySelector('.dsc-rc').getBoundingClientRect().height > 50 }`
  const homeDone = `() => { const f = [...document.querySelectorAll('.soc-feed')].find(e => e.offsetParent && !e.classList.contains('dsc')); return f && f.querySelector('.soc-feed-slot article') }`
  for (let i = 0; i < N; i++) {
    const A = await newPhone(b)
    await A.page.goto(L.CONSUMER + '/'); await homeMetrics(A.page)
    push('tab_home_to_friends_first', await timeAction(A.page, tabClick('Friends'), friendsDone))
    await A.page.waitForTimeout(800)
    push('tab_friends_to_discover_first', await timeAction(A.page, tabClick('Discover'), discDone))
    await A.page.waitForTimeout(800)
    push('tab_discover_to_home_first', await timeAction(A.page, tabClick('Home'), homeDone))
    await A.page.waitForTimeout(500)
    push('tab_home_to_friends_repeat', await timeAction(A.page, tabClick('Friends'), friendsDone))
    await A.page.waitForTimeout(500)
    push('tab_friends_to_discover_repeat', await timeAction(A.page, tabClick('Discover'), discDone))
    await A.page.waitForTimeout(800)
    // restaurant page from a Discover card (SPA navigation)
    push('restaurant_from_discover_menu_visible', await timeAction(A.page, `() => document.querySelector('.dsc-rc h3 a').click()`, `() => location.pathname.startsWith('/restaurant/') && document.querySelector('h1') && document.querySelector('.ig-grid-tile')`, 25000))
    await A.page.waitForTimeout(1200)
    // dish sheet: click the first available tile body (not the + button)
    push('dish_sheet_photo_visible', await timeAction(A.page, `() => { const t = [...document.querySelectorAll('.ig-grid-tile')].find(x => !/SOLD OUT/i.test(x.innerText)); t.scrollIntoView({block:'center'}); t.click() }`, `() => { const s = document.querySelector('.sheet'); const i = s && s.querySelector('img'); return s && i && i.complete && i.naturalWidth > 0 }`, 25000))
    await A.page.keyboard.press('Escape'); await A.page.waitForTimeout(500)
    push('dish_sheet_open_shell_2nd', await timeAction(A.page, `() => { const t = [...document.querySelectorAll('.ig-grid-tile')].filter(x => !/SOLD OUT/i.test(x.innerText))[1]; t.click() }`, `() => !!document.querySelector('.sheet')`, 25000))
    L.log('round', i, 'done')
    await A.ctx.close()
  }
  // restaurant page by direct URL (hard navigation), cold
  for (let i = 0; i < N; i++) {
    const A = await newPhone(b)
    await A.page.goto(L.CONSUMER + '/restaurant/bella-roma')
    const t = await A.page.evaluate(() => new Promise(res => { const tick = () => { if (document.querySelector('.ig-grid-tile') && document.querySelector('h1')) return res(performance.now()); if (performance.now() > 40000) return res(null); requestAnimationFrame(tick) }; tick() }))
    push('restaurant_direct_cold_menu_visible', t)
    await A.ctx.close()
  }
  const out = { throttle: THROTTLE, results: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, stat(v)])) }
  fs.writeFileSync(L.path.join(L.OUT, THROTTLE ? 'speed-throttled.json' : 'speed.json'), JSON.stringify(out, null, 1))
  for (const [k, v] of Object.entries(out.results)) L.log(k.padEnd(44), 'median', v.median, 'min', v.min, 'max', v.max, JSON.stringify(v.all))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
