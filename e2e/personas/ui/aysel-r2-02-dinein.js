// Round 2, part 1: scan table, order, kitchen (KDS) marks ready -> "food is ready" notification on the phone (realtime), inbox in en / az.
const L = require('./aysel-r2-lib')
const fs = require('fs')
const T = process.argv[2] || 'T1'
const STATE = L.path.join(L.OUT, 'state.json')

;(async () => {
  const b = await L.launch()
  const mgr = await L.api('Səid Əhmədov')
  const tables = await mgr.get('tables?restaurant_id=eq.' + L.FINCAN + '&select=id,table_number,state&order=table_number')
  const codes = await mgr.get('table_access_codes?restaurant_id=eq.' + L.FINCAN + '&select=table_id,access_code')
  const tb = tables.find(t => t.table_number === T)
  const code = codes.find(c => c.table_id === tb.id).access_code
  L.log('table', T, 'state', tb.state)
  const A = await L.phone(b, 'Aysel Məmmədova')
  const t00 = Date.now()
  const log = []
  const note = (k, v) => { log.push({ k, v, at: Date.now() - t00 }); L.log('  >>', k, v, '@' + (Date.now() - t00) + 'ms') }

  await L.step('scan + join card', async () => {
    await A.page.goto(L.CONSUMER + '/t/' + code); await A.page.waitForTimeout(2500)
    await L.shot(A.page, '02-join-card')
    note('join card text', (await A.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 300))
    await A.page.getByRole('button', { name: 'Join', exact: true }).click(); await A.page.waitForTimeout(2500)
    await L.shot(A.page, '02-table-empty')
    note('table page text', (await A.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 400))
  })

  await L.step('menu + add two dishes', async () => {
    await A.page.getByRole('link', { name: /Menu|Browse|Add/i }).first().click().catch(() => A.page.goto(L.CONSUMER + '/restaurant/fincan-coffee'))
    await A.page.waitForTimeout(3000)
    note('url / tabs', A.page.url().replace(L.CONSUMER, '') + ' ' + JSON.stringify(await A.page.evaluate(() => [...document.querySelectorAll('[role=tab]')].map(t => t.innerText.trim() + ':' + t.getAttribute('aria-selected')))))
    const adds = A.page.locator('.mn-add')
    note('add buttons', (await adds.count()) + ' first box ' + JSON.stringify(await adds.first().boundingBox()))
    const row = n => A.page.locator('.mn-row').filter({ hasText: n }).first()
    await row('Flat White').scrollIntoViewIfNeeded()
    await row('Flat White').locator('.mn-add').click(); await A.page.waitForTimeout(900)
    note('after first +: sheet open', await A.page.locator('.sheet').count())
    note('after first +: toast', await A.page.evaluate(() => [...document.querySelectorAll('[class*=toast i], [role=status]')].map(e => e.innerText.trim()).filter(Boolean).join(' / ')))
    await L.shot(A.page, '02-after-first-add')
    await row('Butter Croissant').scrollIntoViewIfNeeded()
    await row('Butter Croissant').locator('.mn-add').click({ timeout: 8000 }).then(() => note('second add', 'clicked without closing anything')).catch(() => note('second add', 'BLOCKED'))
    await A.page.waitForTimeout(800)
    note('fab', JSON.stringify(await A.page.evaluate(() => document.querySelector('.cart-fab')?.innerText)))
    await L.shot(A.page, '02-after-second-add')
  })

  await L.step('open cart + place order', async () => {
    if (!(await A.page.locator('.sheet').count())) await A.page.locator('.cart-fab').click({ force: true })
    await A.page.waitForTimeout(700)
    note('cart text', (await A.page.evaluate(() => document.querySelector('.sheet')?.innerText || '')).replace(/\n+/g, ' | ').slice(0, 300))
    await A.page.getByRole('button', { name: /Place order/i }).click()
    await A.page.waitForSelector('.dn-placed-ref', { timeout: 20000 })
    note('order placed', 'ok')
    await L.shot(A.page, '02-placed')
    await A.page.getByRole('button', { name: /Done/i }).click().catch(() => {})
    await A.page.waitForTimeout(2200)
    await L.shot(A.page, '02-push-prompt')
    note('prompt card?', await A.page.evaluate(() => [...document.querySelectorAll('[class*=prompt i], [role=dialog], [role=alert]')].map(e => e.innerText.trim().replace(/\n+/g, ' ')).filter(Boolean).join(' || ').slice(0, 300)))
  })

  // Aysel goes Home so the bell is visible while the kitchen works
  await A.page.goto(L.CONSUMER + '/'); await A.page.waitForSelector('.soc-feed-slot article'); await A.page.waitForTimeout(1500)
  const bell = () => A.page.evaluate(() => { const e = document.querySelector('a[href="/notifications"], button[aria-label*="otification" i]'); return e ? (e.innerText || '').trim() : null })
  note('bell before kitchen', await bell())

  const M = await L.desk(b, 'Səid Əhmədov')
  await L.step('kitchen: start + ready', async () => {
    await M.page.goto(L.RESTO + '/kds'); await M.page.waitForSelector('.kds-advance-btn', { timeout: 30000 })
    await L.shot(M.page, '02-kds-new')
    const btns = M.page.locator('.kds-advance-btn')
    for (let i = 0; i < 6 && await btns.filter({ hasText: /Start/i }).count(); i++) { await btns.filter({ hasText: /Start/i }).first().click(); await M.page.waitForTimeout(600) }
    note('kitchen started', 'both tickets')
    await A.page.waitForTimeout(3500)
    note('bell after Preparing', await bell())
    const tReady = Date.now()
    for (let i = 0; i < 6 && await btns.filter({ hasText: /ready/i }).count(); i++) { await btns.filter({ hasText: /ready/i }).first().click(); await M.page.waitForTimeout(500) }
    note('kitchen marked ready', 'tap done')
    let seenAt = null
    for (let i = 0; i < 40; i++) { const v = await bell(); if (v && /\d/.test(v)) { seenAt = Date.now() - tReady; note('bell shows', v + ' after ' + seenAt + 'ms since the Ready tap'); break } await A.page.waitForTimeout(500) }
    if (seenAt == null) note('bell', 'NO badge within 20 s')
    await L.shot(A.page, '02-bell-after-ready')
    await L.shot(M.page, '02-kds-ready')
  })

  await L.step('inbox (en): food ready', async () => {
    const t0 = Date.now()
    await A.page.locator('a[href="/notifications"], button[aria-label*="otification" i]').first().click()
    await A.page.waitForSelector('.ntf-item, [class*=ntf] li, [class*=ntf-row]', { timeout: 15000 }).catch(() => {})
    await A.page.waitForTimeout(1500)
    note('inbox opened ms', Date.now() - t0)
    await L.shot(A.page, '02-inbox-food-ready')
    note('inbox top', (await A.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 520))
    note('bell after opening inbox', await bell())
  })

  fs.writeFileSync(STATE, JSON.stringify({ table: T, code, log }, null, 1))
  L.log('\nkeep contexts: not closing; saved state')
  L.log('errors A', A.errors.filter(e => !/ERR_ABORTED/.test(e)), 'M', M.errors)
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
