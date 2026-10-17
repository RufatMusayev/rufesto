// Round 2, part 2: tap "food is ready" (where does it land?), Azerbaijani text, waiter serves from the Waiter page.
const L = require('./aysel-r2-lib')
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova')
  const api = await L.api('Aysel Məmmədova')
  await L.step('inbox -> tap the food-ready item', async () => {
    await A.page.goto(L.CONSUMER + '/notifications'); await A.page.waitForTimeout(3000)
    const row = A.page.locator('.ntf-item, [class*=ntf-row], li').filter({ hasText: 'Your food is ready' }).first()
    L.log('row found', await row.count(), '| row html tag', await row.evaluate(e => e.tagName + '.' + e.className).catch(() => '?'))
    const box = await row.boundingBox(); L.log('row box', JSON.stringify(box))
    await row.click(); await A.page.waitForTimeout(2200)
    L.log('landed on', A.page.url().replace(L.CONSUMER, ''))
    await L.shot(A.page, '03-after-tap-food-ready')
    L.log((await A.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 420))
    // is it now read?
    await A.page.goBack(); await A.page.waitForTimeout(1500)
    L.log('after back, food-ready row text:', (await A.page.locator('.ntf-item, [class*=ntf-row], li').filter({ hasText: 'Your food is ready' }).first().innerText().catch(() => '')).replace(/\n+/g, ' | '))
    L.log('header count:', (await A.page.evaluate(() => document.body.innerText)).match(/Notifications\s*\n?\s*(\d+)/)?.[1])
  })
  await L.step('az text', async () => {
    await A.page.getByRole('button', { name: 'AZ' }).click(); await A.page.waitForTimeout(2000)
    await L.shot(A.page, '03-inbox-az')
    L.log((await A.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 1100))
    L.log('lang stored', await A.page.evaluate(() => localStorage.getItem('rufesto_lang')), '| html lang', await A.page.evaluate(() => document.documentElement.lang))
  })
  await L.step('settings az', async () => {
    await A.page.goto(L.CONSUMER + '/settings/notifications'); await A.page.waitForTimeout(2500)
    await L.shot(A.page, '03-settings-az')
    L.log((await A.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 900))
  })
  // waiter serves
  const W = await L.desk(b, 'Ülviyyə Kazımova')
  await L.step('waiter: take table, serve from My tables', async () => {
    await W.page.goto(L.RESTO + '/waiter'); await W.page.waitForTimeout(3500)
    await L.shot(W.page, '03-waiter-calls')
    L.log('waiter page:', (await W.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 500))
    await W.page.getByRole('button', { name: /All tables/i }).click(); await W.page.waitForTimeout(900)
    await L.shot(W.page, '03-waiter-all')
    L.log('ALL:', (await W.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(250, 700))
    const take = W.page.getByRole('button', { name: /Take Table/i }).first()
    if (await take.count()) { await take.click(); await W.page.waitForTimeout(1500) }
    await W.page.getByRole('button', { name: /My tables/i }).click(); await W.page.waitForTimeout(1500)
    await L.shot(W.page, '03-waiter-mine')
    L.log('MINE:', (await W.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(250, 800))
    L.log('buttons', await W.page.evaluate(() => [...document.querySelectorAll('button')].filter(e => e.offsetParent).map(e => e.innerText.trim()).filter(Boolean)))
    const serve = W.page.getByRole('button', { name: /Mark served|Serve/i }).first()
    if (await serve.count()) { const t0 = Date.now(); await serve.click(); await W.page.waitForTimeout(1500); L.log('served tap ok'); await L.shot(W.page, '03-waiter-served') }
    await A.page.goto(L.CONSUMER + '/table'); await A.page.waitForTimeout(2500)
    L.log('Aysel table page status:', (await A.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').match(/(Placed|Preparing|Ready|Served)/g))
  })
  L.log('errors', A.errors.filter(e => !/ERR_ABORTED/.test(e)), W.errors)
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
