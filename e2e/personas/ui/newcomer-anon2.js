// Persona A part 2: restaurant page + dish sheet + like/follow/reserve while signed out; denied geolocation; bad slug; other tabs.
// node personas/ui/newcomer-anon2.js   -> A4x-*.png, results/anon2.json
const L = require('./lib')
const out = {}
const note = (k, v) => { out[k] = v; console.log('##', k, typeof v === 'string' ? v : JSON.stringify(v)) }
const lines = t => [...new Set(t.split('\n').map(x => x.trim()).filter(Boolean))]
const dialogText = page => page.evaluate(() => { const d = document.querySelector('[role=dialog]'); return d ? d.innerText.replace(/\s+/g, ' ').slice(0, 260) : 'NO DIALOG' })

;(async () => {
  const s = await L.open({})
  const { page, watch } = s
  try {
    // from Home: tap the restaurant chip on the first post -> restaurant page (what a newcomer does)
    await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor()
    const t0 = Date.now()
    await page.locator('.soc-feed-slot').first().locator('a[href^="/restaurant/"]').first().click()
    await page.locator('h1').first().waitFor()
    note('chip_to_restaurant_h1_ms', Date.now() - t0)
    await page.waitForTimeout(1500)
    note('restaurant_buttons', await page.evaluate(() => [...document.querySelectorAll('main a, main button, #root button, #root a')].filter(b => b.getBoundingClientRect().width > 0 && b.getBoundingClientRect().top < 800).slice(0, 14).map(b => `${b.tagName}|${b.getAttribute('aria-label') || ''}|${b.innerText.replace(/\s+/g, ' ').slice(0, 20)}|${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`)))
    // follow
    await page.getByRole('button', { name: 'Follow', exact: true }).first().click(); await page.waitForTimeout(700)
    await L.shot(page, 'A40-restaurant-follow-prompt'); note('follow_prompt', await dialogText(page)); await page.keyboard.press('Escape'); await page.waitForTimeout(300)
    // reserve a table
    await page.getByRole('link', { name: 'Reserve a table' }).first().click(); await page.waitForTimeout(1500)
    await L.shot(page, 'A41-restaurant-reserve-signedout'); note('reserve_url', page.url().replace(L.BASE, '')); note('reserve_dialog', await dialogText(page))
    await page.goBack({ waitUntil: 'load' }); await page.waitForTimeout(1500)
    // dish
    await page.evaluate(() => window.scrollTo(0, 560)); await page.waitForTimeout(600)
    await L.shot(page, 'A42-restaurant-dishes')
    const dish = page.locator('text=Tiramisù').first()
    await dish.scrollIntoViewIfNeeded(); await dish.click(); await page.waitForTimeout(1200)
    await L.shot(page, 'A43-dish-sheet')
    note('dish_sheet_text', lines(await page.evaluate(() => (document.querySelector('[role=dialog]') || document.body).innerText)).slice(0, 30))
    note('dish_sheet_buttons', await page.evaluate(() => [...document.querySelectorAll('[role=dialog] button, [role=dialog] a')].map(b => `${b.getAttribute('aria-label') || ''}|${b.innerText.replace(/\s+/g, ' ').slice(0, 24)}|${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`)))
    const like = page.locator('[role=dialog]').getByRole('button', { name: /like|bəyən|save|saxla/i }).first()
    if (await like.count()) { await like.click(); await page.waitForTimeout(800); await L.shot(page, 'A44-dish-like-prompt'); note('dish_like_prompt', await dialogText(page)) }
    else note('dish_like_button', 'none found')
    await page.keyboard.press('Escape')
    // add to cart signed out?
    const addBtn = page.getByRole('button', { name: /add|order|sifariş/i }).first()
    note('dish_add_visible', (await addBtn.count()) > 0)
  } catch (e) { note('ERROR_resto', String(e).slice(0, 400)); await L.shot(page, 'A49-error').catch(() => {}) }
  note('console', watch.console.slice(0, 6)); note('bad', watch.bad.slice(0, 6))
  await s.close()

  // bad slug
  {
    const s2 = await L.open({}); const { page: p } = s2
    await p.goto(L.BASE + '/restaurant/no-such-place', { waitUntil: 'load' }); await p.waitForTimeout(2500)
    note('bad_slug_final_url', p.url().replace(L.BASE, '')); note('bad_slug_text', lines(await p.evaluate(() => document.body.innerText)).slice(0, 6))
    await p.goto(L.BASE + '/nope', { waitUntil: 'load' }); await p.waitForTimeout(1200); await L.shot(p, 'A45-404'); note('404_text', lines(await p.evaluate(() => document.body.innerText)).slice(0, 8))
    await s2.close()
  }
  // denied geolocation (no permission granted): pill click
  {
    const s3 = await L.open({}); const { page: p } = s3
    await p.goto(L.BASE + '/', { waitUntil: 'load' }); await p.locator('.soc-feed-slot').first().waitFor()
    await p.getByRole('button', { name: 'Use my location for nearby' }).first().click(); await p.waitForTimeout(2500)
    await L.shot(p, 'A46-geo-denied')
    note('geo_denied_text', lines(await p.evaluate(() => (document.querySelector('.soc-geo') || { innerText: 'none' }).innerText)))
    await s3.close()
  }
  // other bottom-nav tabs signed out (Explore, Map)
  {
    const s4 = await L.open({}); const { page: p, watch: w } = s4
    for (const [n, path] of [['explore', '/explore'], ['map', '/map'], ['notifications', '/notifications']]) {
      const t = Date.now()
      await p.goto(L.BASE + path, { waitUntil: 'load' }); await p.waitForTimeout(2500)
      await L.shot(p, `A47-${n}`); note(`${n}_text`, lines(await p.evaluate(() => document.body.innerText)).slice(0, 18))
    }
    note('other_tabs_console', w.console.slice(0, 6)); note('other_tabs_bad', w.bad.slice(0, 6))
    await s4.close()
  }
  L.save('anon2', out)
})()
