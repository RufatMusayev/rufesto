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
      // the first card's PHOTO (a post photo or promo picture, not the 34 px avatar / logo); a text card has none
      const s = document.querySelector('.soc-feed-slot')
      const img = s && s.querySelector('.soc-photo img, .menu-card img, img[src*="post-photos"], img[src*="_w640"]')
      const textCard = s && s.querySelector('.soc-textcard')
      if (textCard || (img && img.complete && img.naturalWidth > 0)) m.firstImg = performance.now()
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
    out.toFriends = await go(1, () => document.querySelector('#home-panel-friends .soc-feed-slot, #home-panel-friends .soc-feed-banner, #home-panel-friends [class*=empty]'))
    out.toHome = await go(0, () => document.querySelector('#home-panel-home .soc-feed-slot'))
    out.toFriendsAgain = await go(1, () => document.querySelector('#home-panel-friends .soc-feed-slot, #home-panel-friends .soc-feed-banner'))
    await go(0, () => document.querySelector('#home-panel-home .soc-feed-slot'))
    return out
  })
  r.tabs = tabs
  // ---- Search tab (the old Discover content): route open, first rows, images in view
  r.search = await page.evaluate(async () => {
    const link = document.querySelector('.bottom-nav a[aria-label="Explore"]')
    const s = performance.now(); link.click()
    const trending = await window.__waitFor(() => [...document.querySelectorAll('h2')].some(h => h.innerText === 'Trending dishes'), 15000)
    const rows = await window.__waitFor(() => [...document.querySelectorAll('button')].filter(b => b.innerText.includes('₼')).length > 0, 15000)
    const imgs = await window.__waitFor(() => { const i = [...document.images].filter(x => x.getBoundingClientRect().top < innerHeight && x.getBoundingClientRect().width > 40); return i.length > 0 && i.every(x => x.complete) }, 15000)
    return { toTrending: trending < 0 ? null : trending, toRows: rows < 0 ? null : rows, toImagesLoaded: imgs < 0 ? null : performance.now() - s }
  })
  // ---- dish sheet: open (first tap), hero photo, reviews; then Back
  r.sheet = await page.evaluate(async () => {
    const row = [...document.querySelectorAll('button')].find(b => b.innerText.includes('₼'))
    const s = performance.now(); row.click()
    const open = await window.__waitFor(() => document.querySelector('[role=dialog][aria-modal=true]'), 8000)
    const img = await window.__waitFor(() => { const i = document.querySelector('[role=dialog] img'); return i && i.complete && i.naturalWidth > 0 }, 8000)
    const reviews = await window.__waitFor(() => document.querySelector('[role=dialog]') && /Reviews/.test(document.querySelector('[role=dialog]').innerText) && document.querySelectorAll('[role=dialog] .rv').length > 0, 8000)
    return { toOpen: open < 0 ? null : open, toPhoto: img < 0 ? null : performance.now() - s, toReviews: reviews < 0 ? null : performance.now() - s }
  })
  const tb = Date.now(); await page.goBack(); await page.locator('[role=dialog][aria-modal=true]').waitFor({ state: 'detached', timeout: 5000 }).catch(() => { }); r.sheet.backCloseMs = Date.now() - tb
  await page.evaluate(() => document.querySelector('.bottom-nav a[aria-label="Home"]').click()); await page.waitForTimeout(1500)
  // ---- restaurant page open from a Home card chip
  await page.evaluate(() => { document.querySelectorAll('[role=tab]')[0].click() }); await page.waitForTimeout(600)
  r.restaurant = await page.evaluate(async () => {
    const a = document.querySelector('.soc-feed-slot a[href^="/restaurant/"]')
    const s = performance.now(); a.click()
    const h1 = await window.__waitFor(() => location.pathname.startsWith('/restaurant') && document.querySelector('h1') && !/home feed/i.test(document.querySelector('h1').innerText))
    const tile = await window.__waitFor(() => [...document.images].some(i => i.getBoundingClientRect().width > 120 && i.getBoundingClientRect().top < innerHeight && i.getBoundingClientRect().top > 0 && i.complete && i.naturalWidth > 0))
    return { toTitleMs: h1 < 0 ? null : h1, toFirstDishPhoto: tile < 0 ? null : performance.now() - s, path: location.pathname }
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
    search_to_trending: med(pick(r => r.search.toTrending)), search_to_rows: med(pick(r => r.search.toRows)), search_images_loaded: med(pick(r => r.search.toImagesLoaded)), sheet_open: med(pick(r => r.sheet.toOpen)), sheet_photo: med(pick(r => r.sheet.toPhoto)), sheet_reviews: med(pick(r => r.sheet.toReviews)), sheet_back_close: med(pick(r => r.sheet.backCloseMs)),
    tab_friends_painted: med(pick(r => r.tabs.toFriends[0])), tab_friends_ready: med(pick(r => r.tabs.toFriends[1])),
    tab_home_painted: med(pick(r => r.tabs.toHome[0])), tab_home_ready: med(pick(r => r.tabs.toHome[1])),
    tab_friends_again_painted: med(pick(r => r.tabs.toFriendsAgain[0])),
    resto_title: med(pick(r => r.restaurant.toTitleMs)), resto_first_dish_photo: med(pick(r => r.restaurant.toFirstDishPhoto)),
  }
  console.log(JSON.stringify(table, (k, v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : v)))
  L.save(`r3-speed-${profile}-${who}`, { table, runs })
})()
