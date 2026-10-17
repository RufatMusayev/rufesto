const L = require('./aysel-lib')
const step = async (n, fn) => { try { L.log('\n=== ' + n); await fn() } catch (e) { L.log('STEP FAILED', n, String(e.message).split('\n')[0]) } }
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova')
  await A.page.goto(L.CONSUMER + '/table'); await A.page.waitForTimeout(2500)
  const t00 = Date.now()
  const seen = []
  const statusNow = () => A.page.evaluate(() => { const t = document.body.innerText; const m = t.match(/Order #\d+[\s\S]{0,40}?(Placed|Preparing|Ready|Served|Cooking|In progress|Submitted)/); return m ? m[1] : (t.match(/\b(Placed|Preparing|Ready|Served)\b/) || [])[1] || '?' })
  const poll = setInterval(async () => { try { const s = await statusNow(); if (!seen.length || seen[seen.length - 1].s !== s) { seen.push({ s, at: Date.now() - t00 }); L.log('  [aysel sees]', s, '@', Date.now() - t00, 'ms') } } catch {} }, 400)
  const M = await L.desk(b, 'Səid Əhmədov')
  await step('manager opens KDS', async () => {
    const t0 = Date.now()
    await M.page.goto(L.RESTO + '/kds'); await M.page.waitForSelector('.kds-advance-btn', { timeout: 30000 })
    L.log('kds ready ms', Date.now() - t0)
    await L.shot(M.page, '10-kds-new')
    L.log((await M.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 600))
  })
  const tickets = () => M.page.locator('.kds-advance-btn')
  await step('start preparing all', async () => {
    const mark = Date.now() - t00
    for (let i = 0; i < 6 && await tickets().filter({ hasText: /Start/i }).count(); i++) { await tickets().filter({ hasText: /Start/i }).first().click(); await M.page.waitForTimeout(700) }
    L.log('started at', mark, 'ms')
    await L.shot(M.page, '10-kds-preparing')
    await A.page.waitForTimeout(2500)
    await L.shot(A.page, '10-aysel-preparing')
  })
  await step('mark ready', async () => {
    await M.page.waitForTimeout(3000)
    for (let i = 0; i < 6 && await tickets().filter({ hasText: /ready/i }).count(); i++) { await tickets().filter({ hasText: /ready/i }).first().click(); await M.page.waitForTimeout(700) }
    await L.shot(M.page, '10-kds-ready')
    await A.page.waitForTimeout(2500)
    await L.shot(A.page, '10-aysel-ready')
  })
  await step('done', async () => {
    for (let i = 0; i < 6 && await tickets().filter({ hasText: /Done/i }).count(); i++) { await tickets().filter({ hasText: /Done/i }).first().click(); await M.page.waitForTimeout(700) }
    await L.shot(M.page, '10-kds-done')
    await A.page.waitForTimeout(2500)
    await L.shot(A.page, '10-aysel-after-done')
    L.log('aysel table text:', (await A.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(150, 700))
  })
  await step('manager orders page: mark served', async () => {
    await M.page.goto(L.RESTO + '/orders'); await M.page.waitForTimeout(3000)
    await L.shot(M.page, '10-orders')
    L.log((await M.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 700))
    const served = M.page.getByRole('button', { name: /Mark served/i })
    L.log('served buttons', await served.count())
    if (await served.count()) { await served.first().click(); await M.page.waitForTimeout(1500); await L.shot(M.page, '10-orders-served') }
    await A.page.waitForTimeout(2500)
    await L.shot(A.page, '10-aysel-served')
  })
  clearInterval(poll)
  L.log('timeline', JSON.stringify(seen))
  L.log('aysel errors', A.errors, 'mgr errors', M.errors)
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
