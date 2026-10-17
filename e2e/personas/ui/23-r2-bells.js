'use strict'
// Round 2, live service with the staff bell (Rauf already seated at T2 by 22-r2-scan.js):
// order 2 dishes with the "+" buttons, call the waiter twice (water, then cutlery after the 2-minute cooldown: grouping),
// kitchen (T2 tickets only: other agents leave tickets on the board), Orxan marks served from My Tables,
// Rauf asks for the bill at reception (Notify staff), Leyla settles from /bills, Rauf reviews a dish after paying.
// Orxan and Leyla keep their pages open the whole time; every badge change is measured without a reload.
const C = require('./common')
const TABLE = process.env.TABLE || 'T2'

const flat = async (page, sel) => (await C.text(page, sel)).split('\n').join(' | ')
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
async function openPanel(page) {
  await page.getByRole('button', { name: /^Notifications/ }).first().click()
  await page.locator('.notif-panel').waitFor({ timeout: 8000 })
  await page.locator('.notif-skeleton').waitFor({ state: 'detached', timeout: 6000 }).catch(() => {})
  await page.waitForTimeout(400)
  return page.locator('.notif-item').evaluateAll(els => els.map(e => ({ title: e.querySelector('.notif-item-title')?.innerText, count: e.querySelector('.notif-count')?.innerText || '', detail: e.querySelector('.notif-detail')?.innerText || '', unread: e.classList.contains('is-unread') })))
}
const closePanel = page => page.locator('.notif-panel .modal-close').click().catch(() => {})

