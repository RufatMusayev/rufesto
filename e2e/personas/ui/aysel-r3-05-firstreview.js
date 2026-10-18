const L = require('./aysel-r3-lib')
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova')
  const page = A.page
  await page.goto(L.CONSUMER + '/restaurant/bella-roma?tab=menu'); await page.waitForSelector('.mn-row'); await page.waitForTimeout(1500)
  const idx = await page.evaluate(() => [...document.querySelectorAll('.mn-row')].map((r, i) => (r.querySelector('.mn-tag--rate') ? i : -1)).filter(i => i >= 0))
  const out = []
  for (const n of idx) {
    await page.locator('.mn-row-btn').nth(n).scrollIntoViewIfNeeded(); await page.locator('.mn-row-btn').nth(n).click()
    await page.waitForSelector('.bs-panel'); await page.waitForTimeout(1800)
    const r = await page.evaluate(() => {
      const p = document.querySelector('.bs-panel'); const foot = p.querySelector('.bs-foot')?.getBoundingClientRect().top
      const nm = p.querySelector('.rv-name'); const q = nm && nm.getBoundingClientRect()
      return { title: p.querySelector('.dds-titlerow')?.innerText.replace(/\n+/g, ' ').slice(0, 28), desc: Math.round(p.querySelector('.dds-desc')?.getBoundingClientRect().height || 0), reviewTop: q ? Math.round(q.top) : null, reviewBottom: q ? Math.round(q.bottom) : null, footTop: Math.round(foot), reviewHeader: !!p.querySelector('.rv-section'), reviewsNone: (p.querySelector('.rv-section')?.innerText || '').replace(/\n+/g, ' | ').slice(0, 80) }
    })
    out.push(r); L.log(n, JSON.stringify(r))
    await page.keyboard.press('Escape'); await page.waitForTimeout(600)
  }
  const vis = out.filter(r => r.reviewTop != null && r.reviewBottom <= r.footTop).length
  L.log(`first review fully above the footer without scrolling: ${vis} of ${out.length}`)
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
