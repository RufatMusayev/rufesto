// Round 3: background scroll lock under the dish sheet (real scroll position), signed-out like/save, Filters sheet. ROUND=round3 node personas/ui/r3-sheet.js
const L = require('./lib')
const out = {}
const note = (k, v) => { out[k] = v; console.log('##', k, typeof v === 'string' ? v : JSON.stringify(v)) }
const lines = t => [...new Set(t.split('\n').map(x => x.trim()).filter(Boolean))]
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function swipe(cdp, x, y0, y1, steps = 14, ms = 14) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] })
  for (let i = 1; i <= steps; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + (y1 - y0) * i / steps }] }); await sleep(ms) }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}
;(async () => {
  const s = await L.open({}); const { page, ctx } = s; const cdp = await ctx.newCDPSession(page)
  try {
    await page.goto(L.BASE + '/explore', { waitUntil: 'load' }); await page.waitForTimeout(2500)
    note('page_scrollable', await page.evaluate(() => ({ scrollingElement: document.scrollingElement.tagName, scrollHeight: document.scrollingElement.scrollHeight, inner: innerHeight })))
    // scroll the page behind to a known place, then open a dish that is in view
    await page.mouse.move(206, 500); await page.mouse.wheel(0, 700); await page.waitForTimeout(500)
    const before = await page.evaluate(() => scrollY)
    const row = page.locator('button', { hasText: /₼/ }).filter({ hasText: /Trattoria|Dönər|Tiflis|Səda/ }).first()
    // pick any visible dish row or review dish link
    const target = page.locator('button').filter({ hasText: /₼/ }).nth(1)
    await target.scrollIntoViewIfNeeded().catch(() => { })
    const y1 = await page.evaluate(() => scrollY)
    await target.click(); await page.locator('[role=dialog][aria-modal=true]').waitFor(); await page.waitForTimeout(900)
    const opened = await page.evaluate(() => scrollY)
    // wheel / touch on the scrim (above the sheet) and below the sheet's scroller end
    await page.mouse.move(206, 30); await page.mouse.wheel(0, 1600); await sleep(500); const w1 = await page.evaluate(() => scrollY)
    await swipe(cdp, 206, 140, 10); await sleep(400); const t1 = await page.evaluate(() => scrollY)
    // inside the sheet: scroll its content to the end, then keep pushing (scroll chaining must not move the page)
    await page.evaluate(() => { const d = document.querySelector('[role=dialog]'); const sc = [d, ...d.querySelectorAll('*')].find(e => e.scrollHeight > e.clientHeight + 20 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowY)); if (sc) sc.scrollTop = sc.scrollHeight })
    await page.mouse.move(206, 600); await page.mouse.wheel(0, 1600); await sleep(500); const w2 = await page.evaluate(() => scrollY)
    await swipe(cdp, 206, 700, 300); await sleep(400); const t2 = await page.evaluate(() => scrollY)
    note('scroll_positions', { scrolledBehindBeforeOpen: before, afterScrollIntoView: y1, whenOpen: opened, wheelOnScrim: w1, touchOnScrim: t1, wheelPastSheetEnd: w2, touchPastSheetEnd: t2 })
    note('lock_verdict', [w1, t1, w2, t2].every(v => v === opened) ? 'locked: page did not move' : 'PAGE MOVED behind the sheet')
    await page.keyboard.press('Escape'); await sleep(700)
    note('scroll_restored_after_close', { scrollY: await page.evaluate(() => scrollY), htmlOverflow: await page.evaluate(() => getComputedStyle(document.documentElement).overflow) })
    // like / save signed out
    const writes = []; page.on('request', r => { if (!['GET', 'HEAD', 'OPTIONS'].includes(r.method()) && /\/rest\/v1\/(likes|saved_dishes)/.test(r.url())) writes.push(r.method()) })
    await target.click(); await page.locator('[role=dialog][aria-modal=true]').waitFor(); await page.waitForTimeout(800)
    await page.getByRole('button', { name: 'Like this dish' }).click(); await page.waitForTimeout(900)
    note('like_signed_out', { signin_sheet: await page.getByText('Continue with Google').count(), heart_filled: await page.evaluate(() => /\b1 like/.test(document.body.innerText)) })
    await L.shot(page, 'RA11-dish-like-signedout')
    await page.keyboard.press('Escape'); await sleep(500)
    if (await page.getByText('Continue with Google').count()) { await page.keyboard.press('Escape'); await sleep(500) }
    if (!(await page.locator('[role=dialog][aria-modal=true]').count())) { await target.click(); await page.locator('[role=dialog][aria-modal=true]').waitFor(); await page.waitForTimeout(600) }
    await page.getByRole('button', { name: 'Save to your list' }).click(); await page.waitForTimeout(900)
    note('save_signed_out', { signin_sheet: await page.getByText('Continue with Google').count() }); note('writes', writes)
    await page.keyboard.press('Escape'); await sleep(500)
    // Filters sheet in the zero state: Italian + Show results
    await page.goto(L.BASE + '/explore', { waitUntil: 'load' }); await page.waitForTimeout(2200)
    await page.getByRole('button', { name: 'Filters' }).click(); await page.waitForTimeout(900)
    await page.locator('[role=dialog]').getByText('Italian', { exact: true }).click(); await page.waitForTimeout(300)
    note('filters_primary_label', await page.locator('[role=dialog]').getByRole('button', { name: /Show/ }).innerText())
    await page.locator('[role=dialog]').getByRole('button', { name: /Show/ }).click(); await page.waitForTimeout(2200)
    await L.shot(page, 'RA08-search-filtered-italian')
    note('filtered_state', { text: lines(await page.evaluate(() => document.body.innerText)).slice(0, 26), headings: await page.locator('h1,h2,h3').allInnerTexts() })
    note('filter_badge_or_chip', await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.getBoundingClientRect().top < 140 && b.getBoundingClientRect().width > 0).map(b => `${b.getAttribute('aria-label') || b.innerText.replace(/\s+/g, ' ')}|${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`)))
    // open now filter + clear
    await page.getByRole('button', { name: /Filters/ }).first().click(); await page.waitForTimeout(800)
    await page.getByRole('button', { name: 'Reset' }).click().catch(() => { }); await page.waitForTimeout(400)
    await page.locator('[role=dialog] [role=switch], [role=dialog] input[type=checkbox]').first().click().catch(() => { }); await page.waitForTimeout(300)
    await page.locator('[role=dialog]').getByRole('button', { name: /Show/ }).click(); await page.waitForTimeout(2000)
    note('open_now_filter', lines(await page.evaluate(() => document.body.innerText)).slice(0, 14)); await L.shot(page, 'RA12-search-open-now')
  } catch (e) { note('ERROR', String(e).split(/\r?\n/)[0].slice(0, 300)); await L.shot(page, 'RA96-error').catch(() => { }) }
  L.save('r3-sheet', out); await s.close()
})()
