'use strict'
// Round 2, consumer checks: "Order this" for a visitor who is not seated; the seated table page (VAT lines, 24-hour times,
// the "+" toast); Rauf's own bell. Leaves nothing behind (order cancelled by Leyla, Rauf leaves, table freed).
const C = require('./common')
const TABLE = process.env.TABLE || 'T2'
const flat = async (p, sel) => (await C.text(p, sel)).split('\n').join(' | ')

;(async () => {
  const browser = await C.launch()
  const sink = []
  const V = await C.open(browser, 'anon', { geo: true, sink })
  const vp = V.page
  await vp.goto(C.CONSUMER + '/'); await vp.waitForTimeout(3500)
  const post = vp.locator('article').filter({ has: vp.getByRole('link', { name: /order this/i }) }).first()
  await post.waitFor({ timeout: 15_000 })
  await post.scrollIntoViewIfNeeded()
  console.log('post buttons:', JSON.stringify(await post.getByRole('button').allInnerTexts()))
  await post.getByRole('link', { name: /order this/i }).first().click(); await vp.waitForTimeout(1800)
  console.log('Order this (signed out, not seated) ->', vp.url(), '|', (await flat(vp, '.overlay, [role=dialog], main')).slice(0, 300))
  await C.shot(vp, 'r2-130-order-this-visitor', { full: false })

  const L = C.makeApi(await C.login('Leyla'))
  const [tbl] = await L.rows(`tables?restaurant_id=eq.${C.BELLA}&table_number=eq.${TABLE}&select=id,state`)
  const [{ access_code: code }] = await L.rows(`table_access_codes?table_id=eq.${tbl.id}&select=access_code`)
  const R = await C.open(browser, 'rauf', { who: 'Rauf', geo: true, sink }); const rp = R.page
  await rp.goto(C.CONSUMER + '/t/' + code, { waitUntil: 'domcontentloaded' })
  await rp.getByRole('heading', { name: 'Join this table?' }).waitFor({ timeout: 20_000 })
  await rp.getByRole('button', { name: 'Join', exact: true }).click()
  await rp.getByRole('heading', { name: 'Your Table' }).waitFor({ timeout: 20_000 })
  await rp.getByRole('link', { name: /Browse the menu|Add More Items/ }).first().click()
  await rp.locator('.mn-row').first().waitFor({ timeout: 20_000 })
  const row = rp.locator('.mn-row').filter({ has: rp.locator('.mn-name', { hasText: /^Spaghetti alla Carbonara$/ }) }).first()
  await row.getByRole('button', { name: /^Add .* to order/ }).click(); await rp.waitForTimeout(400)
  await C.shot(rp, 'r2-131-rauf-plus-toast', { full: false })
  console.log('toast / cart badge:', (await flat(rp, '.cart-added-toast, [role=status], .toast').catch(() => '')).slice(0, 160))
  await rp.getByRole('button', { name: 'Open cart' }).click()
  console.log('cart text:', (await flat(rp, '.overlay, [role=dialog]')).slice(0, 300))
  await C.shot(rp, 'r2-132-rauf-cart', { full: false })
  await rp.getByRole('button', { name: /^Place Order/ }).click(); await rp.waitForTimeout(1500)
  await rp.goto(C.CONSUMER + '/table'); await rp.getByRole('heading', { name: 'Your Table' }).waitFor()
  console.log('/table text:', (await flat(rp, 'main, body')).slice(0, 520))
  await C.shot(rp, 'r2-133-rauf-table-page')
  // Rauf's own bell (consumer) while the order is placed
  const bell = rp.getByRole('button', { name: /Notifications/ }).first()
  console.log('Rauf bell label:', await bell.getAttribute('aria-label'))
  await bell.click().catch(() => {}); await rp.waitForTimeout(1800)
  console.log('Rauf bell page:', rp.url(), '|', (await flat(rp, 'main, body')).slice(0, 360))
  await C.shot(rp, 'r2-134-rauf-notifications', { full: false })

  // cleanup
  const open = await L.rows(`orders?restaurant_id=eq.${C.BELLA}&user_id=eq.${C.makeApi(await C.login('Rauf')).userId}&status=in.(open,submitted,preparing,ready,served)&select=id`)
  for (const o of open) await L.patch(`orders?id=eq.${o.id}`, { status: 'cancelled' })
  const tk = await L.rows(`kds_tickets?restaurant_id=eq.${C.BELLA}&status=in.(new,preparing,ready)&select=id,order_items!order_item_id(orders(table_id))`)
  const mine = tk.filter(t => t.order_items?.orders?.table_id === tbl.id).map(t => t.id)
  if (mine.length) await L.patch(`kds_tickets?id=in.(${mine.join(',')})`, { status: 'cancelled' })
  const ra = C.makeApi(await C.login('Rauf')); const s = await ra.rpc('my_table_session'); if (s.data?.table_id) await ra.rpc('leave_table', { p_table_id: s.data.table_id })
  const [t2] = await L.rows(`tables?id=eq.${tbl.id}&select=state`); if (t2.state === 'cleared') await L.patch(`tables?id=eq.${tbl.id}`, { state: 'free' })
  console.log('cleanup done, table state:', (await L.rows(`tables?id=eq.${tbl.id}&select=state`))[0]?.state)
  console.log('problems:', JSON.stringify(sink.map(s => s.stage + ' ' + s.who + ' ' + s.kind + ' ' + s.text).filter(s => !/ERR_ABORTED|vibrate/.test(s)).slice(0, 6)))
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
