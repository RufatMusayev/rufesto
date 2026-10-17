// Re-verification of the main newcomer findings on the CURRENT preview build (the bundle changed while the walk-through ran).
// node personas/ui/newcomer-reverify.js  -> results/reverify.json, screenshots R*.png
const L = require('./lib')
const out = {}
const note = (k, v) => { out[k] = v; console.log('##', k, typeof v === 'string' ? v : JSON.stringify(v)) }
const lines = t => [...new Set(t.split('\n').map(x => x.trim()).filter(Boolean))]
const bundle = page => page.evaluate(() => [...document.scripts].map(s => (s.src.match(/index-[\w-]+\.js/) || [])[0]).filter(Boolean)[0])

;(async () => {
  // ---- signed out
  {
    const s = await L.open({}); const { page } = s
    await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor(); await page.waitForTimeout(1500)
    note('bundle', await bundle(page)); note('time', new Date().toISOString())
    await L.shot(page, 'R01-home-signedout')
    // F: dish like / save signed out (deep link opens the dish sheet)
    await page.goto(L.BASE + '/restaurant/bella-roma?dish=80000001-0000-0000-0000-000000000020', { waitUntil: 'load' }); await page.waitForTimeout(3000)
    await L.shot(page, 'R02-restaurant-dish-deeplink')
    const icons = await page.evaluate(() => [...document.querySelectorAll('button.icon-btn')].filter(b => b.getBoundingClientRect().top > 0 && b.getBoundingClientRect().top < 840 && !b.getAttribute('aria-label')).map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.left + 22), Math.round(r.top + 22)] }))
    note('dish_sheet_unlabelled_icons', icons.length)
    const writes = []
    page.on('request', r => { if (r.method() !== 'GET' && /\/rest\/v1\/(likes|saved_dishes)/.test(r.url())) writes.push(r.method()) })
    if (icons.length >= 3) {
      await page.mouse.click(icons[0][0], icons[0][1]); await page.waitForTimeout(800)
      note('dish_like_shows_1_like_signed_out', await page.evaluate(() => /1 like/.test(document.body.innerText)))
      await page.mouse.click(icons[2][0], icons[2][1]); await page.waitForTimeout(800)
      note('dish_like_save_signin_prompt', await page.evaluate(() => /Continue with|Welcome back/.test(document.body.innerText)))
      note('dish_like_save_writes', writes)
      await L.shot(page, 'R03-dish-like-signed-out')
    }
    // F: cuisine chip
    await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.getByRole('tab').nth(2).click(); await page.waitForTimeout(2500)
    await page.getByRole('button', { name: 'Japanese', exact: true }).click(); await page.waitForTimeout(2000)
    note('japanese_chip_sections', await page.evaluate(() => { const o = {}; document.querySelectorAll('.dsc h2').forEach(h => { o[h.innerText] = [...h.parentElement.querySelectorAll('h3')].map(x => x.innerText).slice(0, 12).length }); return o }))
    await L.shot(page, 'R04-discover-japanese')
    // F: language switch for signed-out phone users
    await page.goto(L.BASE + '/profile', { waitUntil: 'load' }); await page.waitForTimeout(1500)
    note('profile_signedout_has_language_switch', await page.evaluate(() => /\bAZ\b|Azərbaycan|Language|Dil\b/.test(document.body.innerText) || !!document.querySelector('.lang-switcher')))
    note('home_header_has_language_switch', await page.evaluate(() => !!document.querySelector('header .lang-switcher, .lang-switcher')))
    // a11y names
    note('bottom_nav', await page.evaluate(() => [...document.querySelectorAll('.bottom-nav a, .bottom-nav button')].map(e => e.getAttribute('aria-label'))))
    await page.goto(L.BASE + '/restaurant/bella-roma', { waitUntil: 'load' }); await page.waitForTimeout(3000)
    await L.shot(page, 'R05-restaurant-new-build')
    note('restaurant_first_screen', lines(await page.evaluate(() => document.body.innerText)).slice(0, 26))
    note('restaurant_unnamed_buttons', await page.evaluate(() => [...document.querySelectorAll('button, a[href]')].filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && !(b.getAttribute('aria-label') || b.innerText || b.title || '').trim() }).map(b => `${b.tagName.toLowerCase()} ${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)} @y${Math.round(b.getBoundingClientRect().top + scrollY)}`)))
    await s.close()
  }
  // ---- Ferid: Follow in Discover, back to Home without reload
  {
    const s = await L.open({ as: 'Fərid Məlikov' }); const { page } = s
    await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor(); await page.waitForTimeout(1200)
    const top = () => page.evaluate(() => [...document.querySelectorAll('.soc-feed-slot')].slice(0, 6).map(el => el.innerText.replace(/\s+/g, ' ').slice(0, 40)))
    const before = await top()
    await page.getByRole('tab').nth(2).click(); await page.waitForTimeout(2500)
    const btn = page.getByRole('button', { name: 'Follow Trattoria Bella Roma', exact: true }).first()
    if (!(await page.locator('[role=dialog]').count()) && await btn.count()) {
      await btn.scrollIntoViewIfNeeded(); await btn.click(); await page.waitForTimeout(1200)
      await page.getByRole('tab').nth(0).click(); await page.waitForTimeout(1500)
      const sw = await top()
      note('home_top6_before', before); note('home_top6_after_follow_tabswitch', sw); note('home_unchanged_after_follow_without_reload', JSON.stringify(before) === JSON.stringify(sw))
      // undo (restore Ferid's follows)
      await page.getByRole('tab').nth(2).click(); await page.waitForTimeout(1500)
      await page.getByRole('button', { name: 'Unfollow Trattoria Bella Roma', exact: true }).first().click(); await page.waitForTimeout(1000)
      note('undo_follow_done', true)
    } else note('follow_step', 'skipped (no Follow button or dialog open)')
    await s.close()
  }
  // ---- Mehriban: Friends tab has her own post and no way to find friends
  {
    const s = await L.open({ as: 'Mehriban Rzayeva' }); const { page } = s
    await page.addInitScript(() => { try { localStorage.setItem('rufesto_home_tab', 'friends') } catch { } })
    await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(3500)
    note('friends_tab_after_first_post_text', lines(await page.locator('.soc-feed:visible').first().innerText()).slice(0, 12))
    note('friends_tab_find_friends_cta', await page.getByRole('link', { name: 'Find friends' }).count())
    await L.shot(page, 'R06-mehriban-friends-after-post')
    await s.close()
  }
  L.save('reverify', out)
})()
