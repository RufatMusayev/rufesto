// Speed of the first-time experience, real numbers (Performance API in the page). Pixel 7 profile, Chromium, live preview.
// node personas/ui/newcomer-speed.js [native|mid] [anon|ferid] [runs]   -> results/speed-<profile>-<who>.json
//   native = no throttling (this PC, home broadband);  mid = CPU x4 + "Slow 4G" (1.6 Mbit/s, 150 ms RTT) via CDP.
const L = require('./lib')
const profile = process.argv[2] || 'native'
const who = process.argv[3] || 'anon'
const RUNS = Number(process.argv[4] || 5)
const med = a => { const s = [...a].filter(x => x != null && !Number.isNaN(x)).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : null }
const p90 = a => { const s = [...a].filter(x => x != null && !Number.isNaN(x)).sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.ceil(s.length * 0.9) - 1)] : null }
const round = x => (x == null ? null : Math.round(x))

const INIT = () => {
  const m = window.__m = { lt: [], lcp: 0, cls: 0, firstSlot: null, firstImg: null, firstDsc: null }
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) m.lt.push([Math.round(e.startTime), Math.round(e.duration)]) }).observe({ type: 'longtask', buffered: true }) } catch { }
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) m.lcp = e.startTime }).observe({ type: 'largest-contentful-paint', buffered: true }) } catch { }
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) m.cls += e.value }).observe({ type: 'layout-shift', buffered: true }) } catch { }
  const tick = () => {
    if (m.firstSlot == null) { const s = document.querySelector('.soc-feed-slot'); if (s) m.firstSlot = performance.now() }
    if (m.firstSlot != null && m.firstImg == null) {
      const s = document.querySelector('.soc-feed-slot'); const img = s && s.querySelector('img')
      if (!img || (img.complete && img.naturalWidth > 0)) m.firstImg = performance.now()
    }
    if (m.firstImg == null || m.firstSlot == null) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

/** runs in the page: resolves ms from now until cond() is true (checked every frame), or -1 after 15 s */
const PAGE_HELPERS = `
window.__waitFor = (cond, limit = 15000) => new Promise(res => { const t0 = performance.now(); const f = () => { let ok = false; try { ok = cond() } catch {} ; if (ok) res(performance.now() - t0); else if (performance.now() - t0 > limit) res(-1); else requestAnimationFrame(f) }; f() })
window.__frame2 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
`

async function once(i) {
  const s = await L.open(who === 'ferid' ? { as: 'Fərid Məlikov' } : {})
  const { page, ctx, browser } = s
  const cdp = await ctx.newCDPSession(page)
  if (profile === 'mid') {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })
  }
  await page.addInitScript(INIT)
  await page.addInitScript(PAGE_HELPERS)
  const r = {}
  // ---- cold load of Home (fresh browser = empty HTTP cache)
  await page.goto(L.BASE + '/', { waitUntil: 'load', timeout: 90000 })
  await page.evaluate(() => { if (document.querySelector('[role=tab][aria-selected=true]')?.innerText !== document.querySelectorAll('[role=tab]')[0].innerText) document.querySelectorAll('[role=tab]')[0].click() })
  await page.waitForFunction(() => window.__m.firstImg != null, null, { timeout: 60000 }).catch(() => { })
  await page.waitForTimeout(800)
  Object.assign(r, await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0]
    const fcp = performance.getEntriesByName('first-contentful-paint')[0]
    const res = performance.getEntriesByType('resource')
    const feed = res.find(x => /rpc\/home_feed/.test(x.name))
    const bytes = res.reduce((a, x) => a + (x.transferSize || 0), 0)
    const first = [...document.querySelectorAll('.soc-feed-slot img')].slice(0, 3).map(i => i.currentSrc.replace(/\?.*$/, '').slice(-26))
    return {
      ttfb: nav.responseStart, dcl: nav.domContentLoadedEventEnd, load: nav.loadEventEnd, fcp: fcp ? fcp.startTime : null, lcp: window.__m.lcp, cls: +window.__m.cls.toFixed(3),
      firstCard: window.__m.firstSlot, firstCardPhoto: window.__m.firstImg, homeFeedEnd: feed ? feed.responseEnd : null, homeFeedDur: feed ? feed.duration : null,
      requests: res.length, kb: Math.round(bytes / 1024), jsKb: Math.round(res.filter(x => /\.js(\?|$)/.test(x.name)).reduce((a, x) => a + (x.transferSize || 0), 0) / 1024),
      imgKb: Math.round(res.filter(x => x.initiatorType === 'img' || /\.(jpg|png|webp)/.test(x.name)).reduce((a, x) => a + (x.transferSize || 0), 0) / 1024),
      longTasksLoad: window.__m.lt.length, longTaskMsLoad: window.__m.lt.reduce((a, x) => a + x[1], 0), tbtLike: window.__m.lt.reduce((a, x) => a + Math.max(0, x[1] - 50), 0),
    }
  }))
  // ---- scrolling Home: 5 s of ~1000 px/s programmatic scroll, frame deltas + long tasks
  r.scroll = await page.evaluate(async () => {
    const lt0 = window.__m.lt.length
    const deltas = []; let last = performance.now(); const t0 = last; let y = 0
    await new Promise(res => { const f = t => { deltas.push(t - last); last = t; y += 16; window.scrollTo(0, y); if (t - t0 < 5000) requestAnimationFrame(f); else res() }; requestAnimationFrame(f) })
    const d = deltas.slice(1).sort((a, b) => a - b)
    return { frames: d.length, avgFps: +(1000 / (d.reduce((a, b) => a + b, 0) / d.length)).toFixed(1), p95FrameMs: +d[Math.floor(d.length * 0.95)].toFixed(1), maxFrameMs: +d[d.length - 1].toFixed(1), over50: d.filter(x => x > 50).length, longTasks: window.__m.lt.length - lt0, longTaskMs: window.__m.lt.slice(lt0).reduce((a, x) => a + x[1], 0), scrolledPx: Math.round(y) }
  })
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(500)
  // ---- tab switches (click -> two frames = rendered; and -> content ready)
  const tabs = await page.evaluate(async () => {
    const t = [...document.querySelectorAll('[role=tab]')]
    const out = {}
    const go = async (i, ready) => { const s = performance.now(); t[i].click(); await window.__frame2(); const painted = performance.now() - s; const rdy = await window.__waitFor(ready); return [painted, rdy < 0 ? null : painted + rdy] }
    out.toDiscoverFirst = await go(2, () => document.querySelector('.dsc h2'))
    out.toFriends = await go(1, () => document.querySelector('.soc-feed:not([hidden] .soc-feed) .soc-feed-slot, .soc-feed-banner, .empty-state, [class*=empty]') || document.body.innerText.includes('Friends'))
    out.toHome = await go(0, () => document.querySelector('.soc-feed-slot'))
    out.toDiscoverAgain = await go(2, () => document.querySelector('.dsc h2'))
    return out
  })
  r.tabs = tabs
  // ---- Discover first section / images
  r.discover = await page.evaluate(async () => {
    const h = [...document.querySelectorAll('.dsc h2')].map(x => x.innerText)
    const imgs = [...document.querySelectorAll('.dsc img')]
    return { sections: h.length, imgs: imgs.length, imgsLoaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length }
  })
  // ---- restaurant page open from a Home card chip
  await page.evaluate(() => { document.querySelectorAll('[role=tab]')[0].click() }); await page.waitForTimeout(600)
  r.restaurant = await page.evaluate(async () => {
    const a = document.querySelector('.soc-feed-slot a[href^="/restaurant/"]')
    const s = performance.now(); a.click()
    const h1 = await window.__waitFor(() => document.querySelector('h1'))
    const tile = await window.__waitFor(() => { const i = document.querySelector('.ig-grid-tile img'); return i && i.complete && i.naturalWidth > 0 })
    return { toTitle: h1 < 0 ? null : (performance.now() - s) - (tile < 0 ? 0 : tile) + h1 - h1, toTitleMs: h1 < 0 ? null : h1, toFirstDishPhoto: tile < 0 ? null : performance.now() - s, path: location.pathname }
  })
  await browser.close()
  return r
}

