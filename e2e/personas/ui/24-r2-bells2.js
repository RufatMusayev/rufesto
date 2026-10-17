'use strict'
// Round 2, part 2 of the bell cycle (state left by 23-r2-bells.js: Rauf seated at T2, order served, Orxan holds the table).
// Second waiter call (cutlery), bill request at reception, Leyla settles from the page the bell opens, Rauf's review.
// Orxan and Leyla keep their pages open; badge changes are measured without a reload. Rows are matched on "T2"
// because other agents are creating bookings, bill requests and low-stock events at Bella Roma at the same time.
const C = require('./common')

const badgeOf = async page => {
  const b = page.getByRole('button', { name: /^Notifications/ }).first()
  if (!(await b.count())) return null
  const m = ((await b.getAttribute('aria-label')) || '').match(/(\d+) new/)
  return m ? Number(m[1]) : 0
}
async function until(label, t0, fn, max = 20_000) {
  while (Date.now() - t0 < max) { let v; try { v = await fn() } catch { v = false } if (v) { C.timing(label, Date.now() - t0); return Date.now() - t0 }; await C.sleep(100) }
  C.timing(label, max, 'NOT SEEN in ' + max / 1000 + ' s'); return null
}
const panelRows = page => page.locator('.notif-item').evaluateAll(els => els.map(e => ({ title: e.querySelector('.notif-item-title')?.innerText, count: e.querySelector('.notif-count')?.innerText || '', detail: e.querySelector('.notif-detail')?.innerText || '', time: e.querySelector('.notif-time')?.innerText || '', unread: e.classList.contains('is-unread') })))
async function openPanel(page) {
  await page.getByRole('button', { name: /^Notifications/ }).first().click()
  await page.locator('.notif-panel').waitFor({ timeout: 8000 })
}
const closePanel = page => page.locator('.notif-panel .modal-close').click().catch(() => {})
async function waitRow(page, re, max = 8000) {
  const t0 = Date.now()
  while (Date.now() - t0 < max) { const rows = await panelRows(page); const r = rows.find(x => re.test(x.title + ' ' + x.detail)); if (r) return { ms: Date.now() - t0, row: r, top: rows.slice(0, 3) }; await C.sleep(100) }
  return { ms: null, row: null, top: (await panelRows(page)).slice(0, 3) }
}

