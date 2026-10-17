// Persona B: Ferid Melikov (Sabuncu, new in town). node personas/ui/newcomer-ferid.js <stage>
//   stages: asfound | cold | follow2 | save | restore   (results/ferid-<stage>.json, screenshots B*.png)
// Facts the brief did not know: the DB gives Ferid 3 follows (restaurants ...06/07/08, created by the simulation on 2026-10-10).
const L = require('./lib')
const stage = process.argv[2] || 'asfound'
const out = {}
const note = (k, v) => { out[k] = v; console.log('##', k, typeof v === 'string' ? v : JSON.stringify(v)) }
const lines = t => [...new Set(t.split('\n').map(x => x.trim()).filter(Boolean))]
const NAME = 'Fərid Məlikov'

const summary = res => ({
  mix: res.mix, radius: res.radius_km, caught_up: res.caught_up, n: (res.items || []).length,
  items: (res.items || []).map(i => `${i.position}:${i.kind}:${i.pool}:${i.restaurant?.name || i.author?.name || ''}${i.kind === 'post' && i.author?.type !== 'restaurant' ? ' (by ' + (i.author?.name || i.user?.name) + ')' : ''}`),
})

/** reload Home and resolve the first home_feed answer + ms until the first card is visible */
async function loadHome(page, fresh = true) {
  const p = page.waitForResponse(r => /rpc\/home_feed(\?|$)/.test(r.url()) && r.request().method() === 'POST', { timeout: 20000 })
  const t0 = Date.now()
  if (fresh) await page.goto(L.BASE + '/', { waitUntil: 'load' })
  const res = await (await p).json()
  if (await page.getByRole('tab').nth(0).getAttribute('aria-selected') !== 'true') await page.getByRole('tab').nth(0).click()   // the last tab is remembered
  await page.locator('.soc-feed-slot').first().waitFor({ timeout: 20000 })
  const ms = Date.now() - t0
  await page.waitForTimeout(1200)
  return { res, ms }
}

async function discoverFollow(page, names, on) {
  await page.getByRole('tab').nth(2).click(); await page.waitForTimeout(2500)
  for (const n of names) {
    const btn = page.getByRole('button', { name: `${on ? 'Follow' : 'Unfollow'} ${n}`, exact: true }).first()
    if (!(await btn.count())) { note(`${on ? 'follow' : 'unfollow'}_${n}`, 'no button (already in that state?)'); continue }
    await btn.scrollIntoViewIfNeeded(); await page.waitForTimeout(300)
    const t0 = Date.now(); await btn.click({ force: true })
    await page.getByRole('button', { name: `${on ? 'Unfollow' : 'Follow'} ${n}`, exact: true }).first().waitFor({ timeout: 8000 }).catch(() => note(`follow_state_flip_${n}`, 'NO FLIP'))
    note(`${on ? 'follow' : 'unfollow'}_${n}_ms`, Date.now() - t0)
  }
}

