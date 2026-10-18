// Search timing with expectations (rows for the NEW query must appear; stale rows of the previous query are counted), plus the Filters sheet.
const L = require('./aysel-r3-lib')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const CASES = [['doner', /Dönər Bakı Express/], ['tiramisu', /Tiramisù/], ['plov', /Plov/], ['pasta', /Pappardelle|Penne|Spaghetti/], ['italian', /Trattoria Bella Roma/], ['dessert', /Tiramisù|Cake|Panna/], ['cafe', /Fincan Coffee|Brew & Books/], ['sushi', /Sakura House|Nigiri/], ['sada ocagi', /Səda Ocağı/], ['narserab', /Narşərab/], ['xyzzy', /No results/]]
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova')
  const page = A.page
  const note = (k, v) => L.log('  >>', k, v)
  await page.goto(L.CONSUMER + '/explore'); await sleep(2500)
  const field = page.getByPlaceholder(/Dishes, places, people/i)
  const results = []
  for (const [q, rx] of CASES) {
    await field.fill(''); await sleep(1200)
    await page.evaluate(() => { window.__s = { t0: performance.now(), samples: [] } })
    const t0 = Date.now()
    await field.fill(q)
    let hit = null; let stale = 0; let skeletonSeen = false; let prevText = ''
    for (let i = 0; i < 120 && hit == null; i++) {
      await sleep(25)
      const s = await page.evaluate(() => ({ text: document.body.innerText, skel: document.querySelectorAll('[class*=skel]').length, rows: document.querySelectorAll('[class*=sr-row]').length }))
      if (s.skel) skeletonSeen = true
      if (rx.test(s.text)) hit = Date.now() - t0
      else if (s.rows) stale++
    }
    results.push(q.padEnd(11) + (hit != null ? hit + ' ms' : 'NOT FOUND in 3 s') + (skeletonSeen ? ' | skeleton shown' : '') + ' | polls showing other rows meanwhile: ' + stale)
  }
  L.log(results.join('\n'))
  await L.step('Filters button and sheet', async () => {
    await field.fill(''); await sleep(800)
    const fb = page.locator('button').filter({ has: page.locator('svg') }).last()
    L.log('buttons near the field:', await page.evaluate(() => [...document.querySelectorAll('button')].slice(0, 6).map(b => (b.getAttribute('aria-label') || b.innerText || '(none)').trim().slice(0, 24) + ' ' + Math.round(b.getBoundingClientRect().width) + 'x' + Math.round(b.getBoundingClientRect().height))))
    await page.locator('button[aria-label*="ilter" i], button[aria-label*="Filtr" i], button[title*="ilter" i]').first().click({ timeout: 5000 }).catch(async () => { await page.evaluate(() => { const bs = [...document.querySelectorAll('button')]; const f = bs.find(b => b.getBoundingClientRect().top < 140 && b.getBoundingClientRect().left > 330); f && f.click() }) })
    await page.waitForSelector('.bs-panel', { timeout: 8000 }).catch(() => {}); await sleep(900)
    await L.shot(page, '13b-filters-sheet')
    note('sheet', (await page.evaluate(() => (document.querySelector('.bs-panel')?.innerText || '(no sheet)'))).replace(/\n+/g, ' | ').slice(0, 360))
    const sheet = page.locator('.bs-panel')
    await sheet.getByRole('button', { name: 'Italian', exact: true }).click().catch(() => note('Italian chip', 'not found'))
    await sheet.getByRole('button', { name: /Show results|Show/i }).first().click(); await sleep(2800)
    await L.shot(page, '13b-filter-italian')
    note('Italian only: url', page.url().replace(L.CONSUMER, ''))
    note('Italian only: text', (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 420))
    // open now on top
    await page.locator('button[aria-label*="ilter" i]').first().click().catch(() => page.evaluate(() => { const bs = [...document.querySelectorAll('button')]; const f = bs.find(b => b.getBoundingClientRect().top < 140 && b.getBoundingClientRect().left > 330); f && f.click() }))
    await page.waitForSelector('.bs-panel'); await sleep(700)
    const sw = page.locator('.bs-panel').getByRole('switch').or(page.locator('.bs-panel input[type=checkbox]')).first()
    await sw.click({ force: true }); await sleep(200)
    await page.locator('.bs-panel').getByRole('button', { name: /Show/i }).first().click(); await sleep(2800)
    note('Italian + Open now (all venues closed)', (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 300))
    await L.shot(page, '13b-filter-open-italian')
    note('active chips', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => /✕|×|Remove/.test(b.innerText + (b.getAttribute('aria-label') || ''))).map(b => (b.getAttribute('aria-label') || b.innerText).trim().slice(0, 30)))))
  })
  L.log('errors', A.errors.filter(e => !/ERR_ABORTED/.test(e)))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
