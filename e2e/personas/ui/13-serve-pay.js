'use strict'
// Live service, step 4: Orxan serves (Orders tab on his phone), Rauf opens the bill and pays by demo card with a 10 % tip for Orxan.
// Watchers: Orxan /waiter (calls: bill), Leyla /bills, Leyla /tips (Today), Orxan /my-tips.
const C = require('./common')
const TIP = process.env.TIP || '10'

const poll = async (label, t0, fn, max = 20_000) => {
  while (Date.now() - t0 < max) { if (await fn().catch(() => false)) { C.timing(label, Date.now() - t0); return Date.now() - t0 }; await C.sleep(100) }
  C.timing(label, max, 'NOT SEEN in ' + max / 1000 + ' s'); return null
}

;(async () => {
  const browser = await C.launch()
  const sink = []
  const [O, L, LT, R] = await Promise.all([
    C.open(browser, 'orxan', { who: 'Orxan', sink }), C.open(browser, 'leyla', { who: 'Leyla', sink }),
    C.open(browser, 'leyla', { who: 'Leyla', sink }), C.open(browser, 'rauf', { who: 'Rauf', geo: true, sink })])
  const op = O.page, lp = L.page, lt = LT.page, rp = R.page
  sink.stage = 'setup'
  await Promise.all([op.goto(C.RESTO + '/orders'), lp.goto(C.RESTO + '/bills'), lt.goto(C.RESTO + '/tips'), rp.goto(C.CONSUMER + '/table')])
  await rp.getByText(/Your Table/).waitFor({ timeout: 20_000 })
  await lp.getByRole('heading', { name: 'Bills', exact: true }).waitFor(); await lt.getByRole('heading', { name: 'Tips', exact: true }).waitFor()
  await op.waitForTimeout(1500)
  console.log('Orxan /orders:', (await C.text(op, '.dash-content')).replace(/\n+/g, ' | ').slice(0, 400))
  console.log('Leyla /bills before:', (await C.text(lp, '.dash-content')).replace(/\n+/g, ' | ').slice(0, 300))
  await C.shot(op, '70-orxan-orders-ready')

  // ---- Orxan serves
  sink.stage = 'serve'
  await op.locator('.dash-content div', { hasText: /T2/ }).filter({ hasText: /READY/i }).last().click().catch(() => {})
  await op.waitForTimeout(500)
  await C.shot(op, '71-orxan-order-expanded')
  const served = op.getByRole('button', { name: /Mark served/i })
  let t0 = Date.now()
  await served.first().click()
  await poll('Orxan Mark served -> Rauf /table shows Served (no reload)', t0, async () => /Served/.test(await C.text(rp)))
  await C.shot(rp, '72-rauf-served', { full: false })
  console.log('Rauf after served:', (await C.text(rp)).replace(/\n+/g, ' | ').replace(/.*Order #1/, 'Order #1').slice(0, 300))
  console.log('Orxan Orders after served:', (await C.text(op, '.dash-content')).replace(/\n+/g, ' | ').slice(0, 300))

  // ---- Rauf: bill
  sink.stage = 'bill'
  t0 = Date.now()
  await rp.getByRole('link', { name: /^View bill/ }).click()
  await rp.getByRole('heading', { name: 'Payment method' }).waitFor({ timeout: 20_000 })
  C.timing('Rauf: View bill -> bill screen ready', Date.now() - t0)
  await C.shot(rp, '73-rauf-bill')
  console.log('bill screen:', (await C.text(rp)).replace(/\n+/g, ' | ').slice(0, 700))
  const card = rp.getByRole('radio', { name: /Card \(demo\)/ })
  await card.click()
  const tipGroup = rp.getByRole('radiogroup', { name: 'Add a tip' })
  await tipGroup.getByRole('radio', { name: new RegExp('^' + TIP + '%') }).click()
  const picker = rp.getByRole('radiogroup', { name: 'Who gets the tip?' })
  await picker.waitFor({ timeout: 8000 })
  console.log('tip receivers offered:', JSON.stringify(await picker.getByRole('radio').allInnerTexts()))
  const pickOrxan = picker.getByRole('radio', { name: /Orxan/ })
  console.log('Orxan preselected as assigned waiter?', await pickOrxan.getAttribute('aria-checked'))
  await pickOrxan.click()
  await C.shot(rp, '74-rauf-bill-card-tip')
  console.log('pay bar:', (await rp.locator('.bl-paybar-sum').innerText().catch(() => '')).replace(/\n+/g, ' '))
  console.log('tip hint:', await rp.getByText(/^Tip: ₼/).innerText().catch(() => '?'))

  // ---- pay
  sink.stage = 'pay'
  await rp.getByRole('button', { name: /^Pay ₼/ }).click()
  const confirm = rp.getByRole('button', { name: /\(demo\)$/ })
  await confirm.waitFor({ timeout: 8000 })
  await C.shot(rp, '75-rauf-demo-pay-sheet', { full: false })
  const billsBefore = (await C.text(lp, '.dash-content')).replace(/\d+m ago|just now/g, '')
  t0 = Date.now()
  await confirm.click()
  const tp = poll('pay: Rauf confirm -> "Payment received" on Rauf', t0, async () => rp.getByRole('heading', { name: 'Payment received' }).isVisible())
  const bp = poll('pay: Rauf confirm -> Leyla /bills changes (no reload)', t0, async () => (await C.text(lp, '.dash-content')).replace(/\d+m ago|just now/g, '') !== billsBefore)
  const tipP = poll('pay: Rauf confirm -> Leyla /tips (Today) shows a tip (no reload)', t0, async () => !/No tips in this period/.test(await C.text(lt, '.dash-content')))
  await Promise.all([tp, bp, tipP])
  await rp.waitForTimeout(800)
  await C.shot(rp, '76-rauf-payment-received', { full: false })
  console.log('Rauf after pay:', (await C.text(rp)).replace(/\n+/g, ' | ').slice(0, 300))
  console.log('Leyla /bills after pay:', (await C.text(lp, '.dash-content')).replace(/\n+/g, ' | ').slice(0, 600))
  await C.shot(lp, '77-leyla-bills-after-pay')
  console.log('Leyla /tips (Today) after pay:', (await C.text(lt, '.dash-content')).replace(/\n+/g, ' | ').slice(0, 700))
  await C.shot(lt, '78-leyla-tips-today-after-pay')
  console.log('Orxan /waiter calls after pay:')
  await op.goto(C.RESTO + '/waiter'); await op.waitForTimeout(1500)
  console.log((await C.text(op, '.dash-content')).replace(/\n+/g, ' | ').slice(0, 400))
  console.log('problems:', JSON.stringify(sink.map(s => `${s.stage} ${s.who} ${s.kind} ${s.text}`), null, 1))
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
