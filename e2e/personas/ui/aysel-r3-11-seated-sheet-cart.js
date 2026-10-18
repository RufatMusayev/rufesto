// Round 3, part 7: seated at T1: dish sheet footer "Add to order", sheet close timing, cart as a BottomSheet (drag to dismiss), 2nd order, kitchen, waiter serves.
const L = require('./aysel-r3-lib')
const sleep = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova')
  const page = A.page
  const cdp = await A.ctx.newCDPSession(page)
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
  const swipe = async (x, y0, y1, ms = 300, steps = 10) => { await touch('touchStart', [{ x, y: y0 }]); for (let i = 1; i <= steps; i++) { await touch('touchMove', [{ x, y: y0 + ((y1 - y0) * i) / steps }]); await sleep(ms / steps) } await touch('touchEnd', []) }
  const note = (k, v) => L.log('  >>', k, v)
  await L.step('seated dish sheet: footer + Add to order', async () => {
    await page.goto(L.CONSUMER + '/restaurant/fincan-coffee'); await sleep(3000)
    const row = page.locator('.mn-row').filter({ hasText: 'Butter Croissant' }).first()
    await row.scrollIntoViewIfNeeded(); await sleep(300)
    const y0 = await page.evaluate(() => scrollY)
    await row.locator('.mn-row-btn').click(); await page.waitForSelector('.bs-panel'); await sleep(1200)
    await L.shot(page, '11-dish-sheet-seated')
    note('footer', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.bs-foot button, .bs-foot a, .bs-foot p, .bs-foot div')].map(e => e.innerText.trim().replace(/\n+/g, ' ')).filter(Boolean))))
    note('scrollY before / with sheet open', y0 + ' / ' + (await page.evaluate(() => scrollY)))
    const t = Date.now()
    await page.locator('.dds-cta').click()
    await page.waitForFunction(() => !document.querySelector('.bs-panel'), null, { timeout: 5000 }).catch(() => {})
    note('sheet gone after the CTA', (Date.now() - t) + ' ms')
    await sleep(500)
    note('fab / toast / scrollY', JSON.stringify(await page.evaluate(() => document.querySelector('.cart-fab')?.innerText)) + ' / ' + (await page.evaluate(() => [...document.querySelectorAll('[class*=toast i]')].map(e => e.innerText.replace(/\n+/g, ' / ')).join(' | '))) + ' / ' + (await page.evaluate(() => scrollY)))
    await L.shot(page, '11-after-add-to-order')
  })
  await L.step('cart sheet: handle drag dismiss, reopen, place', async () => {
    await page.locator('.cart-fab').click({ force: true }); await page.waitForSelector('.bs-panel'); await sleep(900)
    const top = await page.evaluate(() => document.querySelector('.bs-panel').getBoundingClientRect().top)
    await L.shot(page, '11-cart')
    await swipe(206, top + 14, top + 330, 500, 12); await sleep(800)
    note('cart after handle drag 316 px', (await page.locator('.bs-panel').count()) ? 'STILL OPEN' : 'closed')
    await page.locator('.cart-fab').click({ force: true }); await page.waitForSelector('.bs-panel'); await sleep(800)
    await page.getByRole('button', { name: /Place order/i }).click()
    await page.waitForSelector('.dn-placed-ref', { timeout: 20000 }).catch(() => note('placed', 'NO confirmation'))
    note('placed', (await page.evaluate(() => (document.querySelector('.bs-panel')?.innerText || '').replace(/\n+/g, ' | ').slice(0, 120))))
    await page.getByRole('button', { name: /Done/i }).click().catch(() => {}); await sleep(1200)
  })
  await L.step('table page with 2 orders', async () => {
    await page.goto(L.CONSUMER + '/table'); await sleep(2800)
    await L.shot(page, '11-table-orders')
    note('table text', (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 520))
  })
  const M = await L.desk(b, 'Səid Əhmədov')
  await L.step('kitchen start / ready / done for the new ticket', async () => {
    await M.page.goto(L.RESTO + '/kds'); await M.page.waitForSelector('.kds-advance-btn', { timeout: 30000 })
    const btns = M.page.locator('.kds-advance-btn')
    for (let i = 0; i < 8; i++) {
      const n = await btns.count(); if (!n) break
      await btns.first().click(); await M.page.waitForTimeout(700)
    }
    note('kds tickets left', await btns.count())
  })
  const W = await L.desk(b, 'Ülviyyə Kazımova')
  await L.step('waiter serves from My Tables', async () => {
    await W.page.goto(L.RESTO + '/waiter'); await W.page.waitForTimeout(3000)
    await W.page.getByRole('button', { name: /All tables/i }).click(); await W.page.waitForTimeout(800)
    const take = W.page.getByRole('button', { name: /Take Table/i }).first(); if (await take.count()) { await take.click(); await W.page.waitForTimeout(1500) }
    await W.page.getByRole('button', { name: /My tables/i }).click(); await W.page.waitForTimeout(1200)
    for (let i = 0; i < 4; i++) { const s = W.page.getByRole('button', { name: /Mark Served/i }).first(); if (await s.count()) { await s.click(); await W.page.waitForTimeout(1200) } }
    await L.shot(W.page, '11-waiter-mine')
    note('waiter card', (await W.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(140, 460))
  })
  L.log('errors', A.errors.filter(e => !/ERR_ABORTED/.test(e)), M.errors, W.errors)
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
