// "Order this" on a Home restaurant post -> dish sheet with the dish name visible; plus like and comment round trips.
const L = require('./aysel-lib')
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] }
const timeAction = (page, clickSrc, doneSrc, timeout) => page.evaluate(([c, d, to]) => new Promise(res => {
  const click = new Function('return (' + c + ')()'), done = new Function('return (' + d + ')()')
  const t0 = performance.now(); click()
  const tick = () => { if (done()) return res(performance.now() - t0); if (performance.now() - t0 > to) return res(null); requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
}), [clickSrc, doneSrc, timeout || 15000])
;(async () => {
  const b = await L.launch()
  const rows = { order_tap_to_sheet: [], order_tap_to_sheet_photo: [], like_roundtrip_ui: [], back_to_home_first_card: [] }
  for (let i = 0; i < 5; i++) {
    const A = await L.phone(b, 'Aysel Məmmədova')
    await A.page.goto(L.CONSUMER + '/'); await A.page.waitForSelector('.soc-feed-slot article'); await A.page.waitForTimeout(1500)
    const t = await timeAction(A.page, `() => { window.__t0 = performance.now(); [...document.querySelectorAll('a')].find(a => a.innerText.trim() === 'Order this').click() }`, `() => { const s = document.querySelector('.sheet'); return s && /Available|Sold out|Mövcud/.test(s.innerText) }`, 20000)
    rows.order_tap_to_sheet.push(t)
    const t2 = await A.page.evaluate(() => new Promise(res => { const tick = () => { const i = document.querySelector('.sheet img'); if (i && i.complete && i.naturalWidth) return res(performance.now() - window.__t0); if (performance.now() > 20000) return res(null); requestAnimationFrame(tick) }; tick() }))
    rows.order_tap_to_sheet_photo.push(t2)
    await A.page.keyboard.press('Escape'); await A.page.waitForTimeout(400)
    // browser back to Home from the restaurant page
    const t3 = await timeAction(A.page, `() => history.back()`, `() => location.pathname === '/' && document.querySelector('.soc-feed-slot article')`, 15000)
    rows.back_to_home_first_card.push(t3)
    // like round trip: tap Like, time until aria-pressed/label flips, then check server
    await A.page.waitForTimeout(800)
    const likeT = await timeAction(A.page, `() => { const b = [...document.querySelectorAll('.soc-feed-slot article button')].find(x => x.getAttribute('aria-label') === 'Like'); window.__likeBtn = b; b.click() }`, `() => window.__likeBtn.getAttribute('aria-label') === 'Remove like' || window.__likeBtn.getAttribute('aria-pressed') === 'true'`, 8000)
    rows.like_roundtrip_ui.push(likeT)
    // undo so the persona's data stays tidy
    await A.page.evaluate(() => window.__likeBtn && window.__likeBtn.click()); await A.page.waitForTimeout(800)
    await A.ctx.close()
  }
  for (const [k, v] of Object.entries(rows)) L.log(k.padEnd(28), 'median', Math.round(med(v.filter(x => x != null))), JSON.stringify(v.map(x => x == null ? null : Math.round(x))))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
