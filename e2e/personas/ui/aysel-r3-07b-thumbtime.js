const L = require('./aysel-r3-lib')
;(async () => {
  const b = await L.launch()
  for (const run of ['cold', 'warm']) {
    const A = run === 'cold' ? await L.phone(b, 'Aysel Məmmədova') : null
    const page = run === 'cold' ? A.page : global.__page
    if (run === 'cold') global.__page = page
    const t0 = Date.now()
    await page.goto(L.CONSUMER + '/notifications')
    const out = await page.evaluate(() => new Promise(res => {
      const t = performance.now(); const m = {}
      const tick = () => {
        const rows = [...document.querySelectorAll('li.ntf-li')]
        if (rows.length && !m.rows) m.rows = performance.now() - t
        const like = rows.find(r => /liked your post/.test(r.innerText))
        const th = like && like.querySelector('.ntf-thumb img')
        if (th && th.complete && th.naturalWidth && !m.thumb) { m.thumb = performance.now() - t; return res(m) }
        if (performance.now() - t > 12000) return res(m)
        requestAnimationFrame(tick)
      }
      tick()
    }))
    L.log(run, 'rows visible', Math.round(out.rows), 'ms | post thumbnail loaded', out.thumb ? Math.round(out.thumb) + ' ms (' + Math.round(out.thumb - out.rows) + ' ms after the rows)' : 'NOT in 12 s')
    if (run === 'cold') await page.waitForTimeout(1500)
  }
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
