// Persona B2: Mehriban Rzayeva (signed up, never posted). node personas/ui/newcomer-mehriban.js <stage>
//   stages: empty | post | where     (results/mehriban-<stage>.json, screenshots M*.png)
// The photo is downloaded beforehand to scratchpad/dl/burger.jpg (https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=1080&q=80).
const L = require('./lib')
const stage = process.argv[2] || 'empty'
const out = {}
const note = (k, v) => { out[k] = v; console.log('##', k, typeof v === 'string' ? v : JSON.stringify(v)) }
const lines = t => [...new Set(t.split('\n').map(x => x.trim()).filter(Boolean))]
const NAME = 'Mehriban Rzayeva'
const PHOTO = 'C:/Users/musay/AppData/Local/Temp/claude/C--Users-musay-Desktop-claude/9308ea1d-0f9a-4965-b895-2223492297b4/scratchpad/dl/burger.jpg'
const CAPTION = 'Lunch at Burger Qala today. The classic burger with extra pickles did not disappoint.'

const summary = res => ({
  mix: res.mix, n: (res.items || []).length,
  items: (res.items || []).map(i => `${i.position}:${i.kind}:${i.pool}:${i.restaurant?.name || i.author?.name || ''}${i.kind === 'post' && i.author?.type !== 'restaurant' ? ' (by ' + (i.author?.name || i.user?.name) + ')' : ''}`),
})
async function loadHome(page) {
  const p = page.waitForResponse(r => /rpc\/home_feed(\?|$)/.test(r.url()) && r.request().method() === 'POST', { timeout: 20000 })
  const t0 = Date.now()
  await page.goto(L.BASE + '/', { waitUntil: 'load' })
  const res = await (await p).json()
  if ((await page.getByRole('tab').nth(0).getAttribute('aria-selected')) !== 'true') await page.getByRole('tab').nth(0).click()
  await page.locator('.soc-feed-slot').first().waitFor({ timeout: 20000 })
  const ms = Date.now() - t0
  await page.waitForTimeout(1200)
  return { res, ms }
}

