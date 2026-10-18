'use strict'
// Round 3, cycle 1 part 2 at T2 (Rauf seated, order placed, calls answered): kitchen (T2 tickets only), Mark served, bill at reception
// with all three panels open (rows per request, kitchen bell), Leyla opens the bill from the row and settles it.
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
  await Promise.all([op.goto(C.RESTO + '/waiter'), tp.goto(C.RESTO + '/kds'), lp.goto(C.RESTO + '/'), rp.goto(C.CONSUMER + '/table')])
  await rp.getByRole('heading', { name: 'Your Table' }).waitFor({ timeout: 20_000 })
  await op.getByRole('button', { name: /^Calls/ }).waitFor({ timeout: 20_000 })
  await tp.waitForTimeout(1500)
  const hasTickets = (await tp.locator('.kds-ticket').filter({ hasText: TABLE }).count()) > 0
  console.log('T2 tickets on the board:', hasTickets ? 'yes' : 'none (order already ready; another agent may have advanced them)')

  sink.stage = 'kitchen'
  if (hasTickets) for (const b of ['Start Preparing', 'Mark Ready', 'Done']) for (let n = 0; n < 2; n++) { const btn = tp.locator('.kds-ticket').filter({ hasText: TABLE }).getByRole('button', { name: new RegExp('^' + b) }).first(); await btn.waitFor({ timeout: 10_000 }); await btn.click(); await tp.waitForTimeout(300) }
  await op.getByRole('button', { name: /^All Tables/ }).click(); await op.waitForTimeout(700)
  const take = op.locator('.wt-card', { hasText: TABLE }).getByRole('button', { name: 'Take Table' })
  console.log('Orxan card for ' + TABLE + ' after he answered a call:', (await op.locator('.wt-card', { hasText: TABLE }).innerText()).split('\n').join(' | ').slice(0, 200), '| Take Table button:', await take.count())
  if (await take.count()) { await take.click(); await op.waitForTimeout(900) }
  await op.getByRole('button', { name: /^My Tables/ }).click()
  await op.getByRole('button', { name: /Mark served/i }).first().waitFor({ timeout: 15_000 })
  let t0 = Date.now(); await op.getByRole('button', { name: /Mark served/i }).first().click()
  await P.until('R3 Orxan Mark served -> Rauf sees Served', t0, async () => /Served/.test(await C.text(rp)))

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
  console.log('Tural rows now:', JSON.stringify(P.fmt((await P.readPanel(tp)).slice(0, 3))), '| badge', await P.badgeOf(tp))
  await C.shot(lp, 'r3-50-leyla-panel-bill', { full: false }); await C.shot(op, 'r3-51-orxan-panel-bill', { full: false }); await C.shot(tp, 'r3-52-tural-panel-bill', { full: false })
  await P.closePanel(op); await P.closePanel(tp)
  const lrow = lp.locator('.notif-panel li.notif-row', { hasText: reBill }).first()
  console.log('Leyla row action:', await lrow.locator('.notif-act').innerText().catch(() => '(none)'))
  await lrow.locator('.notif-act').click(); await lp.waitForTimeout(1500)
  console.log('Leyla "Open bill" ->', lp.url())
  await lp.getByRole('heading', { name: 'Bills', exact: true }).waitFor(); await lp.locator('.v2-bill-list').waitFor({ timeout: 15_000 })
  console.log('bill actions:', JSON.stringify(await lp.locator('.v2-bill-list button').allInnerTexts()))
  await C.shot(lp, 'r3-53-leyla-bills-from-row')
  await lp.locator('.v2-bill-list').getByRole('button', { name: /Mark paid|Mark whole bill paid|Settle/i }).first().click()
  const dlg = lp.getByRole('dialog'); t0 = Date.now()
  if (await dlg.count()) { await C.shot(lp, 'r3-54-leyla-confirm', { full: false }); t0 = Date.now(); await dlg.getByRole('button', { name: /Mark whole bill paid|Mark paid|Confirm|Settle/i }).last().click() }
  await P.until('R3 Leyla confirms settle -> Rauf sees Settled', t0, async () => /Payment received|Bill settled|Settled/.test(await C.text(rp)))
  await rp.waitForTimeout(1200); await C.shot(rp, 'r3-55-rauf-settled', { full: false })
  console.log('Rauf settled screen:', (await C.text(rp)).split('\n').join(' | ').slice(0, 300))
  console.log('problems:', JSON.stringify(sink.map(s => s.stage + ' ' + s.who + ' ' + s.kind + ' ' + s.text).filter(s => !/ERR_ABORTED|vibrate/.test(s)), null, 1))
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
