'use strict'
// Leyla creates "Pasta night -15 %" (7 days) on /promos the way the form works, activates it, then a nearby visitor looks for it
// in Home slots and Discover > Promos.  CREATE=1 to really create (once; marker file guards a second run).
const fs = require('fs')
const path = require('path')
const C = require('./common')
const MARK = path.join(C.SCRATCH, 'leyla-promo.json')
const TITLE = 'Pasta night −15 %'
const DESC = 'Every pasta dish 15 % off from 18:00, all week. Ask your waiter or order from your table.'

const pad = n => String(n).padStart(2, '0')
const local = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`

async function visitor(browser, sink) {
  const V = await C.open(browser, 'anon', { geo: true, sink })
  const { page } = V
  sink.stage = 'visitor home'
  await page.goto(C.CONSUMER + '/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)
  const arts = await page.locator('article').allInnerTexts()
  const idx = arts.findIndex(a => a.includes('Pasta night −15'))
  console.log('home: promo slot position =', idx, 'of', arts.length, idx >= 0 ? '| ' + arts[idx].replace(/\n+/g, ' | ').slice(0, 220) : '')
  if (idx >= 0) { await page.locator('article').nth(idx).scrollIntoViewIfNeeded(); await page.locator('article').nth(idx).screenshot({ path: path.join(C.OUT, '31-consumer-home-promo.png') }) }
  const bodyHas = (await C.text(page)).includes('Pasta night −15')
  console.log('home body contains promo text:', bodyHas)
  sink.stage = 'visitor discover'
  await page.getByRole('tab', { name: /Discover/i }).first().click()
  await page.waitForTimeout(4000)
  const dtxt = await C.text(page)
  const at = dtxt.indexOf('Pasta night −15')
  console.log('discover contains promo:', at >= 0, at >= 0 ? '| ' + dtxt.slice(Math.max(0, at - 80), at + 220).replace(/\n+/g, ' | ') : '')
  await C.shot(page, '32-consumer-discover-promos')
  await V.close()
}

;(async () => {
  const browser = await C.launch()
  const sink = []
  const L = await C.open(browser, 'leyla', { who: 'Leyla', sink })
  const { page } = L
  if (fs.existsSync(MARK)) { console.log('promo already created:', fs.readFileSync(MARK, 'utf8')); await visitor(browser, sink); await browser.close(); return }
  sink.stage = 'promos'
  await page.goto(C.RESTO + '/promos'); await page.getByRole('button', { name: /New Campaign/i }).waitFor()
  await page.getByRole('button', { name: /New Campaign/i }).click()
  const dlg = page.getByRole('dialog')
  await dlg.waitFor()
  await C.shot(page, '30-promo-form-empty', { full: false })
  console.log('form fields:', JSON.stringify(await dlg.locator('label, .label').allInnerTexts()))
  console.log('starts/ends defaults:', await dlg.getByLabel(/^Starts/).inputValue(), '->', await dlg.getByLabel(/^Ends/).inputValue())
  // try to save with nothing filled
  await dlg.getByRole('button', { name: /save|create/i }).last().click()
  await page.waitForTimeout(500)
  console.log('empty-save message:', (await dlg.innerText()).split('\n').filter(l => /required|enter|must|positive/i.test(l)).join(' | '))
  await dlg.getByLabel(/^Name/).fill('Pasta night')
  await dlg.getByLabel(/^Title/).fill(TITLE)
  await dlg.getByLabel('Description').fill(DESC)
  await dlg.getByRole('button', { name: /Discount/ }).click()
  await dlg.getByLabel(/Linked dish/i).selectOption({ label: 'Spaghetti alla Carbonara' }).catch(e => console.log('dish select:', e.message.split('\n')[0]))
  await dlg.getByLabel(/^Budget/).fill('70')
  await dlg.getByLabel(/Daily limit/i).fill('10')
  const now = new Date(), end = new Date(now.getTime() + 7 * 86400000)
  await dlg.getByLabel(/^Starts/).fill(local(now)); await dlg.getByLabel(/^Ends/).fill(local(end))
  await C.shot(page, '30b-promo-form-filled', { full: false })
  if (process.env.CREATE !== '1') { console.log('dry run'); await browser.close(); return }
  const t0 = Date.now()
  await dlg.getByRole('button', { name: /save|create/i }).last().click()
  await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 15_000 })
  C.timing('promo save -> dialog closed', Date.now() - t0)
  const card = page.locator('div', { hasText: TITLE }).last()
  await page.getByText(TITLE).first().waitFor({ timeout: 10_000 })
  await C.shot(page, '33-promo-created-draft')
  console.log('card text after create:', (await C.text(page, '.dash-content')).split('\n').slice(0, 25).join(' | '))
  // activate
  const t1 = Date.now()
  await page.getByRole('button', { name: /^Activate/ }).first().click()
  await page.waitForFunction(() => /\bACTIVE\b/i.test(document.querySelector('.dash-content').innerText)).catch(() => {})
  C.timing('promo Activate -> shows Active', Date.now() - t1)
  fs.writeFileSync(MARK, JSON.stringify({ at: new Date().toISOString(), title: TITLE }))
  await page.waitForTimeout(800)
  await C.shot(page, '34-promo-active')
  console.log('problems:', JSON.stringify(sink.map(s => `${s.stage} ${s.kind} ${s.text}`), null, 1))
  await visitor(browser, sink)
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
