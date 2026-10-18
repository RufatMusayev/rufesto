'use strict'
// Round 3, cycle 2 at T1: join by link, order two drinks, kitchen, Mark served, CARD payment with a 10 % tip for Orxan, then a review.
// Watchers with the panel OPEN: Orxan, Leyla, Tural (kitchen). Checks: no second "Bill requested" for a card payment, the new
// "Table T1 paid ₼... by card" row (who, tip), what the kitchen bell shows, the review row for Leyla.
const C = require('./common')
const P = require('./panel3')
const TABLE = process.env.TABLE || 'T1'

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
  console.log('table', TABLE, tbl.state)
  await Promise.all([op.goto(C.RESTO + '/waiter'), tp.goto(C.RESTO + '/kds'), lp.goto(C.RESTO + '/')])
  await op.getByRole('button', { name: /^All Tables/ }).click()
  await lp.getByText('Overview', { exact: false }).first().waitFor({ timeout: 20_000 })

  sink.stage = 'join'
  let t0 = Date.now()
  await rp.goto(C.CONSUMER + '/t/' + code, { waitUntil: 'domcontentloaded' })
  await rp.getByRole('heading', { name: 'Join this table?' }).waitFor({ timeout: 20_000 })
  await rp.getByRole('button', { name: 'Join', exact: true }).click()
  await rp.getByRole('heading', { name: 'Your Table' }).waitFor({ timeout: 20_000 })
  C.timing('R3 link join -> Your Table', Date.now() - t0)
  await P.until('R3 join -> Orxan All Tables shows ' + TABLE, t0, async () => (await op.locator('.wt-card', { hasText: TABLE }).count()) > 0)
  await op.locator('.wt-card', { hasText: TABLE }).getByRole('button', { name: 'Take Table' }).click(); await op.waitForTimeout(900)

  sink.stage = 'order'
  await rp.getByRole('link', { name: /Browse the menu|Add More Items/ }).first().click()
  await rp.locator('.mn-row').first().waitFor({ timeout: 20_000 })
  for (const name of ['Espresso', 'Cappuccino']) { await rp.locator('.mn-row').filter({ has: rp.locator('.mn-name', { hasText: new RegExp('^' + name + '$') }) }).first().getByRole('button', { name: /^Add .* to order/ }).click(); await rp.waitForTimeout(450) }
  const toastView = rp.getByRole('button', { name: /^View( cart)?$/ }).or(rp.getByRole('link', { name: /^View( cart)?$/ })).first()
  if (await toastView.count()) await toastView.click(); else await rp.getByRole('button', { name: /Open cart|cart/i }).first().click()
  const place = rp.getByRole('button', { name: /^Place Order/ }); await place.waitFor({ timeout: 8000 })
  const tickets = () => tp.locator('.kds-ticket').filter({ hasText: TABLE }).count()
  const before = await tickets()
  t0 = Date.now(); await place.click()
  await P.until('R3 Place Order -> 2 ' + TABLE + ' tickets on Tural /kds', t0, async () => (await tickets()) >= before + 2)
  for (const b of ['Start Preparing', 'Mark Ready', 'Done']) for (let n = 0; n < 2; n++) { const btn = tp.locator('.kds-ticket').filter({ hasText: TABLE }).getByRole('button', { name: new RegExp('^' + b) }).first(); await btn.waitFor({ timeout: 10_000 }); await btn.click(); await tp.waitForTimeout(250) }
  await rp.goto(C.CONSUMER + '/table'); await rp.getByRole('heading', { name: 'Your Table' }).waitFor()
  await op.getByRole('button', { name: /^My Tables/ }).click()
  await op.getByRole('button', { name: /Mark served/i }).first().waitFor({ timeout: 15_000 })
  t0 = Date.now(); await op.getByRole('button', { name: /Mark served/i }).first().click()
  await P.until('R3 Orxan Mark served -> Rauf sees Served', t0, async () => /Served/.test(await C.text(rp)))

  sink.stage = 'pay'
  await P.openPanel(op); await P.openPanel(lp); await P.openPanel(tp)
  const reReq = new RegExp('Table ' + TABLE + ' · Bill requested'), rePaid = new RegExp('Table ' + TABLE + ' paid')
  const pre = { reqO: await P.countRows(op, reReq), reqL: await P.countRows(lp, reReq), paidO: await P.countRows(op, rePaid), paidL: await P.countRows(lp, rePaid), tural: (await P.readPanel(tp)).length }
  await rp.getByRole('link', { name: /^View bill/ }).click()
  await rp.getByRole('heading', { name: 'Payment method' }).waitFor({ timeout: 20_000 })
  const card = rp.getByRole('radio', { name: /Card \(demo\)/ }); if ((await card.getAttribute('aria-checked')) !== 'true') await card.click()
  await rp.getByRole('radiogroup', { name: 'Add a tip' }).getByRole('radio', { name: /^10%/ }).click()
  await rp.getByRole('radiogroup', { name: 'Who gets the tip?' }).getByRole('radio', { name: /Orxan/ }).click()
  await C.shot(rp, 'r3-60-rauf-bill-tip', { full: false })
  await rp.getByRole('button', { name: /^Pay ₼/ }).click()
  const confirm = rp.getByRole('button', { name: /\(demo\)$/ }); await confirm.waitFor({ timeout: 8000 })
  await C.shot(rp, 'r3-61-rauf-demo-sheet', { full: false })
  t0 = Date.now(); await confirm.click()
  await P.until('R3 pay confirm -> "Payment received" on Rauf', t0, async () => rp.getByRole('heading', { name: 'Payment received' }).isVisible())
  await P.until('R3 card payment (panels open) -> "Table T1 paid" row in Leyla panel', t0, async () => (await P.countRows(lp, rePaid)) > pre.paidL)
  await P.until('R3 card payment (panels open) -> "Table T1 paid" row in Orxan panel', t0, async () => (await P.countRows(op, rePaid)) > pre.paidO)
  await lp.waitForTimeout(4000)
  console.log('card payment rows: paid Orxan +', (await P.countRows(op, rePaid)) - pre.paidO, '| paid Leyla +', (await P.countRows(lp, rePaid)) - pre.paidL, '| "Bill requested" Orxan +', (await P.countRows(op, reReq)) - pre.reqO, '| Leyla +', (await P.countRows(lp, reReq)) - pre.reqL, '| Tural rows', pre.tural, '->', (await P.readPanel(tp)).length)
  console.log('Leyla top:', JSON.stringify(P.fmt((await P.readPanel(lp)).slice(0, 3))))
  console.log('Orxan top:', JSON.stringify(P.fmt((await P.readPanel(op)).slice(0, 3))))
  await C.shot(lp, 'r3-62-leyla-panel-paid', { full: false }); await C.shot(op, 'r3-63-orxan-panel-paid', { full: false }); await C.shot(tp, 'r3-64-tural-panel-paid', { full: false })
  await P.closePanel(op); await P.closePanel(tp)
  const bellL = await P.badgeOf(lp)

  // ---- review (compact reviews)
  sink.stage = 'review'
  await rp.waitForTimeout(800); await C.shot(rp, 'r3-65-rauf-settled', { full: true })
  console.log('settled screen:', (await C.text(rp)).split('\n').join(' | ').slice(0, 360))
  const star = rp.getByRole('radio', { name: /Rate Espresso: 5 of 5|Espresso.*5/i }).first()
  if (await star.count()) { await star.click(); await rp.getByPlaceholder(/comment/i).fill('Proper espresso, quick and hot.').catch(() => {}); await C.shot(rp, 'r3-66-rauf-review-form', { full: false })
    t0 = Date.now(); await rp.getByRole('button', { name: /Send review|Send|Post/i }).first().click(); await rp.getByText(/Thanks for your review/).waitFor({ timeout: 15_000 }).catch(() => console.log('no thanks text'))
    C.timing('R3 Send review -> thanks on Rauf', Date.now() - t0)
    await P.until('R3 review -> "New review" row in Leyla open panel', t0, async () => (await P.rowsMatching(lp, /New review/)).some(r => /Espresso/.test(r.detail) && /now|1m|0m/.test(r.time)))
    console.log('Leyla review row:', JSON.stringify(P.fmt((await P.rowsMatching(lp, /New review/)).slice(0, 1))), '| Orxan has review rows?', (await P.rowsMatching(op, /New review/)).length)
    await C.shot(lp, 'r3-67-leyla-panel-review', { full: false })
  } else console.log('no star control found; review section text:', (await C.text(rp)).slice(-300))
  console.log('problems:', JSON.stringify(sink.map(s => s.stage + ' ' + s.who + ' ' + s.kind + ' ' + s.text).filter(s => !/ERR_ABORTED|vibrate/.test(s)), null, 1))
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
