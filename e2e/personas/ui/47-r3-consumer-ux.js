'use strict'
// Round 3, consumer UX round: Home (For you / Friends, promo slots), Search, dish sheet (scroll lock, close), notifications as an
// activity list, language / theme moved to Settings, side rail on a wide screen. Visitor = signed out near Bella Roma; Rauf = signed in.
const C = require('./common')
const flat = async (p, sel = 'body') => (await C.text(p, sel)).split('\n').filter(Boolean).join(' | ')
const ctrls = p => p.evaluate(() => [...document.querySelectorAll('a,button,[role=tab]')].filter(e => e.offsetParent !== null).map(x => (x.getAttribute('aria-label') || x.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 24)).filter(Boolean).slice(0, 30).join(' ; '))

;(async () => {
  const browser = await C.launch()
  const sink = []
  const V = await C.open(browser, 'anon', { geo: true, sink }); const vp = V.page
  let t0 = Date.now()
  await vp.goto(C.CONSUMER + '/', { waitUntil: 'domcontentloaded' }); await vp.locator('article').first().waitFor({ timeout: 20_000 })
  C.timing('R3 consumer Home: first card (visitor, fresh page)', Date.now() - t0)
  await vp.waitForTimeout(1500)
  console.log('HOME controls:', await ctrls(vp))
  console.log('HOME tabs:', JSON.stringify(await vp.getByRole('tab').allInnerTexts()))
  await C.shot(vp, 'r3-90-home-visitor', { full: false })
  // promos in the first pages, and where Bella's is
  let pos = -1, promoCards = []
  for (let i = 0; i < 12; i++) { await vp.evaluate(() => window.scrollBy(0, 2600)); await vp.waitForTimeout(700) }
  const arts = await vp.locator('article').allInnerTexts()
  arts.forEach((a, i) => { if (/SPONSORED|PROMOTED/i.test(a)) promoCards.push(i + 1) ; if (/Pasta night/.test(a) && /SPONSORED|PROMOTED/i.test(a)) pos = i + 1 })
  console.log('HOME cards loaded', arts.length, '| promo cards at', JSON.stringify(promoCards), '| Bella "Pasta night" promo at card', pos)
  const types = { review: arts.filter(a => /Popular review/.test(a)).length }
  console.log('HOME popular review cards:', types.review)

  // Search
  await vp.goto(C.CONSUMER + '/explore', { waitUntil: 'domcontentloaded' }); await vp.waitForTimeout(3000)
  console.log('SEARCH zero state controls:', await ctrls(vp))
  await C.shot(vp, 'r3-91-search-zero', { full: false })
  const box = vp.getByRole('searchbox').or(vp.getByPlaceholder(/search/i)).first()
  for (const q of ['tiramisu', 'pasta', 'ceyhun']) {
    await box.fill(q); t0 = Date.now(); await vp.waitForTimeout(1800)
    console.log(`SEARCH "${q}":`, (await flat(vp, 'main')).slice(0, 360))
    await C.shot(vp, 'r3-92-search-' + q, { full: false })
  }
  await box.fill('')

  // restaurant page + dish sheet
  await vp.goto(C.CONSUMER + '/restaurant/bella-roma', { waitUntil: 'domcontentloaded' }); await vp.waitForTimeout(2500)
  console.log('RESTAURANT controls:', await ctrls(vp))
  await vp.getByRole('tab', { name: 'Menu' }).click(); await vp.waitForTimeout(1200)
  const row = vp.locator('.mn-row').filter({ has: vp.locator('.mn-name', { hasText: /^Spaghetti alla Carbonara$/ }) }).first()
  await row.locator('.mn-row-btn').click(); await vp.waitForTimeout(1200)
  console.log('DISH SHEET:', (await flat(vp, '[role=dialog]')).slice(0, 520))
  await C.shot(vp, 'r3-93-dish-sheet', { full: false })
  const lock = await vp.evaluate(() => { const y0 = window.scrollY; window.scrollBy(0, 400); return { moved: window.scrollY - y0, bodyOverflow: getComputedStyle(document.body).overflow, bodyPos: getComputedStyle(document.body).position } })
  console.log('page behind the sheet moves on scroll?', JSON.stringify(lock))
  await vp.keyboard.press('Escape'); await vp.waitForTimeout(700)
  console.log('Escape closes the sheet:', (await vp.locator('[role=dialog]').count()) === 0)

  // Rauf: notifications, profile / settings, wide screen
  const R = await C.open(browser, 'rauf', { who: 'Rauf', geo: true, sink }); const rp = R.page
  await rp.goto(C.CONSUMER + '/notifications', { waitUntil: 'domcontentloaded' }); await rp.waitForTimeout(3000)
  console.log('NOTIFICATIONS:', (await flat(rp, 'main')).slice(0, 420))
  await C.shot(rp, 'r3-94-rauf-notifications', { full: false })
  await rp.goto(C.CONSUMER + '/profile', { waitUntil: 'domcontentloaded' }); await rp.waitForTimeout(2500)
  console.log('PROFILE controls:', await ctrls(rp))
  await C.shot(rp, 'r3-95-rauf-profile', { full: false })
  const W = await C.open(browser, 'leyla', { who: 'Rauf', geo: true, sink }); const wp = W.page
  await wp.goto(C.CONSUMER + '/', { waitUntil: 'domcontentloaded' }); await wp.waitForTimeout(3500)
  console.log('WIDE 1280 controls:', await ctrls(wp))
  await C.shot(wp, 'r3-96-home-wide', { full: false })
  console.log('problems:', JSON.stringify(sink.map(s => s.who + ' ' + s.kind + ' ' + s.text).filter(s => !/ERR_ABORTED|vibrate/.test(s)).slice(0, 8)))
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
