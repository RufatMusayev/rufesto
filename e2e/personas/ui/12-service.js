'use strict'
// Live service, step 3: Orxan takes the table, Rauf calls the waiter (water), Tural runs both tickets through the kitchen board,
// Orxan marks the order served. Four live pages at once; every hop is timed (click -> what the OTHER person sees, no reload).
const C = require('./common')

const clickToSee = async (label, t0, ...probes) => {
  // each probe: [name, async () => bool]; polls every 100 ms up to 15 s; logs ms per probe
  const res = {}
  while (Date.now() - t0 < 15_000 && Object.keys(res).length < probes.length) {
    for (const [name, fn] of probes) if (!(name in res) && await fn().catch(() => false)) res[name] = Date.now() - t0
    await C.sleep(100)
  }
  for (const [name] of probes) C.timing(`${label} -> ${name}`, res[name] ?? 15_000, res[name] === undefined ? 'NOT SEEN in 15 s' : '')
  return res
}

;(async () => {
  const browser = await C.launch()
  const sink = []
  const [O, T, L, R] = await Promise.all([
    C.open(browser, 'orxan', { who: 'Orxan', sink }), C.open(browser, 'tural', { who: 'Tural', sink }),
    C.open(browser, 'leyla', { who: 'Leyla', sink }), C.open(browser, 'rauf', { who: 'Rauf', geo: true, sink })])
  const op = O.page, tp = T.page, lp = L.page, rp = R.page
  sink.stage = 'setup'
  await Promise.all([op.goto(C.RESTO + '/waiter'), tp.goto(C.RESTO + '/kds'), lp.goto(C.RESTO + '/orders'), rp.goto(C.CONSUMER + '/table')])
  await op.getByRole('button', { name: /^All Tables/ }).click()
  await tp.locator('.kds-ticket').first().waitFor({ timeout: 20_000 })
  await rp.getByText(/Your Table/).waitFor({ timeout: 20_000 })
  await lp.waitForTimeout(1500)
  const rText = () => C.text(rp)
  const lText = () => C.text(lp, '.dash-content')
  console.log('rauf /table now:', (await rText()).replace(/\n+/g, ' | ').slice(0, 500))
  console.log('leyla /orders now:', (await lText()).replace(/\n+/g, ' | ').slice(0, 400))

  // ---- 1. Orxan takes the table
  sink.stage = 'take-table'
  let t0 = Date.now()
  await op.getByRole('button', { name: 'Take Table' }).click()
  await clickToSee('Orxan Take Table', t0, ['Orxan sees "Mine"', () => op.getByText('Mine', { exact: true }).isVisible()])
  await C.shot(op, '61-orxan-took-table')
  await op.getByRole('button', { name: /^My Tables/ }).click(); await op.waitForTimeout(600)
  console.log('Orxan My Tables:', (await C.text(op, '.dash-content')).replace(/\n+/g, ' | ').slice(0, 400))
  await C.shot(op, '62-orxan-my-tables')

  // ---- 2. Rauf calls the waiter for water
  sink.stage = 'call-waiter'
  await rp.getByRole('button', { name: /Call waiter/ }).click()
  await rp.waitForTimeout(500)
  await C.shot(rp, '63-rauf-call-sheet', { full: false })
  t0 = Date.now()
  await rp.getByRole('button', { name: /Water/i }).first().click()
  await clickToSee('Rauf requests water', t0,
    ['Orxan Calls tab badge (no reload)', async () => /Calls \(1\)/.test(await op.getByRole('button', { name: /^Calls/ }).innerText())],
    ['Rauf button says "Waiter called"', async () => /called|on the way/i.test(await rp.locator('.table-call-btn').innerText())])
  await op.getByRole('button', { name: /^Calls/ }).click(); await op.waitForTimeout(500)
  await C.shot(op, '64-orxan-calls')
  console.log('Orxan Calls:', (await C.text(op, '.dash-content')).replace(/\n+/g, ' | ').slice(0, 400))
  t0 = Date.now()
  await op.getByRole('button', { name: /On my way/i }).first().click()
  await clickToSee('Orxan On my way', t0, ['Rauf sees "on the way"', async () => /on the way/i.test(await rp.locator('.table-call-btn').innerText())])
  t0 = Date.now()
  await op.getByRole('button', { name: /^Done$/ }).first().click()
  await clickToSee('Orxan Done (call resolved)', t0, ['Orxan Calls (0)', async () => /Calls \(0\)/.test(await op.getByRole('button', { name: /^Calls/ }).innerText())])

  // ---- 3. Tural: both tickets through the board
  sink.stage = 'kitchen'
  const tickets = () => tp.locator('.kds-ticket').count()
  const colCount = async name => Number((await tp.locator('.kds-col', { hasText: new RegExp('^' + name, 'i') }).locator('.kds-col-count').innerText().catch(() => '-1')))
  const orderStatusLeyla = async () => (await lText()).match(/\b(OPEN|SUBMITTED|PREPARING|READY|SERVED|PAID|CANCELLED)\b/)?.[1] || '?'
  const orderStatusRauf = async () => (await rText()).match(/\b(Open|Submitted|Preparing|Ready|Served|Paid|Placed|Received|Cooking)\b/i)?.[1] || '?'
  console.log('status before kitchen: leyla', await orderStatusLeyla(), '| rauf', await orderStatusRauf())
  for (const [i, [btn, col, nextCol]] of [['Start Preparing', 'new', 'preparing'], ['Mark Ready', 'preparing', 'ready'], ['Done', 'ready', null]].entries()) {
    for (let n = 0; n < 2; n++) {
      const b = tp.getByRole('button', { name: new RegExp('^' + btn) }).first()
      await b.waitFor({ timeout: 8000 })
      const beforeLeyla = await orderStatusLeyla(), beforeRauf = await orderStatusRauf()
      const beforeRText = await rText()
      t0 = Date.now()
      await b.click()
      const probes = [[`Tural board moves the ticket`, async () => nextCol ? (await colCount(nextCol)) > n : (await tickets()) < 2 - n]]
      probes.push(['Rauf /table text changes (no reload)', async () => (await rText()) !== beforeRText])
      probes.push(['Leyla /orders text changes (no reload)', async () => (await lText()).replace(/\d+m ago|just now/g, '') !== lastL])
      var lastL = (await lText()).replace(/\d+m ago|just now/g, '')
      await clickToSee(`Tural "${btn}" #${n + 1}`, t0, ...probes)
      console.log(`  after "${btn}" #${n + 1}: leyla status ${await orderStatusLeyla()} (was ${beforeLeyla}) | rauf ${await orderStatusRauf()} (was ${beforeRauf})`)
      if (n === 0) await C.shot(tp, `65-kds-${i}-${btn.split(' ')[0]}`, { full: false })
    }
  }
  await C.shot(rp, '66-rauf-after-kitchen')
  await C.shot(lp, '67-leyla-orders-after-kitchen')
  console.log('rauf /table after kitchen:', (await rText()).replace(/\n+/g, ' | ').slice(0, 600))
  console.log('leyla /orders after kitchen:', (await lText()).replace(/\n+/g, ' | ').slice(0, 500))
  console.log('problems:', JSON.stringify(sink.map(s => `${s.stage} ${s.who} ${s.kind} ${s.text}`), null, 1))
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
