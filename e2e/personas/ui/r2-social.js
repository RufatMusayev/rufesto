// Round 2: the Fərid <-> Mehriban loop. Stranger post must not raise Fərid's Friends "New posts" pill; friend request Fərid -> Mehriban
// shows in her inbox (live), she accepts, Fərid is notified; push prompt must not appear on any of this.
// ROUND=round2 node personas/ui/r2-social.js  -> results/round2/r2-social.json, screenshots round2/RS*.png
const L = require('./lib')
const out = {}
const note = (k, v) => { out[k] = v; console.log('##', k, typeof v === 'string' ? v : JSON.stringify(v)) }
const lines = t => [...new Set(t.split('\n').map(x => x.trim()).filter(Boolean))]
const PHOTO = 'C:/Users/musay/AppData/Local/Temp/claude/C--Users-musay-Desktop-claude/9308ea1d-0f9a-4965-b895-2223492297b4/scratchpad/dl/burger.jpg'
const POLL_WAIT_S = Number(process.env.POLL_WAIT_S || 135)
const bell = page => page.evaluate(() => { const b = document.querySelector('button[aria-label="Notifications"]'); return b ? b.innerText.trim() : null })
const waitBell = (page, ms) => page.waitForFunction(() => { const b = document.querySelector('button[aria-label="Notifications"]'); return b && b.innerText.trim() !== '' }, null, { timeout: ms }).then(() => true).catch(() => false)

