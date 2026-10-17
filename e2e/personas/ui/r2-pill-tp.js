// Round 2: true-positive check of the Friends "New posts" pill. Fərid and Mehriban are friends now; Mehriban posts, Fərid's open Friends tab should show the pill.
// ROUND=round2 node personas/ui/r2-pill-tp.js
const L = require('./lib')
const out = {}
const note = (k, v) => { out[k] = v; console.log('##', k, typeof v === 'string' ? v : JSON.stringify(v)) }
const PHOTO = 'C:/Users/musay/AppData/Local/Temp/claude/C--Users-musay-Desktop-claude/9308ea1d-0f9a-4965-b895-2223492297b4/scratchpad/dl/burger.jpg'
;(async () => {
  const F = await L.open({ as: 'Fərid Məlikov' }); const M = await L.open({ as: 'Mehriban Rzayeva' })
  const fp = F.page; const counts = []
  fp.on('response', async r => { if (/rpc\/friends_new_count/.test(r.url()) && r.request().method() === 'POST') { try { counts.push({ at: Date.now(), n: await r.json() }) } catch { } } })
  try {
    await fp.goto(L.BASE + '/', { waitUntil: 'load' }); await fp.locator('.soc-feed-slot').first().waitFor(); await fp.getByRole('tab').nth(1).click(); await fp.waitForTimeout(3000)
    note('pill_before', await fp.getByRole('button', { name: /New posts/i }).count())
    const mp = M.page
    await mp.goto(L.BASE + '/post/new', { waitUntil: 'load' }); await mp.waitForTimeout(1200)
    await mp.locator('input[type=file]').setInputFiles(PHOTO); await mp.locator('.soc-photo-slot img').waitFor({ timeout: 20000 })
    await mp.getByLabel('Caption').fill('Round two, post three: burger again, friends only need to know.')
    await mp.getByPlaceholder('Search restaurants').fill('Burger'); await mp.getByRole('option', { name: /Burger Qala/ }).click()
    await mp.getByRole('button', { name: 'Post', exact: true }).click(); await mp.waitForURL(u => new URL(u).pathname === '/', { timeout: 40000 })
    const t0 = Date.now()
    let at = null
    while (Date.now() - t0 < 150000) { if (await fp.getByRole('button', { name: /New posts/i }).count()) { at = Date.now(); break } await fp.waitForTimeout(1000) }
    note('pill_appeared', !!at); note('pill_after_s', at ? Math.round((at - t0) / 1000) : null)
    note('friends_new_count_responses', counts.map(c => ({ afterPostS: Math.round((c.at - t0) / 1000), n: c.n })))
    await L.shot(fp, 'RS12-ferid-pill-friend-post')
    if (at) { const pillText = await fp.getByRole('button', { name: /New posts/i }).first().innerText(); note('pill_text', pillText); await fp.getByRole('button', { name: /New posts/i }).first().click(); await fp.waitForTimeout(2500); note('top_card_after_tap', (await fp.locator('#home-panel-friends .soc-feed-slot').first().innerText()).replace(/\s+/g, ' ').slice(0, 90)); note('pill_after_tap', await fp.getByRole('button', { name: /New posts/i }).count()) }
  } catch (e) { note('ERROR', String(e).split(/\r?\n/)[0].slice(0, 300)) }
  L.save('r2-pill-tp', out); await F.close(); await M.close()
})()
