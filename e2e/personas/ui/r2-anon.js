// Round 2, persona A (signed-out visitor): re-checks N01 N02 N04 N10-N15 N17 N18 on the current preview build.
// ROUND=round2 node personas/ui/r2-anon.js   -> results/round2/r2-anon.json, screenshots round2/RA*.png
const L = require('./lib')
const out = {}
const note = (k, v) => { out[k] = v; console.log('##', k, typeof v === 'string' ? v : JSON.stringify(v)) }
const lines = t => [...new Set(t.split('\n').map(x => x.trim()).filter(Boolean))]

;(async () => {
  const s = await L.open({}); const { page, watch } = s
  try {
    await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor(); await page.waitForTimeout(2000)
    note('bundle', await page.evaluate(() => [...document.scripts].map(x => (x.src.match(/index-[\w-]+\.js/) || [])[0]).filter(Boolean)[0]))
    await L.shot(page, 'RA01-home-signedout')
    // ---- N18 semantics + N10 targets + N14 ads + N15 card mix
    note('h1', await page.evaluate(() => [...document.querySelectorAll('h1')].map(h => ({ t: h.innerText, vis: h.getBoundingClientRect().width > 1 }))))
    note('tablist', await page.evaluate(() => { const t = document.querySelector('[role=tablist]'); return { tabs: [...t.querySelectorAll('[role=tab]')].map(b => ({ txt: b.innerText, sel: b.getAttribute('aria-selected'), tabindex: b.getAttribute('tabindex'), controls: b.getAttribute('aria-controls') })), panels: document.querySelectorAll('[role=tabpanel]').length } }))
    await page.getByRole('tab').nth(0).focus(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(500)
    note('arrowright_selected', await page.evaluate(() => [...document.querySelectorAll('[role=tab]')].map(b => b.getAttribute('aria-selected'))))
    await page.getByRole('tab').nth(0).click(); await page.waitForTimeout(500)
    const cards = await page.evaluate(() => [...document.querySelectorAll('.soc-feed-slot')].slice(0, 20).map((el, i) => ({ i: i + 1, promo: /Sponsored|PROMOTED|Sponsorlu/i.test(el.innerText), photo: !!el.querySelector('.soc-photo img, img[src*="post-photos"], .menu-card img'), h: Math.round(el.getBoundingClientRect().height), head: el.innerText.replace(/\s+/g, ' ').slice(0, 40) })))
    note('promo_positions_first20', cards.filter(c => c.promo).map(c => c.i))
    note('textonly_in_top10', cards.slice(0, 10).filter(c => !c.promo && c.h < 300).map(c => `${c.i}:${c.h}px:${c.head}`))
    note('card_heights_top10', cards.slice(0, 10).map(c => c.h))
    note('promo_label_texts', await page.evaluate(() => [...document.querySelectorAll('.menu-card')].slice(0, 2).map(e => e.innerText.replace(/\s+/g, ' ').slice(0, 60))))
    const imgs = await page.evaluate(() => [...document.querySelectorAll('.soc-feed-slot img')].slice(0, 6).map(i => ({ loading: i.loading, fp: i.getAttribute('fetchpriority'), nat: i.naturalWidth + 'x' + i.naturalHeight, shown: Math.round(i.getBoundingClientRect().width), alt: (i.alt || '').slice(0, 24), src: i.currentSrc.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '').slice(-26) })))
    note('first_images', imgs)
    // small targets (everything the brief names + links)
    note('small_targets_home', await page.evaluate(() => {
      const g = {}
      for (const e of document.querySelectorAll('a[href], button, [role=tab]')) { const r = e.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) continue; if ((r.width < 44 || r.height < 44) && !(e.tagName === 'A' && getComputedStyle(e).display === 'inline')) { const k = `${e.tagName.toLowerCase()}.${(e.className || '').toString().split(' ')[0]}|${(e.getAttribute('aria-label') || e.innerText || '').slice(0, 18)}|${Math.round(r.width)}x${Math.round(r.height)}`; g[k] = (g[k] || 0) + 1 } }
      return Object.entries(g).map(([k, n]) => `${n}x ${k}`)
    }))
    // ---- N12 FAB overlap while scrolling
    const overlap = await page.evaluate(async () => {
      const fab = document.querySelector('.soc-fab'); if (!fab) return { fab: 'none' }
      const hits = new Set(); let steps = 0
      for (let y = 0; y < 9000; y += 160) {
        window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); steps++
        const f = fab.getBoundingClientRect()
        for (const e of document.querySelectorAll('.soc-feed-slot a[href], .soc-feed-slot button')) {
          const r = e.getBoundingClientRect(); if (r.width <= 0 || r.bottom < 0 || r.top > innerHeight) continue
          const ix = Math.max(0, Math.min(f.right, r.right) - Math.max(f.left, r.left)), iy = Math.max(0, Math.min(f.bottom, r.bottom) - Math.max(f.top, r.top))
          if (ix * iy > 0.3 * r.width * r.height && r.width > 60) hits.add((e.innerText || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').slice(0, 24) + '|' + Math.round(r.width) + 'x' + Math.round(r.height))
        }
      }
      const f = fab.getBoundingClientRect()
      return { rect: [Math.round(f.left), Math.round(f.top), Math.round(f.width), Math.round(f.height)], steps, coveredControls: [...hits] }
    })
    note('fab_overlap', overlap)
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(500)
    // ---- N11 sign-in sheet copy + FAB over sheet
    await page.locator('.soc-feed-slot').first().getByRole('button', { name: 'Like' }).click(); await page.waitForTimeout(900)
    await L.shot(page, 'RA02-signin-sheet')
    note('signin_sheet_headings', await page.locator('h1, h2, h3').allInnerTexts().then(a => a.slice(-3)))
    note('signin_sheet_text', await page.getByText('Continue with Google').count() ? await page.getByText(/no password needed|Sign in or create/).first().innerText().catch(() => 'n/a') : 'no sheet')
    note('fab_above_sheet', await page.evaluate(() => { const f = document.querySelector('.soc-fab'); if (!f) return 'no fab while sheet open'; const r = f.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return top === f || f.contains(top) ? 'FAB is on top of the sheet' : 'sheet is above the FAB' }))
    await page.keyboard.press('Escape'); await page.waitForTimeout(400)
    // ---- Order this
    const order = page.getByRole('button', { name: /Order this/ }).or(page.getByRole('link', { name: /Order this/ })).first()
    note('order_this_present', await order.count())
    if (await order.count()) {
      await order.scrollIntoViewIfNeeded(); await order.click(); await page.waitForTimeout(1200)
      await L.shot(page, 'RA03-order-this')
      note('order_this_result', { url: page.url().replace(L.BASE, ''), text: lines(await page.evaluate(() => (document.querySelector('[role=dialog]') || document.body).innerText)).slice(0, 16) })
      await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor()
    }
    // ---- language switch (N04, N13)
    const az = page.getByRole('button', { name: /Switch language to Az/ })
    note('lang_switch_present_home', await az.count())
    await az.first().click(); await page.waitForTimeout(1200)
    note('after_az_tabs', await page.getByRole('tab').allInnerTexts()); note('html_lang_after_az', await page.evaluate(() => document.documentElement.lang))
    await L.shot(page, 'RA04-home-az')
    await page.getByRole('tab').nth(2).click(); await page.waitForTimeout(2500)
    note('az_discover_chips', await page.evaluate(() => [...document.querySelectorAll('.dsc button')].slice(0, 9).map(b => b.innerText)))
    note('az_discover_cuisine_lines', await page.evaluate(() => [...document.querySelectorAll('.dsc .dsc-rc-meta')].slice(0, 5).map(e => e.innerText)))
    await L.shot(page, 'RA05-discover-az')
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(1500)
    note('az_persists_after_reload', await page.getByRole('tab').allInnerTexts())
    await page.goto(L.BASE + '/profile', { waitUntil: 'load' }); await page.waitForTimeout(1500)
    note('profile_signedout_az_lines', lines(await page.evaluate(() => document.body.innerText)).slice(0, 10))
    note('lang_buttons_in_az', await page.locator('.lang-switcher button').evaluateAll(b => b.map(x => x.getAttribute('aria-label'))))
    await page.locator('.lang-switcher button').first().click(); await page.waitForTimeout(800)
    note('html_lang_back', await page.evaluate(() => document.documentElement.lang))
    // ---- N02 chip filters every section
    await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.getByRole('tab').nth(2).click(); await page.waitForTimeout(2500)
    await page.getByRole('button', { name: 'Japanese', exact: true }).click(); await page.waitForTimeout(2500)
    await L.shot(page, 'RA06-discover-japanese')
    note('japanese_sections', await page.evaluate(() => { const o = {}; document.querySelectorAll('.dsc h2').forEach(h => { o[h.innerText] = h.parentElement.innerText.replace(/\s+/g, ' ').slice(0, 150) }); return o }))
    await page.getByRole('button', { name: 'Italian', exact: true }).click(); await page.waitForTimeout(2000)
    note('italian_sections', await page.evaluate(() => { const o = {}; document.querySelectorAll('.dsc h2').forEach(h => { o[h.innerText] = h.parentElement.innerText.replace(/\s+/g, ' ').slice(0, 150) }); return o }))
    note('chip_a11y', await page.evaluate(() => { const b = [...document.querySelectorAll('.dsc button')].find(x => x.innerText === 'Italian'); return b ? { pressed: b.getAttribute('aria-pressed'), selected: b.getAttribute('aria-selected'), h: Math.round(b.getBoundingClientRect().height) } : null }))
    // ---- N01 dish like / save signed out
    await page.goto(L.BASE + '/restaurant/bella-roma?dish=80000001-0000-0000-0000-000000000020', { waitUntil: 'load' }); await page.waitForTimeout(3000)
    await L.shot(page, 'RA07-dish-sheet')
    const writes = []; page.on('request', r => { if (r.method() !== 'GET' && /\/rest\/v1\/(likes|saved_dishes)/.test(r.url())) writes.push(r.method()) })
    const names = await page.evaluate(() => [...document.querySelectorAll('[role=dialog] button, [role=dialog] a')].filter(b => b.getBoundingClientRect().width > 0).map(b => `${b.getAttribute('aria-label') || b.innerText.replace(/\s+/g, ' ').slice(0, 16)}|${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`))
    note('dish_sheet_controls', names)
    const likeBtn = page.locator('[role=dialog]').getByRole('button', { name: /^(Like|Unlike|Remove like)/i }).first()
    note('dish_like_button_named', await likeBtn.count())
    if (await likeBtn.count()) { await likeBtn.click(); await page.waitForTimeout(1000) }
    note('dish_like_signin_sheet', await page.evaluate(() => /Continue with|Sign in|Welcome/.test(document.body.innerText)))
    note('dish_like_shows_1_like', await page.evaluate(() => /\b1 like/.test(document.body.innerText)))
    note('dish_like_writes', writes)
    await L.shot(page, 'RA08-dish-like-signedout')
    // ---- N17 bad slug + 404
    await page.goto(L.BASE + '/restaurant/no-such-place', { waitUntil: 'load' }); await page.waitForTimeout(2500)
    await L.shot(page, 'RA09-bad-slug'); note('bad_slug', { url: page.url().replace(L.BASE, ''), text: lines(await page.evaluate(() => document.body.innerText)).slice(0, 8) })
    // ---- alt text vs caption (N18)
    await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor(); await page.waitForTimeout(1500)
    note('alt_equals_caption_count', await page.evaluate(() => [...document.querySelectorAll('.soc-feed-slot')].slice(0, 12).filter(el => { const i = el.querySelector('.soc-photo img'); const c = el.querySelector('.soc-caption'); return i && c && i.alt && c.innerText.includes(i.alt.slice(0, 20)) }).length))
  } catch (e) { note('ERROR', String(e).slice(0, 500)); await L.shot(page, 'RA99-error').catch(() => { }) }
  note('console', watch.console.slice(0, 8)); note('pageErrors', watch.pageErrors); note('bad', watch.bad.filter(b => !/ABORTED/.test(b)).slice(0, 8))
  L.save('r2-anon', out)
  await s.close()
})()
