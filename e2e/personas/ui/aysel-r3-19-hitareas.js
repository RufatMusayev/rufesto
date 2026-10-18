const L = require('./aysel-r3-lib')
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova', { storage: { rufesto_home_tab: 'friends' } })
  const page = A.page
  await page.goto(L.CONSUMER + '/'); await page.waitForSelector('article'); await page.waitForTimeout(2500)
  const row = page.locator('article').filter({ has: page.locator('.rv-name') }).filter({ has: page.locator('.rv-where') }).first()
  await row.scrollIntoViewIfNeeded(); await page.waitForTimeout(800)
  const out = await page.evaluate(() => {
    const rv = [...document.querySelectorAll('article')].find(a => a.querySelector('.rv-name') && a.querySelector('.rv-where') && a.getBoundingClientRect().top >= 0 && a.getBoundingClientRect().bottom <= innerHeight) || document.querySelector('article')
    const probeEl = (el) => {
      const r = el.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2
      const ok = (x, y) => { const e = document.elementFromPoint(x, y); return !!(e && (e === el || el.contains(e))) }
      let up = 0, down = 0, left = 0, right = 0
      while (up < 40 && ok(cx, cy - r.height / 2 - up - 1 + 0.5 * 0)) up++
      while (down < 40 && ok(cx, cy + r.height / 2 + down)) down++
      while (left < 40 && ok(cx - r.width / 2 - left - 1, cy)) left++
      while (right < 40 && ok(cx + r.width / 2 + right, cy)) right++
      return { box: Math.round(r.width) + 'x' + Math.round(r.height), centerHit: ok(cx, cy), extendsPx: { up, down, left, right } }
    }
    return { name: probeEl(rv.querySelector('.rv-name')), where: probeEl(rv.querySelector('.rv-where')), like: probeEl(rv.querySelector('.rv-act')), reply: probeEl([...rv.querySelectorAll('.rv-act')][1]), avatar: probeEl(rv.querySelector('.rv-av')) }
  })
  L.log(JSON.stringify(out))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
