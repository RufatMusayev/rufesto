// Round 3, persona B2 (Mehriban): Home, Friends, composer + a new photo post, and the Instagram-style inbox with inline Confirm / Delete
// (two simulated diners, Zaur and Elçin, send her a request; she confirms one and deletes the other).
// ROUND=round3 node personas/ui/r3-mehriban.js  -> results/round3/r3-mehriban.json, screenshots round3/RM*.png
const L = require('./lib')
const out = {}
const note = (k, v) => { out[k] = v; console.log('##', k, typeof v === 'string' ? v : JSON.stringify(v)) }
const lines = t => [...new Set(t.split('\n').map(x => x.trim()).filter(Boolean))]
const PHOTO = 'C:/Users/musay/AppData/Local/Temp/claude/C--Users-musay-Desktop-claude/9308ea1d-0f9a-4965-b895-2223492297b4/scratchpad/dl/burger.jpg'
const bell = page => page.evaluate(() => { const b = document.querySelector('button[aria-label="Notifications"]'); return b ? b.innerText.trim() : null })
const summary = res => ({ mix: res.mix, items: (res.items || []).slice(0, 10).map(i => `${i.position}:${i.kind === 'promo' ? 'promo' : i.kind === 'review' ? 'review' : i.pool}:${i.restaurant?.name || i.author?.name || ''}`) })

async function sendRequest(who, toName) {
  const S = await L.open({ as: who }); const p = S.page
  await p.goto(L.BASE + '/friends?tab=find', { waitUntil: 'load' }); await p.waitForTimeout(1500)
  await p.getByPlaceholder('Search by name').fill(toName); await p.waitForTimeout(2200)
  const row = p.locator('.soc-list > *').filter({ hasText: toName }).first()
  await row.getByRole('button', { name: /^Add/ }).click(); await p.waitForTimeout(1200)
  const state = (await row.innerText()).replace(/\s+/g, ' ')
  return { S, state }
}

