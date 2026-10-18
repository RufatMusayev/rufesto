'use strict'
// Round 3: N4 (panel opens on a stale list?) and N5 (vibrate console error) with the panels CLOSED when a waiter call arrives.
const C = require('./common')
const P = require('./panel3')
const TABLE = process.env.TABLE || 'T1'

;(async () => {
  const browser = await C.launch()
  const sink = []
  const [O, L, R] = await Promise.all([C.open(browser, 'orxan', { who: 'Orxan', sink }), C.open(browser, 'leyla', { who: 'Leyla', sink }), C.open(browser, 'rauf', { who: 'Rauf', geo: true, sink })])
  const op = O.page, lp = L.page, rp = R.page
  const consoleAll = []
  op.on('console', m => { if (['error', 'warning'].includes(m.type())) consoleAll.push(m.type() + ': ' + m.text().slice(0, 140)) })
  const [tbl] = await L.api.rows(`tables?restaurant_id=eq.${C.BELLA}&table_number=eq.${TABLE}&select=id,state`)
  if (tbl.state === 'cleared') await L.api.patch(`tables?id=eq.${tbl.id}`, { state: 'free' })
  const [{ access_code: code }] = await L.api.rows(`table_access_codes?table_id=eq.${tbl.id}&select=access_code`)
  await Promise.all([op.goto(C.RESTO + '/waiter'), lp.goto(C.RESTO + '/')])
  await rp.goto(C.CONSUMER + '/t/' + code, { waitUntil: 'domcontentloaded' })
  await rp.getByRole('heading', { name: 'Join this table?' }).waitFor({ timeout: 20_000 })
  await rp.getByRole('button', { name: 'Join', exact: true }).click()
  await rp.getByRole('heading', { name: 'Your Table' }).waitFor({ timeout: 20_000 })
  await op.getByRole('button', { name: /^Calls/ }).waitFor({ timeout: 20_000 }); await lp.getByText('Overview', { exact: false }).first().waitFor({ timeout: 20_000 })
  await rp.waitForTimeout(1500)
  // make sure the 2-minute throttle of this guest and table is over
  for (let i = 0; i < 70 && /Wait \d+s/.test(await rp.locator('.table-call-btn').innerText()); i++) await rp.waitForTimeout(2000)
  const reCall = new RegExp('Table ' + TABLE + ' · Waiter called')
  const bO = await P.badgeOf(op), bL = await P.badgeOf(lp)
  await rp.locator('.table-call-btn').click(); await rp.waitForTimeout(500)
  const t0 = Date.now(); await rp.getByRole('button', { name: /Need help/i }).first().click()
  const oMs = await P.until('R3 call, panel closed -> Orxan badge +1 (noisy: other agents)', t0, async () => (await P.badgeOf(op)) > bO, 15_000)
  const lMs = await P.until('R3 call, panel closed -> Leyla badge +1 (noisy: other agents)', t0, async () => (await P.badgeOf(lp)) > bL, 15_000)
  for (const [who, p, shot] of [['Orxan', op, 'r3-80-orxan-panel-first-open'], ['Leyla', lp, 'r3-81-leyla-panel-first-open']]) {
    const t1 = Date.now()
    await p.getByRole('button', { name: /^Notifications/ }).first().click(); await p.locator('.notif-panel').waitFor()
    const first = (await P.readPanel(p)).slice(0, 2)
    let seen = null
    while (Date.now() - t1 < 8000) { const r = (await P.rowsMatching(p, reCall)).find(x => x.action && /now|^0m/.test(x.time)); if (r) { seen = Date.now() - t1; break }; await C.sleep(100) }
    C.timing(`R3 ${who}: open panel (closed before the call) -> new "Waiter called" row`, seen ?? 8000, seen === null ? 'NOT SEEN' : '')
    console.log(`${who}: rows read right at open: ${JSON.stringify(P.fmt(first))}`)
    await C.shot(p, shot, { full: false })
    if (who === 'Orxan') { await p.locator('.notif-panel li.notif-row', { hasText: reCall }).first().getByRole('button', { name: 'On my way' }).click().catch(() => {}); await p.waitForTimeout(800) }
    await P.closePanel(p)
  }
  console.log('Orxan console errors/warnings (unfiltered):', JSON.stringify(consoleAll))
  // cleanup: finish the call, Rauf leaves, table back to free
  await op.getByRole('button', { name: /^Calls/ }).click(); await op.waitForTimeout(600)
  await op.getByRole('button', { name: /^Done$/ }).first().click().catch(() => {}); await op.waitForTimeout(800)
  const ra = C.makeApi(R.auth); const s = await ra.rpc('my_table_session'); if (s.data?.table_id) await ra.rpc('leave_table', { p_table_id: s.data.table_id })
  const [t2] = await L.api.rows(`tables?id=eq.${tbl.id}&select=state`); if (t2.state === 'cleared') await L.api.patch(`tables?id=eq.${tbl.id}`, { state: 'free' })
  console.log('table now', (await L.api.rows(`tables?id=eq.${tbl.id}&select=state`))[0]?.state)
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