;(async () => {
  const s = await L.open({ as: NAME })
  const { page, watch } = s
  try {
    if (stage === 'empty') {
      const { res, ms } = await loadHome(page)
      note('home_first_card_ms', ms); note('home', summary(res))
      await L.shot(page, 'M01-mehriban-home')
      await page.getByRole('tab').nth(1).click(); await page.waitForTimeout(2500)
      await L.shot(page, 'M02-mehriban-friends-empty')
      note('friends_text', lines(await page.locator('.soc-feed:visible').first().innerText()))
      note('friends_items', await page.locator('.soc-feed:visible .soc-feed-slot').count())
      note('find_cta', await page.getByRole('link', { name: 'Find friends' }).count())
      await page.getByRole('link', { name: 'Find friends' }).first().click(); await page.waitForTimeout(1500)
      note('find_url', page.url().replace(L.BASE, '')); await L.shot(page, 'M03-mehriban-find-from-empty')
      note('find_focus_in_search', await page.evaluate(() => document.activeElement && document.activeElement.tagName + '|' + (document.activeElement.placeholder || '')))
      await page.goBack({ waitUntil: 'load' }); await page.waitForTimeout(1500)
      // requests tab (accept nothing)
      await page.goto(L.BASE + '/friends', { waitUntil: 'load' }); await page.waitForTimeout(1500)
      await page.getByRole('tab', { name: 'Requests' }).click(); await page.waitForTimeout(1000)
      await L.shot(page, 'M04-mehriban-requests')
      note('requests_text', lines(await page.evaluate(() => document.body.innerText)).slice(0, 20))
    }
    if (stage === 'post') {
      await loadHome(page)
      const fab = page.getByRole('button', { name: 'New post' })
      await fab.first().click(); await page.waitForTimeout(1500)
      note('composer_url', page.url().replace(L.BASE, ''))
      await L.shot(page, 'M10-composer-empty')
      note('composer_post_button_disabled_initially', await page.getByRole('button', { name: 'Post', exact: true }).isDisabled())
      const t0 = Date.now()
      await page.locator('input[type=file]').setInputFiles(PHOTO)
      await page.locator('.soc-photo-slot img').waitFor({ timeout: 20000 })
      note('photo_preview_ms', Date.now() - t0)
      await page.waitForTimeout(500); await L.shot(page, 'M11-composer-photo')
      await page.getByLabel('Caption').fill(CAPTION)
      note('post_button_disabled_without_restaurant', await page.getByRole('button', { name: 'Post', exact: true }).isDisabled())
      await page.getByPlaceholder('Search restaurants').fill('Burger')
      await page.getByRole('option', { name: /Burger Qala/ }).waitFor({ timeout: 8000 })
      await L.shot(page, 'M12-composer-restaurant-search')
      await page.getByRole('option', { name: /Burger Qala/ }).click(); await page.waitForTimeout(400)
      await L.shot(page, 'M13-composer-ready')
      note('post_button_enabled_ready', await page.getByRole('button', { name: 'Post', exact: true }).isEnabled())
      note('composer_text', lines(await page.evaluate(() => document.body.innerText)))
      const t1 = Date.now()
      await page.getByRole('button', { name: 'Post', exact: true }).click()
      await page.waitForURL(u => new URL(u).pathname === '/', { timeout: 30000 })
      note('post_to_home_ms', Date.now() - t1)
      await page.waitForTimeout(2500)
      await L.shot(page, 'M14-after-post')
      note('landing_tab', await page.getByRole('tab', { selected: true }).allInnerTexts())
      note('landing_first_card', (await page.locator('.soc-feed:visible .soc-feed-slot').first().innerText()).replace(/\s+/g, ' ').slice(0, 160))
      note('landing_items', await page.locator('.soc-feed:visible .soc-feed-slot').count())
    }
    if (stage === 'where') {
      // Friends tab: own post?
      await page.addInitScript(() => { try { localStorage.setItem('rufesto_home_tab', 'friends') } catch { } })
      await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(3000)
      const own = page.locator('.soc-feed:visible .soc-feed-slot', { hasText: 'Burger Qala today' })
      note('friends_has_own_post', await own.count()); note('friends_first_card', (await page.locator('.soc-feed:visible .soc-feed-slot').first().innerText().catch(() => 'none')).replace(/\s+/g, ' ').slice(0, 140))
      await L.shot(page, 'M20-mehriban-friends-after-post')
      // Home: find the post by paging
      await page.getByRole('tab').nth(0).click(); await page.waitForTimeout(800)
      await page.reload({ waitUntil: 'load' }); await page.getByRole('tab').nth(0).click(); await page.locator('.soc-feed-slot').first().waitFor()
      let found = -1, rounds = 0
      for (; rounds < 25; rounds++) {
        const idx = await page.evaluate(() => [...document.querySelectorAll('.soc-feed-slot')].findIndex(e => /Burger Qala today/.test(e.innerText)))
        if (idx >= 0) { found = idx; break }
        if (await page.getByText("You're all caught up").count()) break
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(900)
      }
      note('home_post_position', found); note('home_paging_rounds', rounds)
      if (found >= 0) { await page.locator('.soc-feed-slot').nth(found).scrollIntoViewIfNeeded(); await page.waitForTimeout(800); await L.shot(page, 'M21-mehriban-home-post') }
      // on Burger Qala's page?
      await page.goto(L.BASE + '/restaurant/burger-qala', { waitUntil: 'load' }); await page.waitForTimeout(2500)
      note('burger_page_mentions_post', await page.evaluate(() => /Burger Qala today/.test(document.body.innerText)))
      note('burger_page_tabs', lines(await page.evaluate(() => document.body.innerText)).slice(0, 14))
      // profile
      await page.goto(L.BASE + '/profile', { waitUntil: 'load' }); await page.waitForTimeout(2500)
      await L.shot(page, 'M22-mehriban-profile-after-post')
      note('profile_text', lines(await page.evaluate(() => document.body.innerText)).slice(0, 24))
      // signed-out view of the same post (is a tagged post public?)
    }
  } catch (e) { note('ERROR', String(e).slice(0, 500)); await L.shot(page, `M99-error-${stage}`).catch(() => { }) }
  note('console', watch.console.slice(0, 8)); note('pageErrors', watch.pageErrors); note('bad', watch.bad.filter(b => !/ERR_ABORTED/.test(b)).slice(0, 8))
  L.save(`mehriban-${stage}`, out)
  await s.close()
})()
