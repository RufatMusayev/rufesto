// Restaurant page, Menu tab and dish sheet timing (Fincan). node aysel-31-menu-timing.js [--throttle]
const L = require('./aysel-lib')
const THROTTLE = process.argv.includes('--throttle')
const N = 4
const LIM = THROTTLE ? 40000 : 15000
const med = a => { const s = a.filter(x => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null }
const timeAction = (page, clickSrc, doneSrc, timeout) => page.evaluate(([c, d, to]) => new Promise(res => {
  const click = new Function('return (' + c + ')()'), done = new Function('return (' + d + ')()')
  const t0 = performance.now()
  try { click() } catch (e) { return res(null) }
  const tick = () => { if (done()) return res(performance.now() - t0); if (performance.now() - t0 > to) return res(null); requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
}), [clickSrc, doneSrc, timeout])

;(async () => {
  const b = await L.launch()
  const rows = { restaurant_direct_first_tile: [], menu_tab_first_rows: [], dish_row_to_sheet_shell: [], dish_row_to_sheet_photo: [] }
  for (let i = 0; i < N; i++) {
    const A = await L.phone(b, 'Aysel Məmmədova')
    const cdp = await A.ctx.newCDPSession(A.page)
    if (THROTTLE) {
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
      await cdp.send('Network.enable')
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })
    }
    A.page.setDefaultTimeout(20000)
    try {
      await A.page.goto(L.CONSUMER + '/restaurant/fincan-coffee', { timeout: 60000 })
      rows.restaurant_direct_first_tile.push(await A.page.evaluate(lim => new Promise(res => { const tick = () => { if (document.querySelector('h1') && document.querySelector('.ig-grid-tile')) return res(performance.now()); if (performance.now() > lim) return res(null); requestAnimationFrame(tick) }; tick() }), LIM))
      await A.page.waitForTimeout(1500)
      rows.menu_tab_first_rows.push(await timeAction(A.page, `() => [...document.querySelectorAll('[role=tab]')].find(t => t.innerText.trim() === 'Menu').click()`, `() => document.body.innerText.includes('Double shot of our house blend')`, LIM))
      await A.page.waitForTimeout(THROTTLE ? 4000 : 1500)
      rows.dish_row_to_sheet_shell.push(await timeAction(A.page, `() => { const t = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && e.textContent.trim() === 'Flat White'); t.click() }`, `() => !!document.querySelector('.sheet')`, LIM))
      rows.dish_row_to_sheet_photo.push(await A.page.evaluate(lim => new Promise(res => { const t0 = performance.now(); const tick = () => { const i = document.querySelector('.sheet img'); if (i && i.complete && i.naturalWidth) return res(performance.now() - t0); if (performance.now() - t0 > lim) return res(null); requestAnimationFrame(tick) }; tick() }), LIM))
    } catch (e) { L.log('round', i, 'error', String(e.message).split('\n')[0]) }
    await A.ctx.close()
    L.log('round', i, 'done')
  }
  L.log(THROTTLE ? 'THROTTLED' : 'UNTHROTTLED')
  for (const [k, v] of Object.entries(rows)) L.log(k.padEnd(30), 'median', Math.round(med(v)), JSON.stringify(v.map(x => x == null ? null : Math.round(x))))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
