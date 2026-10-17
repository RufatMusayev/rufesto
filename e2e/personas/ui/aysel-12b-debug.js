const L = require('./aysel-lib')
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova')
  await A.page.goto(L.CONSUMER + '/bill'); await A.page.waitForTimeout(2500)
  const probe = () => A.page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(x => /Card \(demo\)/.test(x.innerText)); const r = btn.getBoundingClientRect()
    const pts = [[r.x + r.width / 2, r.y + 10], [r.x + r.width / 2, r.y + r.height / 2], [r.x + r.width / 2, r.y + r.height - 10]].map(([x, y]) => { const t = document.elementFromPoint(x, y); return t ? t.tagName + '.' + (t.className || '').toString().slice(0, 40) : null })
    return { rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], vh: innerHeight, scrollY: Math.round(scrollY), docH: document.documentElement.scrollHeight, pts, disabled: btn.disabled }
  })
  L.log('initial', JSON.stringify(await probe()))
  await A.page.evaluate(() => window.scrollBy(0, 400)); await A.page.waitForTimeout(400)
  L.log('after scroll', JSON.stringify(await probe()))
  await A.page.evaluate(() => window.scrollTo(0, 99999)); await A.page.waitForTimeout(400)
  L.log('bottom', JSON.stringify(await probe()))
  await L.shot(A.page, '12-bill-bottom')
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
