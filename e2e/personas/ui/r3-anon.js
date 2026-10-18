// Round 3, persona A (signed-out visitor) on build 81f5890: Home For you / Friends, Search tab, dish sheet (Back / swipe / scroll lock), language access, restaurant page.
// ROUND=round3 node personas/ui/r3-anon.js  -> results/round3/r3-anon.json, screenshots round3/RA*.png
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
const dialogOpen = page => page.locator('[role=dialog][aria-modal=true]').count()

;(async () => {
  const s = await L.open({}); const { page, ctx, watch } = s
  const cdp = await ctx.newCDPSession(page)
  try {
    // ---------------------------------------------------------------- Home
    await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor(); await page.waitForTimeout(2200)
    note('bundle', await page.evaluate(() => [...document.scripts].map(x => (x.src.match(/index-[\w-]+\.js/) || [])[0]).filter(Boolean)[0]))
    await L.shot(page, 'RA01-home-signedout')
    note('top_controls', await page.evaluate(() => [...document.querySelectorAll('button, a[href], [role=tab]')].filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.top < 110 }).map(b => `${b.getAttribute('role') || b.tagName.toLowerCase()}|${b.getAttribute('aria-label') || b.innerText.replace(/\s+/g, ' ').slice(0, 14)}|${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`)))
    note('language_or_theme_in_top_bar', await page.evaluate(() => !!document.querySelector('.lang-switcher, [aria-label*="Switch language"], [aria-label*="Toggle theme"]')))
    note('fab_present', await page.locator('.soc-fab').count())
    note('tabs', await page.evaluate(() => [...document.querySelectorAll('[role=tab]')].map(b => `${b.innerText}|sel=${b.getAttribute('aria-selected')}|ctrl=${b.getAttribute('aria-controls')}|tabindex=${b.getAttribute('tabindex')}`)))
    note('location_button', await page.evaluate(() => { const b = document.querySelector('button[aria-label*="location"]'); return b ? { label: b.getAttribute('aria-label'), pressed: b.getAttribute('aria-pressed'), size: Math.round(b.getBoundingClientRect().width) + 'x' + Math.round(b.getBoundingClientRect().height) } : null }))
    const cards = await page.evaluate(() => [...document.querySelectorAll('.soc-feed-slot')].map((el, i) => { const k = el.firstElementChild ? el.firstElementChild.className.toString() : ''; return { i: i + 1, kind: /menu-card/.test(k + el.className) ? 'promo' : /rv/.test(k) ? 'review' : 'post', h: Math.round(el.getBoundingClientRect().height), kicker: /Popular review/.test(el.innerText), textcard: !!el.querySelector('.soc-textcard'), head: el.innerText.replace(/\s+/g, ' ').slice(0, 28) } }))
    note('page_items', cards.length)
    note('promo_positions', cards.filter(c => c.kind === 'promo').map(c => c.i))
    note('popular_review_positions', cards.filter(c => c.kind === 'review').map(c => `${c.i}(kicker=${c.kicker},${c.h}px)`))
    note('review_row_heights', cards.filter(c => c.kind === 'review').map(c => c.h))
    note('textcards', cards.filter(c => c.textcard).map(c => `${c.i}:${c.h}px`))
    note('available_now_pills', await page.evaluate(() => [...document.querySelectorAll('.soc-feed-slot')].filter(e => /Available now/i.test(e.innerText)).length))
    note('sold_out_marks', await page.evaluate(() => [...document.querySelectorAll('.soc-feed-slot')].filter(e => /Sold out/i.test(e.innerText)).length))
    note('verified_markers', await page.evaluate(() => [...document.querySelectorAll('.soc-feed-slot')].slice(0, 6).map(e => /Verified visit/.test(e.innerText) ? 'pill-text' : (e.querySelector('[aria-label*="erified"], svg[aria-label*="erified"]') ? 'icon' : '-'))))
    note('small_targets_home', await page.evaluate(() => { const g = {}; for (const e of document.querySelectorAll('a[href], button, [role=tab]')) { const r = e.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0 || r.top > 4000) continue; if ((r.width < 44 || r.height < 44) && !(e.tagName === 'A' && getComputedStyle(e).display === 'inline')) { const k = `${e.tagName.toLowerCase()}.${(e.className || '').toString().split(' ')[0]}|${(e.getAttribute('aria-label') || e.innerText || '').replace(/\s+/g, ' ').slice(0, 16)}|${Math.round(r.width)}x${Math.round(r.height)}`; g[k] = (g[k] || 0) + 1 } } return Object.entries(g).map(([k, n]) => `${n}x ${k}`).slice(0, 14) }))
    note('first_images', await page.evaluate(() => [...document.querySelectorAll('.soc-feed-slot img')].slice(0, 4).map(i => `${i.loading}|fp=${i.getAttribute('fetchpriority')}|${i.naturalWidth}px|alt=${(i.alt || '').slice(0, 22)}`)))
    // like -> sign-in sheet
    await page.locator('.soc-feed-slot').first().getByRole('button', { name: 'Like' }).click(); await page.waitForTimeout(900)
    await L.shot(page, 'RA02-signin-sheet')
    note('signin_sheet', { welcome: await page.getByText('Welcome', { exact: true }).count(), google: await page.getByText('Continue with Google').count() })
    await page.keyboard.press('Escape'); await page.waitForTimeout(500)
    note('signin_sheet_closed_by_escape', (await page.getByText('Continue with Google').count()) === 0)
    // popular review compact row detail + tap
    const rv = page.locator('.rv--card').first()
    note('popular_review_text', (await rv.innerText()).replace(/\s+/g, ' ').slice(0, 160))
    note('popular_review_controls', await rv.evaluate(el => [...el.querySelectorAll('button, a[href]')].map(b => `${b.getAttribute('aria-label') || b.innerText.replace(/\s+/g, ' ').slice(0, 14)}|${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`)))
    // new post (+) signed out
    await page.getByRole('button', { name: 'New post' }).click(); await page.waitForTimeout(900)
    note('plus_signed_out', { url: page.url().replace(L.BASE, ''), signin_sheet: await page.getByText('Continue with Google').count() })
    await page.keyboard.press('Escape'); await page.waitForTimeout(400)
    // Friends tab signed out
    await page.getByRole('tab', { name: 'Friends' }).click(); await page.waitForTimeout(1500)
    await L.shot(page, 'RA03-friends-signedout'); note('friends_signedout', lines(await page.evaluate(() => document.getElementById('home-panel-friends').innerText)))
    await page.getByRole('tab', { name: 'For you' }).click()
    // location icon: denied here (no permission granted)
    await page.getByRole('button', { name: /location/i }).first().click(); await page.waitForTimeout(2500)
    await L.shot(page, 'RA04-location-denied'); note('location_denied_feedback', lines(await page.evaluate(() => document.body.innerText)).filter(x => /location|Location/.test(x)))

    // ---------------------------------------------------------------- language: can a signed-out newcomer reach it?
    const reach = {}
    await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor()
    await page.locator('.bottom-nav a[aria-label="Profile"]').click(); await page.waitForTimeout(1200)
    reach.tap_profile_tab = { url: page.url().replace(L.BASE, ''), signin_sheet: await page.getByText('Continue with Google').count(), language_row: await page.getByText('Language', { exact: true }).count() }
    await page.keyboard.press('Escape'); await page.waitForTimeout(400)
    await page.locator('button[aria-label="Notifications"]').click(); await page.waitForTimeout(1500)
    reach.tap_bell = { url: page.url().replace(L.BASE, ''), text: lines(await page.evaluate(() => document.body.innerText)).slice(0, 5), language_words: await page.evaluate(() => /\bAZ\b|Language|Dil\b/.test(document.body.innerText)) }
    await page.goto(L.BASE + '/explore', { waitUntil: 'load' }); await page.waitForTimeout(1500)
    await page.getByRole('button', { name: 'Filters' }).click(); await page.waitForTimeout(1000)
    reach.filters_sheet_language = await page.evaluate(() => /\bAZ\b|Language|Dil\b/.test(document.body.innerText))
    await L.shot(page, 'RA05-filters-sheet')
    note('filters_sheet', lines(await page.evaluate(() => document.querySelector('[role=dialog]') ? document.querySelector('[role=dialog]').innerText : 'no dialog')))
    note('filters_sheet_controls', await page.evaluate(() => [...document.querySelectorAll('[role=dialog] button, [role=dialog] input, [role=dialog] [role=switch]')].map(b => `${b.getAttribute('aria-label') || b.innerText.replace(/\s+/g, ' ').slice(0, 16)}|${b.getAttribute('aria-pressed') ?? b.getAttribute('aria-checked') ?? ''}|${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`)))
    await page.keyboard.press('Escape'); await page.waitForTimeout(500)
    await page.goto(L.BASE + '/profile', { waitUntil: 'load' }); await page.waitForTimeout(1500)
    await page.getByRole('button', { name: 'Settings' }).first().click(); await page.waitForTimeout(900)
    reach.direct_profile_url_settings = lines(await page.evaluate(() => document.body.innerText)).filter(x => /Language|EN|AZ|Dark|feedback/.test(x))
    note('language_reachability', reach)

    // ---------------------------------------------------------------- Search
    await page.goto(L.BASE + '/explore', { waitUntil: 'load' }); await page.waitForTimeout(2500)
    note('search_zero_headings', await page.locator('h1,h2,h3').allInnerTexts())
    note('search_zero_row_sizes', await page.evaluate(() => [...document.querySelectorAll('main button, #root button')].filter(b => /₼/.test(b.innerText)).slice(0, 3).map(b => Math.round(b.getBoundingClientRect().height))))
    note('search_small_targets', await page.evaluate(() => { const g = {}; for (const e of document.querySelectorAll('a[href], button, input')) { const r = e.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) continue; if (r.width < 44 || r.height < 44) { const k = `${e.tagName.toLowerCase()}|${(e.getAttribute('aria-label') || e.innerText || e.placeholder || '').replace(/\s+/g, ' ').slice(0, 16)}|${Math.round(r.width)}x${Math.round(r.height)}`; g[k] = (g[k] || 0) + 1 } } return Object.entries(g).map(([k, n]) => `${n}x ${k}`).slice(0, 16) }))
    const q = page.getByPlaceholder(/Dishes, places/)
    await q.fill('doner'); await page.waitForTimeout(1500); await L.shot(page, 'RA06-search-doner')
    note('search_doner', { headings: await page.locator('h1,h2,h3').allInnerTexts(), rows: lines(await page.evaluate(() => document.body.innerText)).slice(0, 24) })
    await q.fill('pasta'); await page.waitForTimeout(1500); note('search_pasta_headings', await page.locator('h1,h2,h3').allInnerTexts())
    await q.fill('zzzzq'); await page.waitForTimeout(1500); await L.shot(page, 'RA07-search-empty'); note('search_empty', lines(await page.evaluate(() => document.body.innerText)).slice(0, 12))
    await q.fill('ay'); await page.waitForTimeout(1200); note('search_two_letters', lines(await page.evaluate(() => document.body.innerText)).slice(0, 8))
    await q.fill(''); await page.waitForTimeout(800)
    note('recent_searches_after_queries', await page.evaluate(() => [...document.querySelectorAll('h2,h3')].map(h => h.innerText)))
    try { // filter sheet usage
    await page.getByRole('button', { name: 'Filters' }).click(); await page.waitForTimeout(900)
    const italian = page.getByRole('button', { name: 'Italian', exact: true }).last()
    if (await italian.count()) { await italian.click(); await page.waitForTimeout(400) }
    const apply = page.getByRole('button', { name: /^(Show|Apply|Done)/ }).first()
    note('filters_apply_label', (await apply.count()) ? await apply.innerText() : 'none')
    if (await apply.count()) { await apply.click(); await page.waitForTimeout(1800) }
    await L.shot(page, 'RA08-search-filtered-italian'); note('search_filtered', lines(await page.evaluate(() => document.body.innerText)).slice(0, 22))

    } catch (e) { note('ERROR_filter', String(e).split(/\r?\n/)[0].slice(0, 200)); await L.shot(page, 'RA98-filter-error').catch(() => { }) }
    try { // dish sheet: close behaviours + scroll lock
    await page.goto(L.BASE + '/explore', { waitUntil: 'load' }); await page.waitForTimeout(2200)
    await page.evaluate(() => window.scrollTo(0, 420)); await page.waitForTimeout(300)
    const y0 = await page.evaluate(() => scrollY)
    const trending = page.getByRole('button', { name: /^Cappuccino/ }).last()
    await trending.scrollIntoViewIfNeeded(); await page.waitForTimeout(300)
    const yBefore = await page.evaluate(() => scrollY)
    const tOpen = Date.now(); await trending.click(); await page.locator('[role=dialog][aria-modal=true]').waitFor(); note('sheet_open_ms', Date.now() - tOpen)
    await page.waitForTimeout(900); await L.shot(page, 'RA09-dish-sheet')
    note('sheet_url', page.url().replace(L.BASE, ''))
    note('sheet_controls', await page.evaluate(() => [...document.querySelectorAll('[role=dialog] button, [role=dialog] a[href]')].filter(b => b.getBoundingClientRect().width > 0).map(b => `${b.getAttribute('aria-label') || b.innerText.replace(/\s+/g, ' ').slice(0, 18)}|${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`)))
    note('sheet_text', lines(await page.evaluate(() => document.querySelector('[role=dialog]').innerText)).slice(0, 34))
    note('sheet_photo_ratio', await page.evaluate(() => { const i = document.querySelector('[role=dialog] img'); if (!i) return null; const r = i.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)} (${(r.width / r.height).toFixed(2)})` }))
    note('sheet_like_button_name', await page.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].slice(0, 6).map(b => b.getAttribute('aria-label') || b.innerText.replace(/\s+/g, ' ').slice(0, 14))))
    note('sheet_reviewer_names', await page.evaluate(() => /Anonymous/.test(document.querySelector('[role=dialog]').innerText) ? 'ANONYMOUS PRESENT' : 'no "Anonymous"'))
    // scroll lock
    note('lock_styles', await page.evaluate(() => ({ html: getComputedStyle(document.documentElement).overflow, body: getComputedStyle(document.body).overflow, bodyPosition: getComputedStyle(document.body).position })))
    await page.mouse.move(206, 40); await page.mouse.wheel(0, 1500); await page.waitForTimeout(500)
    const afterWheel = await page.evaluate(() => scrollY)
    await swipe(cdp, 206, 120, 20); await page.waitForTimeout(300)   // finger on the scrim above the sheet
    const afterTouch = await page.evaluate(() => scrollY)
    note('background_scroll_while_open', { before: yBefore, afterWheelOnScrim: afterWheel, afterTouchOnScrim: afterTouch })
    // inner scroll still works
    const inner = await page.evaluate(() => { const d = document.querySelector('[role=dialog]'); const sc = [d, ...d.querySelectorAll('*')].find(e => e.scrollHeight > e.clientHeight + 40 && ['auto', 'scroll'].includes(getComputedStyle(e).overflowY)); return sc ? { scrollable: true, sh: sc.scrollHeight, ch: sc.clientHeight } : { scrollable: false } })
    note('sheet_inner_scroller', inner)
    // Back closes
    const tBack = Date.now(); await page.goBack(); await page.locator('[role=dialog][aria-modal=true]').waitFor({ state: 'detached', timeout: 5000 }).catch(() => { })
    note('back_closes_sheet', { closed: (await dialogOpen(page)) === 0, ms: Date.now() - tBack, url: page.url().replace(L.BASE, ''), stayedOnSearch: /explore/.test(page.url()), scrollYKept: await page.evaluate(() => scrollY) })
    // reopen, swipe down on the handle
    await trending.scrollIntoViewIfNeeded(); await trending.click(); await page.locator('[role=dialog][aria-modal=true]').waitFor(); await page.waitForTimeout(900)
    const box = await page.evaluate(() => { const d = document.querySelector('[role=dialog]'); const r = d.getBoundingClientRect(); return { top: r.top, h: r.height } })
    const tSw = Date.now(); await swipe(cdp, 206, box.top + 14, box.top + 14 + box.h * 0.6, 14, 14)
    await page.locator('[role=dialog][aria-modal=true]').waitFor({ state: 'detached', timeout: 4000 }).catch(() => { })
    note('swipe_down_on_handle_closes', { closed: (await dialogOpen(page)) === 0, ms: Date.now() - tSw, url: page.url().replace(L.BASE, '') })
    // short, slow drag must spring back
    await trending.scrollIntoViewIfNeeded(); await trending.click(); await page.locator('[role=dialog][aria-modal=true]').waitFor(); await page.waitForTimeout(900)
    const box2 = await page.evaluate(() => { const r = document.querySelector('[role=dialog]').getBoundingClientRect(); return { top: r.top, h: r.height } })
    await swipe(cdp, 206, box2.top + 14, box2.top + 14 + box2.h * 0.12, 10, 30); await page.waitForTimeout(700)
    note('short_drag_springs_back', (await dialogOpen(page)) === 1)
    // swipe down from inside the content while scrolled to the top
    await swipe(cdp, 206, 700, 1500, 14, 14); await page.waitForTimeout(900)
    note('swipe_down_from_content_closes', (await dialogOpen(page)) === 0)
    // Escape + close button
    await trending.scrollIntoViewIfNeeded(); await trending.click(); await page.locator('[role=dialog][aria-modal=true]').waitFor(); await page.waitForTimeout(700)
    await page.keyboard.press('Escape'); await page.waitForTimeout(700); note('escape_closes', (await dialogOpen(page)) === 0)
    await trending.click(); await page.locator('[role=dialog][aria-modal=true]').waitFor(); await page.waitForTimeout(700)
    await page.getByRole('button', { name: 'Close' }).first().click(); await page.waitForTimeout(700); note('close_button_closes', (await dialogOpen(page)) === 0)
    // like + save while signed out
    await trending.click(); await page.locator('[role=dialog][aria-modal=true]').waitFor(); await page.waitForTimeout(700)
    const writes = []; page.on('request', r => { if (r.method() !== 'GET' && r.method() !== 'HEAD' && /\/rest\/v1\/(likes|saved_dishes)/.test(r.url())) writes.push(r.method()) })
    await page.locator('[role=dialog] button').filter({ hasText: /^$/ }).first().click().catch(() => { }); await page.waitForTimeout(900)
    note('dish_like_signedout_prompt', await page.getByText('Continue with Google').count())
    await page.keyboard.press('Escape'); await page.waitForTimeout(500)
    note('dish_like_writes', writes)

    } catch (e) { note('ERROR_dish_sheet', String(e).split(/\r?\n/)[0].slice(0, 200)); await L.shot(page, 'RA97-sheet-error').catch(() => { }) }
    // restaurant page
    await page.goto(L.BASE + '/restaurant/bella-roma', { waitUntil: 'load' }); await page.waitForTimeout(3000)
    await L.shot(page, 'RA10-restaurant')
    note('restaurant_top', lines(await page.evaluate(() => document.body.innerText)).slice(0, 26))
    note('restaurant_controls', await page.evaluate(() => [...document.querySelectorAll('button, a[href]')].filter(b => b.getBoundingClientRect().width > 0 && b.getBoundingClientRect().top < 900).slice(0, 18).map(b => `${b.getAttribute('aria-label') || b.innerText.replace(/\s+/g, ' ').slice(0, 18)}|${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`)))
    await page.goto(L.BASE + '/restaurant/no-such-place', { waitUntil: 'load' }); await page.waitForTimeout(1800); note('bad_slug', lines(await page.evaluate(() => document.body.innerText)).slice(0, 6))
  } catch (e) { note('ERROR', String(e).split(/\r?\n/)[0].slice(0, 300)); await L.shot(page, 'RA99-error').catch(() => { }) }
  note('console', watch.console.slice(0, 6)); note('pageErrors', watch.pageErrors); note('bad', watch.bad.filter(b => !/ABORTED/.test(b)).slice(0, 6))
  L.save('r3-anon', out); await s.close()
})()
