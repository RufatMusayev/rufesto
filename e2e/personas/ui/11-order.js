'use strict'
// Live service, step 2: Rauf (already seated at the table by 10-scan.js) reloads, opens his table, orders 2 dishes.
// Watchers: Tural on /kds (tablet), Leyla on / (overview), both left open so realtime latency can be measured.
const C = require('./common')
const DISHES = (process.env.DISHES || 'Spaghetti alla Carbonara,Panna Cotta al Limone').split(',')

;(async () => {
  const browser = await C.launch()
  const sink = []
  const R = await C.open(browser, 'rauf', { who: 'Rauf', geo: true, sink })
  const T = await C.open(browser, 'tural', { who: 'Tural', sink })
  const L = await C.open(browser, 'leyla', { who: 'Leyla', sink })
  const rp = R.page
  // watchers first
  sink.stage = 'watchers'
  await T.page.goto(C.RESTO + '/kds'); await T.page.getByText(/active/i).first().waitFor({ timeout: 20_000 }); await T.page.waitForTimeout(800)
  await L.page.goto(C.RESTO + '/'); await L.page.getByText('Recent orders', { exact: false }).first().waitFor({ timeout: 20_000 })
  const ov = async () => { const t = await C.text(L.page, '.dash-content'); const m = t.split('\n'); return { revenue: m[m.indexOf('Revenue') - 1], orders: m[m.indexOf('Orders Today') - 1], tables: m[m.indexOf('Active Tables') - 1] } }
  console.log('overview before order:', JSON.stringify(await ov()))
  await C.shot(T.page, '50-kds-empty', { full: false })

  // Rauf reloads after the crashed scanner: is he at the table?
  sink.stage = 'rauf-reload'
  let t0 = Date.now()
  await rp.goto(C.CONSUMER + '/', { waitUntil: 'domcontentloaded' })
  await rp.getByRole('button', { name: 'Active table' }).waitFor({ timeout: 15_000 }).catch(() => console.log('NO "Active table" button after reload'))
  C.timing('rauf: reload after scan -> app usable with active table', Date.now() - t0)
  await C.shot(rp, '51-rauf-home-seated', { full: false })
  await rp.goto(C.CONSUMER + '/table'); await rp.waitForTimeout(2500)
  await C.shot(rp, '52-rauf-table-page')
  console.log('/table text:', (await C.text(rp)).slice(0, 600).replace(/\n+/g, ' | '))

  // order: Add More Items -> restaurant page
  sink.stage = 'order'
  await rp.getByRole('link', { name: /Add More Items|Order|Menu/i }).first().click()
  await rp.locator('.menu-card').first().waitFor({ timeout: 15_000 })
  for (const name of DISHES) {
    await rp.locator('.menu-card', { hasText: name }).first().click()
    const add = rp.getByRole('button', { name: /^Add to Order/ })
    await add.waitFor({ timeout: 8000 })
    if (name === DISHES[0]) await C.shot(rp, '53-rauf-dish-sheet', { full: false })
    await add.click()
    await rp.waitForTimeout(900)
    await C.shot(rp, '53b-after-add-' + name.split(' ')[0], { full: false })
    if (await rp.locator('.overlay').count()) { console.log('overlay still open after Add to Order for', name, '->', (await rp.locator('.overlay').first().innerText()).replace(/\n+/g, ' | ').slice(0, 160)); if (name !== DISHES[DISHES.length - 1]) { await rp.keyboard.press('Escape'); await rp.waitForTimeout(600) } }
  }
  const place = rp.getByRole('button', { name: /^Place Order/ })
  if (!(await place.isVisible({ timeout: 3000 }).catch(() => false))) await rp.getByRole('button', { name: 'Open cart' }).click()
  await place.waitFor({ timeout: 8000 })
  await C.shot(rp, '54-rauf-cart', { full: false })
  const before = await ov()
  const tNew = []
  const watchKds = T.page.waitForFunction(n => document.querySelectorAll('.kds-ticket').length >= n, DISHES.length, { timeout: 20_000, polling: 100 }).then(() => Date.now())
  const watchOv = L.page.waitForFunction(b => { const t = document.querySelector('.dash-content').innerText.split('\n'); return t[t.indexOf('Orders Today') - 1] !== b }, before.orders, { timeout: 20_000, polling: 100 }).then(() => Date.now()).catch(() => null)
  const placed = rp.waitForResponse(r => /rpc\/place_order/.test(r.url()), { timeout: 20_000 })
  t0 = Date.now()
  await place.click()
  const res = await placed
  C.timing('rauf: Place Order -> place_order answered', Date.now() - t0, 'status ' + res.status())
  const tk = await watchKds.catch(() => null)
  C.timing('order placed -> tickets on Tural /kds (no reload)', tk ? tk - t0 : 20_000, tk ? '' : 'NOT SEEN')
  const to = await watchOv
  C.timing('order placed -> Leyla overview Orders Today changes (no reload)', to ? to - t0 : 20_000, to ? '' : 'NOT SEEN')
  await rp.waitForTimeout(1500)
  await C.shot(rp, '55-rauf-order-placed', { full: false })
  await C.shot(T.page, '56-kds-two-tickets', { full: false })
  await L.page.waitForTimeout(1500)
  console.log('overview after order (still unpaid):', JSON.stringify(await ov()))
  await C.shot(L.page, '57-leyla-overview-live')
  console.log('KDS text:', (await C.text(T.page, '.kds-board')).replace(/\n+/g, ' | ').slice(0, 500))
  console.log('problems:', JSON.stringify(sink.map(s => `${s.stage} ${s.who} ${s.kind} ${s.text}`), null, 1))
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
