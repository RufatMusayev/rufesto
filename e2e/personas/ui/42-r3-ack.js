'use strict'
// Round 3: the two ways to answer a waiter call and who sees it live.
//  A) Orxan answers on the Calls tab (old path)    B) Orxan answers with "On my way" in the bell panel (new path)
// Watchers: Rauf's call button (guest), Leyla's panel row (colleague), Orxan's own panel row. Rauf is seated at T2 (41-r3-reception.js).
const C = require('./common')
const P = require('./panel3')
const TABLE = process.env.TABLE || 'T2'
const reCall = new RegExp('Table ' + TABLE + ' · Waiter called')

;(async () => {
  const browser = await C.launch()
  const sink = []
  const [O, L, R] = await Promise.all([C.open(browser, 'orxan', { who: 'Orxan', sink }), C.open(browser, 'leyla', { who: 'Leyla', sink }), C.open(browser, 'rauf', { who: 'Rauf', geo: true, sink })])
  const op = O.page, lp = L.page, rp = R.page
  await Promise.all([op.goto(C.RESTO + '/waiter'), lp.goto(C.RESTO + '/'), rp.goto(C.CONSUMER + '/table')])
  await rp.getByRole('heading', { name: 'Your Table' }).waitFor({ timeout: 20_000 })
  await op.getByRole('button', { name: /^Calls/ }).waitFor({ timeout: 20_000 })
  const label = () => rp.locator('.table-call-btn').innerText().then(t => t.split('\n').join(' '))

  rp.on('response', async r => { if (/call_waiter/.test(r.url())) console.log('   call_waiter ->', r.status(), (await r.text()).slice(0, 80)) })
  async function call(kind) {
    for (let i = 0; i < 80 && /Wait \d+s/.test(await label()); i++) await rp.waitForTimeout(2000)   // cooldown
    await rp.locator('.table-call-btn').click(); await rp.waitForTimeout(500)
    await rp.getByRole('button', { name: new RegExp(kind, 'i') }).first().click(); await rp.waitForTimeout(800)
  }

  let t0
  // ---- A: Calls tab
  sink.stage = 'A'
  if (process.env.ONLYB !== '1') {
  console.log('button before:', await label())
  if (process.env.CALLED !== '1') await call('Cutlery')
  await op.getByRole('button', { name: /^Calls/ }).click()
  await op.getByRole('button', { name: /On my way/i }).first().waitFor({ timeout: 15_000 })
  t0 = Date.now(); await op.getByRole('button', { name: /On my way/i }).first().click()
  await P.until('R3 A) Calls-tab "On my way" -> Rauf button on the way', t0, async () => /on the way/i.test(await label()))
  console.log('A) Rauf label:', await label())
  await op.getByRole('button', { name: /^Done$/ }).first().click(); await op.waitForTimeout(1000)

  }
  // ---- B: panel
  sink.stage = 'B'
  await call('Clean|Clear')
  await P.openPanel(op); await P.openPanel(lp)
  await P.until('R3 B) new call -> row in Orxan panel', Date.now(), async () => (await P.rowsMatching(op, reCall)).some(r => /clean|needs cleaning|Clear/i.test(r.detail) && r.action))
  await P.until('R3 B) new call -> row in Leyla panel', Date.now(), async () => (await P.rowsMatching(lp, reCall)).some(r => /clean|cleaning/i.test(r.detail) && r.action))
  t0 = Date.now()
  await op.locator('.notif-panel li.notif-row', { hasText: reCall }).filter({ hasText: /cleaning|clean/i }).first().getByRole('button', { name: 'On my way' }).click()
  await P.until('R3 B) panel "On my way" -> Orxan row shows ack', t0, async () => (await P.rowsMatching(op, reCall)).some(r => /clean/i.test(r.detail) && /✓/.test(r.ack)))
  await P.until('R3 B) panel "On my way" -> Rauf button on the way', t0, async () => /on the way/i.test(await label()), 15_000)
  await P.until('R3 B) panel "On my way" -> Leyla row shows ack (panel open, no reload)', t0, async () => (await P.rowsMatching(lp, reCall)).some(r => /clean/i.test(r.detail) && /✓/.test(r.ack)), 15_000)
  console.log('B) Rauf label:', await label())
  console.log('B) Leyla rows:', JSON.stringify(P.fmt(await P.rowsMatching(lp, reCall))))
  await P.closePanel(lp); await P.openPanel(lp, 1500)
  console.log('B) Leyla rows after closing and reopening her panel:', JSON.stringify(P.fmt(await P.rowsMatching(lp, reCall))))
  await C.shot(lp, 'r3-40-leyla-panel-after-ack-reopen', { full: false })
  await P.closePanel(lp); await P.closePanel(op)
  await op.getByRole('button', { name: /^Calls/ }).click(); await op.waitForTimeout(700)
  console.log('Orxan Calls after B:', (await C.text(op, '.dash-content')).split('\n').join(' | ').slice(0, 200))
  console.log('problems:', JSON.stringify(sink.map(s => s.stage + ' ' + s.who + ' ' + s.kind + ' ' + s.text).filter(s => !/ERR_ABORTED|vibrate/.test(s)), null, 1))
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
