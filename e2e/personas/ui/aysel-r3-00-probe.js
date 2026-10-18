const L = require('./aysel-r3-lib')
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova')
  const t0 = Date.now()
  await A.page.goto(L.CONSUMER + '/'); await A.page.waitForSelector('article', { timeout: 40000 })
  L.log('first article ms', Date.now() - t0)
  await A.page.waitForTimeout(1500)
  await L.shot(A.page, '00-home')
  L.log('text:', (await A.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 700))
  L.log('top bar & tabs:', await A.page.evaluate(() => ({
    header: [...document.querySelectorAll('header, .top-bar, .app-header, [class*=topbar i]')].filter(e => e.offsetParent).map(e => e.className + ' ' + Math.round(e.getBoundingClientRect().height) + 'px ' + e.innerText.replace(/\n+/g, '/').slice(0, 40)),
    tabs: [...document.querySelectorAll('[role=tab]')].map(t => t.innerText.trim() + ' h' + Math.round(t.getBoundingClientRect().height) + ' sel=' + t.getAttribute('aria-selected')),
    fab: !!document.querySelector('.soc-fab'), langSwitcher: !!([...document.querySelectorAll('button')].find(b => /^(EN|AZ)$/.test(b.innerText.trim()))),
    iconButtons: [...document.querySelectorAll('header button, header a, [class*=topbar i] button, [class*=topbar i] a')].filter(e => e.offsetParent).map(e => ((e.getAttribute('aria-label') || e.innerText || '').trim().slice(0, 24)) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)),
  })))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
