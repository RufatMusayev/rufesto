'use strict'
// Round 3, cycle 1 at T2 (Rauf seated by 40-r3-scan.js): order, a waiter call answered with "On my way" FROM THE PANEL,
// kitchen (T2 tickets only) + what the kitchen bell shows, Mark served, bill at reception (rows per request), Leyla opens the bill from the row.
const C = require('./common')
const P = require('./panel3')
const TABLE = process.env.TABLE || 'T2'

;(async () => {
  const browser = await C.launch()
  const sink = []
  const [O, T, L, R] = await Promise.all([
    C.open(browser, 'orxan', { who: 'Orxan', sink }), C.open(browser, 'tural', { who: 'Tural', sink }),
    C.open(browser, 'leyla', { who: 'Leyla', sink }), C.open(browser, 'rauf', { who: 'Rauf', geo: true, sink })])
  const op = O.page, tp = T.page, lp = L.page, rp = R.page
  const [tbl] = await L.api.rows(`tables?restaurant_id=eq.${C.BELLA}&table_number=eq.${TABLE}&select=id,state`)
  console.log('table', TABLE, tbl.state)
  await Promise.all([op.goto(C.RESTO + '/waiter'), tp.goto(C.RESTO + '/kds'), lp.goto(C.RESTO + '/'), rp.goto(C.CONSUMER + '/table')])
  await rp.getByRole('heading', { name: 'Your Table' }).waitFor({ timeout: 20_000 })
  await lp.getByText('Overview', { exact: false }).first().waitFor({ timeout: 20_000 })
  await op.getByRole('button', { name: /^Calls/ }).waitFor({ timeout: 20_000 })
  await tp.waitForTimeout(1200)

  // ---- baseline: what each role sees in the bell
  sink.stage = 'baseline'
  for (const [who, p, shot] of [['Tural (kitchen)', tp, 'r3-20-tural-panel'], ['Orxan (waiter)', op, 'r3-21-orxan-panel'], ['Leyla (manager)', lp, 'r3-22-leyla-panel']]) {
    const badge = await P.badgeOf(p)
    await P.openPanel(p)
    const rows = await P.readPanel(p)
    const types = {}; for (const r of rows) types[r.title.replace(/^Table T\d+ · /, '').replace(/ ₼.*/, '').replace(/ paid.*/, ' paid')] = (types[r.title.replace(/^Table T\d+ · /, '').replace(/ ₼.*/, '').replace(/ paid.*/, ' paid')] || 0) + 1
    console.log(`${who}: badge ${badge}, ${rows.length} rows, titles: ${JSON.stringify(types)}`)
    console.log('  first rows:', JSON.stringify(P.fmt(rows.slice(0, 4))))
    await C.shot(p, shot, { full: false })
    await P.closePanel(p); await p.waitForTimeout(300)
  }

  // ---- order two dishes with "+"
  sink.stage = 'order'
  await rp.getByRole('link', { name: /Browse the menu|Add More Items/ }).first().click()
  await rp.locator('.mn-row').first().waitFor({ timeout: 20_000 })
  for (const name of ['Spaghetti alla Carbonara', 'Panna Cotta al Limone']) {
    await rp.locator('.mn-row').filter({ has: rp.locator('.mn-name', { hasText: new RegExp('^' + name + '$') }) }).first().getByRole('button', { name: /^Add .* to order/ }).click()
    await rp.waitForTimeout(500)
    if (name.startsWith('Spaghetti')) await C.shot(rp, 'r3-23-rauf-plus-toast', { full: false })
  }
  const toastView = rp.getByRole('button', { name: /^View( cart)?$/ }).or(rp.getByRole('link', { name: /^View( cart)?$/ })).first()
  console.log('toast text:', (await C.text(rp, '[role=status], .cart-added-toast, .toast')).split('\n').join(' | ').slice(0, 120), '| View control:', await toastView.count())
  if (await toastView.count()) await toastView.click(); else await rp.getByRole('button', { name: /Open cart|cart/i }).first().click()
  const place = rp.getByRole('button', { name: /^Place Order/ }); await place.waitFor({ timeout: 8000 })
  await C.shot(rp, 'r3-24-rauf-cart', { full: false })
  const tickets = () => tp.locator('.kds-ticket').filter({ hasText: TABLE }).count()
  const before = await tickets()
  let t0 = Date.now(); await place.click()
  await P.until('R3 Place Order -> 2 new ' + TABLE + ' tickets on Tural /kds', t0, async () => (await tickets()) >= before + 2)

  // ---- waiter call; Orxan answers from the PANEL
  sink.stage = 'call'
  await rp.goto(C.CONSUMER + '/table'); await rp.getByRole('heading', { name: 'Your Table' }).waitFor()
  await P.openPanel(op); await P.openPanel(lp)
  const reCall = new RegExp('Table ' + TABLE + ' · Waiter called')
  const preO = await P.countRows(op, reCall), preL = await P.countRows(lp, reCall)
  await rp.locator('.table-call-btn').click(); await rp.waitForTimeout(500)
  t0 = Date.now(); await rp.getByRole('button', { name: /Water/i }).first().click()
  await P.until('R3 waiter call (unassigned table, panels open) -> row in Orxan panel', t0, async () => (await P.countRows(op, reCall)) > preO)
  await P.until('R3 waiter call (unassigned table, panels open) -> row in Leyla panel', t0, async () => (await P.countRows(lp, reCall)) > preL)
  const oRows = await P.rowsMatching(op, reCall), lRows = await P.rowsMatching(lp, reCall)
  console.log('Orxan call rows:', JSON.stringify(P.fmt(oRows.slice(0, 2))), '\nLeyla call rows:', JSON.stringify(P.fmt(lRows.slice(0, 2))))
  await C.shot(op, 'r3-25-orxan-panel-call', { full: false }); await C.shot(lp, 'r3-26-leyla-panel-call', { full: false })
  t0 = Date.now()
  await op.locator('.notif-panel li.notif-row', { hasText: reCall }).first().getByRole('button', { name: 'On my way' }).click()
  await P.until('R3 Orxan taps "On my way" in his panel -> row shows the ack for him', t0, async () => /✓/.test((await P.rowsMatching(op, reCall))[0]?.ack || ''))
  await P.until('R3 Orxan "On my way" -> Leyla\'s row shows a colleague took it (no reload)', t0, async () => /colleague|✓/i.test((await P.rowsMatching(lp, reCall))[0]?.ack || ''))
  await P.until('R3 Orxan "On my way" -> Rauf\'s button says on the way', t0, async () => /on the way/i.test(await rp.locator('.table-call-btn').innerText()))
  console.log('after ack: Orxan', JSON.stringify(P.fmt(await P.rowsMatching(op, reCall))), '| Leyla', JSON.stringify(P.fmt(await P.rowsMatching(lp, reCall))))
  await C.shot(op, 'r3-27-orxan-panel-acked', { full: false }); await C.shot(lp, 'r3-28-leyla-panel-acked', { full: false })
  await P.closePanel(op); await P.closePanel(lp)
  await op.getByRole('button', { name: /^Calls/ }).click(); await op.waitForTimeout(700)
  console.log('Orxan Calls tab after the panel ack:', (await C.text(op, '.dash-content')).split('\n').join(' | ').slice(0, 220))
  await C.shot(op, 'r3-29-orxan-calls-tab', { full: false })

  // ---- kitchen
  sink.stage = 'kitchen'
  for (const b of ['Start Preparing', 'Mark Ready', 'Done']) for (let n = 0; n < 2; n++) { const btn = tp.locator('.kds-ticket').filter({ hasText: TABLE }).getByRole('button', { name: new RegExp('^' + b) }).first(); await btn.waitFor({ timeout: 10_000 }); await btn.click(); await tp.waitForTimeout(300) }
  await op.getByRole('button', { name: /^All Tables/ }).click(); await op.waitForTimeout(700)
  await op.locator('.wt-card', { hasText: TABLE }).getByRole('button', { name: 'Take Table' }).click(); await op.waitForTimeout(900)
  await op.getByRole('button', { name: /^My Tables/ }).click()
  await op.getByRole('button', { name: /Mark served/i }).first().waitFor({ timeout: 15_000 })
  t0 = Date.now(); await op.getByRole('button', { name: /Mark served/i }).first().click()
  await P.until('R3 Orxan Mark served -> Rauf sees Served', t0, async () => /Served/.test(await C.text(rp)))

  // ---- bill at reception: rows per request
  sink.stage = 'bill'
  await P.openPanel(op); await P.openPanel(lp); await P.openPanel(tp)
  const reBill = new RegExp('Table ' + TABLE + ' · Bill requested')
  const bO = await P.countRows(op, reBill), bL = await P.countRows(lp, reBill), bT = await P.countRows(tp, /Bill requested/)
  await rp.getByRole('link', { name: /^View bill/ }).click()
  await rp.getByRole('heading', { name: 'Payment method' }).waitFor({ timeout: 20_000 })
  await rp.getByRole('radio', { name: /Pay at reception/ }).click()
  t0 = Date.now(); await rp.getByRole('button', { name: /^Notify staff/ }).click()
  await rp.getByText('Staff notified').waitFor({ timeout: 15_000 })
  C.timing('R3 Notify staff -> "Staff notified" on Rauf', Date.now() - t0)
  await P.until('R3 bill request (panels open) -> row in Orxan panel', t0, async () => (await P.countRows(op, reBill)) > bO)
  await P.until('R3 bill request (panels open) -> row in Leyla panel', t0, async () => (await P.countRows(lp, reBill)) > bL)
  await lp.waitForTimeout(5000)
  console.log('bill rows added (1 expected each): Orxan', (await P.countRows(op, reBill)) - bO, '| Leyla', (await P.countRows(lp, reBill)) - bL, '| Tural (any bill row)', (await P.countRows(tp, /Bill requested/)) - bT)
  console.log('Leyla top:', JSON.stringify(P.fmt((await P.readPanel(lp)).slice(0, 3))))
  console.log('Orxan top:', JSON.stringify(P.fmt((await P.readPanel(op)).slice(0, 3))))
  console.log('Tural panel rows now:', JSON.stringify(P.fmt((await P.readPanel(tp)).slice(0, 4))), '| badge', await P.badgeOf(tp))
  await C.shot(lp, 'r3-30-leyla-panel-bill', { full: false }); await C.shot(op, 'r3-31-orxan-panel-bill', { full: false }); await C.shot(tp, 'r3-32-tural-panel-bill', { full: false })
  await P.closePanel(op); await P.closePanel(tp)
  // Leyla: inline "Open bill" on the row
  const lrow = lp.locator('.notif-panel li.notif-row', { hasText: reBill }).first()
  console.log('Leyla row action:', await lrow.locator('.notif-act').innerText().catch(() => '(none)'))
  await lrow.locator('.notif-act').click(); await lp.waitForTimeout(1500)
  console.log('Leyla "Open bill" ->', lp.url())
  await lp.getByRole('heading', { name: 'Bills', exact: true }).waitFor(); await lp.locator('.v2-bill-list').waitFor({ timeout: 15_000 })
  console.log('bill actions:', JSON.stringify(await lp.locator('.v2-bill-list button').allInnerTexts()))
  await C.shot(lp, 'r3-33-leyla-bills-from-row')
  await lp.locator('.v2-bill-list').getByRole('button', { name: /Mark paid|Mark whole bill paid|Settle/i }).first().click()
  const dlg = lp.getByRole('dialog'); t0 = Date.now()
  if (await dlg.count()) { await C.shot(lp, 'r3-34-leyla-confirm', { full: false }); t0 = Date.now(); await dlg.getByRole('button', { name: /Mark whole bill paid|Mark paid|Confirm|Settle/i }).last().click() }
  await P.until('R3 Leyla confirms settle -> Rauf sees Settled', t0, async () => /Payment received|Bill settled|Settled/.test(await C.text(rp)))
  await rp.waitForTimeout(1200); await C.shot(rp, 'r3-35-rauf-settled', { full: false })
  console.log('problems:', JSON.stringify(sink.map(s => s.stage + ' ' + s.who + ' ' + s.kind + ' ' + s.text).filter(s => !/ERR_ABORTED|vibrate/.test(s)), null, 1))
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
