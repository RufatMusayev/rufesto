// Does the Friends list drop a friend right after "Remove friend"? (re-creates the Ceyhun friendship first, then removes it again)
const L = require('./aysel-r3-lib')
const sleep = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  const b = await L.launch()
  const C = await L.phone(b, 'Ceyhun Məmmədli')
  await C.page.goto(L.CONSUMER + '/explore'); await sleep(2500)
  await C.page.getByPlaceholder(/Dishes, places, people/i).fill('aysel'); await sleep(2500)
  await C.page.getByRole('button', { name: /Add friend/i }).first().click(); await sleep(1500); await C.ctx.close()
  const A = await L.phone(b, 'Aysel Məmmədova'); const page = A.page
  await page.goto(L.CONSUMER + '/notifications'); await page.waitForSelector('li.ntf-li'); await sleep(1500)
  await page.locator('li.ntf-li').filter({ hasText: /Ceyhun.*friend request/ }).first().getByRole('button', { name: 'Confirm' }).click(); await sleep(1500)
  await page.goto(L.CONSUMER + '/friends'); await sleep(2500)
  const names = () => page.evaluate(() => [...document.querySelectorAll('.soc-row-name')].map(e => e.innerText))
  L.log('friends before', await names())
  await page.locator('.soc-row').filter({ hasText: 'Ceyhun' }).first().locator('button').last().click(); await sleep(700)
  await page.getByRole('button', { name: 'Remove friend' }).click()
  const t0 = Date.now(); let gone = null
  for (let i = 0; i < 100 && gone == null; i++) { await sleep(100); if (!(await names()).includes('Ceyhun Məmmədli')) gone = Date.now() - t0 }
  L.log('Ceyhun left the list after (ms):', gone, '| sheet still open?', await page.locator('.bs-panel').count())
  await page.reload(); await sleep(2500); L.log('after reload', await names())
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
