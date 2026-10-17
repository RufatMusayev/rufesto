// Round 2, persona B (Fərid): follows change Home without a reload (N03), Friends entry (N06), Find people (N19), profile, saved dish, notifications text (N20).
// ROUND=round2 node personas/ui/r2-ferid.js  -> results/round2/r2-ferid.json, screenshots round2/RF*.png
// Leaves Fərid with his original three follows (Dönər Bakı Express, Burger Qala, Şirvan Mətbəxi).
const L = require('./lib')
const out = {}
const note = (k, v) => { out[k] = v; console.log('##', k, typeof v === 'string' ? v : JSON.stringify(v)) }
const lines = t => [...new Set(t.split('\n').map(x => x.trim()).filter(Boolean))]
const summary = res => ({ mix: res.mix, items: (res.items || []).slice(0, 12).map(i => `${i.position}:${i.kind}:${i.pool}:${i.restaurant?.name || i.author?.name || ''}`) })

;(async () => {
  const s = await L.open({ as: 'Fərid Məlikov' }); const { page, watch } = s
  const feeds = []
  page.on('response', async r => { if (/rpc\/home_feed(\?|$)/.test(r.url()) && r.request().method() === 'POST') { try { feeds.push({ at: Date.now(), res: await r.json() }) } catch { } } })
  const homeTop = () => page.evaluate(() => [...document.querySelectorAll('#home-panel-home .soc-feed-slot')].slice(0, 8).map(e => e.innerText.replace(/\s+/g, ' ').slice(0, 38)))
  const toTab = async i => { await page.getByRole('tab').nth(i).click(); await page.waitForTimeout(i === 2 ? 2500 : 1800) }
  async function follow(names, on) {
    await toTab(2)
    for (const n of names) {
      const btn = page.getByRole('button', { name: `${on ? 'Follow' : 'Unfollow'} ${n}`, exact: true }).first()
      if (!(await btn.count())) { note(`${on ? 'follow' : 'unfollow'}_${n}`, 'no such button'); continue }
      await btn.scrollIntoViewIfNeeded(); const t = Date.now(); await btn.click()
      await page.getByRole('button', { name: `${on ? 'Unfollow' : 'Follow'} ${n}`, exact: true }).first().waitFor({ timeout: 8000 }).catch(() => note(`flip_${n}`, 'NO FLIP'))
      note(`${on ? 'follow' : 'unfollow'}_${n}_ms`, Date.now() - t)
    }
  }
  try {
    await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor(); await page.waitForTimeout(1500)
    note('home_as_found', summary(feeds[feeds.length - 1].res)); await L.shot(page, 'RF02-ferid-home-asfound')
    // cold start: unfollow the three, back to Home WITHOUT reload
    const n0 = feeds.length
    await follow(['Dönər Bakı Express', 'Burger Qala', 'Şirvan Mətbəxi'], false)
    await toTab(0)
    note('home_refetched_after_unfollow_without_reload', feeds.length - n0)
    note('cold_home', summary(feeds[feeds.length - 1].res)); await L.shot(page, 'RF03-ferid-home-cold-noreload')
    note('cold_top8_dom', await homeTop())
    // follow two new places, back to Home without reload
    const n1 = feeds.length
    await follow(['Şirvan Mətbəxi', 'Burger Qala'], true)
    await L.shot(page, 'RF04-ferid-discover-followed')
    await toTab(0)
    note('home_refetched_after_follow_without_reload', feeds.length - n1)
    note('after_follow_home', summary(feeds[feeds.length - 1].res)); await L.shot(page, 'RF05-ferid-home-after-follow-noreload')
    note('after_follow_top8_dom', await homeTop())
    // restore Dönər Bakı Express (Burger Qala + Şirvan are followed already) -> his original three
    await follow(['Dönər Bakı Express'], true)
    await toTab(0)
    note('restored_home', summary(feeds[feeds.length - 1].res).mix)
    // Friends tab: entry + own content
    await toTab(1)
    note('friends_tab_top', lines(await page.locator('#home-panel-friends').innerText()).slice(0, 6)); await L.shot(page, 'RF06-ferid-friends')
    // find people: Aysel (three results), context lines
    await page.getByRole('link', { name: /Find friends/i }).first().click(); await page.waitForTimeout(1500)
    note('find_url', page.url().replace(L.BASE, ''))
    await page.getByPlaceholder('Search by name').fill('Aysel'); await page.waitForTimeout(2000); await L.shot(page, 'RF07-ferid-find-aysel')
    note('find_aysel_rows', lines(await page.locator('.soc-list').first().innerText()))
    note('find_row_height_and_sub', await page.evaluate(() => [...document.querySelectorAll('.soc-list > *')].slice(0, 3).map(e => e.innerText.replace(/\s+/g, ' ').slice(0, 50) + ' | ' + Math.round(e.getBoundingClientRect().height))))
    // notifications text (bill lines carry the restaurant)
    await page.goto(L.BASE + '/notifications', { waitUntil: 'load' }); await page.waitForTimeout(2500)
    note('inbox', lines(await page.evaluate(() => document.body.innerText)).slice(0, 30)); await L.shot(page, 'RF08-ferid-inbox')
    // save a dish (own journey) and check it appears in the profile
    await page.goto(L.BASE + '/restaurant/brew-and-books?dish=', { waitUntil: 'load' }).catch(() => { })
    await page.goto(L.BASE + '/profile?tab=saved', { waitUntil: 'load' }); await page.waitForTimeout(2500); await L.shot(page, 'RF09-ferid-profile-saved')
    note('profile_saved', lines(await page.evaluate(() => document.body.innerText)).slice(0, 24))
  } catch (e) { note('ERROR', String(e).split(/\r?\n/)[0].slice(0, 300)); await L.shot(page, 'RF99-error').catch(() => { }) }
  note('console', watch.console.slice(0, 6)); note('bad', watch.bad.filter(b => !/ABORTED/.test(b)).slice(0, 6))
  L.save('r2-ferid', out); await s.close()
})()