;(async () => {
  const browser = await C.launch()
  const sink = []
  const [O, T, L, R] = await Promise.all([
    C.open(browser, 'orxan', { who: 'Orxan', sink }), C.open(browser, 'tural', { who: 'Tural', sink }),
    C.open(browser, 'leyla', { who: 'Leyla', sink }), C.open(browser, 'rauf', { who: 'Rauf', geo: true, sink })])
  const op = O.page, tp = T.page, lp = L.page, rp = R.page
  const [tbl] = await L.api.rows(`tables?restaurant_id=eq.${C.BELLA}&table_number=eq.${TABLE}&select=id,state`)
  console.log('table', TABLE, tbl.state)
  sink.stage = 'setup'
  await Promise.all([op.goto(C.RESTO + '/waiter'), tp.goto(C.RESTO + '/kds'), lp.goto(C.RESTO + '/'), rp.goto(C.CONSUMER + '/table')])
  await rp.getByRole('heading', { name: 'Your Table' }).waitFor({ timeout: 20_000 })
  await lp.getByText('Recent orders', { exact: false }).first().waitFor({ timeout: 20_000 })
  await op.getByRole('button', { name: /^Calls/ }).waitFor({ timeout: 20_000 })
  await tp.waitForTimeout(1000)
  console.log('bells at start: Leyla', await badgeOf(lp), '| Orxan', await badgeOf(op), '| Tural', await badgeOf(tp))
  await C.shot(op, 'r2-20-orxan-waiter-start'); await C.shot(tp, 'r2-20-tural-kds-start', { full: false })

  // clean slate for the bells: mark everything read for Leyla and Orxan
  for (const [who, p] of [['Leyla', lp], ['Orxan', op]]) {
    const items = await openPanel(p)
    console.log(`${who} panel before (${items.length} rows):`, JSON.stringify(items.slice(0, 4)))
    if (who === 'Leyla') await C.shot(p, 'r2-21-leyla-panel-before', { full: false })
    await p.getByRole('button', { name: 'Mark all read' }).click().catch(() => {})
    await p.waitForTimeout(600); await closePanel(p); await p.waitForTimeout(400)
    console.log(`${who} bell after mark all read:`, await badgeOf(p))
  }

  // ---- order with "+"
  sink.stage = 'order'
  const t2tickets = () => tp.locator('.kds-ticket').filter({ hasText: TABLE }).count()
  let t0 = Date.now()
  if (process.env.RESUME !== '1') {
  await rp.getByRole('link', { name: /Browse the menu|Add More Items/ }).first().click()
  await rp.locator('.mn-row').first().waitFor({ timeout: 20_000 })
  for (const name of ['Spaghetti alla Carbonara', 'Panna Cotta al Limone']) {
    const row = rp.locator('.mn-row').filter({ has: rp.locator('.mn-name', { hasText: new RegExp('^' + name + '$') }) }).first()
    await row.getByRole('button', { name: /^Add .* to order/ }).click()
    await rp.waitForTimeout(500)
    if (name.startsWith('Spaghetti')) await C.shot(rp, 'r2-22-rauf-plus-toast', { full: false })
  }
  await rp.getByRole('button', { name: 'Open cart' }).click()
  const place = rp.getByRole('button', { name: /^Place Order/ })
  await place.waitFor({ timeout: 8000 })
  await C.shot(rp, 'r2-23-rauf-cart', { full: false })
  const before = await t2tickets()
  t0 = Date.now()
  await place.click()
  await until('R2 Place Order -> 2 new T2 tickets on Tural /kds', t0, async () => (await t2tickets()) >= before + 2)
  }
  await rp.goto(C.CONSUMER + '/table'); await rp.getByRole('heading', { name: 'Your Table' }).waitFor({ timeout: 20_000 })

  // ---- call the waiter (water)
  sink.stage = 'call-1'
  const bO = await badgeOf(op), bL = await badgeOf(lp)
  await rp.getByRole('button', { name: /Call waiter/ }).click()
  await rp.waitForTimeout(400)
  t0 = Date.now()
  await rp.getByRole('button', { name: /Water/i }).first().click()
  await until('R2 Rauf calls waiter (water) -> Orxan bell badge +1', t0, async () => (await badgeOf(op)) > bO)
  await until('R2 Rauf calls waiter (water) -> Leyla bell badge +1', t0, async () => (await badgeOf(lp)) > bL)
  console.log('after call 1: Orxan', await badgeOf(op), '| Leyla', await badgeOf(lp), '| Tural', await badgeOf(tp))
  await C.shot(op, 'r2-24-orxan-bell-after-call', { full: false })
  const oItems = await openPanel(op)
  console.log('Orxan panel:', JSON.stringify(oItems.slice(0, 4)))
  await C.shot(op, 'r2-25-orxan-panel-call', { full: false })
  await op.locator('.notif-item', { hasText: /Waiter called/ }).first().click()
  await op.waitForTimeout(1200)
  console.log('Orxan tap "Waiter called" ->', op.url(), '| bell now', await badgeOf(op))
  await C.shot(op, 'r2-26-orxan-after-tap', { full: false })
  const lItems = await openPanel(lp)
  console.log('Leyla panel:', JSON.stringify(lItems.slice(0, 4)))
  await C.shot(lp, 'r2-27-leyla-panel-call', { full: false })
  await closePanel(lp)

  // ---- kitchen: only T2 tickets
  sink.stage = 'kitchen'
  for (const [btn] of [['Start Preparing'], ['Mark Ready'], ['Done']]) {
    for (let n = 0; n < 2; n++) {
      const b = tp.locator('.kds-ticket').filter({ hasText: TABLE }).getByRole('button', { name: new RegExp('^' + btn) }).first()
      await b.waitFor({ timeout: 8000 }); t0 = Date.now(); await b.click(); await tp.waitForTimeout(250)
    }
  }
  C.timing('R2 kitchen: 6 button presses on the two T2 tickets', Date.now() - t0)
  await C.shot(tp, 'r2-28-tural-kds-t2-done', { full: false })

  // ---- Orxan: take the table, Mark served on My Tables
  sink.stage = 'serve'
  await op.goto(C.RESTO + '/waiter'); await op.getByRole('button', { name: /^All Tables/ }).click(); await op.waitForTimeout(900)
  console.log('Orxan All Tables card:', await flat(op, '.dash-content'))
  await C.shot(op, 'r2-29-orxan-all-tables')
  await op.locator('.wt-card', { hasText: TABLE }).getByRole('button', { name: 'Take Table' }).click()
  await op.waitForTimeout(900)
  await op.getByRole('button', { name: /^My Tables/ }).click(); await op.waitForTimeout(700)
  console.log('Orxan My Tables:', await flat(op, '.dash-content'))
  await C.shot(op, 'r2-30-orxan-my-tables-ready')
  t0 = Date.now()
  await op.getByRole('button', { name: /Mark served/i }).first().click()
  await until('R2 Orxan Mark served (My Tables) -> Rauf /table shows Served', t0, async () => /Served/.test(await C.text(rp)))

  // ---- second call after the cooldown: grouping x2 (cooldown 2 min from the first call)
  sink.stage = 'call-2'
  const need = 125_000 - (Date.now() - t0 + 0)
  console.log('waiting for the call-waiter cooldown ...')
  await rp.waitForTimeout(Math.max(0, Math.min(125_000, 125_000 - (Date.now() - t0))))
  await rp.getByRole('button', { name: /Call waiter/ }).waitFor({ timeout: 5000 })
  const waitLabel = await rp.locator('.table-call-btn').innerText()
  console.log('call button label:', waitLabel)
  if (!/Wait \d+s/.test(waitLabel)) {
    await rp.locator('.table-call-btn').click(); await rp.waitForTimeout(400)
    t0 = Date.now(); await rp.getByRole('button', { name: /Cutlery/i }).first().click()
    await until('R2 second call (cutlery) -> Orxan bell updates', t0, async () => (await badgeOf(op)) >= 1)
    const items2 = await openPanel(op)
    console.log('Orxan panel after 2 calls:', JSON.stringify(items2.slice(0, 3)))
    await C.shot(op, 'r2-31-orxan-panel-grouped', { full: false }); await closePanel(op)
  }

  // ---- bill: reception request
  sink.stage = 'bill'
  const bO2 = await badgeOf(op), bL2 = await badgeOf(lp)
  await rp.getByRole('link', { name: /^View bill/ }).click()
  await rp.getByRole('heading', { name: 'Payment method' }).waitFor({ timeout: 20_000 })
  console.log('bill default method:', await rp.getByRole('radio', { checked: true }).first().innerText().catch(() => '?'))
  await rp.getByRole('radio', { name: /Pay at reception/ }).click()
  t0 = Date.now()
  await rp.getByRole('button', { name: /^Notify staff/ }).click()
  await rp.getByText('Staff notified').waitFor({ timeout: 15_000 })
  C.timing('R2 Notify staff -> "Staff notified" on Rauf', Date.now() - t0)
  await until('R2 Rauf asks for the bill -> Orxan bell badge +1', t0, async () => (await badgeOf(op)) > bO2)
  await until('R2 Rauf asks for the bill -> Leyla bell badge +1', t0, async () => (await badgeOf(lp)) > bL2)
  await C.shot(lp, 'r2-32-leyla-bell-after-bill', { full: false })
  const lItems2 = await openPanel(lp)
  console.log('Leyla panel after bill request:', JSON.stringify(lItems2.slice(0, 4)))
  await C.shot(lp, 'r2-33-leyla-panel-bill', { full: false })
  await lp.locator('.notif-item', { hasText: /Bill requested/ }).first().click()
  await lp.waitForTimeout(1500)
  console.log('Leyla tap "Bill requested" ->', lp.url())
  await C.shot(lp, 'r2-34-leyla-bills-from-bell')
  const oItems2 = await openPanel(op)
  console.log('Orxan panel after bill request:', JSON.stringify(oItems2.slice(0, 4)))
  await C.shot(op, 'r2-35-orxan-panel-bill', { full: false })
  await op.locator('.notif-item', { hasText: /Bill requested/ }).first().click()
  await op.waitForTimeout(1200)
  console.log('Orxan tap "Bill requested" ->', op.url())
  await C.shot(op, 'r2-36-orxan-after-bill-tap', { full: false })

  // ---- Leyla settles (one action)
  sink.stage = 'settle'
  console.log('bill card buttons:', JSON.stringify(await lp.locator('.v2-bill-list button, .v2-bill-list [role=menuitem]').allInnerTexts()))
  const settle = lp.getByRole('button', { name: /Mark whole bill paid|Mark paid|Settle/i }).first()
  t0 = Date.now()
  await settle.click()
  const dlg = lp.getByRole('dialog')
  if (await dlg.count()) { await C.shot(lp, 'r2-37-leyla-confirm', { full: false }); await dlg.getByRole('button', { name: /Mark whole bill paid|Mark paid|Confirm|Settle/i }).last().click() }
  await until('R2 Leyla settles -> Rauf sees Settled', t0, async () => /Payment received|Bill settled|Settled/.test(await C.text(rp)))
  await rp.waitForTimeout(1200)
  await C.shot(rp, 'r2-38-rauf-settled', { full: false })

  // ---- review
  sink.stage = 'review'
  const bL3 = await badgeOf(lp)
  await rp.getByText('How was your meal?').waitFor({ timeout: 10_000 })
  await rp.getByRole('radio', { name: /Rate Spaghetti alla Carbonara: 5 of 5/ }).click()
  await rp.getByPlaceholder(/Add a comment/).fill('Carbonara just like in Rome. Fast service, thank you Orxan.')
  await C.shot(rp, 'r2-39-rauf-review-form', { full: false })
  t0 = Date.now()
  await rp.getByRole('button', { name: 'Send review' }).click()
  await rp.getByText('Thanks for your review!').waitFor({ timeout: 15_000 })
  C.timing('R2 Send review -> "Thanks for your review!"', Date.now() - t0)
  await until('R2 Rauf reviews a dish -> Leyla bell badge +1', t0, async () => (await badgeOf(lp)) > bL3)
  const lItems3 = await openPanel(lp)
  console.log('Leyla panel after review:', JSON.stringify(lItems3.slice(0, 5)))
  await C.shot(lp, 'r2-40-leyla-panel-review', { full: false })
  await lp.locator('.notif-item', { hasText: /New review/ }).first().click()
  await lp.waitForTimeout(1500)
  console.log('Leyla tap "New review" ->', lp.url())
  await C.shot(lp, 'r2-41-leyla-menu-from-bell', { full: false })
  console.log('Tural bell at end:', await badgeOf(tp), '| Orxan', await badgeOf(op), '| Leyla', await badgeOf(lp))
  console.log('problems:', JSON.stringify(sink.map(s => `${s.stage} ${s.who} ${s.kind} ${s.text}`).filter(s => !/ERR_ABORTED/.test(s)), null, 1))
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
