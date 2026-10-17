// Misc checks: Discover cuisine chip filtering, signed-in AZ pass (Mehriban), AZ lang attribute, empty-search copy, dish-sheet like prompt.
// node personas/ui/newcomer-misc.js   -> results/misc.json
const L = require('./lib')
const out = {}
const note = (k, v) => { out[k] = v; console.log('##', k, typeof v === 'string' ? v : JSON.stringify(v)) }
const lines = t => [...new Set(t.split('\n').map(x => x.trim()).filter(Boolean))]

;(async () => {
  // ---- Discover chip filtering (signed out)
  {
    const s = await L.open({}); const { page } = s
    await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.getByRole('tab').nth(2).click(); await page.waitForTimeout(2500)
    const snap = () => page.evaluate(() => {
      const sec = {}
      document.querySelectorAll('.dsc h2').forEach(h => { const box = h.parentElement; sec[h.innerText] = [...box.querySelectorAll('h3, .dsc-dish-name, [class*=name]')].map(e => e.innerText.trim()).filter(Boolean).length })
      return sec
    })
    note('chips_all', await snap())
    const t0 = Date.now()
    await page.getByRole('button', { name: 'Italian', exact: true }).click()
    await page.waitForFunction(() => /dsc/.test(document.body.innerHTML)); await page.waitForTimeout(1500)
    note('chip_italian_ms', Date.now() - t0)
    note('chips_italian', await snap())
    note('chip_italian_open_now', await page.evaluate(() => { const h = [...document.querySelectorAll('.dsc h2')].find(x => /Open now/.test(x.innerText)); return [...h.parentElement.querySelectorAll('h3')].map(x => x.innerText) }))
    note('chip_italian_top_reviews_places', await page.evaluate(() => { const h = [...document.querySelectorAll('.dsc h2')].find(x => /Top reviews/.test(x.innerText)); return h ? [...h.parentElement.querySelectorAll('article')].map(a => (a.innerText.match(/·\s*([^\n]+)\n/) || [])[1]).slice(0, 8) : [] }))
    await L.shot(page, 'A50-discover-italian-filtered')
    await page.getByRole('button', { name: 'Japanese', exact: true }).click(); await page.waitForTimeout(1500)
    note('chips_japanese', await snap())
    note('chip_state_selected', await page.evaluate(() => [...document.querySelectorAll('.dsc button[aria-pressed=true], .dsc [aria-selected=true]')].map(b => b.innerText)))
    note('chips_a11y', await page.evaluate(() => { const c = document.querySelector('.dsc-chips, [class*=chips]'); return c ? (c.getAttribute('role') + '|' + [...c.children].slice(0, 3).map(b => b.tagName + ':' + (b.getAttribute('aria-pressed') ?? b.getAttribute('aria-selected') ?? 'none') + ':' + Math.round(b.getBoundingClientRect().height)).join(',')) : 'no chips container' }))
    // dish card -> what happens on tap (Trending dishes) while signed out
    await page.getByRole('button', { name: 'All', exact: true }).first().click(); await page.waitForTimeout(1500)
    const dish = page.locator('.dsc').getByText('Espresso', { exact: true }).first()
    await dish.scrollIntoViewIfNeeded(); await dish.click({ force: true }); await page.waitForTimeout(1500)
    note('trending_dish_tap_url', page.url().replace(L.BASE, ''))
    await L.shot(page, 'A51-trending-dish-tap')
    // like inside the dish sheet while signed out
    const icons = await page.evaluate(() => [...document.querySelectorAll('button.icon-btn')].filter(b => b.getBoundingClientRect().top > 0 && b.getBoundingClientRect().top < 840 && !b.getAttribute('aria-label')).map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.left + 22), Math.round(r.top + 22)] }))
    note('dish_sheet_icon_buttons', icons)
    if (icons.length) { await page.mouse.click(icons[0][0], icons[0][1]); await page.waitForTimeout(1000); await L.shot(page, 'A52-dish-like-signedout'); note('dish_like_prompt', lines(await page.evaluate(() => document.body.innerText)).slice(-14)) }
    await s.close()
  }
  // ---- signed-in Azerbaijani (Mehriban): friends empty state, find people, composer, profile
  {
    const s = await L.open({ as: 'Mehriban Rzayeva', lang: 'az' }); const { page } = s
    await page.addInitScript(() => { try { localStorage.setItem('rufesto_home_tab', 'friends') } catch { } })
    await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(3000)
    note('az_html_lang', await page.evaluate(() => document.documentElement.lang))
    await L.shot(page, 'M40-az-friends'); note('az_friends', lines(await page.evaluate(() => document.querySelector('.soc-feed:not([hidden] *)') ? document.body.innerText : document.body.innerText)).slice(0, 22))
    await page.goto(L.BASE + '/friends?tab=find', { waitUntil: 'load' }); await page.waitForTimeout(1500)
    await page.locator('input').first().fill('Ays'); await page.waitForTimeout(500); note('az_find_hint', lines(await page.evaluate(() => document.body.innerText)))
    await page.locator('input').first().fill('Zzzzzq'); await page.waitForTimeout(1800); await L.shot(page, 'M41-az-find-noresults'); note('az_find_noresults', lines(await page.evaluate(() => document.body.innerText)))
    await page.goto(L.BASE + '/post/new', { waitUntil: 'load' }); await page.waitForTimeout(1500); await L.shot(page, 'M42-az-composer'); note('az_composer', lines(await page.evaluate(() => document.body.innerText)))
    await page.goto(L.BASE + '/profile', { waitUntil: 'load' }); await page.waitForTimeout(2500); await L.shot(page, 'M43-az-profile'); note('az_profile', lines(await page.evaluate(() => document.body.innerText)).slice(0, 26))
    await s.close()
  }
  L.save('misc', out)
})()
