'use strict'
// Round 2, cycle B at T1 (controlled bell experiment + card payment with a tip for Orxan):
// Rauf joins by link, Orxan takes the table FIRST (so the call goes to him only), both Orxan and Leyla keep the panel OPEN
// while Rauf calls the waiter, then order -> kitchen (T1 tickets only) -> Mark served on My Tables -> card + 10 % tip -> bells.
const C = require('./common')
const TABLE = process.env.TABLE || 'T1'

const panelRows = page => page.locator('.notif-item').evaluateAll(els => els.map(e => ({ title: e.querySelector('.notif-item-title')?.innerText || '', detail: e.querySelector('.notif-detail')?.innerText || '', time: e.querySelector('.notif-time')?.innerText || '', unread: e.classList.contains('is-unread') })))
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
const rowMatch = (rows, re) => rows.find(r => re.test(r.title + ' ' + r.detail) && /just now|^[0-2]m ago/.test(r.time))
const openPanel = async p => { await p.getByRole('button', { name: /^Notifications/ }).first().click(); await p.locator('.notif-panel').waitFor({ timeout: 8000 }) }

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
  await Promise.all([op.goto(C.RESTO + '/waiter'), tp.goto(C.RESTO + '/kds'), lp.goto(C.RESTO + '/')])
  await lp.getByText('Recent orders', { exact: false }).first().waitFor({ timeout: 20_000 })
  await op.getByRole('button', { name: /^All Tables/ }).click()
  await tp.waitForTimeout(1000)

  // ---- kitchen bell: what does Tural see?
  sink.stage = 'tural-bell'
  console.log('Tural bell:', await badgeOf(tp))
  if ((await badgeOf(tp)) !== null) {
    await openPanel(tp); await tp.waitForTimeout(2000)
    console.log('Tural panel rows:', JSON.stringify((await panelRows(tp)).slice(0, 6)))
    await C.shot(tp, 'r2-70-tural-panel', { full: false })
    await tp.locator('.notif-panel .modal-close').click()
  }

  // ---- Rauf joins by link, Orxan takes the table
  sink.stage = 'join'
  let t0 = Date.now()
  await rp.goto(C.CONSUMER + '/t/' + code, { waitUntil: 'domcontentloaded' })
  await rp.getByRole('heading', { name: 'Join this table?' }).waitFor({ timeout: 20_000 })
  await rp.getByRole('button', { name: 'Join', exact: true }).click()
  await rp.getByRole('heading', { name: 'Your Table' }).waitFor({ timeout: 20_000 })
  C.timing('R2 link join: open /t/<code> -> Your Table', Date.now() - t0)
  await until('R2 join -> Orxan All Tables shows ' + TABLE + ' (no reload)', t0, async () => (await op.locator('.wt-card', { hasText: TABLE }).count()) > 0)
  await C.shot(op, 'r2-71-orxan-all-tables-joined')
  await op.locator('.wt-card', { hasText: TABLE }).getByRole('button', { name: 'Take Table' }).click()
  await op.waitForTimeout(900)

  // ---- panels open on both, then Rauf calls the waiter
  sink.stage = 'call'
  await openPanel(op); await openPanel(lp)
  await op.waitForTimeout(1800); await lp.waitForTimeout(500)
  await rp.getByRole('button', { name: /Call waiter/ }).click(); await rp.waitForTimeout(400)
  t0 = Date.now()
  await rp.getByRole('button', { name: /Needs help|Assist|Help/i }).first().click()
  const oMs = await until('R2 call (assigned table, panel OPEN) -> row appears in Orxan panel, no reload', t0, async () => rowMatch(await panelRows(op), new RegExp('Table ' + TABLE + '.*Waiter called', 'i')))
  await C.shot(op, 'r2-72-orxan-panel-live-call', { full: false })
  await lp.waitForTimeout(5000)
  const lRow = rowMatch(await panelRows(lp), new RegExp('Table ' + TABLE + '.*Waiter called', 'i'))
  console.log('Leyla panel got the call of an ASSIGNED table?', lRow ? 'YES ' + JSON.stringify(lRow) : 'no (routing to the assigned waiter only)')
  await C.shot(lp, 'r2-73-leyla-panel-no-call', { full: false })
  await op.locator('.notif-panel .modal-close').click(); await lp.locator('.notif-panel .modal-close').click()
  // Orxan answers the call from the Calls tab
  await op.getByRole('button', { name: /^Calls/ }).click(); await op.waitForTimeout(500)
  await op.getByRole('button', { name: /On my way/i }).first().click()
  await op.waitForTimeout(800)
  await op.getByRole('button', { name: /^Done$/ }).first().click()
  await op.waitForTimeout(800)

  // ---- order (Cappuccino with "+") and kitchen on T1 only
  sink.stage = 'order'
  await rp.getByRole('link', { name: /Browse the menu|Add More Items/ }).first().click()
  await rp.locator('.mn-row').first().waitFor({ timeout: 20_000 })
  await rp.locator('.mn-row').filter({ has: rp.locator('.mn-name', { hasText: /^Cappuccino$/ }) }).first().getByRole('button', { name: /^Add .* to order/ }).click()
  await rp.waitForTimeout(500)
  await rp.getByRole('button', { name: 'Open cart' }).click()
  const place = rp.getByRole('button', { name: /^Place Order/ }); await place.waitFor({ timeout: 8000 })
  const tickets = () => tp.locator('.kds-ticket').filter({ hasText: TABLE }).count()
  const before = await tickets()
  t0 = Date.now(); await place.click()
  await until('R2 Place Order -> ticket on Tural /kds (' + TABLE + ')', t0, async () => (await tickets()) > before)
  for (const b of ['Start Preparing', 'Mark Ready', 'Done']) { const btn = tp.locator('.kds-ticket').filter({ hasText: TABLE }).getByRole('button', { name: new RegExp('^' + b) }).first(); await btn.waitFor({ timeout: 8000 }); await btn.click(); await tp.waitForTimeout(400) }
  await op.getByRole('button', { name: /^My Tables/ }).click()
  await op.getByRole('button', { name: /Mark served/i }).first().waitFor({ timeout: 15_000 })
  t0 = Date.now()
  await op.getByRole('button', { name: /Mark served/i }).first().click()
  await until('R2 Orxan Mark served (My Tables) -> Rauf sees Served', t0, async () => /Served/.test(await C.text(rp)))

  // ---- card payment with a 10 % tip for Orxan; watch the bells
  sink.stage = 'pay'
  const bO = await badgeOf(op), bL = await badgeOf(lp)
  await rp.goto(C.CONSUMER + '/table'); await rp.getByRole('link', { name: /^View bill/ }).click()
  await rp.getByRole('heading', { name: 'Payment method' }).waitFor({ timeout: 20_000 })
  console.log('default payment method:', await rp.getByRole('radio', { checked: true }).first().innerText().catch(() => '?'))
  const card = rp.getByRole('radio', { name: /Card \(demo\)/ }); if ((await card.getAttribute('aria-checked')) !== 'true') await card.click()
  await rp.getByRole('radiogroup', { name: 'Add a tip' }).getByRole('radio', { name: /^10%/ }).click()
  const picker = rp.getByRole('radiogroup', { name: 'Who gets the tip?' })
  console.log('tip receivers offered:', JSON.stringify((await picker.getByRole('radio').allInnerTexts()).map(x => x.split('\n').join(' '))))
  console.log('Orxan preselected:', await picker.getByRole('radio', { name: /Orxan/ }).getAttribute('aria-checked'))
  await C.shot(rp, 'r2-74-rauf-bill-tip', { full: true })
  await rp.getByRole('button', { name: /^Pay ₼/ }).click()
  const confirm = rp.getByRole('button', { name: /\(demo\)$/ }); await confirm.waitFor({ timeout: 8000 })
  t0 = Date.now(); await confirm.click()
  await until('R2 pay confirm -> "Payment received" on Rauf', t0, async () => rp.getByRole('heading', { name: 'Payment received' }).isVisible())
  await lp.waitForTimeout(4000)
  console.log('bells after the card payment: Orxan', bO, '->', await badgeOf(op), '| Leyla', bL, '->', await badgeOf(lp), '(other agents add noise)')
  console.log('problems:', JSON.stringify(sink.map(s => s.stage + ' ' + s.who + ' ' + s.kind + ' ' + s.text).filter(s => !/ERR_ABORTED|vibrate/.test(s)), null, 1))
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
