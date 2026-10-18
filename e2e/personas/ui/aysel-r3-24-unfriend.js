const L = require('./aysel-r3-lib')
const sleep = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova'); const page = A.page
  await page.goto(L.CONSUMER + '/friends'); await sleep(2500)
  const row = page.locator('.soc-row').filter({ hasText: 'Ceyhun' }).first()
  await row.locator('button').last().click(); await sleep(900)
  await L.shot(page, '24-friend-menu')
  L.log('menu:', (await page.evaluate(() => (document.querySelector('.bs-panel, [role=menu], [role=dialog]')?.innerText || '(no menu)'))).replace(/\n+/g, ' | '))
  const rm = page.getByRole('button', { name: /Remove|Unfriend/i }).first()
  if (await rm.count()) { await rm.click(); await sleep(900); L.log('after remove click:', (await page.evaluate(() => document.querySelector('.bs-panel, [role=dialog]')?.innerText || '(closed)')).replace(/\n+/g, ' | ')) }
  await L.shot(page, '24-friend-menu-after')
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
