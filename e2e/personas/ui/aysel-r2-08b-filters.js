const L = require('./aysel-r2-lib')
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova')
  await A.page.goto(L.CONSUMER + '/notifications'); await A.page.waitForSelector('li.ntf-li'); await A.page.waitForTimeout(1500)
  for (const f of ['Social', 'Dine-in', 'Bookings', 'Places', 'All']) {
    const t0 = Date.now()
    await A.page.getByRole('button', { name: f, exact: true }).or(A.page.getByRole('tab', { name: f, exact: true })).first().click()
    let state = null
    for (let i = 0; i < 40 && !state; i++) {
      await A.page.waitForTimeout(150)
      state = await A.page.evaluate(() => {
        const items = document.querySelectorAll('li.ntf-li').length
        const skel = document.querySelectorAll('[class*=skel]').length
        const main = (document.querySelector('main') || document.body).innerText.replace(/\n+/g, ' | ')
        if (items) return { items, skel }
        if (!skel && /No |Nothing|empty/i.test(main) ) return { items: 0, skel, main: main.slice(0, 160) }
        return null
      })
    }
    L.log(f.padEnd(9), (Date.now() - t0) + 'ms', JSON.stringify(state))
    await L.shot(A.page, '08b-filter-' + f)
  }
  L.log('aria of chips:', await A.page.evaluate(() => [...document.querySelectorAll('.ntf-chips button, [role=tablist] *')].map(e => e.innerText + ':' + (e.getAttribute('aria-selected') || e.getAttribute('aria-pressed')))))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