;(async () => {
  const s = await L.open({ as: NAME })
  const { page, watch } = s
  try {
    if (stage === 'asfound') {
      const { res, ms } = await loadHome(page)
      note('home_first_card_ms', ms); note('home_as_found', summary(res))
      await L.shot(page, 'B01-ferid-home-asfound')
      await page.evaluate(() => window.scrollTo(0, 1800)); await page.waitForTimeout(600); await L.shot(page, 'B02-ferid-home-scroll')
      // Friends tab
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.getByRole('tab').nth(1).click(); await page.waitForTimeout(2500)
      await L.shot(page, 'B03-ferid-friends-empty')
      note('friends_text', lines(await page.locator('.soc-feed:visible').first().innerText()).slice(0, 40))
      note('friends_items', await page.locator('.soc-feed:visible .soc-feed-slot').count())
      // Find friends
      const find = page.getByRole('link', { name: 'Find friends' })
      note('find_friends_cta', (await find.count()) > 0)
      if (await find.count()) await find.first().click()
      else {
        // no CTA on a non-empty Friends tab: a newcomer has to find /friends through Profile
        await page.getByRole('link').nth(0).evaluate(() => { })
        await page.goto(L.BASE + '/profile', { waitUntil: 'load' }); await page.waitForTimeout(2000)
        await L.shot(page, 'B03b-ferid-profile-entry')
        await page.locator('a.soc-entry').click(); await page.waitForTimeout(1200)
        note('friends_page_default_tab', await page.getByRole('tab', { selected: true }).allInnerTexts())
        await page.getByRole('tab', { name: 'Find' }).click()
      }
      await page.waitForTimeout(1500)
      await L.shot(page, 'B04-ferid-find-people')
      note('find_url', page.url().replace(L.BASE, ''))
      note('find_text', lines(await page.evaluate(() => document.body.innerText)).slice(0, 14))
      await page.getByPlaceholder('Search by name').fill('Ays')
      await page.waitForTimeout(300); await L.shot(page, 'B05-ferid-find-typing')
      note('find_hint_min_chars', lines(await page.evaluate(() => document.body.innerText)).slice(0, 12))
      await page.getByPlaceholder('Search by name').fill('Aysel')
      const t0 = Date.now()
      await page.locator('.soc-list button, .soc-list [role=button]').first().waitFor({ timeout: 8000 }).catch(() => { })
      note('search_ms', Date.now() - t0); await page.waitForTimeout(800)
      await L.shot(page, 'B06-ferid-find-results')
      note('search_results', lines(await page.locator('.soc-list').first().innerText()))
      const addBtn = page.locator('.soc-list').getByRole('button', { name: /^Add/ }).first()
      note('add_button_text', await addBtn.innerText().catch(() => 'none'))
      await addBtn.click(); await page.waitForTimeout(1500)
      await L.shot(page, 'B07-ferid-request-sent')
      note('after_add', lines(await page.locator('.soc-list').first().innerText()))
      // requests tab
      note('friends_page_tabs', await page.getByRole('tab').allInnerTexts())
    }
    if (stage === 'cold') {
      const { res: before } = await loadHome(page)
      note('before_unfollow', summary(before).mix)
      await discoverFollow(page, ['Dönər Bakı Express', 'Burger Qala', 'Şirvan Mətbəxi'], false)
      await L.shot(page, 'B10-ferid-unfollowed')
      const { res, ms } = await loadHome(page)
      note('cold_home_first_card_ms', ms); note('cold_home', summary(res))
      await L.shot(page, 'B11-ferid-home-cold')
      await page.evaluate(() => window.scrollTo(0, 1800)); await page.waitForTimeout(600); await L.shot(page, 'B12-ferid-home-cold-scroll')
    }
    if (stage === 'follow2') {
      const { res: before } = await loadHome(page)
      note('before_follow', summary(before))
      const picks = ['Şirvan Mətbəxi', 'Burger Qala']
      await discoverFollow(page, picks, true)
      await L.shot(page, 'B20-ferid-discover-followed')
      // back to Home WITHOUT reload (tab switch)
      await page.getByRole('tab').nth(0).click(); await page.waitForTimeout(1800)
      note('home_after_follow_tabswitch_first10', await page.evaluate(() => [...document.querySelectorAll('.soc-feed-slot')].slice(0, 12).map(el => el.innerText.replace(/\s+/g, ' ').slice(0, 50))))
      await L.shot(page, 'B21-ferid-home-after-follow-noreload')
      // reload
      const { res, ms } = await loadHome(page)
      note('after_follow_reload_first_card_ms', ms); note('after_follow', summary(res))
      await L.shot(page, 'B22-ferid-home-after-follow-reload')
    }
    if (stage === 'save') {
      await page.goto(L.BASE + '/restaurant/brew-and-books', { waitUntil: 'load' }); await page.waitForTimeout(2500)
      await page.evaluate(() => window.scrollTo(0, 500)); await page.waitForTimeout(600)
      await page.locator('.ig-grid-tile').first().click({ force: true }); await page.waitForTimeout(1500)
      const btns = page.locator('[role=dialog] button:not([aria-label="Close"])')
      note('dish_sheet_unlabeled_buttons', await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.getBoundingClientRect().top > 0 && b.getBoundingClientRect().top < 840 && !b.getAttribute('aria-label') && !b.innerText.trim()).length))
      await L.shot(page, 'B30-ferid-dish-sheet')
      // the save button is the third icon button (like, review, save) on the sheet's action row
      const row = page.locator('.dish-actions button, [class*=sheet] button').filter({ hasNot: page.locator('x') })
      const icons = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.getBoundingClientRect().top > 0 && b.getBoundingClientRect().top < 840 && !b.getAttribute('aria-label') && !b.innerText.trim() && b.getBoundingClientRect().width === 44).map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.left + 22), Math.round(r.top + 22)] }))
      note('icon_positions', icons)
      if (icons.length >= 3) {
        await page.mouse.click(icons[2][0], icons[2][1]); await page.waitForTimeout(1500)
        await L.shot(page, 'B31-ferid-dish-saved')
      }
      await page.keyboard.press('Escape'); await page.waitForTimeout(500)
      await page.goto(L.BASE + '/profile', { waitUntil: 'load' }); await page.waitForTimeout(2500)
      await L.shot(page, 'B32-ferid-profile')
      note('profile_text', lines(await page.evaluate(() => document.body.innerText)).slice(0, 40))
      await page.getByRole('tab', { name: /Saved/ }).click(); await page.waitForTimeout(1500)
      await L.shot(page, 'B33-ferid-profile-saved')
      note('profile_saved_text', lines(await page.evaluate(() => document.body.innerText)).slice(0, 30))
      for (const t of ['Posts', 'Reviews', 'Visits']) {
        const tab = page.getByRole('tab', { name: new RegExp(t) })
        if (await tab.count()) { await tab.click(); await page.waitForTimeout(1000); await L.shot(page, `B34-ferid-profile-${t.toLowerCase()}`); note(`profile_${t}_text`, lines(await page.evaluate(() => document.body.innerText)).slice(-12)) }
      }
    }
    if (stage === 'restore') {
      // original sim state = follows of ...06 (Dönər Bakı Express), ...07 (Burger Qala), ...08 (Şirvan Mətbəxi); Burger Qala + Şirvan are already followed
      await loadHome(page)
      await discoverFollow(page, ['Dönər Bakı Express'], true)
      await L.shot(page, 'B90-ferid-restored')
    }
  } catch (e) { note('ERROR', String(e).slice(0, 500)); await L.shot(page, `B99-error-${stage}`).catch(() => { }) }
  note('console', watch.console.slice(0, 8)); note('pageErrors', watch.pageErrors); note('bad', watch.bad.slice(0, 8))
  L.save(`ferid-${stage}`, out)
  await s.close()
})()
