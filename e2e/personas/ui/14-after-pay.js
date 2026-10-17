'use strict'
// Live service, step 5: Rauf leaves the table; Orxan checks "My tips"; Leyla looks at the settled bill (Paid), Tables, Overview, Tips (Today + week).
const C = require('./common')

const poll = async (label, t0, fn, max = 20_000) => {
  while (Date.now() - t0 < max) { if (await fn().catch(() => false)) { C.timing(label, Date.now() - t0); return Date.now() - t0 }; await C.sleep(100) }
  C.timing(label, max, 'NOT SEEN in ' + max / 1000 + ' s'); return null
}

;(async () => {
  const browser = await C.launch()
  const sink = []
  const [O, L, LO, R] = await Promise.all([
    C.open(browser, 'orxan', { who: 'Orxan', sink }), C.open(browser, 'leyla', { who: 'Leyla', sink }),
    C.open(browser, 'leyla', { who: 'Leyla', sink }), C.open(browser, 'rauf', { who: 'Rauf', geo: true, sink })])
  const op = O.page, lp = L.page, lo = LO.page, rp = R.page
  sink.stage = 'setup'
  let t0 = Date.now()
  await op.goto(C.RESTO + '/my-tips'); await op.getByText(/Total tips/i).first().waitFor({ timeout: 20_000 })
  C.timing('orxan phone: /my-tips ready (cold)', Date.now() - t0)
  await op.waitForTimeout(800)
  console.log('Orxan My tips:', (await C.text(op, '.dash-content')).replace(/\n+/g, ' | ').slice(0, 600))
  await C.shot(op, '80-orxan-my-tips')
  await lp.goto(C.RESTO + '/tables'); await lp.waitForTimeout(2000)
  await lo.goto(C.RESTO + '/'); await lo.getByText('Recent orders', { exact: false }).first().waitFor({ timeout: 20_000 }); await lo.waitForTimeout(1000)
  console.log('Leyla tables before leave:', (await C.text(lp, '.dash-content')).replace(/\n+/g, ' | ').slice(0, 260))
  const ovs = async () => { const m = (await C.text(lo, '.dash-content')).split('\n'); return `revenue ${m[m.indexOf('Revenue') - 1]} | orders ${m[m.indexOf('Orders Today') - 1]} | active tables ${m[m.indexOf('Active Tables') - 1]}` }
  console.log('Overview before leave:', await ovs())

  // Rauf's phone after the payment: is he still "at" the table?
  sink.stage = 'leave'
  await rp.goto(C.CONSUMER + '/table'); await rp.waitForTimeout(2000)
  console.log('Rauf /table after paying:', (await C.text(rp)).split('\n').join(' | ').slice(0, 250))
  await C.shot(rp, '81-rauf-table-after-paid', { full: false })
  // Leyla: T2 is "Cleared"; how does it get back to Free?
  const top = lp.locator('.tbl-card-top', { hasText: 'Table T2' }).first(); const card = top.locator('xpath=..')
  console.log('T2 card text:', (await card.innerText()).split('\n').join(' | '))
  await top.click()
  await lp.waitForTimeout(600)
  console.log('T2 card buttons:', JSON.stringify(await card.getByRole('button').allInnerTexts()))
  await C.shot(lp, '82-leyla-tables-t2-cleared')
  t0 = Date.now()
  await card.getByRole('button', { name: /Free/i }).first().click()
  await poll('Leyla marks T2 Free -> Leyla /tables shows T2 FREE', t0, async () => /FREE/.test(await card.innerText()))
  await poll('Leyla marks T2 Free -> overview unchanged check (no reload)', t0, async () => true)
  console.log('Overview after table free:', await ovs())
  await C.shot(lp, '83-leyla-tables-after')
  await C.shot(lo, '84-leyla-overview-after')

  // bills: Paid
  sink.stage = 'bills'
  t0 = Date.now()
  await lp.goto(C.RESTO + '/bills'); await lp.getByRole('heading', { name: 'Bills', exact: true }).waitFor()
  await lp.getByRole('button', { name: /^Paid/ }).click(); await lp.waitForTimeout(800)
  C.timing('Leyla /bills -> Paid list', Date.now() - t0)
  console.log('Bills Paid:', (await C.text(lp, '.dash-content')).replace(/\n+/g, ' | ').slice(0, 700))
  await C.shot(lp, '85-leyla-bills-paid')
  // tips: week
  sink.stage = 'tips'
  await lp.goto(C.RESTO + '/tips'); await lp.getByRole('heading', { name: 'Tips', exact: true }).waitFor(); await lp.waitForTimeout(1200)
  await lp.getByRole('button', { name: 'This week' }).or(lp.getByRole('tab', { name: 'This week' })).first().click(); await lp.waitForTimeout(1500)
  console.log('Tips week:', (await C.text(lp, '.dash-content')).replace(/\n+/g, ' | ').slice(0, 600))
  await C.shot(lp, '86-leyla-tips-week-after')
  console.log('problems:', JSON.stringify(sink.map(s => `${s.stage} ${s.who} ${s.kind} ${s.text}`), null, 1))
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
