// Re-checks on the live build (index-D9ZRBzZM): Discover Italian chip, join card, promo labels on Home.
const L = require('./aysel-lib')
const step = async (n, fn) => { try { L.log('\n=== ' + n); await fn() } catch (e) { L.log('STEP FAILED', n, String(e.message).split('\n')[0]) } }
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova', { storage: { rufesto_home_tab: 'discover' } })
  await step('Discover Italian chip (live)', async () => {
    await A.page.goto(L.CONSUMER + '/'); await A.page.waitForSelector('.dsc .dsc-rc'); await A.page.waitForTimeout(1200)
    await A.page.getByRole('button', { name: 'Italian', exact: true }).click(); await A.page.waitForTimeout(2500)
    L.log(await A.page.evaluate(() => [...document.querySelectorAll('.dsc section')].map(s => (s.querySelector('h2')?.innerText || '?') + ': ' + [...s.querySelectorAll('h3')].map(h => h.innerText).join(', ')).join('\n')))
  })
  await step('promo labels on Home (live)', async () => {
    await A.page.evaluate(() => localStorage.setItem('rufesto_home_tab', 'home'))
    await A.page.goto(L.CONSUMER + '/'); await A.page.waitForSelector('.soc-feed-slot article'); await A.page.waitForTimeout(1500)
    const promo = A.page.locator('.soc-feed-slot').filter({ hasText: 'Sponsored' }).first()
    await promo.scrollIntoViewIfNeeded(); await A.page.waitForTimeout(600)
    L.log('promo text:', (await promo.innerText()).replace(/\n+/g, ' | '))
    await L.shot(A.page, '37-promo-card')
  })
  await step('join card (live)', async () => {
    await A.page.goto(L.CONSUMER + '/t/FINCAN-CHH7CC'); await A.page.waitForTimeout(2500)
    L.log((await A.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 260))
    await L.shot(A.page, '37-join-card')
    await A.page.getByRole('button', { name: 'Cancel' }).click().catch(() => {})
  })
  L.log('errors', A.errors.filter(e => !/ERR_ABORTED/.test(e)))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
