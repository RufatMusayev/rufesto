'use strict'
// Round 2, cycle C at T1: clean bell measurements. Rows are matched on "Table T1" and COUNTED before/after (other agents
// keep creating bookings and bill requests at Bella Roma, so a bare badge change proves nothing).
//  - waiter call with both panels OPEN: when does the row show up live (Orxan assigned, Leyla must not get it)
//  - bill request at reception with both panels OPEN: how many rows per recipient, how fast, where a tap goes
//  - Leyla settles from the bell link; Rauf sees it
const C = require('./common')
const TABLE = process.env.TABLE || 'T1'

const panelRows = page => page.locator('.notif-item').evaluateAll(els => els.map(e => ({ title: e.querySelector('.notif-item-title')?.innerText || '', detail: e.querySelector('.notif-detail')?.innerText || '', time: e.querySelector('.notif-time')?.innerText || '', unread: e.classList.contains('is-unread') })))
const countRows = async (page, re) => (await panelRows(page)).filter(r => re.test(r.title)).length
const badgeOf = async page => { const b = page.getByRole('button', { name: /^Notifications/ }).first(); if (!(await b.count())) return null; const m = ((await b.getAttribute('aria-label')) || '').match(/(\d+) new/); return m ? Number(m[1]) : 0 }
async function until(label, t0, fn, max = 20_000) {
  while (Date.now() - t0 < max) { let v; try { v = await fn() } catch { v = false } if (v) { C.timing(label, Date.now() - t0); return Date.now() - t0 }; await C.sleep(100) }
  C.timing(label, max, 'NOT SEEN in ' + max / 1000 + ' s'); return null
}
const openPanel = async p => { await p.getByRole('button', { name: /^Notifications/ }).first().click(); await p.locator('.notif-panel').waitFor({ timeout: 8000 }); await p.locator('.notif-skeleton').waitFor({ state: 'detached', timeout: 6000 }).catch(() => {}); await p.waitForTimeout(2500) }
const closePanel = p => p.locator('.notif-panel .modal-close').click().catch(() => {})

