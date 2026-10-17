// Final timing walk on the live build (bundle index-D9ZRBzZM, deployed 12:32 Baku). All numbers in ms, measured in the page.
// node aysel-36-speed-final.js [--throttle]   --throttle = CPU 4x + 1.6 Mbit/s down, 150 ms RTT (mid-range phone on 4G)
const L = require('./aysel-r2-lib')
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

async function newPhone(b, opts) {
  const A = await L.phone(b, 'Aysel Məmmədova', opts)
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

;(async () => {
  const b = await L.launch()
  const guard = async (label, fn) => { try { await fn() } catch (e) { L.log(label, 'error:', String(e.message).split('\n')[0]) } }
  // Home cold
  for (let i = 0; i < N; i++) await guard('home cold', async () => {
    const A = await newPhone(b); await A.page.goto(L.CONSUMER + '/', { timeout: 90000 })
    const m = await homeMetrics(A.page); for (const [k, v] of Object.entries(m)) push('home_cold_' + k, v)
    await A.ctx.close()
  })
  // Home warm
  await guard('home warm', async () => {
    const A = await newPhone(b); await A.page.goto(L.CONSUMER + '/', { timeout: 90000 }); await homeMetrics(A.page)
    for (let i = 0; i < N; i++) {
      await A.page.goto(L.CONSUMER + '/profile', { timeout: 90000 }); await A.page.waitForTimeout(700)
      await A.page.goto(L.CONSUMER + '/', { timeout: 90000 })
      const m = await homeMetrics(A.page); for (const [k, v] of Object.entries(m)) push('home_warm_' + k, v)
    }
    await A.ctx.close()
  })
  // tabs, restaurant from Discover, menu tab, dish sheet, back
  const friendsDone = `() => { const f = [...document.querySelectorAll('.soc-feed')].find(e => e.offsetParent); return f && f.querySelector('article') && f.querySelector('article').getBoundingClientRect().height > 50 }`
  const discDone = `() => { const d = document.querySelector('.dsc'); return d && d.offsetParent && d.querySelector('.dsc-rc') && d.querySelector('.dsc-rc').getBoundingClientRect().height > 50 }`
  const homeDone = `() => { const f = [...document.querySelectorAll('.soc-feed')].find(e => e.offsetParent && !e.classList.contains('dsc')); return f && f.querySelector('.soc-feed-slot article') }`
  for (let i = 0; i < N; i++) await guard('tabs', async () => {
    const A = await newPhone(b); await A.page.goto(L.CONSUMER + '/', { timeout: 90000 }); await homeMetrics(A.page)
    push('tab_home_to_friends_1st', await timeAction(A.page, tabClick('Friends'), friendsDone)); await A.page.waitForTimeout(900)
    push('tab_friends_to_discover_1st', await timeAction(A.page, tabClick('Discover'), discDone)); await A.page.waitForTimeout(900)
    push('tab_discover_to_home_1st', await timeAction(A.page, tabClick('Home'), homeDone)); await A.page.waitForTimeout(600)
    push('tab_home_to_friends_repeat', await timeAction(A.page, tabClick('Friends'), friendsDone)); await A.page.waitForTimeout(600)
    push('tab_friends_to_discover_repeat', await timeAction(A.page, tabClick('Discover'), discDone)); await A.page.waitForTimeout(900)
    // restaurant page from a Discover card (SPA)
    push('restaurant_from_discover_header_tabs', await timeAction(A.page, `() => document.querySelector('.dsc-rc h3 a').click()`, RESTO_READY))
    push('restaurant_from_discover_first_post_photo_INVALID', await sinceNav(A.page, POST_PHOTO, LIM * 2).then(v => v))
    await A.page.waitForTimeout(800)
    push('menu_tab_rows_visible', await timeAction(A.page, tabClick('Menu'), MENU_ROWS)); await A.page.waitForTimeout(1500)
    push('dish_row_to_sheet_shell', await timeAction(A.page, `() => document.querySelectorAll('.mn-row-btn')[2].click()`, `() => !!document.querySelector('.sheet')`))
    push('dish_row_to_sheet_photo', await A.page.evaluate(l => new Promise(res => { const t0 = performance.now(); const tick = () => { const i = document.querySelector('.sheet img'); if (i && i.complete && i.naturalWidth) return res(performance.now() - t0); if (performance.now() - t0 > l) return res(null); requestAnimationFrame(tick) }; tick() }), LIM))
    await A.ctx.close()
  })
  // restaurant direct (cold)
  for (let i = 0; i < N; i++) await guard('direct', async () => {
    const A = await newPhone(b); await A.page.goto(L.CONSUMER + '/restaurant/bella-roma', { timeout: 90000 })
    push('restaurant_direct_cold_header_tabs', await sinceNav(A.page, RESTO_READY))
    push('restaurant_direct_cold_first_post_photo', await sinceNav(A.page, POST_PHOTO, LIM * 2))
    await A.ctx.close()
  })
  // Order this -> dish sheet (SPA), then back
  for (let i = 0; i < N; i++) await guard('order this', async () => {
    const A = await newPhone(b); await A.page.goto(L.CONSUMER + '/', { timeout: 90000 }); await homeMetrics(A.page)
    push('order_this_to_sheet_with_dish', await timeAction(A.page, `() => { window.__t0 = performance.now(); [...document.querySelectorAll('a')].find(a => a.innerText.trim() === 'Order this').click() }`, `() => { const s = document.querySelector('.sheet'); return s && /Available|Sold out/.test(s.innerText) }`, LIM * 2))
    push('order_this_to_sheet_photo', await A.page.evaluate(l => new Promise(res => { const tick = () => { const i = document.querySelector('.sheet img'); if (i && i.complete && i.naturalWidth) return res(performance.now() - window.__t0); if (performance.now() - window.__t0 > l) return res(null); requestAnimationFrame(tick) }; tick() }), LIM * 2))
    await A.page.keyboard.press('Escape'); await A.page.waitForTimeout(400)
    push('back_to_home_first_card', await timeAction(A.page, `() => history.back()`, `() => location.pathname === '/' && document.querySelector('.soc-feed-slot article')`))
    await A.ctx.close()
  })
  const out = { throttle: THROTTLE, build: 'index-_D0J1bFF.js', results: Object.fromEntries(Object.entries(R).map(([k, v]) => [k, { median: rnd(med(v)), all: v.map(rnd) }])) }
  fs.writeFileSync(L.path.join(L.OUT, THROTTLE ? 'speed-final-throttled.json' : 'speed-final.json'), JSON.stringify(out, null, 1))
  L.log(THROTTLE ? 'THROTTLED (CPU x4, 1.6 Mbit/s, 150 ms RTT)' : 'UNTHROTTLED')
  for (const [k, v] of Object.entries(out.results)) L.log(k.padEnd(46), 'median', String(v.median).padStart(6), JSON.stringify(v.all))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