;(async () => {
  const browser = await C.launch()
  const sink = []
  const [O, L, R] = await Promise.all([C.open(browser, 'orxan', { who: 'Orxan', sink }), C.open(browser, 'leyla', { who: 'Leyla', sink }), C.open(browser, 'rauf', { who: 'Rauf', geo: true, sink })])
  const op = O.page, lp = L.page, rp = R.page
  sink.stage = 'setup'
  await Promise.all([op.goto(C.RESTO + '/waiter'), lp.goto(C.RESTO + '/'), rp.goto(C.CONSUMER + '/table')])
  await rp.getByRole('heading', { name: 'Your Table' }).waitFor({ timeout: 20_000 })
  await lp.getByText('Recent orders', { exact: false }).first().waitFor({ timeout: 20_000 })
  await op.getByRole('button', { name: /^Calls/ }).waitFor({ timeout: 20_000 })
  for (const p of [lp, op]) { await openPanel(p); await p.waitForTimeout(1500); await p.getByRole('button', { name: 'Mark all read' }).click().catch(() => {}); await p.waitForTimeout(500); await closePanel(p); await p.waitForTimeout(300) }
  console.log('bells after reset: Leyla', await badgeOf(lp), '| Orxan', await badgeOf(op))

  // ---- second call (cutlery); the first (water) is still open on Orxan's Calls tab
  sink.stage = 'call-2'
  console.log('Rauf call button:', await rp.locator('.table-call-btn').innerText())
  const bO = await badgeOf(op), bL = await badgeOf(lp)
  await rp.locator('.table-call-btn').click(); await rp.waitForTimeout(400)
  let t0 = Date.now()
  await rp.getByRole('button', { name: /Cutlery/i }).first().click()
  await until('R2 call 2 (cutlery) -> Orxan bell badge +1', t0, async () => (await badgeOf(op)) > bO)
  await until('R2 call 2 (cutlery) -> Leyla bell badge +1', t0, async () => (await badgeOf(lp)) > bL)
  console.log('bells: Orxan', await badgeOf(op), '| Leyla', await badgeOf(lp))
  await C.shot(op, 'r2-50-orxan-bell-call2', { full: false })
  await openPanel(op)
  const first = (await panelRows(op)).slice(0, 2)
  const found = await waitRow(op, /Table T2.*Waiter called/i)
  console.log('Orxan panel: rows at open', JSON.stringify(first), '| T2 call row after', found.ms, 'ms ->', JSON.stringify(found.row))
  C.timing('R2 Orxan opens panel -> T2 "Waiter called" row visible', found.ms ?? 8000, found.ms === null ? 'NOT SEEN' : '')
  await C.shot(op, 'r2-51-orxan-panel-call2', { full: false })
  await op.locator('.notif-item', { hasText: /T2/ }).filter({ hasText: /Waiter called/ }).first().click()
  await op.waitForTimeout(1200)
  console.log('Orxan taps the T2 call ->', op.url())
  await C.shot(op, 'r2-52-orxan-after-tap', { full: false })
  await openPanel(lp)
  await waitRow(lp, /Table T2.*Waiter called/i)
  console.log('Leyla panel T2 rows:', JSON.stringify((await panelRows(lp)).filter(r => /T2/.test(r.title)).slice(0, 3)))
  await C.shot(lp, 'r2-53-leyla-panel-calls', { full: false }); await closePanel(lp)

  // ---- bill at reception
  sink.stage = 'bill'
  const bO2 = await badgeOf(op), bL2 = await badgeOf(lp)
  await rp.getByRole('link', { name: /^View bill/ }).click()
  await rp.getByRole('heading', { name: 'Payment method' }).waitFor({ timeout: 20_000 })
  await C.shot(rp, 'r2-54-rauf-bill', { full: false })
  await rp.getByRole('radio', { name: /Pay at reception/ }).click()
  t0 = Date.now()
  await rp.getByRole('button', { name: /^Notify staff/ }).click()
  await rp.getByText('Staff notified').waitFor({ timeout: 15_000 })
  C.timing('R2 Notify staff -> "Staff notified" on Rauf', Date.now() - t0)
  await until('R2 Rauf asks for the bill -> Orxan bell badge +1', t0, async () => (await badgeOf(op)) > bO2)
  await until('R2 Rauf asks for the bill -> Leyla bell badge +1', t0, async () => (await badgeOf(lp)) > bL2)
  await C.shot(lp, 'r2-55-leyla-bell-bill', { full: false })
  await openPanel(lp)
  const lb = await waitRow(lp, /Table T2.*Bill requested/i)
  console.log('Leyla panel T2 bill row:', lb.ms, 'ms', JSON.stringify(lb.row))
  await C.shot(lp, 'r2-56-leyla-panel-bill', { full: false })
  await lp.locator('.notif-item', { hasText: /T2/ }).filter({ hasText: /Bill requested/ }).first().click()
  await lp.waitForTimeout(1500)
  console.log('Leyla taps the T2 bill ->', lp.url())
  await C.shot(lp, 'r2-57-leyla-bills-from-bell')
  await openPanel(op)
  const ob = await waitRow(op, /Table T2.*Bill requested/i)
  console.log('Orxan panel T2 bill row:', ob.ms, 'ms', JSON.stringify(ob.row))
  await C.shot(op, 'r2-58-orxan-panel-bill', { full: false })
  await op.locator('.notif-item', { hasText: /T2/ }).filter({ hasText: /Bill requested/ }).first().click()
  await op.waitForTimeout(1200)
  console.log('Orxan taps the T2 bill ->', op.url())
  await C.shot(op, 'r2-59-orxan-after-bill-tap', { full: false })

  // ---- Leyla settles from the page the bell opened
  sink.stage = 'settle'
  await lp.getByRole('heading', { name: 'Bills', exact: true }).waitFor()
  await lp.waitForTimeout(800)
  console.log('bills (bell link):', (await C.text(lp, '.dash-content')).split('\n').join(' | ').slice(0, 330))
  console.log('bill card buttons:', JSON.stringify(await lp.locator('.v2-bill-list button').allInnerTexts()))
  t0 = Date.now()
  await lp.locator('.v2-bill-list').getByRole('button', { name: /Mark whole bill paid|Mark paid|Settle/i }).first().click()
  const dlg = lp.getByRole('dialog')
  if (await dlg.count()) { await C.shot(lp, 'r2-60-leyla-confirm', { full: false }); await dlg.getByRole('button', { name: /Mark whole bill paid|Mark paid|Confirm|Settle/i }).last().click() }
  await until('R2 Leyla settles -> Rauf sees Settled', t0, async () => /Payment received|Bill settled|Settled/.test(await C.text(rp)))
  await rp.waitForTimeout(1200)
  await C.shot(rp, 'r2-61-rauf-settled', { full: false })

  // ---- review after paying
  sink.stage = 'review'
  const bL3 = await badgeOf(lp)
  await rp.getByText('How was your meal?').waitFor({ timeout: 10_000 })
  await rp.getByRole('radio', { name: /Rate Spaghetti alla Carbonara: 5 of 5/ }).click()
  await rp.getByPlaceholder(/Add a comment/).fill('Carbonara just like in Rome. Fast service, thank you Orxan.')
  await C.shot(rp, 'r2-62-rauf-review-form', { full: false })
  t0 = Date.now()
  await rp.getByRole('button', { name: 'Send review' }).click()
  await rp.getByText('Thanks for your review!').waitFor({ timeout: 15_000 })
  C.timing('R2 Send review -> thanks on Rauf', Date.now() - t0)
  await until('R2 Rauf reviews a dish -> Leyla bell badge +1', t0, async () => (await badgeOf(lp)) > bL3)
  await lp.goto(C.RESTO + '/'); await lp.getByText('Recent orders', { exact: false }).first().waitFor()
  await openPanel(lp)
  const lr = await waitRow(lp, /New review.*Carbonara/i)
  console.log('Leyla panel review row:', lr.ms, 'ms', JSON.stringify(lr.row), '| top3', JSON.stringify(lr.top))
  await C.shot(lp, 'r2-63-leyla-panel-review', { full: false })
  await lp.locator('.notif-item', { hasText: /New review/ }).filter({ hasText: /Carbonara/ }).first().click()
  await lp.waitForTimeout(1500)
  console.log('Leyla taps "New review" ->', lp.url())
  await C.shot(lp, 'r2-64-leyla-menu-from-bell', { full: false })
  console.log('problems:', JSON.stringify(sink.map(s => s.stage + ' ' + s.who + ' ' + s.kind + ' ' + s.text).filter(s => !/ERR_ABORTED/.test(s)), null, 1))
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