;(async () => {
  const F = await L.open({ as: 'Fərid Məlikov', sw: true }); const M = await L.open({ as: 'Mehriban Rzayeva', sw: true })
  const fp = F.page, mp = M.page
  const counts = []
  fp.on('response', async r => { if (/rpc\/friends_new_count/.test(r.url()) && r.request().method() === 'POST') { try { counts.push({ at: Date.now(), n: await r.json() }) } catch { } } })
  try {
    // 1. Fərid on the Friends tab
    await fp.goto(L.BASE + '/', { waitUntil: 'load' }); await fp.locator('.soc-feed-slot').first().waitFor(); await fp.waitForTimeout(1500)
    await fp.getByRole('tab').nth(1).click(); await fp.waitForTimeout(2500)
    await L.shot(fp, 'RS01-ferid-friends-tab')
    note('F_friends_entry', { find_friends_link: await fp.getByRole('link', { name: /Find friends/i }).count(), top_text: lines(await fp.locator('#home-panel-friends').innerText()).slice(0, 4) })
    note('F_pill_before', await fp.getByRole('button', { name: /New posts/i }).count())
    // 2. Mehriban: Home open (stays open to receive the live badge)
    await mp.goto(L.BASE + '/', { waitUntil: 'load' }); await mp.locator('.soc-feed-slot').first().waitFor(); await mp.waitForTimeout(1500)
    note('M_bell_before', await bell(mp))
    // 3. Mehriban posts (a stranger to Fərid at this point)
    const p2 = await M.ctx.newPage()
    await p2.goto(L.BASE + '/post/new', { waitUntil: 'load' }); await p2.waitForTimeout(1200)
    await p2.locator('input[type=file]').setInputFiles(PHOTO); await p2.locator('.soc-photo-slot img').waitFor({ timeout: 20000 })
    await p2.getByLabel('Caption').fill('Round two: back at Burger Qala, the pickles are still excellent.')
    await p2.getByPlaceholder('Search restaurants').fill('Burger'); await p2.getByRole('option', { name: /Burger Qala/ }).click()
    const tPost = Date.now()
    await p2.getByRole('button', { name: 'Post', exact: true }).click()
    await p2.waitForURL(u => new URL(u).pathname === '/', { timeout: 40000 })
    note('M_post_ms', Date.now() - tPost)
    note('M_prompt_after_post', await p2.locator('.ntf-prompt').count())
    await L.shot(p2, 'RS02-mehriban-second-post'); await p2.close()
    // 4. wait for Fərid's poll(s): a stranger's post must not raise the pill
    note('F_wait_seconds', POLL_WAIT_S)
    await fp.waitForTimeout(POLL_WAIT_S * 1000)
    note('F_pill_after_stranger_post', await fp.getByRole('button', { name: /New posts/i }).count())
    note('F_friends_new_count_responses', counts.map(c => ({ afterPostS: Math.round((c.at - tPost) / 1000), n: c.n })))
    await L.shot(fp, 'RS03-ferid-friends-after-stranger-post')
    // 5. Fərid sends Mehriban a friend request
    await fp.getByRole('link', { name: /Find friends/i }).first().click(); await fp.waitForTimeout(1500)
    await fp.getByRole('tab', { name: 'Find' }).click().catch(() => { })
    await fp.getByPlaceholder('Search by name').fill('Mehriban'); await fp.waitForTimeout(2000)
    await L.shot(fp, 'RS04-ferid-find-mehriban')
    note('F_search_rows', lines(await fp.locator('.soc-list').first().innerText()))
    const row = fp.locator('.soc-list > div, .soc-list li, .soc-list > *').filter({ hasText: 'Mehriban' }).first()
    note('F_row_has_context_line', (await row.innerText().catch(() => '')).replace(/\s+/g, ' '))
    const tReq = Date.now()
    await row.getByRole('button', { name: /^Add/ }).click(); await fp.waitForTimeout(1200)
    await L.shot(fp, 'RS05-ferid-request-sent')
    note('F_after_add', (await row.innerText().catch(() => '')).replace(/\s+/g, ' '))
    note('F_prompt_after_request', await fp.locator('.ntf-prompt').count())
    // 6. Mehriban: live badge on her open page, inbox item, accept
    const gotBadge = await waitBell(mp, 60000)
    note('M_badge_appeared_live', gotBadge); note('M_badge_latency_ms', gotBadge ? Date.now() - tReq : null); note('M_bell_after', await bell(mp))
    await L.shot(mp, 'RS06-mehriban-home-badge')
    await mp.locator('button[aria-label="Notifications"]').click(); await mp.waitForTimeout(2500)
    await L.shot(mp, 'RS07-mehriban-inbox-request')
    note('M_inbox_after_request', lines(await mp.evaluate(() => document.body.innerText)).slice(0, 24))
    const accept = mp.getByRole('button', { name: /Accept/i }).first()
    note('M_inbox_has_inline_accept', await accept.count())
    let tAcc
    if (await accept.count()) { tAcc = Date.now(); await accept.click() }
    else {
      await mp.getByText(/sent you a friend request/).first().click(); await mp.waitForTimeout(2000)
      note('M_tap_item_lands_on', mp.url().replace(L.BASE, ''))
      await L.shot(mp, 'RS08-mehriban-after-tap')
      tAcc = Date.now(); await mp.getByRole('button', { name: /Accept/i }).first().click()
    }
    await mp.waitForTimeout(1500); await L.shot(mp, 'RS09-mehriban-accepted')
    note('M_after_accept_text', lines(await mp.evaluate(() => document.body.innerText)).slice(0, 18))
    note('M_prompt_after_accept', await mp.locator('.ntf-prompt').count())
    // 7. Fərid: live badge + inbox line
    await fp.goto(L.BASE + '/', { waitUntil: 'load' }); await fp.waitForTimeout(500)
    const gotF = await waitBell(fp, 60000)
    note('F_badge_after_accept', gotF); note('F_badge_latency_ms_from_accept_click', gotF ? Date.now() - tAcc : null)
    await fp.locator('button[aria-label="Notifications"]').click(); await fp.waitForTimeout(2500)
    await L.shot(fp, 'RS10-ferid-inbox-accepted')
    note('F_inbox_after_accept', lines(await fp.evaluate(() => document.body.innerText)).slice(0, 22))
    note('F_prompt_anywhere', await fp.locator('.ntf-prompt').count())
    // 8. Friends tab now has Mehriban's posts?
    await fp.goto(L.BASE + '/', { waitUntil: 'load' }); await fp.getByRole('tab').nth(1).click(); await fp.waitForTimeout(3500)
    await L.shot(fp, 'RS11-ferid-friends-with-friend')
    note('F_friends_tab_cards', await fp.evaluate(() => [...document.querySelectorAll('#home-panel-friends .soc-feed-slot')].map(e => e.innerText.replace(/\s+/g, ' ').slice(0, 50))))
    note('F_perm', await fp.evaluate(() => Notification.permission))
  } catch (e) { note('ERROR', String(e).split(/\r?\n/)[0].slice(0, 300)); await L.shot(fp, 'RS99-error-F').catch(() => { }); await L.shot(mp, 'RS99-error-M').catch(() => { }) }
  L.save('r2-social', out)
  await F.close(); await M.close()
})()