;(async () => {
  const M = await L.open({ as: 'Mehriban Rzayeva' }); const { page, watch } = M
  let first = null; page.on('response', async r => { if (!first && /rpc\/home_feed(\?|$)/.test(r.url()) && r.request().method() === 'POST') { try { first = await r.json() } catch { } } })
  try {
    await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor(); await page.waitForTimeout(2000)
    note('for_you', summary(first)); await L.shot(page, 'RM01-mehriban-home')
    await page.getByRole('tab', { name: 'Friends' }).click(); await page.waitForTimeout(3000); await L.shot(page, 'RM02-mehriban-friends')
    note('friends_tab', await page.evaluate(() => document.getElementById('home-panel-friends').innerText.replace(/\s+/g, ' ').slice(0, 240)))
    // composer via the Home "+" and a new photo post
    await page.getByRole('tab', { name: 'For you' }).click(); await page.waitForTimeout(500)
    await page.getByRole('button', { name: 'New post' }).click(); await page.waitForTimeout(1500)
    note('composer_url', page.url().replace(L.BASE, '')); await L.shot(page, 'RM03-composer')
    note('composer_controls', await page.evaluate(() => [...document.querySelectorAll('button, input, textarea')].filter(e => e.getBoundingClientRect().width > 0 && !e.closest('.bottom-nav')).map(e => `${e.tagName.toLowerCase()}|${e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.innerText.replace(/\s+/g, ' ').slice(0, 14)}|${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`)))
    const t0 = Date.now(); await page.locator('input[type=file]').setInputFiles(PHOTO); await page.locator('.soc-photo-slot img').waitFor({ timeout: 20000 }); note('photo_preview_ms', Date.now() - t0)
    await page.getByLabel('Caption').fill('Round three: flat white and pancakes at Brew & Books, worth the queue.')
    await page.getByPlaceholder('Search restaurants').fill('Brew'); await page.getByRole('option', { name: /Brew & Books/ }).click(); await page.waitForTimeout(400)
    await L.shot(page, 'RM04-composer-ready')
    const t1 = Date.now(); await page.getByRole('button', { name: 'Post', exact: true }).click(); await page.waitForURL(u => new URL(u).pathname === '/', { timeout: 40000 }); note('post_to_home_ms', Date.now() - t1)
    await page.waitForTimeout(2500); await L.shot(page, 'RM05-after-post')
    note('landing_tab', await page.getByRole('tab', { selected: true }).allInnerTexts())
    note('landing_first_cards', await page.evaluate(() => [...document.querySelectorAll('.soc-feed-slot')].filter(e => e.getBoundingClientRect().width > 0).slice(0, 3).map(e => e.innerText.replace(/\s+/g, ' ').slice(0, 70))))
    // incoming requests from two simulated diners
    const z = await sendRequest('Zaur Hüseynov', 'Mehriban'); note('zaur_row_after_add', z.state)
    const e = await sendRequest('Elçin Vəliyev', 'Mehriban'); note('elcin_row_after_add', e.state)
    await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(2500)
    note('M_bell_with_two_requests', await bell(page)); await L.shot(page, 'RM06-mehriban-bell')
    await page.locator('button[aria-label="Notifications"]').click(); await page.waitForTimeout(2800); await L.shot(page, 'RM07-mehriban-inbox-requests')
    note('inbox_text', lines(await page.evaluate(() => document.body.innerText)).slice(0, 30))
    note('inbox_sections', await page.locator('h2, h3').allInnerTexts())
    note('inbox_request_controls', await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => /Confirm|Delete/.test(b.innerText)).map(b => `${b.innerText}|${Math.round(b.getBoundingClientRect().width)}x${Math.round(b.getBoundingClientRect().height)}`)))
    // Confirm Zaur, Delete Elçin
    const zRow = page.locator('li, div').filter({ hasText: 'Zaur' }).filter({ has: page.getByRole('button', { name: 'Confirm' }) }).last()
    const eRow = page.locator('li, div').filter({ hasText: 'Elçin' }).filter({ has: page.getByRole('button', { name: 'Delete' }) }).last()
    const tc = Date.now(); await zRow.getByRole('button', { name: 'Confirm' }).click(); await page.waitForTimeout(1500)
    note('after_confirm_zaur', lines(await page.evaluate(() => document.body.innerText)).slice(0, 18)); note('confirm_ms', Date.now() - tc); await L.shot(page, 'RM08-after-confirm')
    await eRow.getByRole('button', { name: 'Delete' }).click(); await page.waitForTimeout(1500)
    note('after_delete_elcin', lines(await page.evaluate(() => document.body.innerText)).slice(0, 18)); await L.shot(page, 'RM09-after-delete')
    // Zaur is notified of the confirmation; Elçin is not
    await z.S.page.goto(L.BASE + '/notifications', { waitUntil: 'load' }); await z.S.page.waitForTimeout(2500)
    note('zaur_inbox', lines(await z.S.page.evaluate(() => document.body.innerText)).slice(0, 12))
    await e.S.page.goto(L.BASE + '/notifications', { waitUntil: 'load' }); await e.S.page.waitForTimeout(2500)
    note('elcin_inbox_mentions_mehriban', await e.S.page.evaluate(() => /Mehriban/.test(document.body.innerText)))
    await z.S.close(); await e.S.close()
    // reload the inbox: rows persist correctly?
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(2500); note('inbox_after_reload', lines(await page.evaluate(() => document.body.innerText)).slice(0, 14))
  } catch (err) { note('ERROR', String(err).split(/\r?\n/)[0].slice(0, 300)); await L.shot(page, 'RM99-error').catch(() => { }) }
  note('console', watch.console.slice(0, 6)); note('bad', watch.bad.filter(b => !/ABORTED/.test(b)).slice(0, 6))
  L.save('r3-mehriban', out); await M.close()
})()
