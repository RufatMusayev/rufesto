// Round 3, persona B (Fərid): For you mix, Friends entry, follows reaching Home without reload, Find people, profile, notifications, settings rows.
// ROUND=round3 node personas/ui/r3-ferid.js  -> results/round3/r3-ferid.json, screenshots round3/RF*.png
// Leaves Fərid with his original three follows (Dönər Bakı Express, Burger Qala, Şirvan Mətbəxi).
const L = require('./lib')
const out = {}
const note = (k, v) => { out[k] = v; console.log('##', k, typeof v === 'string' ? v : JSON.stringify(v)) }
const lines = t => [...new Set(t.split('\n').map(x => x.trim()).filter(Boolean))]
const summary = res => ({ mix: res.mix, promos: (res.items || []).filter(i => i.kind === 'promo').length, items: (res.items || []).slice(0, 14).map(i => `${i.position}:${i.kind === 'promo' ? 'promo' : i.kind === 'review' ? 'review' : i.pool}:${i.restaurant?.name || i.author?.name || ''}`) })

;(async () => {
  const s = await L.open({ as: 'Fərid Məlikov' }); const { page, watch } = s
  const feeds = []
  page.on('response', async r => { if (/rpc\/home_feed(\?|$)/.test(r.url()) && r.request().method() === 'POST') { try { feeds.push({ at: Date.now(), res: await r.json() }) } catch { } } })
  const goHomeByNav = async () => { await page.locator('.bottom-nav a[aria-label="Home"]').click(); await page.waitForTimeout(3500) }
  async function setFollow(slug, on) {
    await page.goto(L.BASE + '/restaurant/' + slug, { waitUntil: 'load' }); await page.waitForTimeout(2200)
    const btn = page.getByRole('button', { name: /Follow|Following/ }).first()
    const following = (await btn.getAttribute('aria-pressed')) === 'true'
    if (following === on) { note(`follow_${slug}`, `already ${on ? 'following' : 'not following'}`); return }
    const t = Date.now(); await btn.click()
    await page.waitForFunction(w => { const b = [...document.querySelectorAll('button')].find(x => /Follow/.test(x.innerText)); return b && (b.getAttribute('aria-pressed') === 'true') === w }, on, { timeout: 8000 }).catch(() => note(`flip_${slug}`, 'NO FLIP'))
    note(`${on ? 'follow' : 'unfollow'}_${slug}_ms`, Date.now() - t)
  }
  try {
    await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor(); await page.waitForTimeout(1800)
    note('for_you_as_found', summary(feeds[feeds.length - 1].res)); await L.shot(page, 'RF01-ferid-for-you')
    note('popular_reviews_not_own_or_friend', await page.evaluate(() => [...document.querySelectorAll('.rv--card')].map(e => e.innerText.replace(/\s+/g, ' ').slice(0, 60))))
    // cold start: unfollow the three, then Home through the bottom nav (no reload)
    const n0 = feeds.length
    for (const slug of ['doner-baki-express', 'burger-qala', 'shirvan-metbexi']) await setFollow(slug, false)
    await goHomeByNav()
    note('home_refetched_after_unfollows', feeds.length - n0); note('cold_start', summary(feeds[feeds.length - 1].res)); await L.shot(page, 'RF02-ferid-cold-start-home')
    const n1 = feeds.length
    for (const slug of ['shirvan-metbexi', 'burger-qala']) await setFollow(slug, true)
    await goHomeByNav()
    note('home_refetched_after_two_follows', feeds.length - n1); note('after_two_follows', summary(feeds[feeds.length - 1].res)); await L.shot(page, 'RF03-ferid-after-two-follows')
    await setFollow('doner-baki-express', true)
    await goHomeByNav(); note('restored_mix', summary(feeds[feeds.length - 1].res).mix)
    // Friends tab + Find people
    await page.getByRole('tab', { name: 'Friends' }).click(); await page.waitForTimeout(2500)
    await page.getByRole('link', { name: /Find friends/i }).first().click(); await page.waitForTimeout(1500)
    note('find_url', page.url().replace(L.BASE, ''))
    await page.getByPlaceholder('Search by name').fill('Aysel'); await page.waitForTimeout(2200); await L.shot(page, 'RF04-ferid-find-aysel')
    note('find_rows', lines(await page.locator('.soc-list').first().innerText()))
    note('find_row_height', await page.evaluate(() => { const l = document.querySelector('.soc-list'); return l ? [...l.children].map(c => Math.round(c.getBoundingClientRect().height)) : null }))
    // profile
    await page.goto(L.BASE + '/profile', { waitUntil: 'load' }); await page.waitForTimeout(2500)
    note('profile_tabs', await page.getByRole('tab').allInnerTexts())
    await page.getByRole('button', { name: /Friends/ }).first().click(); await page.waitForTimeout(1500); note('friends_stat_opens', page.url().replace(L.BASE, ''))
    await page.goto(L.BASE + '/profile', { waitUntil: 'load' }); await page.waitForTimeout(2000)
    await page.getByRole('tab', { name: 'Visits' }).click(); await page.waitForTimeout(1500); await L.shot(page, 'RF05-ferid-profile-visits')
    note('visits_tab', lines(await page.evaluate(() => document.body.innerText)).slice(0, 24))
    await page.getByRole('tab', { name: 'Saved' }).click(); await page.waitForTimeout(1500); note('saved_tab', lines(await page.evaluate(() => document.body.innerText)).slice(-8))
    await page.getByRole('button', { name: 'Settings' }).click(); await page.waitForTimeout(1000); await L.shot(page, 'RF06-ferid-settings-sheet')
    note('settings_rows', lines(await page.evaluate(() => document.body.innerText)).filter(x => /Language|Dark|Notif|feedback|Sign out|Delete|EN|AZ/.test(x)))
    await page.keyboard.press('Escape'); await page.waitForTimeout(600)
    await page.getByRole('button', { name: 'Edit profile' }).click(); await page.waitForTimeout(1000); await L.shot(page, 'RF07-ferid-edit-profile')
    note('edit_profile', lines(await page.evaluate(() => document.body.innerText)).slice(-12))
    await page.keyboard.press('Escape'); await page.waitForTimeout(500)
    // notifications + settings page
    await page.goto(L.BASE + '/notifications', { waitUntil: 'load' }); await page.waitForTimeout(2500); await L.shot(page, 'RF08-ferid-inbox')
    note('inbox_header_height', await page.evaluate(() => { const b = document.querySelector('button[aria-label="Back"]'); return b ? Math.round(b.getBoundingClientRect().bottom) : null }))
    note('inbox_rows', await page.evaluate(() => [...document.querySelectorAll('main button, #root button')].filter(b => b.getBoundingClientRect().height > 50 && b.getBoundingClientRect().height < 120).map(b => `${Math.round(b.getBoundingClientRect().height)}px|${b.innerText.replace(/\s+/g, ' ').slice(0, 70)}`)))
    note('inbox_has_chips_or_markall', await page.evaluate(() => /Mark all read|Social|Dine-in/.test(document.body.innerText)))
    await page.locator('a[aria-label="Notification settings"]').click(); await page.waitForTimeout(2000); await L.shot(page, 'RF09-ferid-notif-settings')
    note('notif_settings', lines(await page.evaluate(() => document.body.innerText)).slice(0, 24))
  } catch (e) { note('ERROR', String(e).split(/\r?\n/)[0].slice(0, 300)); await L.shot(page, 'RF99-error').catch(() => { }) }
  note('console', watch.console.slice(0, 6)); note('bad', watch.bad.filter(b => !/ABORTED/.test(b)).slice(0, 6))
  L.save('r3-ferid', out); await s.close()
})()
