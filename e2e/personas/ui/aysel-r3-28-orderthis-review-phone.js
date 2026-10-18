// Round 3: "Order this" on Home -> dish sheet -> first review, on the phone profile (CPU x4, 1.6 Mbit/s, 150 ms RTT). Snapshots every 250 ms.
const L = require('./aysel-r3-lib')
const sleep = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  const b = await L.launch()
  const out = []
  for (let run = 0; run < 4; run++) {
    const A = await L.phone(b, 'Aysel Məmmədova'); const page = A.page
    const cdp = await A.ctx.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })
    await page.goto(L.CONSUMER + '/', { timeout: 90000 }); await page.waitForSelector('.soc-feed-slot article', { timeout: 60000 }); await sleep(1200)
    const r = await page.evaluate(() => new Promise(res => {
      const link = [...document.querySelectorAll('a')].find(a => a.innerText.trim() === 'Order this'); const t0 = performance.now(); link.click()
      const m = { sheet: null, title: null, review: null, noReviews: null, panelTop: null }
      const tick = () => {
        const t = performance.now() - t0; const p = document.querySelector('.bs-panel')
        if (p && m.sheet == null) m.sheet = Math.round(t)
        if (p && m.title == null && (p.querySelector('.dds-titlerow')?.innerText || '').length > 3) m.title = Math.round(t)
        const n = p && p.querySelector('.rv-name')
        if (n && n.getBoundingClientRect().height > 0 && m.review == null) { m.review = Math.round(t); const r = n.getBoundingClientRect(); m.reviewVisibleAboveFoot = r.bottom < (p.querySelector('.bs-foot')?.getBoundingClientRect().top || 9999) }
        if (m.review != null || t > 25000) return res(m)
        requestAnimationFrame(tick)
      }
      tick()
    }))
    r.path = page.url().replace(L.CONSUMER, ''); r.reviewsText = (await page.evaluate(() => (document.querySelector('.bs-panel .rv-section')?.innerText || '(none)').replace(/\n+/g, ' | ').slice(0, 90)))
    out.push(r); L.log('run', run, JSON.stringify(r))
    await A.ctx.close()
  }
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
