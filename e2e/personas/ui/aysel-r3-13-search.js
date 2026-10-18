// Round 3, part 9: Search tab against §3 of the plan: zero state, typing speed, queries, rows per screen, filters, recent searches, people, back restore, no results.
const L = require('./aysel-r3-lib')
const sleep = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova')
  const page = A.page
  const note = (k, v) => L.log('  >>', k, v)
  const field = () => page.getByPlaceholder(/Dishes, places, people/i)
  const rowsInfo = () => page.evaluate(() => {
    const vh = innerHeight
    const heads = [...document.querySelectorAll('h2, h3')].map(h => h.innerText.trim()).filter(t => t.length < 25)
    const rows = [...document.querySelectorAll('[class*=sr-row], [class*=sr-dish], [class*=sr-place], [class*=sr-person]')]
    return { heads, n: rows.length, classes: [...new Set(rows.map(r => r.className.split(' ')[0]))].slice(0, 6) }
  })
  await L.step('zero state', async () => {
    await page.goto(L.CONSUMER + '/explore'); await sleep(2500)
    note('classes / headings', JSON.stringify(await rowsInfo()))
    note('zero-state headings in order', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('h2')].map(h => h.innerText.trim()))))
    note('dish rows visible in the first viewport', await page.evaluate(() => { const vh = innerHeight; return [...document.querySelectorAll('[class*=sr-dish], [class*=sr-row]')].filter(r => { const q = r.getBoundingClientRect(); return q.top >= 0 && q.bottom <= vh && q.height > 40 && q.height < 90 }).length }))
    note('trending row height', await page.evaluate(() => { const r = document.querySelector('[class*=sr-dish], [class*=sr-row]'); return r ? Math.round(r.getBoundingClientRect().height) : null }))
  })
  await L.step('typing speed (keystroke -> first row, -> server rows)', async () => {
    const f = field(); await f.click()
    const t0 = Date.now(); await f.pressSequentially('dön', { delay: 60 })
    let first = null, settled = null
    for (let i = 0; i < 100; i++) { await sleep(40); const info = await page.evaluate(() => ({ rows: document.querySelectorAll('[class*=sr-dish], [class*=sr-place], [class*=sr-row]').length, skel: document.querySelectorAll('[class*=skel]').length, text: document.body.innerText.slice(0, 400) })); if (info.rows && first == null) first = Date.now() - t0; if (info.rows && /Dönər Bakı Express/.test(info.text) && info.skel === 0) { settled = Date.now() - t0; break } }
    note('first rows after the last key', first != null ? (first - 180) + ' ms' : 'none', ) ; note('Dönər Bakı Express row settled', settled != null ? (settled - 180) + ' ms after the last key' : 'never')
    await L.shot(page, '13-search-dön')
    note('results text', (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 520))
    note('tabs', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('[role=tab]')].map(t => t.innerText.trim() + ':' + t.getAttribute('aria-selected')))))
  })
  const queries = ['sada ocagi', 'doner', 'tiramisu', 'plov', 'pasta', 'italian', 'dessert', 'cafe', 'sushi', 'xyzzy']
  await L.step('query set', async () => {
    for (const q of queries) {
      const f = field(); await f.fill(''); await sleep(700)
      const t0 = Date.now(); await f.fill(q)
      let state = null
      for (let i = 0; i < 100 && !state; i++) { await sleep(50); state = await page.evaluate(() => { const t = document.body.innerText; if (/No results/.test(t)) return { none: true }; const n = document.querySelectorAll('[class*=sr-dish], [class*=sr-place], [class*=sr-row]').length; const skel = document.querySelectorAll('[class*=skel]').length; return n && !skel ? { n, head: [...document.querySelectorAll('h2, h3')].map(h => h.innerText.trim()).filter(x => x.length < 20).join('/'), first: (document.querySelector('[class*=sr-dish], [class*=sr-place], [class*=sr-row]')?.innerText || '').replace(/\n+/g, ' / ').slice(0, 50) } : null }) }
      await sleep(500)
      const again = await page.evaluate(() => ({ n: document.querySelectorAll('[class*=sr-dish], [class*=sr-place], [class*=sr-row]').length, first: (document.querySelector('[class*=sr-dish], [class*=sr-place], [class*=sr-row]')?.innerText || '').replace(/\n+/g, ' / ').slice(0, 50), none: /No results/.test(document.body.innerText) }))
      L.log(q.padEnd(11), (Date.now() - t0 - 500) + 'ms', state ? JSON.stringify(state) : 'no state', '| settled:', JSON.stringify(again))
    }
  })
  await L.step('rows per screen: "coffee"', async () => {
    const f = field(); await f.fill(''); await sleep(500); await f.fill('coffee'); await sleep(2500)
    await page.getByRole('tab', { name: 'Dishes' }).click(); await sleep(1500)
    await L.shot(page, '13-dishes-coffee')
    note('dish rows fully visible on one screen', await page.evaluate(() => { const vh = innerHeight - 80; return [...document.querySelectorAll('[class*=sr-dish], [class*=sr-row]')].filter(r => { const q = r.getBoundingClientRect(); return q.top >= 60 && q.bottom <= vh && q.height > 40 && q.height < 100 }).length }))
    note('first dish row', await page.evaluate(() => { const r = document.querySelector('[class*=sr-dish], [class*=sr-row]'); return r ? Math.round(r.getBoundingClientRect().height) + 'px ' + r.innerText.replace(/\n+/g, ' / ').slice(0, 70) : null }))
  })
  await L.step('Filters sheet: Italian + Open now', async () => {
    const f = field(); await f.fill(''); await sleep(500)
    await page.getByRole('button', { name: /Filters/i }).click(); await page.waitForSelector('.bs-panel'); await sleep(900)
    await L.shot(page, '13-filters-sheet')
    note('sheet text', (await page.evaluate(() => document.querySelector('.bs-panel').innerText)).replace(/\n+/g, ' | ').slice(0, 330))
    await page.locator('.bs-panel').getByRole('button', { name: 'Italian', exact: true }).click(); await sleep(300)
    await page.locator('.bs-panel').getByRole('button', { name: /Show results/i }).click(); await sleep(2500)
    await L.shot(page, '13-filter-italian')
    note('after Italian: url', page.url().replace(L.CONSUMER, ''))
    note('after Italian: active chips', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('[class*=sr-chip], [class*=active-filter] button, [class*=filter-chip]')].map(c => c.innerText.trim()))))
    note('after Italian: places/dishes', (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 420))
    // open-now: all venues are closed at this hour
    await page.getByRole('button', { name: /Filters/i }).click(); await page.waitForSelector('.bs-panel'); await sleep(700)
    await page.locator('.bs-panel').getByRole('switch').or(page.locator('.bs-panel input[type=checkbox]')).first().click({ force: true }); await sleep(200)
    await page.locator('.bs-panel').getByRole('button', { name: /Show results/i }).click(); await sleep(2500)
    note('Italian + Open now (everything is closed now)', (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 300))
    await L.shot(page, '13-filter-open-italian')
    const x = page.locator('[class*=sr-chip] button, [aria-label*="Remove" i]').first()
    note('chip remove control', await x.count())
  })
  await L.step('recent searches and Back restore', async () => {
    await page.goto(L.CONSUMER + '/explore'); await sleep(2000)
    const f = field(); await f.fill('Bella'); await sleep(2500)
    const place = page.locator('[class*=sr-place], [class*=sr-row]').filter({ hasText: 'Bella Roma' }).first()
    await place.click(); await sleep(2500)
    note('opened', page.url().replace(L.CONSUMER, ''))
    await page.goBack(); await sleep(1800)
    note('Back -> field value', JSON.stringify(await field().inputValue()), '| url', page.url().replace(L.CONSUMER, ''))
    await f.fill(''); await page.keyboard.press('Escape'); await page.goto(L.CONSUMER + '/explore'); await sleep(2000)
    note('zero state after a search: headings', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('h2')].map(h => h.innerText.trim()))))
    await L.shot(page, '13-recent')
  })
  await L.step('People tab with 2 letters, remembered old tab', async () => {
    const f = field(); await f.fill('ay'); await sleep(1800)
    await page.getByRole('tab', { name: 'People' }).click(); await sleep(1200)
    note('People with 2 letters', (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(60, 240))
    await page.evaluate(() => localStorage.setItem('rufesto_home_tab', 'discover')); await page.goto(L.CONSUMER + '/'); await sleep(2500)
    note('old remembered tab "discover" lands on', page.url().replace(L.CONSUMER, ''))
  })
  await L.step('signed out: People tab', async () => {
    const G = await L.phone(b, null)
    await G.page.goto(L.CONSUMER + '/explore'); await sleep(2500)
    await G.page.getByPlaceholder(/Dishes, places, people/i).fill('aysel'); await sleep(2500)
    note('signed-out tabs', JSON.stringify(await G.page.evaluate(() => [...document.querySelectorAll('[role=tab]')].map(t => t.innerText.trim()))))
    await G.ctx.close()
  })
  L.log('errors', A.errors.filter(e => !/ERR_ABORTED/.test(e)))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
