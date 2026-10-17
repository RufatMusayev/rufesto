'use strict'
// Leyla's morning (read-only): Overview, Orders, Bookings (upcoming/past), Bills, Tips (week + CSV). Compares screen numbers with the API.
const fs = require('fs')
const path = require('path')
const C = require('./common')

const bakuDay = d => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baku' }).format(d instanceof Date ? d : new Date(d))
const ready = (page, ms = 20_000) => page.waitForFunction(() => !document.querySelector('.skeleton, .spinner') && (document.querySelector('.dash-content')?.innerText || '').trim().length > 20, null, { timeout: ms }).catch(() => {})

;(async () => {
  const browser = await C.launch()
  const sink = []
  const L = await C.open(browser, 'leyla', { who: 'Leyla', sink })
  const { page, api } = L
  const dl = path.join(C.SCRATCH, 'dl'); fs.mkdirSync(dl, { recursive: true })

  // ---- Overview
  sink.stage = 'home'
  let t0 = Date.now()
  await page.goto(C.RESTO + '/', { waitUntil: 'domcontentloaded' })
  await page.getByText('Recent orders', { exact: false }).first().waitFor({ timeout: 20_000 })
  C.timing('home ready (cold, signed-in session)', Date.now() - t0)
  console.log('home:', (await C.text(page, '.dash-content')).split('\n').slice(0, 14).join(' | '))
  await C.shot(page, '01-home')

  // ---- Orders
  sink.stage = 'orders'
  t0 = Date.now(); await page.getByRole('link', { name: 'Orders' }).first().click(); await ready(page); C.timing('orders ready (client nav)', Date.now() - t0)
  await C.shot(page, '02-orders')
  // is there any way to look at yesterday?
  console.log('orders page controls:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.dash-content input, .dash-content select, .dash-content [type=date]')].map(e => e.outerHTML.slice(0, 80)))))

  // ---- Bookings
  sink.stage = 'bookings'
  await page.getByRole('link', { name: 'Bookings' }).first().click(); await ready(page)
  await C.shot(page, '03-bookings-upcoming')
  const past = page.getByRole('button', { name: /^Past/ }).or(page.getByRole('tab', { name: /^Past/ })).first()
  t0 = Date.now(); await past.click(); await ready(page); await page.waitForTimeout(600); C.timing('bookings past view', Date.now() - t0)
  console.log('bookings past:', (await C.text(page, '.dash-content')).split('\n').slice(0, 30).join(' | '))
  await C.shot(page, '04-bookings-past')

  // ---- Bills
  sink.stage = 'bills'
  t0 = Date.now(); await page.goto(C.RESTO + '/bills'); await page.getByRole('heading', { name: 'Bills', exact: true }).waitFor(); await ready(page); C.timing('bills ready (full load)', Date.now() - t0)
  await C.shot(page, '05-bills-active')
  for (const f of [/^Paid/, /^All/]) { await page.getByRole('button', { name: f }).first().click(); await page.waitForTimeout(400) }
  await C.shot(page, '06-bills-all')
  console.log('bills text:', (await C.text(page, '.dash-content')).split('\n').slice(0, 12).join(' | '))
  const rb = await api.rpc('restaurant_bills', { p_restaurant_id: C.BELLA, p_status: 'all' })
  console.log('restaurant_bills rpc rows:', Array.isArray(rb.data) ? rb.data.length : JSON.stringify(rb.data).slice(0, 200))

  // ---- Tips (week) + CSV
  sink.stage = 'tips'
  t0 = Date.now(); await page.goto(C.RESTO + '/tips'); await page.getByRole('heading', { name: 'Tips', exact: true }).waitFor(); await ready(page); C.timing('tips ready (today, full load)', Date.now() - t0)
  await C.shot(page, '07-tips-today')
  t0 = Date.now(); await page.getByRole('button', { name: 'This week' }).or(page.getByRole('tab', { name: 'This week' })).first().click()
  await page.waitForFunction(() => !document.querySelector('.skeleton'), null, { timeout: 15_000 }).catch(() => {}); await page.waitForTimeout(500)
  C.timing('tips: switch to This week', Date.now() - t0)
  await C.shot(page, '08-tips-week')
  const tipText = await C.text(page, '.dash-content')
  fs.writeFileSync(path.join(C.SCRATCH, 'dump', 'tips-week.txt'), tipText)
  console.log('tips week:', tipText.split('\n').slice(0, 60).join(' | '))
  const exp = page.getByRole('button', { name: 'Export CSV' })
  if (await exp.isEnabled()) {
    const [d] = await Promise.all([page.waitForEvent('download', { timeout: 10_000 }), exp.click()])
    const f = path.join(dl, d.suggestedFilename())
    await d.saveAs(f)
    console.log('csv file:', d.suggestedFilename(), fs.statSync(f).size, 'bytes')
    console.log(fs.readFileSync(f, 'utf8'))
  } else console.log('Export CSV disabled')

  // ---- truth from the API
  const now = new Date()
  const dow = (now.getUTCDay() + 6) % 7
  const mon = new Date(now.getTime() - dow * 86400000)
  const from = bakuDay(mon), to = bakuDay(now)
  const tr = await api.rpc('tip_report', { p_restaurant_id: C.BELLA, p_from: from, p_to: to })
  console.log('tip_report', from, to, JSON.stringify(tr.data).slice(0, 900))
  const tr7 = await api.rpc('tip_report', { p_restaurant_id: C.BELLA, p_from: bakuDay(new Date(now.getTime() - 6 * 86400000)), p_to: to })
  console.log('tip_report last 7 days', JSON.stringify(tr7.data).slice(0, 600))

  console.log('problems:', JSON.stringify(sink.map(s => `${s.stage} ${s.kind} ${s.text}`), null, 1))
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
