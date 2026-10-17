'use strict'
// Round 2, cycle D at T2: "served but not billed" for the cashier (Nigar) and the manager, the diner's own bell ("your food is ready"),
// card payment without a tip, Orxan resets the cleared table from his phone.
const C = require('./common')
const TABLE = process.env.TABLE || 'T2'
const flat = async (page, sel) => (await C.text(page, sel)).split('\n').join(' | ')
async function until(label, t0, fn, max = 20_000) {
  while (Date.now() - t0 < max) { let v; try { v = await fn() } catch { v = false } if (v) { C.timing(label, Date.now() - t0); return Date.now() - t0 }; await C.sleep(100) }
  C.timing(label, max, 'NOT SEEN in ' + max / 1000 + ' s'); return null
}

;(async () => {
  const browser = await C.launch()
  const sink = []
  const [O, T, L, N, R] = await Promise.all([
    C.open(browser, 'orxan', { who: 'Orxan', sink }), C.open(browser, 'tural', { who: 'Tural', sink }), C.open(browser, 'leyla', { who: 'Leyla', sink }),
    C.open(browser, 'leyla', { who: 'Nigar Rəhimova', sink }), C.open(browser, 'rauf', { who: 'Rauf', geo: true, sink })])
  const op = O.page, tp = T.page, lp = L.page, np = N.page, rp = R.page
  const [tbl] = await L.api.rows(`tables?restaurant_id=eq.${C.BELLA}&table_number=eq.${TABLE}&select=id,state`)
  if (tbl.state === 'cleared') await L.api.patch(`tables?id=eq.${tbl.id}`, { state: 'free' })
  const [{ access_code: code }] = await L.api.rows(`table_access_codes?table_id=eq.${tbl.id}&select=access_code`)
  console.log('table', TABLE, tbl.state, '| Nigar role:', N.auth.account.role)
  await Promise.all([op.goto(C.RESTO + '/waiter'), tp.goto(C.RESTO + '/kds'), lp.goto(C.RESTO + '/bills'), np.goto(C.RESTO + '/bills')])
  await lp.getByRole('heading', { name: 'Bills', exact: true }).waitFor({ timeout: 20_000 })
  await np.getByRole('heading', { name: 'Bills', exact: true }).waitFor({ timeout: 20_000 })
  console.log('Nigar landing url:', np.url(), '| nav:', JSON.stringify(await np.locator('.dash-nav-item').allInnerTexts()))
  await C.shot(np, 'r2-90-nigar-bills-start')

  sink.stage = 'join-order'
  if (process.env.RESUME !== '1') {
  await rp.goto(C.CONSUMER + '/t/' + code, { waitUntil: 'domcontentloaded' })
  await rp.getByRole('heading', { name: 'Join this table?' }).waitFor({ timeout: 20_000 })
  await rp.getByRole('button', { name: 'Join', exact: true }).click()
  await rp.getByRole('heading', { name: 'Your Table' }).waitFor({ timeout: 20_000 })
  await rp.getByRole('link', { name: /Browse the menu|Add More Items/ }).first().click()
  await rp.locator('.mn-row').first().waitFor({ timeout: 20_000 })
  for (const name of ['Panna Cotta al Limone', 'Cappuccino']) await rp.locator('.mn-row').filter({ has: rp.locator('.mn-name', { hasText: new RegExp('^' + name + '$') }) }).first().getByRole('button', { name: /^Add .* to order/ }).click()
  await rp.getByRole('button', { name: 'Open cart' }).click()
  const place = rp.getByRole('button', { name: /^Place Order/ }); await place.waitFor({ timeout: 8000 })
  await place.click(); await rp.waitForTimeout(1500)
  for (const b of ['Start Preparing', 'Mark Ready', 'Done']) for (let n = 0; n < 2; n++) { const btn = tp.locator('.kds-ticket').filter({ hasText: TABLE }).getByRole('button', { name: new RegExp('^' + b) }).first(); await btn.waitFor({ timeout: 10_000 }); await btn.click(); await tp.waitForTimeout(300) }
  }
  await rp.goto(C.CONSUMER + '/table'); await rp.getByRole('heading', { name: 'Your Table' }).waitFor()

  // Rauf's own bell: is there "your food is ready"?
  const rapi = C.makeApi(await C.login('Rauf'))
  const gn = await rapi.rpc('my_notifications', { p_audience: 'guest' })
  console.log('Rauf guest notifications (top 5):', JSON.stringify((gn.data?.items || []).slice(0, 5).map(i => [i.type, i.count, i.latest_at?.slice(11, 19)])), 'status', gn.status)
  const sn = await rapi.rpc('my_notifications', { p_audience: 'staff' })
  console.log('Rauf (a diner) staff-audience rows:', sn.status, (sn.data?.items || []).length)

  sink.stage = 'serve'
  await op.getByRole('button', { name: /^All Tables/ }).click(); await op.waitForTimeout(700)
  await op.locator('.wt-card', { hasText: TABLE }).getByRole('button', { name: 'Take Table' }).click()
  await op.waitForTimeout(900)
  await op.getByRole('button', { name: /^My Tables/ }).click()
  await op.getByRole('button', { name: /Mark served/i }).first().waitFor({ timeout: 15_000 })
  let t0 = Date.now()
  await op.getByRole('button', { name: /Mark served/i }).first().click()
  await until('R2 Mark served -> Nigar /bills shows "Served, not billed yet"', t0, async () => /Served, not billed yet/.test(await C.text(np, '.dash-content')))
  await until('R2 Mark served -> Leyla /bills shows "Served, not billed yet"', t0, async () => /Served, not billed yet/.test(await C.text(lp, '.dash-content')))
  console.log('Nigar bills:', (await flat(np, '.dash-content')).slice(0, 420))
  await C.shot(np, 'r2-91-nigar-bills-unbilled'); await C.shot(lp, 'r2-92-leyla-bills-unbilled')

  sink.stage = 'pay'
  await rp.getByRole('link', { name: /^View bill/ }).click()
  await rp.getByRole('heading', { name: 'Payment method' }).waitFor({ timeout: 20_000 })
  console.log('bill default method:', await rp.locator('[role=radio][aria-checked=true]').allInnerTexts())
  const card = rp.getByRole('radio', { name: /Card \(demo\)/ }); if ((await card.getAttribute('aria-checked')) !== 'true') await card.click()
  await rp.getByRole('button', { name: /^Pay ₼/ }).click()
  const confirm = rp.getByRole('button', { name: /\(demo\)$/ }); await confirm.waitFor({ timeout: 8000 })
  t0 = Date.now(); await confirm.click()
  await until('R2 pay -> Rauf "Payment received"', t0, async () => rp.getByRole('heading', { name: 'Payment received' }).isVisible())
  await until('R2 pay -> unbilled card gone on Nigar /bills', t0, async () => !/Served, not billed yet/.test(await C.text(np, '.dash-content')))
  await C.shot(rp, 'r2-93-rauf-paid', { full: false })

  // table is Cleared: Orxan resets it from his phone
  sink.stage = 'reset'
  await op.getByRole('button', { name: /^All Tables/ }).click()
  await op.getByRole('button', { name: 'Reset table' }).first().waitFor({ timeout: 15_000 })
  console.log('Orxan sees:', (await op.locator('.wt-card', { hasText: TABLE }).innerText()).split('\n').join(' | '))
  await C.shot(op, 'r2-94-orxan-cleared-card')
  t0 = Date.now()
  await op.locator('.wt-card', { hasText: TABLE }).getByRole('button', { name: 'Reset table' }).click()
  await until('R2 Orxan Reset table -> T2 free (API)', t0, async () => (await L.api.rows(`tables?id=eq.${tbl.id}&select=state`))[0]?.state === 'free')
  console.log('problems:', JSON.stringify(sink.map(s => s.stage + ' ' + s.who + ' ' + s.kind + ' ' + s.text).filter(s => !/ERR_ABORTED|vibrate/.test(s)), null, 1))
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
