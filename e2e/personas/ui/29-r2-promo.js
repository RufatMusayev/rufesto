'use strict'
// Round 2: the promo form (discount value, defaults, stale errors, Ends overflow) on a NEW-campaign dialog (not saved),
// then Leyla edits her live "Pasta night" promo to carry a 15 % discount and a nearby visitor looks at it on the restaurant page,
// Discover and Home.
const C = require('./common')

const flat = async (p, sel) => (await C.text(p, sel)).split('\n').join(' | ')

;(async () => {
  const browser = await C.launch()
  const sink = []
  const L = await C.open(browser, 'leyla', { who: 'Leyla', sink })
  const { page } = L
  await page.goto(C.RESTO + '/promos'); await page.getByRole('button', { name: /New Campaign/i }).waitFor()
  await page.getByRole('button', { name: /New Campaign/i }).click()
  const dlg = page.getByRole('dialog'); await dlg.waitFor()
  console.log('new form fields:', JSON.stringify(await dlg.locator('label, .label').allInnerTexts()))
  console.log('starts/ends defaults:', JSON.stringify([await dlg.getByLabel(/^Starts/).inputValue(), await dlg.getByLabel(/^Ends/).inputValue()]))
  await dlg.getByRole('button', { name: /^Discount/ }).click(); await page.waitForTimeout(300)
  console.log('after choosing Discount:', JSON.stringify(await dlg.locator('label, .label').allInnerTexts()))
  await dlg.getByRole('button', { name: /Create Campaign/ }).click(); await page.waitForTimeout(500)
  console.log('empty save message:', (await dlg.innerText()).split('\n').filter(l => /required|enter|must|positive/i.test(l)).join(' | '))
  await dlg.getByLabel(/^Name/).fill('x'); await page.waitForTimeout(300)
  console.log('error text after typing the name:', (await dlg.innerText()).split('\n').filter(l => /required/i.test(l)).join(' | ') || '(cleared)')
  const ends = await dlg.getByLabel(/^Ends/).boundingBox(), box = await dlg.boundingBox()
  console.log('Ends input right edge', Math.round(ends.x + ends.width), 'vs dialog right edge', Math.round(box.x + box.width))
  await C.shot(page, 'r2-110-promo-form-new', { full: false })
  await dlg.getByRole('button', { name: /Cancel/ }).click()

  // edit the live promo: 15 % discount
  const card = page.locator('div', { hasText: 'Pasta night −15 %' }).filter({ has: page.getByRole('button', { name: 'Edit' }) }).last()
  await card.getByRole('button', { name: 'Edit' }).click()
  const edlg = page.getByRole('dialog'); await edlg.waitFor()
  console.log('edit form fields:', JSON.stringify(await edlg.locator('label, .label').allInnerTexts()))
  console.log('edit description value:', JSON.stringify(await edlg.getByLabel('Description').inputValue()))
  await C.shot(page, 'r2-111-promo-form-edit', { full: false })
  const pct = edlg.getByRole('radio', { name: /percent|%/i }).first()
  console.log('discount inputs:', JSON.stringify(await edlg.locator('input[type=number], input[type=radio], button[role=radio]').evaluateAll(e => e.map(x => (x.getAttribute('aria-label') || x.name || x.type) + '=' + (x.value || '')))))
  const val = edlg.locator('input[aria-label="Discount"]')
  if (await val.count()) { await val.fill('15') }
  await C.shot(page, 'r2-112-promo-form-edit-15', { full: false })
  await edlg.getByRole('button', { name: /^Save/i }).click()
  await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => console.log('dialog still open:', 'check'))
  await page.waitForTimeout(1200)
  console.log('promo cards after save:', (await flat(page, '.dash-content')).slice(0, 420))
  await C.shot(page, 'r2-113-promos-after-edit')
  await L.close()

  // visitor
  const V = await C.open(browser, 'anon', { geo: true, sink })
  const vp = V.page
  await vp.goto(C.CONSUMER + '/restaurant/bella-roma'); await vp.waitForTimeout(4000)
  const strip = await vp.locator('text=/Pasta night/').first().isVisible().catch(() => false)
  console.log('restaurant page shows the promo (Posts tab):', strip, '| 401s:', sink.filter(s => /ad_campaigns/.test(s.text) && /401|403/.test(s.text)).length)
  if (strip) { const el = vp.locator('text=/Pasta night/').first(); await el.scrollIntoViewIfNeeded(); console.log('promo block text:', (await el.locator('xpath=ancestor::*[self::a or self::div or self::li][1]').innerText()).split('\n').join(' | ').slice(0, 300)) }
  await C.shot(vp, 'r2-114-restaurant-page-promo', { full: false })
  await vp.goto(C.CONSUMER + '/'); await vp.getByRole('tab', { name: /Discover/i }).first().click(); await vp.waitForTimeout(4000)
  const dtxt = await C.text(vp); const at = dtxt.indexOf('Pasta night')
  console.log('Discover promo text:', at >= 0 ? dtxt.slice(Math.max(0, at - 30), at + 230).split('\n').join(' | ') : 'NOT FOUND')
  await C.shot(vp, 'r2-115-discover-promos', { full: false })
  await vp.goto(C.CONSUMER + '/'); await vp.waitForTimeout(3500)
  let pos = -1
  for (let i = 0; i < 14 && pos < 0; i++) { await vp.evaluate(() => window.scrollBy(0, 2500)); await vp.waitForTimeout(800); const a = await vp.locator('article').allInnerTexts(); pos = a.findIndex(t => /Pasta night/.test(t) && /PROMOTED|Sponsored/i.test(t)); if (pos >= 0) console.log('Home promo card at position', pos + 1, '|', a[pos].split('\n').join(' | ').slice(0, 260)) }
  if (pos < 0) console.log('Home: promo card not found in the first', await vp.locator('article').count(), 'cards')
  console.log('problems:', JSON.stringify(sink.map(s => s.stage + ' ' + s.who + ' ' + s.kind + ' ' + s.text).filter(s => !/ERR_ABORTED|vibrate/.test(s)), null, 1))
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
