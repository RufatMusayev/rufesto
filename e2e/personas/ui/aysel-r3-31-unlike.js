const L = require('./aysel-r3-lib')
const sleep = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova'); const page = A.page
  await page.goto(L.CONSUMER + '/post/9158be4f-7850-4c59-ab0a-06ffa7eb78d6'); await sleep(3000)
  L.log('page text:', (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 260))
  L.log('buttons:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('button[aria-pressed]')].map(b => b.getAttribute('aria-label') + ':' + b.getAttribute('aria-pressed')))))
  await L.shot(page, '31-post-9158')
  const rm = page.locator('button[aria-pressed="true"]').first()
  if (await rm.count()) { await rm.click(); await sleep(1000); L.log('clicked pressed button; now:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('button[aria-pressed]')].map(b => b.getAttribute('aria-label') + ':' + b.getAttribute('aria-pressed'))))) }
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