;(async () => {
  const runs = []
  for (let i = 0; i < RUNS; i++) { try { runs.push(await once(i)); process.stdout.write('.') } catch (e) { console.log('\nrun failed', String(e).slice(0, 200)) } }
  console.log()
  const pick = f => runs.map(f)
  const table = {
    runs: runs.length,
    ttfb: [med(pick(r => r.ttfb)), p90(pick(r => r.ttfb))], fcp: [med(pick(r => r.fcp)), p90(pick(r => r.fcp))], lcp: [med(pick(r => r.lcp)), p90(pick(r => r.lcp))],
    homeFeedEnd: [med(pick(r => r.homeFeedEnd)), p90(pick(r => r.homeFeedEnd))], firstCard: [med(pick(r => r.firstCard)), p90(pick(r => r.firstCard))],
    firstCardPhoto: [med(pick(r => r.firstCardPhoto)), p90(pick(r => r.firstCardPhoto))], load: [med(pick(r => r.load)), p90(pick(r => r.load))],
    cls: med(pick(r => r.cls)), kb: med(pick(r => r.kb)), jsKb: med(pick(r => r.jsKb)), imgKb: med(pick(r => r.imgKb)), requests: med(pick(r => r.requests)),
    longTasksLoad: med(pick(r => r.longTasksLoad)), tbtLike: med(pick(r => r.tbtLike)),
    scroll_avgFps: med(pick(r => r.scroll.avgFps)), scroll_p95FrameMs: med(pick(r => r.scroll.p95FrameMs)), scroll_maxFrameMs: med(pick(r => r.scroll.maxFrameMs)), scroll_over50: med(pick(r => r.scroll.over50)), scroll_longTasks: med(pick(r => r.scroll.longTasks)), scroll_longTaskMs: med(pick(r => r.scroll.longTaskMs)),
    tab_discover_first_painted: med(pick(r => r.tabs.toDiscoverFirst[0])), tab_discover_first_ready: med(pick(r => r.tabs.toDiscoverFirst[1])),
    tab_friends_painted: med(pick(r => r.tabs.toFriends[0])), tab_friends_ready: med(pick(r => r.tabs.toFriends[1])),
    tab_home_painted: med(pick(r => r.tabs.toHome[0])), tab_home_ready: med(pick(r => r.tabs.toHome[1])),
    tab_discover_again_painted: med(pick(r => r.tabs.toDiscoverAgain[0])), tab_discover_again_ready: med(pick(r => r.tabs.toDiscoverAgain[1])),
    resto_title: med(pick(r => r.restaurant.toTitleMs)), resto_first_dish_photo: med(pick(r => r.restaurant.toFirstDishPhoto)),
    discover_sections: runs[0] && runs[0].discover.sections,
  }
  console.log(JSON.stringify(table, (k, v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v)))
  L.save(`speed-${profile}-${who}`, { table, runs })
})()
