// Round 3: the shell at 1280 / 1024 / 1023 / 820 px (rail from 1024), Azerbaijani + dark/light on the phone, Home with the language and theme controls gone.
// ROUND=round3 node personas/ui/r3-layout.js -> results/round3/r3-layout.json, screenshots round3/RL*.png
const L = require('./lib')
const out = {}
const note = (k, v) => { out[k] = v; console.log('##', k, typeof v === 'string' ? v : JSON.stringify(v)) }
const lines = t => [...new Set(t.split('\n').map(x => x.trim()).filter(Boolean))]
;(async () => {
  for (const [name, vp, touch] of [['1280', { width: 1280, height: 800 }, false], ['1024', { width: 1024, height: 768 }, false], ['1023', { width: 1023, height: 768 }, false], ['820-touch', { width: 820, height: 1180 }, true]]) {
    const s = await L.open({ viewport: vp, touch }); const { page } = s
    try {
      await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor(); await page.waitForTimeout(2200)
      await L.shot(page, `RL-${name}-home`)
      note(`vp${name}`, await page.evaluate(() => {
        const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
        const rail = document.querySelector('.sidebar, aside, nav[aria-label*="ain"]:not(.bottom-nav)')
        const bn = document.querySelector('.bottom-nav')
        const items = rail ? [...rail.querySelectorAll('a, button')].filter(vis).map(b => (b.getAttribute('aria-label') || b.innerText.replace(/\s+/g, ' ')).slice(0, 16) + '|' + Math.round(b.getBoundingClientRect().width) + 'x' + Math.round(b.getBoundingClientRect().height)) : null
        const col = document.querySelector('.soc-feed-slot')
        return { railVisible: !!(rail && vis(rail)), railWidth: rail && vis(rail) ? Math.round(rail.getBoundingClientRect().width) : 0, railItems: items, bottomNavVisible: !!(bn && vis(bn)), feedColumnWidth: col ? Math.round(col.getBoundingClientRect().width) : null, hScroll: document.documentElement.scrollWidth > innerWidth + 1, langOrTheme: !!document.querySelector('.lang-switcher, [aria-label*="Switch language"], [aria-label*="Toggle theme"]'), text: document.body.innerText.slice(0, 160) }
      }))
    } catch (e) { note(`vp${name}_ERROR`, String(e).split(/\r?\n/)[0].slice(0, 200)) }
    await s.close()
  }
  // desktop: search + restaurant + notifications pages at 1280
  {
    const s = await L.open({ viewport: { width: 1280, height: 800 } }); const { page } = s
    for (const [n, path] of [['search', '/explore'], ['restaurant', '/restaurant/bella-roma'], ['notifications', '/notifications'], ['map', '/map']]) {
      await page.goto(L.BASE + path, { waitUntil: 'load' }); await page.waitForTimeout(2500); await L.shot(page, `RL-1280-${n}`)
      note(`d1280_${n}_hscroll`, await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1))
    }
    await s.close()
  }
  // phone: Azerbaijani + dark + light on Home / Search / notifications
  for (const [tag, opts] of [['az-light', { lang: 'az', theme: 'light' }], ['az-dark', { lang: 'az', theme: 'dark' }], ['en-dark', { lang: 'en', theme: 'dark' }]]) {
    const s = await L.open(opts); const { page } = s
    await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor(); await page.waitForTimeout(2200); await L.shot(page, `RL-${tag}-home`)
    if (tag === 'az-light') {
      note('az_home', { tabs: await page.getByRole('tab').allInnerTexts(), html_lang: await page.evaluate(() => document.documentElement.lang), lines: lines(await page.evaluate(() => document.body.innerText)).slice(0, 26), headerRows: await page.evaluate(() => [...document.querySelectorAll('.soc-feed-slot header')].slice(0, 6).map(h => Math.round(h.getBoundingClientRect().height))), nav_labels: await page.evaluate(() => [...document.querySelectorAll('.bottom-nav a, .bottom-nav button')].map(e => e.getAttribute('aria-label'))) })
      await page.goto(L.BASE + '/explore', { waitUntil: 'load' }); await page.waitForTimeout(2500); await L.shot(page, 'RL-az-light-search')
      note('az_search', lines(await page.evaluate(() => document.body.innerText)).slice(0, 40))
      await page.getByRole('button', { name: /Filtr/i }).first().click().catch(() => { }); await page.waitForTimeout(900); await L.shot(page, 'RL-az-light-filters')
      note('az_filters', lines(await page.evaluate(() => (document.querySelector('[role=dialog]') || document.body).innerText)).slice(0, 30))
      await page.keyboard.press('Escape'); await page.waitForTimeout(500)
      await page.goto(L.BASE + '/restaurant/bella-roma', { waitUntil: 'load' }); await page.waitForTimeout(2500); await L.shot(page, 'RL-az-light-restaurant')
      note('az_restaurant', lines(await page.evaluate(() => document.body.innerText)).slice(0, 20))
      await page.goto(L.BASE + '/explore?dish=80000001-0000-0000-0000-000000000021', { waitUntil: 'load' }); await page.waitForTimeout(2500); await L.shot(page, 'RL-az-light-dish')
      note('az_dish_sheet', lines(await page.evaluate(() => (document.querySelector('[role=dialog]') || document.body).innerText)).slice(0, 24))
      await page.goto(L.BASE + '/profile', { waitUntil: 'load' }); await page.waitForTimeout(1500)
      await page.getByRole('button', { name: /Ayarlar|Settings/ }).first().click().catch(() => { }); await page.waitForTimeout(900); await L.shot(page, 'RL-az-light-settings')
      note('az_settings_signedout', lines(await page.evaluate(() => (document.querySelector('[role=dialog]') || document.body).innerText)).slice(0, 12))
    }
    await s.close()
  }
  L.save('r3-layout', out)
})()