;(async () => {
  const browser = await C.launch()
  const sink = []
  const [O, T, L, R] = await Promise.all([
    C.open(browser, 'orxan', { who: 'Orxan', sink }), C.open(browser, 'tural', { who: 'Tural', sink }),
    C.open(browser, 'leyla', { who: 'Leyla', sink }), C.open(browser, 'rauf', { who: 'Rauf', geo: true, sink })])
  const op = O.page, tp = T.page, lp = L.page, rp = R.page
  const [tbl] = await L.api.rows(`tables?restaurant_id=eq.${C.BELLA}&table_number=eq.${TABLE}&select=id,state`)
  if (tbl.state === 'cleared') await L.api.patch(`tables?id=eq.${tbl.id}`, { state: 'free' })
  const [{ access_code: code }] = await L.api.rows(`table_access_codes?table_id=eq.${tbl.id}&select=access_code`)
  await Promise.all([op.goto(C.RESTO + '/waiter'), tp.goto(C.RESTO + '/kds'), lp.goto(C.RESTO + '/')])
  await lp.getByText('Recent orders', { exact: false }).first().waitFor({ timeout: 20_000 })
  await op.getByRole('button', { name: /^All Tables/ }).click()

  sink.stage = 'join'
  let t0 = Date.now()
  await rp.goto(C.CONSUMER + '/t/' + code, { waitUntil: 'domcontentloaded' })
  await rp.getByRole('heading', { name: 'Join this table?' }).waitFor({ timeout: 20_000 })
  await rp.getByRole('button', { name: 'Join', exact: true }).click()
  await rp.getByRole('heading', { name: 'Your Table' }).waitFor({ timeout: 20_000 })
  C.timing('R2 link join -> Your Table', Date.now() - t0)
  await until('R2 join -> Orxan All Tables shows ' + TABLE, t0, async () => (await op.locator('.wt-card', { hasText: TABLE }).count()) > 0)
  await op.locator('.wt-card', { hasText: TABLE }).getByRole('button', { name: 'Take Table' }).click()
  await op.waitForTimeout(900)

  // ---- waiter call, panels open
  sink.stage = 'call'
  await openPanel(op); await openPanel(lp)
  const reCall = new RegExp('Table ' + TABLE + ' · Waiter called')
  const preO = await countRows(op, reCall), preL = await countRows(lp, reCall)
  await rp.getByRole('button', { name: /Call waiter/ }).click(); await rp.waitForTimeout(400)
  t0 = Date.now()
  await rp.getByRole('button', { name: /Water/i }).first().click()
  await until('R2 waiter call (assigned table, panel open) -> new row in Orxan panel', t0, async () => (await countRows(op, reCall)) > preO)
  await lp.waitForTimeout(5000)
  console.log('call rows: Orxan', preO, '->', await countRows(op, reCall), '| Leyla', preL, '->', await countRows(lp, reCall), '(assigned table: only Orxan expected)')
  await C.shot(op, 'r2-80-orxan-panel-live', { full: false })
  await closePanel(op); await closePanel(lp)
  await op.getByRole('button', { name: /^Calls/ }).click(); await op.waitForTimeout(500)
  await C.shot(op, 'r2-81-orxan-calls-tab', { full: false })
  await op.getByRole('button', { name: /On my way/i }).first().click(); await op.waitForTimeout(900)
  await op.getByRole('button', { name: /^Done$/ }).first().click(); await op.waitForTimeout(900)

  // ---- order and serve
  sink.stage = 'order'
  await rp.getByRole('link', { name: /Browse the menu|Add More Items/ }).first().click()
  await rp.locator('.mn-row').first().waitFor({ timeout: 20_000 })
  await rp.locator('.mn-row').filter({ has: rp.locator('.mn-name', { hasText: /^Espresso$/ }) }).first().getByRole('button', { name: /^Add .* to order/ }).click()
  await rp.waitForTimeout(500)
  await rp.getByRole('button', { name: 'Open cart' }).click()
  const place = rp.getByRole('button', { name: /^Place Order/ }); await place.waitFor({ timeout: 8000 })
  await place.click()
  await rp.waitForTimeout(1500)
  for (const b of ['Start Preparing', 'Mark Ready', 'Done']) { const btn = tp.locator('.kds-ticket').filter({ hasText: TABLE }).getByRole('button', { name: new RegExp('^' + b) }).first(); await btn.waitFor({ timeout: 10_000 }); await btn.click(); await tp.waitForTimeout(400) }
  await rp.goto(C.CONSUMER + '/table'); await rp.getByRole('heading', { name: 'Your Table' }).waitFor()
  await op.getByRole('button', { name: /^My Tables/ }).click()
  await op.getByRole('button', { name: /Mark served/i }).first().waitFor({ timeout: 15_000 })
  t0 = Date.now()
  await op.getByRole('button', { name: /Mark served/i }).first().click()
  await until('R2 Orxan Mark served -> Rauf sees Served', t0, async () => /Served/.test(await C.text(rp)))

  // ---- bill at reception, panels open
  sink.stage = 'bill'
  await openPanel(op); await openPanel(lp)
  const reBill = new RegExp('Table ' + TABLE + ' · Bill requested')
  const bO = await countRows(op, reBill), bL = await countRows(lp, reBill)
  await rp.getByRole('link', { name: /^View bill/ }).click()
  await rp.getByRole('heading', { name: 'Payment method' }).waitFor({ timeout: 20_000 })
  await rp.getByRole('radio', { name: /Pay at reception/ }).click()
  t0 = Date.now()
  await rp.getByRole('button', { name: /^Notify staff/ }).click()
  await rp.getByText('Staff notified').waitFor({ timeout: 15_000 })
  C.timing('R2 Notify staff -> "Staff notified" on Rauf', Date.now() - t0)
  await until('R2 bill request (panels open) -> new row in Orxan panel', t0, async () => (await countRows(op, reBill)) > bO)
  await until('R2 bill request (panels open) -> new row in Leyla panel', t0, async () => (await countRows(lp, reBill)) > bL)
  await lp.waitForTimeout(4000)
  console.log('bill rows added: Orxan', (await countRows(op, reBill)) - bO, '| Leyla', (await countRows(lp, reBill)) - bL, '(1 expected per recipient)')
  console.log('Leyla top rows:', JSON.stringify((await panelRows(lp)).slice(0, 3)))
  await C.shot(lp, 'r2-82-leyla-panel-bill-live', { full: false }); await C.shot(op, 'r2-83-orxan-panel-bill-live', { full: false })
  await lp.locator('.notif-item', { hasText: reBill }).first().click()
  await lp.waitForTimeout(1500)
  console.log('Leyla taps the bill row ->', lp.url())
  await op.locator('.notif-item', { hasText: reBill }).first().click()
  await op.waitForTimeout(1200)
  console.log('Orxan taps the bill row ->', op.url())
  await C.shot(op, 'r2-84-orxan-after-tap', { full: false })

  // ---- settle
  sink.stage = 'settle'
  await lp.getByRole('heading', { name: 'Bills', exact: true }).waitFor()
  await lp.locator('.v2-bill-list').waitFor({ timeout: 15_000 })
  await lp.waitForTimeout(500)
  console.log('bill list (bell link):', (await C.text(lp, '.v2-bill-list')).split('\n').join(' | ').slice(0, 300))
  console.log('buttons:', JSON.stringify(await lp.locator('.v2-bill-list button').allInnerTexts()))
  await C.shot(lp, 'r2-85-leyla-bills-actions')
  await lp.locator('.v2-bill-list').getByRole('button', { name: /Mark whole bill paid|Mark paid|Settle/i }).first().click()
  t0 = Date.now()
  const dlg = lp.getByRole('dialog')
  if (await dlg.count()) { await C.shot(lp, 'r2-86-leyla-confirm', { full: false }); t0 = Date.now(); await dlg.getByRole('button', { name: /Mark whole bill paid|Mark paid|Confirm|Settle/i }).last().click() }
  await until('R2 Leyla confirms settle -> Rauf sees Settled', t0, async () => /Payment received|Bill settled|Settled/.test(await C.text(rp)))
  console.log('problems:', JSON.stringify(sink.map(s => s.stage + ' ' + s.who + ' ' + s.kind + ' ' + s.text).filter(s => !/ERR_ABORTED|vibrate/.test(s)), null, 1))
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
