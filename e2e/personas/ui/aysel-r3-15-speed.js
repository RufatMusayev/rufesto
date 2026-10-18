// Round 3 timing walk on the live build (commit 81f5890). All numbers in ms, measured in the page.
// node aysel-r3-15-speed.js [--throttle]   --throttle = CPU 4x + 1.6 Mbit/s down, 150 ms RTT (mid-range phone on 4G)
const L = require('./aysel-r3-lib')
const fs = require('fs')
const THROTTLE = process.argv.includes('--throttle')
const N = THROTTLE ? 4 : 5
const LIM = THROTTLE ? 45000 : 20000
const med = a => { const s = a.filter(x => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null }
const rnd = x => (x == null ? null : Math.round(x))
const R = {}
const push = (k, v) => (R[k] = R[k] || []).push(v == null ? null : v)

const INIT = () => {
  window.__m = { firstCard: null, firstImg: null, lcp: null, fcp: null }
  const tick = () => {
    const m = window.__m
    if (!m.firstCard) { const a = document.querySelector('.soc-feed-slot article'); if (a && a.getBoundingClientRect().height > 50) m.firstCard = performance.now() }
    if (!m.firstImg) { const i = document.querySelector('.soc-feed-slot article .soc-photo img'); if (i && i.complete && i.naturalWidth > 0) m.firstImg = performance.now() }
    if (!(m.firstCard && m.firstImg) && performance.now() < 90000) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__m.lcp = e.startTime }).observe({ type: 'largest-contentful-paint', buffered: true }) } catch (e) {}
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') window.__m.fcp = e.startTime }).observe({ type: 'paint', buffered: true }) } catch (e) {}
}
const timeAction = (page, clickSrc, doneSrc, timeout) => page.evaluate(([c, d, to]) => new Promise(res => {
  const click = new Function('return (' + c + ')()'), done = new Function('return (' + d + ')()')
  const t0 = performance.now()
  try { click() } catch (e) { return res(null) }
  const tick = () => { if (done()) return res(performance.now() - t0); if (performance.now() - t0 > to) return res(null); requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
}), [clickSrc, doneSrc, timeout || LIM])
const sinceNav = (page, doneSrc, lim) => page.evaluate(([d, l]) => new Promise(res => { const done = new Function('return (' + d + ')()'); const tick = () => { if (done()) return res(performance.now()); if (performance.now() > l) return res(null); requestAnimationFrame(tick) }; tick() }), [doneSrc, lim || LIM])

async function newPhone(b) {
  const A = await L.phone(b, 'Aysel Məmmədova')
  await A.ctx.addInitScript(INIT)
  A.page.setDefaultTimeout(LIM)
  if (THROTTLE) {
    const cdp = await A.ctx.newCDPSession(A.page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })
  }
  return A
}
const homeMetrics = async page => {
  await page.waitForFunction(() => window.__m && window.__m.firstImg, null, { timeout: LIM * 2 }).catch(() => {})
  await page.waitForTimeout(600)
  return page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; const m = window.__m; return { ttfb: n.responseStart, dcl: n.domContentLoadedEventEnd, fcp: m.fcp, firstCard: m.firstCard, firstImg: m.firstImg, lcp: m.lcp } })
}
const RESTO_READY = `() => location.pathname.startsWith('/restaurant/') && document.querySelector('h1') && [...document.querySelectorAll('[role=tab]')].some(t => t.innerText.trim() === 'Menu')`
const POST_PHOTO = `() => { const i = document.querySelector('.rst-tile img'); return i && i.complete && i.naturalWidth > 0 }`
const MENU_ROWS = `() => document.querySelectorAll('.mn-row').length > 3`
const tabClick = name => `() => [...document.querySelectorAll('[role=tab]')].find(t => t.innerText.trim() === '${name}').click()`
const feedArticle = `() => { const f = [...document.querySelectorAll('.soc-feed')].find(e => e.offsetParent); return f && f.querySelector('article') && f.querySelector('article').getBoundingClientRect().height > 50 }`
const homeArticle = `() => { const f = [...document.querySelectorAll('.soc-feed')].find(e => e.offsetParent); return f && f.querySelector('.soc-feed-slot article') }`
const searchZero = `() => location.pathname === '/explore' && document.querySelectorAll('.sr-row').length > 3`

