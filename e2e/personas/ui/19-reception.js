'use strict'
// Second table: Rauf joins through the printed link (/t/<code>, what a phone camera opens), orders an espresso, the kitchen + Orxan serve it,
// Rauf asks to pay at reception ("Notify staff"): does Orxan see the bill request, and can Leyla settle it from /bills?
const C = require('./common')
const TABLE = process.env.TABLE || 'T5'

const poll = async (label, t0, fn, max = 20_000) => {
  while (Date.now() - t0 < max) { if (await fn().catch(() => false)) { C.timing(label, Date.now() - t0); return Date.now() - t0 }; await C.sleep(100) }
  C.timing(label, max, 'NOT SEEN in ' + max / 1000 + ' s'); return null
}

;(async () => {
  const browser = await C.launch()
  const sink = []
  const [O, T, L, R] = await Promise.all([
    C.open(browser, 'orxan', { who: 'Orxan', sink }), C.open(browser, 'tural', { who: 'Tural', sink }),
    C.open(browser, 'leyla', { who: 'Leyla', sink }), C.open(browser, 'rauf', { who: 'Rauf', geo: true, sink })])
  const op = O.page, tp = T.page, lp = L.page, rp = R.page
  const [tbl] = await L.api.rows(`tables?restaurant_id=eq.${C.BELLA}&table_number=eq.${TABLE}&select=id,state`)
  const [{ access_code: code }] = await L.api.rows(`table_access_codes?table_id=eq.${tbl.id}&select=access_code`)
  console.log('table', TABLE, tbl.state)
  await Promise.all([op.goto(C.RESTO + '/waiter'), tp.goto(C.RESTO + '/kds'), lp.goto(C.RESTO + '/bills')])
  await op.getByRole('button', { name: /^All Tables/ }).click()
  await lp.getByRole('heading', { name: 'Bills', exact: true }).waitFor()

  // join by link
  sink.stage = 'join'
  let t0 = Date.now()
  if (process.env.SKIPJOIN !== '1') {
  await rp.goto(C.CONSUMER + '/t/' + code, { waitUntil: 'domcontentloaded' })
  await rp.getByRole('heading', { name: 'Join this table?' }).waitFor({ timeout: 20_000 })
  C.timing('Rauf: open /t/<code> link -> "Join this table?"', Date.now() - t0)
  await C.shot(rp, '100-rauf-join-card', { full: false })
  t0 = Date.now()
  await rp.getByRole('button', { name: 'Join', exact: true }).click()
  await rp.getByRole('heading', { name: 'Your Table' }).waitFor({ timeout: 20_000 })
  C.timing('Rauf: Join -> "Your Table"', Date.now() - t0)
  await poll('Rauf joined -> Orxan All Tables shows the table (no reload)', t0, async () => (await op.getByText(`Table ${TABLE}`).count()) > 0)
  await C.shot(op, '101-orxan-all-tables-new')
  }

  // order via "Add More Items"
  sink.stage = 'order'
  if (process.env.SKIPJOIN === '1') { await rp.goto(C.CONSUMER + '/table'); await rp.getByRole('heading', { name: 'Your Table' }).waitFor({ timeout: 20_000 }) }
  if (process.env.SKIPORDER !== '1') {
  await rp.getByRole('link', { name: /Add More Items/ }).click()
  await rp.waitForTimeout(2500)
  await C.shot(rp, '102-rauf-add-more-items-landing', { full: false })
  console.log('Add More Items lands on:', rp.url(), '| selected tab:', await rp.getByRole('tab', { selected: true }).first().innerText().catch(() => '?'), '| menu rows visible:', await rp.locator('.mn-row').count())
  if (!(await rp.locator('.mn-row').count())) { await rp.getByRole('tab', { name: 'Menu' }).click(); await rp.waitForTimeout(1500) }
  await rp.locator('.mn-row').filter({ has: rp.locator('.mn-name', { hasText: /^Espresso$/ }) }).first().click()
  await rp.getByRole('button', { name: /^Add to Order/ }).click()
  const place = rp.getByRole('button', { name: /^Place Order/ })
  await place.waitFor({ timeout: 8000 })
  t0 = Date.now()
  await place.click()
  await tp.locator('.kds-ticket').first().waitFor({ timeout: 20_000 })
  C.timing('Rauf Place Order -> ticket on Tural /kds', Date.now() - t0)
  for (const b of ['Start Preparing', 'Mark Ready', 'Done']) { await tp.getByRole('button', { name: new RegExp('^' + b) }).first().click(); await tp.waitForTimeout(500) }
  }
  // Orxan serves from his Orders tab
  if (process.env.SKIPSERVE !== '1') {
  await op.goto(C.RESTO + '/orders'); await op.getByText(/READY/).first().waitFor({ timeout: 20_000 }).catch(() => console.log('no READY order on Orxan orders'))
  console.log('Orxan orders:', (await C.text(op, '.dash-content')).split('\n').join(' | ').slice(0, 260))
  await op.locator('.dash-content div', { hasText: new RegExp(TABLE) }).filter({ hasText: /READY/i }).last().click()
  await op.getByRole('button', { name: /Mark served/i }).first().click()
  }
  t0 = Date.now()
  await rp.goto(C.CONSUMER + '/table')
  await rp.getByRole('link', { name: /^View bill/ }).waitFor({ timeout: 20_000 })
  console.log('Orxan Waiter calls before bill request:')
  await op.goto(C.RESTO + '/waiter'); await op.waitForTimeout(1500)
  console.log('  ', (await C.text(op, '.dash-content')).split('\n').join(' | ').slice(0, 300))

  // bill: pay at reception
  sink.stage = 'bill-request'
  await rp.getByRole('link', { name: /^View bill/ }).click()
  await rp.getByRole('heading', { name: 'Payment method' }).waitFor()
  await rp.getByRole('radio', { name: /Pay at reception/ }).click()
  await C.shot(rp, '103-rauf-bill-reception', { full: false })
  t0 = Date.now()
  await rp.getByRole('button', { name: /^Notify staff/ }).click()
  await rp.getByText('Staff notified').waitFor({ timeout: 15_000 })
  C.timing('Rauf: Notify staff -> "Staff notified"', Date.now() - t0)
  await C.shot(rp, '104-rauf-staff-notified', { full: false })
  await poll('Notify staff -> Orxan Calls (bill request, no reload)', t0, async () => /Calls \(1\)|Bill requested/i.test(await C.text(op, '.dash-content')))
  await op.getByRole('button', { name: /^Calls/ }).click().catch(() => {}); await op.waitForTimeout(600)
  console.log('Orxan Calls tab:', (await C.text(op, '.dash-content')).split('\n').join(' | ').slice(0, 300))
  await C.shot(op, '105-orxan-bill-call')
  await poll('Notify staff -> Leyla /bills shows the bill (no reload)', t0, async () => /Active \(1\)/.test(await C.text(lp, '.dash-content')))
  await C.shot(lp, '106-leyla-bills-reception')
  console.log('Leyla /bills:', (await C.text(lp, '.dash-content')).split('\n').join(' | ').slice(0, 500))

  // Leyla settles
  sink.stage = 'settle'
  const mark = lp.getByRole('button', { name: /Mark (whole bill|as) paid|Mark paid|Mark whole bill paid/i }).first()
  console.log('settle buttons on card:', JSON.stringify(await lp.locator('.v2-bill-list button').allInnerTexts()))
  t0 = Date.now()
  await mark.click()
  const dlg = lp.getByRole('dialog')
  if (await dlg.count()) { await C.shot(lp, '107-leyla-confirm-settle', { full: false }); await dlg.getByRole('button', { name: /Mark whole bill paid|Mark paid|Confirm/i }).last().click() }
  await poll('Leyla settles -> Rauf sees receipt/settled (no reload)', t0, async () => /Settled|Payment received|Bill settled|paid/i.test(await C.text(rp)))
  await poll('Leyla settles -> bill moves to Paid on /bills', t0, async () => /Paid \(1\)/.test(await C.text(lp, '.dash-content')))
  console.log('Rauf after settle:', (await C.text(rp)).split('\n').join(' | ').slice(0, 260))
  await C.shot(rp, '108-rauf-settled-at-reception', { full: false })
  console.log('Orxan Calls after:', (await C.text(op, '.dash-content')).split('\n').join(' | ').slice(0, 200))
  console.log('problems:', JSON.stringify(sink.map(s => `${s.stage} ${s.who} ${s.kind} ${s.text}`).filter(s => !/ERR_ABORTED/.test(s)), null, 1))
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
