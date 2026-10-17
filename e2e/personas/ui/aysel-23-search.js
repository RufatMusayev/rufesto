// Explore search as someone who loves Italian: dish and restaurant queries, filters.
const L = require('./aysel-lib')
const step = async (n, fn) => { try { L.log('\n=== ' + n); await fn() } catch (e) { L.log('STEP FAILED', n, String(e.message).split('\n')[0]) } }
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova')
  await A.page.goto(L.CONSUMER + '/explore'); await A.page.waitForTimeout(3000)
  const input = A.page.getByPlaceholder(/Dishes, restaurants/i)
  const read = () => A.page.evaluate(() => [...document.querySelectorAll('main h3, main [class*="name"], main [class*="title"]')].map(e => e.innerText.trim()).filter(Boolean).slice(0, 12))
  for (const q of ['pasta', 'italian', 'tiramisu', 'Tiramisù', 'pizza', 'fincan', 'paste', 'sushi', 'xyzzy']) {
    await step('search: ' + q, async () => {
      await input.fill(''); await input.fill(q)
      const t0 = Date.now()
      await A.page.waitForTimeout(1500)
      const cards = await A.page.evaluate(() => document.querySelectorAll('a[href*="dish="], a[href*="/restaurant/"]').length)
      const txt = (await A.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ')
      const body = await A.page.evaluate(() => document.querySelector('main')?.innerText || document.body.innerText)
      L.log(q.padEnd(10), 'links:', cards, '|', body.split('\n').filter(Boolean).join(' | ').slice(0, 330))
      if (q === 'pasta') await L.shot(A.page, '23-search-pasta')
      if (q === 'xyzzy') await L.shot(A.page, '23-search-empty')
    })
  }
  L.log('errors', A.errors.filter(e => !/ERR_ABORTED/.test(e)))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