;(async () => {
  const b = await L.launch()
  const guard = async (label, fn) => { try { await fn() } catch (e) { L.log(label, 'error:', String(e.message).split('\n')[0]) } }
  for (let i = 0; i < N; i++) await guard('home cold', async () => {
    const A = await newPhone(b); await A.page.goto(L.CONSUMER + '/', { timeout: 90000 })
    const m = await homeMetrics(A.page); for (const [k, v] of Object.entries(m)) push('home_cold_' + k, v)
    await A.ctx.close()
  })
  await guard('home warm', async () => {
    const A = await newPhone(b); await A.page.goto(L.CONSUMER + '/', { timeout: 90000 }); await homeMetrics(A.page)
    for (let i = 0; i < N; i++) {
      await A.page.goto(L.CONSUMER + '/profile', { timeout: 90000 }); await A.page.waitForTimeout(700)
      await A.page.goto(L.CONSUMER + '/', { timeout: 90000 })
      const m = await homeMetrics(A.page); for (const [k, v] of Object.entries(m)) push('home_warm_' + k, v)
    }
    await A.ctx.close()
  })
  for (let i = 0; i < N; i++) await guard('tabs + search + restaurant', async () => {
    const A = await newPhone(b); await A.page.goto(L.CONSUMER + '/', { timeout: 90000 }); await homeMetrics(A.page)
    push('tab_foryou_to_friends_1st', await timeAction(A.page, tabClick('Friends'), feedArticle)); await A.page.waitForTimeout(900)
    push('tab_friends_to_foryou_1st', await timeAction(A.page, tabClick('For you'), homeArticle)); await A.page.waitForTimeout(600)
    push('tab_foryou_to_friends_repeat', await timeAction(A.page, tabClick('Friends'), feedArticle)); await A.page.waitForTimeout(600)
    push('nav_home_to_search_1st', await timeAction(A.page, `() => document.querySelector('.bottom-nav a[href="/explore"], nav a[href="/explore"]').click()`, searchZero)); await A.page.waitForTimeout(1200)
    push('nav_search_to_home', await timeAction(A.page, `() => document.querySelector('.bottom-nav a[href="/"], nav a[href="/"]').click()`, homeArticle)); await A.page.waitForTimeout(800)
    push('nav_home_to_search_repeat', await timeAction(A.page, `() => document.querySelector('.bottom-nav a[href="/explore"], nav a[href="/explore"]').click()`, searchZero)); await A.page.waitForTimeout(1000)
    // restaurant page from a place row in Search (All places list)
    push('restaurant_from_search_header_tabs', await timeAction(A.page, `() => { const r = [...document.querySelectorAll('.sr-row')].find(x => /^Trattoria Bella Roma/.test(x.innerText.trim())); r.click() }`, RESTO_READY))
    await A.page.waitForTimeout(1200)
    push('menu_tab_rows_visible', await timeAction(A.page, tabClick('Menu'), MENU_ROWS)); await A.page.waitForTimeout(1500)
    push('dish_row_to_sheet_shell', await timeAction(A.page, `() => document.querySelectorAll('.mn-row-btn')[4].click()`, `() => !!document.querySelector('.bs-panel')`))
    push('dish_row_to_first_review', await A.page.evaluate(l => new Promise(res => { const t0 = performance.now(); const tick = () => { const n = document.querySelector('.bs-panel .rv-name'); if (n && n.getBoundingClientRect().height > 0) return res(performance.now() - t0); if (performance.now() - t0 > l) return res(null); requestAnimationFrame(tick) }; tick() }), LIM))
    await A.ctx.close()
  })
  for (let i = 0; i < N; i++) await guard('direct', async () => {
    const A = await newPhone(b); await A.page.goto(L.CONSUMER + '/restaurant/bella-roma', { timeout: 90000 })
    push('restaurant_direct_cold_header_tabs', await sinceNav(A.page, RESTO_READY))
    push('restaurant_direct_cold_first_post_photo', await sinceNav(A.page, POST_PHOTO, LIM * 2))
    await A.ctx.close()
  })
  for (let i = 0; i < N; i++) await guard('order this', async () => {
    const A = await newPhone(b); await A.page.goto(L.CONSUMER + '/', { timeout: 90000 }); await homeMetrics(A.page)
    push('order_this_to_sheet_with_dish', await timeAction(A.page, `() => { window.__t0 = performance.now(); [...document.querySelectorAll('a')].find(a => a.innerText.trim() === 'Order this').click() }`, `() => { const s = document.querySelector('.bs-panel'); return s && s.querySelector('.dds-titlerow') && s.querySelector('.dds-titlerow').innerText.length > 3 }`, LIM * 2))
    push('order_this_to_first_review', await A.page.evaluate(l => new Promise(res => { const tick = () => { const n = document.querySelector('.bs-panel .rv-name'); if (n && n.getBoundingClientRect().height > 0) return res(performance.now() - window.__t0); if (performance.now() - window.__t0 > l) return res(null); requestAnimationFrame(tick) }; tick() }), LIM * 2))
    await A.page.keyboard.press('Escape'); await A.page.waitForTimeout(500)
    push('back_to_home_first_card', await timeAction(A.page, `() => history.back()`, `() => location.pathname === '/' && document.querySelector('.soc-feed-slot article')`))
    await A.ctx.close()
  })
  for (let i = 0; i < N; i++) await guard('notifications', async () => {
    const A = await newPhone(b); await A.page.goto(L.CONSUMER + '/', { timeout: 90000 }); await homeMetrics(A.page)
    push('bell_to_inbox_rows', await timeAction(A.page, `() => document.querySelector('[aria-label*="otification" i]').click()`, `() => document.querySelectorAll('li.ntf-li').length > 3`))
    push('inbox_post_thumb_loaded', await A.page.evaluate(l => new Promise(res => { const t0 = performance.now(); const tick = () => { const li = [...document.querySelectorAll('li.ntf-li')].find(r => /liked your post|commented/.test(r.innerText)); const im = li && li.querySelector('.ntf-thumb img'); if (im && im.complete && im.naturalWidth) return res(performance.now() - t0); if (performance.now() - t0 > l) return res(null); requestAnimationFrame(tick) }; tick() }), LIM))
    await A.ctx.close()
  })
  const out = { throttle: THROTTLE, build: '81f5890', results: Object.fromEntries(Object.entries(R).map(([k, v]) => [k, { median: rnd(med(v)), all: v.map(rnd) }])) }
  fs.writeFileSync(L.path.join(L.OUT, THROTTLE ? 'speed-throttled.json' : 'speed.json'), JSON.stringify(out, null, 1))
  L.log(THROTTLE ? 'PHONE (CPU x4, 1.6 Mbit/s, 150 ms RTT)' : 'THIS PC')
  for (const [k, v] of Object.entries(out.results)) L.log(k.padEnd(44), 'median', String(v.median).padStart(6), JSON.stringify(v.all))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
