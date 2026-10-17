'use strict'
// Round 2, Leyla's morning: Today / Yesterday / This week on Overview, Orders, Bills; Tips + CSV; checked against the database.
const fs = require('fs')
const path = require('path')
const C = require('./common')

const bakuDay = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baku' }).format(d instanceof Date ? d : new Date(d))
const ready = (page, ms = 20_000) => page.waitForFunction(() => !document.querySelector('.skeleton, .spinner') && (document.querySelector('.dash-content')?.innerText || '').trim().length > 20, null, { timeout: ms }).catch(() => {})
const flat = async (page, sel = '.dash-content') => (await C.text(page, sel)).split('\n').join(' | ')

;(async () => {
  const browser = await C.launch()
  const sink = []
  const L = await C.open(browser, 'leyla', { who: 'Leyla', sink })
  const { page, api } = L

  // ---- truth from the database (orders as RLS lets the manager read them)
  const orders = await api.rows(`orders?restaurant_id=eq.${C.BELLA}&select=id,status,total_amount,placed_at,user_id&order=placed_at.desc&limit=1000`)
  const byDay = {}
  for (const o of orders) {
    const d = bakuDay(o.placed_at); byDay[d] = byDay[d] || { n: 0, nCancelled: 0, paidSum: 0, orderedSum: 0 }
    byDay[d].n++
    if (o.status === 'cancelled') byDay[d].nCancelled++
    if (o.status === 'paid') byDay[d].paidSum += Number(o.total_amount)
    if (!['cancelled', 'refunded'].includes(o.status)) byDay[d].orderedSum += Number(o.total_amount)
  }
  for (const k of Object.keys(byDay)) for (const f of ['paidSum', 'orderedSum']) byDay[k][f] = Math.round(byDay[k][f] * 100) / 100
  console.log('DB orders per Baku day:', JSON.stringify(byDay))

  // ---- Overview
  sink.stage = 'overview'
  let t0 = Date.now()
  await page.goto(C.RESTO + '/', { waitUntil: 'domcontentloaded' })
  await page.getByText('Recent orders', { exact: false }).first().waitFor({ timeout: 20_000 })
  C.timing('R2 Overview ready (signed-in, fresh load)', Date.now() - t0)
  for (const chip of ['Today', 'Yesterday', 'This week']) {
    t0 = Date.now()
    await page.getByRole('button', { name: chip, exact: true }).or(page.getByRole('tab', { name: chip, exact: true })).first().click()
    await page.waitForTimeout(900); await ready(page)
    C.timing(`R2 Overview chip ${chip} -> stats`, Date.now() - t0)
    console.log(`Overview [${chip}]:`, (await flat(page)).slice(0, 330))
    await C.shot(page, `r2-01-overview-${chip.replace(' ', '-').toLowerCase()}`)
  }
  // ---- Orders
  sink.stage = 'orders'
  await page.goto(C.RESTO + '/orders'); await ready(page); await page.waitForTimeout(800)
  for (const chip of ['Today', 'Yesterday', 'This week']) {
    await page.getByRole('button', { name: chip, exact: true }).or(page.getByRole('tab', { name: chip, exact: true })).first().click()
    await page.waitForTimeout(1000); await ready(page)
    console.log(`Orders [${chip}]:`, (await flat(page)).slice(0, 260))
    await C.shot(page, `r2-02-orders-${chip.replace(' ', '-').toLowerCase()}`)
  }
  // ---- Bills
  sink.stage = 'bills'
  await page.goto(C.RESTO + '/bills'); await page.getByRole('heading', { name: 'Bills', exact: true }).waitFor(); await ready(page)
  for (const chip of ['Today', 'Yesterday', 'Last 7 days']) {
    t0 = Date.now()
    await page.getByRole('button', { name: chip, exact: true }).or(page.getByRole('tab', { name: chip, exact: true })).first().click()
    await page.waitForTimeout(900); await ready(page)
    C.timing(`R2 Bills chip ${chip}`, Date.now() - t0)
    await page.getByRole('button', { name: /^All/ }).first().click().catch(() => {}); await page.waitForTimeout(500)
    console.log(`Bills [${chip}] / All:`, (await flat(page)).slice(0, 380))
    await C.shot(page, `r2-03-bills-${chip.replace(' ', '-').toLowerCase()}`)
  }
  const pick = page.getByRole('button', { name: 'Pick a day' })
  await pick.click(); await page.waitForTimeout(500)
  console.log('Pick a day control:', JSON.stringify(await page.locator('.dash-content input[type=date]').evaluateAll(els => els.map(e => ({ v: e.value, min: e.min, max: e.max })))))
  await C.shot(page, 'r2-03-bills-pick-a-day')
  const d = page.locator('.dash-content input[type=date]').first()
  if (await d.count()) { await d.fill('2026-10-13'); await page.waitForTimeout(1200); console.log('Bills [Oct 13]:', (await flat(page)).slice(0, 380)); await C.shot(page, 'r2-03-bills-oct13') }
  // ---- Tips
  sink.stage = 'tips'
  await page.goto(C.RESTO + '/tips'); await page.getByRole('heading', { name: 'Tips', exact: true }).waitFor(); await ready(page)
  await page.getByRole('button', { name: 'This week' }).or(page.getByRole('tab', { name: 'This week' })).first().click(); await page.waitForTimeout(1500)
  console.log('Tips week:', (await flat(page)).slice(0, 700))
  await C.shot(page, 'r2-04-tips-week')
  const exp = page.getByRole('button', { name: 'Export CSV' })
  if (await exp.isEnabled()) {
    const dl = path.join(C.SCRATCH, 'dl'); fs.mkdirSync(dl, { recursive: true })
    const [dn] = await Promise.all([page.waitForEvent('download', { timeout: 10_000 }), exp.click()])
    const f = path.join(dl, 'r2-' + dn.suggestedFilename()); await dn.saveAs(f)
    console.log('CSV:', dn.suggestedFilename(), fs.statSync(f).size, 'bytes\n' + fs.readFileSync(f, 'utf8').split('\n').slice(0, 5).join('\n'))
  }
  console.log('problems:', JSON.stringify(sink.map(s => `${s.stage} ${s.kind} ${s.text}`).filter(s => !/ERR_ABORTED/.test(s))))
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
