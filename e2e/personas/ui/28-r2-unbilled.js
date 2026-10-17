'use strict'
// Round 2: "Served, not billed yet" on /bills for the cashier (Nigar) and the manager (Leyla): live (page already open) and after a reload.
// Rauf joins T2, orders one dish, kitchen finishes it, Orxan serves; Rauf does NOT open the bill until the checks are done.
const C = require('./common')
const TABLE = process.env.TABLE || 'T2'
const dash = async p => (await C.text(p, '.dash-content')).split('\n').join(' | ')
async function until(label, t0, fn, max = 25_000) {
  while (Date.now() - t0 < max) { let v; try { v = await fn() } catch { v = false } if (v) { C.timing(label, Date.now() - t0); return Date.now() - t0 }; await C.sleep(150) }
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
  const [{ access_code: code }] = await L.api.rows(`table_access_codes?table_id=eq.${tbl.id}&select=access_code`)
  console.log('table', TABLE, tbl.state)
  await Promise.all([op.goto(C.RESTO + '/waiter'), tp.goto(C.RESTO + '/kds'), lp.goto(C.RESTO + '/bills'), np.goto(C.RESTO + '/bills')])
  await lp.getByRole('heading', { name: 'Bills', exact: true }).waitFor({ timeout: 20_000 }); await np.getByRole('heading', { name: 'Bills', exact: true }).waitFor({ timeout: 20_000 })
  await rp.goto(C.CONSUMER + '/t/' + code, { waitUntil: 'domcontentloaded' })
  await rp.getByRole('heading', { name: 'Join this table?' }).waitFor({ timeout: 20_000 })
  await rp.getByRole('button', { name: 'Join', exact: true }).click()
  await rp.getByRole('heading', { name: 'Your Table' }).waitFor({ timeout: 20_000 })
  await rp.getByRole('link', { name: /Browse the menu|Add More Items/ }).first().click()
  await rp.locator('.mn-row').first().waitFor({ timeout: 20_000 })
  await rp.locator('.mn-row').filter({ has: rp.locator('.mn-name', { hasText: /^Panna Cotta al Limone$/ }) }).first().getByRole('button', { name: /^Add .* to order/ }).click()
  await rp.getByRole('button', { name: 'Open cart' }).click()
  const place = rp.getByRole('button', { name: /^Place Order/ }); await place.waitFor({ timeout: 8000 })
  await place.click(); await rp.waitForTimeout(1500)
  for (const b of ['Start Preparing', 'Mark Ready', 'Done']) { const btn = tp.locator('.kds-ticket').filter({ hasText: TABLE }).getByRole('button', { name: new RegExp('^' + b) }).first(); await btn.waitFor({ timeout: 10_000 }); await btn.click(); await tp.waitForTimeout(300) }
  await op.getByRole('button', { name: /^All Tables/ }).click(); await op.waitForTimeout(700)
  await op.locator('.wt-card', { hasText: TABLE }).getByRole('button', { name: 'Take Table' }).click(); await op.waitForTimeout(900)
  await op.getByRole('button', { name: /^My Tables/ }).click()
  await op.getByRole('button', { name: /Mark served/i }).first().waitFor({ timeout: 15_000 })
  let t0 = Date.now()
  await op.getByRole('button', { name: /Mark served/i }).first().click()
  const has = p => p.getByText(/Served, not billed yet/).first().isVisible()
  const nMs = await until('R2 served -> Nigar /bills "Served, not billed yet" (page already open)', t0, () => has(np))
  const lMs = await until('R2 served -> Leyla /bills "Served, not billed yet" (page already open)', t0, () => has(lp), nMs ? 5000 : 25_000)
  // reload both
  for (const [who, p] of [['Nigar', np], ['Leyla', lp]]) {
    const t1 = Date.now(); await p.reload(); await p.getByRole('heading', { name: 'Bills', exact: true }).waitFor();
    const ok = await until(`R2 ${who} /bills after RELOAD: unbilled card`, t1, () => has(p), 12_000)
    console.log(who, 'after reload:', ok ? (await p.locator('.v2-unbilled').innerText()).split('\n').join(' | ') : 'no card | ' + (await dash(p)).slice(0, 260))
    await C.shot(p, `r2-95-${who.toLowerCase()}-bills-unbilled-reload`)
  }
  // then Rauf pays so the table can be reset
  await rp.goto(C.CONSUMER + '/table'); await rp.getByRole('link', { name: /^View bill/ }).click()
  await rp.getByRole('heading', { name: 'Payment method' }).waitFor({ timeout: 20_000 })
  const card = rp.getByRole('radio', { name: /Card \(demo\)/ }); if ((await card.getAttribute('aria-checked')) !== 'true') await card.click()
  await rp.getByRole('button', { name: /^Pay ₼/ }).click()
  const confirm = rp.getByRole('button', { name: /\(demo\)$/ }); await confirm.waitFor({ timeout: 8000 }); await confirm.click()
  await rp.getByRole('heading', { name: 'Payment received' }).waitFor({ timeout: 20_000 })
  await op.getByRole('button', { name: /^All Tables/ }).click()
  await op.getByRole('button', { name: 'Reset table' }).first().waitFor({ timeout: 15_000 }).catch(() => {})
  await op.locator('.wt-card', { hasText: TABLE }).getByRole('button', { name: 'Reset table' }).click().catch(e => console.log('reset:', e.message.split('\n')[0]))
  console.log('problems:', JSON.stringify(sink.map(s => s.stage + ' ' + s.who + ' ' + s.kind + ' ' + s.text).filter(s => !/ERR_ABORTED|vibrate/.test(s)), null, 1))
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
