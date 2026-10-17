// Round 2, part 8: Discover (chips, order, duplicates, distance, AZ cuisines), Explore search, promo labels, review cards.
const L = require('./aysel-r2-lib')
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova', { storage: { rufesto_home_tab: 'discover' } })
  const sections = () => A.page.evaluate(() => [...document.querySelectorAll('.dsc section')].map(s => (s.querySelector('h2')?.innerText || '?') + ': ' + [...s.querySelectorAll('h3')].map(h => h.innerText).join(', ')).join('\n'))
  await L.step('Discover default (no location)', async () => {
    await A.page.goto(L.CONSUMER + '/'); await A.page.waitForSelector('.dsc .dsc-rc'); await A.page.waitForTimeout(1500)
    L.log(await sections())
    await L.shot(A.page, '09-discover-top')
  })
  await L.step('Italian chip', async () => {
    await A.page.getByRole('button', { name: /^Italian$/ }).click(); await A.page.waitForTimeout(2500)
    L.log(await sections())
    await L.shot(A.page, '09-discover-italian')
  })
  await L.step('Discover with location (Yasamal)', async () => {
    const G = await L.phone(b, 'Aysel Məmmədova', { geo: { latitude: 40.386, longitude: 49.818 }, storage: { rufesto_home_tab: 'discover' } })
    await G.page.goto(L.CONSUMER + '/'); await G.page.waitForSelector('.dsc .dsc-rc'); await G.page.waitForTimeout(1000)
    await G.page.getByRole('button', { name: 'Use my location for nearby' }).click()
    await G.page.waitForFunction(() => /within/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {})
    await G.page.waitForTimeout(1800)
    L.log(await G.page.evaluate(() => [...document.querySelectorAll('.dsc section')].slice(0, 2).map(s => (s.querySelector('h2')?.innerText || '?') + ': ' + [...s.querySelectorAll('.dsc-rc')].map(c => c.querySelector('h3')?.innerText + ' [' + (c.querySelector('.dsc-rc-meta')?.innerText || '') + ']').join(', ')).join('\n')))
    await L.shot(G.page, '09-discover-geo')
    await G.ctx.close()
  })
  await L.step('Explore search', async () => {
    await A.page.goto(L.CONSUMER + '/explore'); await A.page.waitForTimeout(3000)
    const input = A.page.getByPlaceholder(/Dishes|restaurants|Search/i).first()
    for (const q of ['tiramisu', 'doner', 'sirvan', 'seda ocagi', 'narsarab', 'pasta', 'italian', 'dessert', 'cafe', 'coffee', 'xyzzy']) {
      await input.fill(''); await input.fill(q); await A.page.waitForTimeout(1400)
      const body = await A.page.evaluate(() => document.querySelector('main')?.innerText || document.body.innerText)
      const nothing = /Nothing found/.test(body)
      const names = [...body.matchAll(/AVAILABLE\n([^\n]+)\n([^\n]+)/gi)].map(m => m[1] + ' @ ' + m[2]).slice(0, 4)
      L.log(q.padEnd(11), nothing ? 'NOTHING FOUND' : 'hits: ' + (names.join(' ; ') || body.replace(/\n+/g, ' | ').slice(60, 200)))
      if (q === 'pasta') await L.shot(A.page, '09-search-pasta')
    }
  })
  await L.step('promo card labels + review cards (Friends)', async () => {
    const H = await L.phone(b, 'Aysel Məmmədova')
    await H.page.goto(L.CONSUMER + '/'); await H.page.waitForSelector('.soc-feed-slot article'); await H.page.waitForTimeout(1500)
    const promo = H.page.locator('.soc-feed-slot').filter({ hasText: /Sponsored|PROMOTED|Promoted/ }).first()
    for (let i = 0; i < 25 && !(await promo.count()); i++) { await H.page.evaluate(() => window.scrollBy(0, 1300)); await H.page.waitForTimeout(500) }
    if (await promo.count()) { await promo.scrollIntoViewIfNeeded(); L.log('promo text:', (await promo.innerText()).replace(/\n+/g, ' | ')); await L.shot(H.page, '09-promo') } else L.log('no promo card found in 25 scrolls')
    await H.ctx.close()
  })
  L.log('errors', A.errors.filter(e => !/ERR_ABORTED/.test(e)))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
