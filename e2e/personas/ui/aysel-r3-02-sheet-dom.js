const L = require('./aysel-r3-lib')
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova')
  await A.page.goto(L.CONSUMER + '/restaurant/bella-roma?tab=menu'); await A.page.waitForTimeout(3500)
  await L.shot(A.page, '02-menu')
  L.log('menu rows:', await A.page.locator('.mn-row').count(), 'scrollY', await A.page.evaluate(() => scrollY))
  await A.page.locator('.mn-row-btn').nth(5).click(); await A.page.waitForTimeout(2500)
  L.log('url', A.page.url().replace(L.CONSUMER, ''))
  await L.shot(A.page, '02-dish-sheet')
  const dom = await A.page.evaluate(() => {
    const walk = (el, d) => { if (d > 4) return ''; const kids = [...el.children].slice(0, 8); return '  '.repeat(d) + el.tagName.toLowerCase() + '.' + (typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 3).join('.') : '') + (el.getAttribute('role') ? '[role=' + el.getAttribute('role') + ']' : '') + '\n' + kids.map(k => walk(k, d + 1)).join('') }
    const r = document.querySelector('.bs-root'); return r ? walk(r, 0) : 'no .bs-root'
  })
  L.log(dom)
  L.log('sheet text:', (await A.page.evaluate(() => document.querySelector('.bs-root')?.innerText || '')).replace(/\n+/g, ' | ').slice(0, 900))
  L.log('html classes', await A.page.evaluate(() => document.documentElement.className + ' | body: ' + document.body.className + ' | #root inert=' + document.getElementById('root')?.hasAttribute('inert')))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
