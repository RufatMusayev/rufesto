// Round 2, Mehriban: Home / Friends after the friendship, composer, where her posts rank for others. ROUND=round2 node personas/ui/r2-mehriban.js
const L = require('./lib')
const out = {}
const note = (k, v) => { out[k] = v; console.log('##', k, typeof v === 'string' ? v : JSON.stringify(v)) }
const lines = t => [...new Set(t.split('\n').map(x => x.trim()).filter(Boolean))]
const summary = res => ({ mix: res.mix, items: (res.items || []).slice(0, 10).map(i => `${i.position}:${i.kind === 'promo' ? 'promo' : i.pool}:${i.restaurant?.name || i.author?.name || ''}${i.kind === 'post' && i.author?.type !== 'restaurant' ? ' (by ' + (i.author?.name || i.user?.name) + ')' : ''}`) })
;(async () => {
  const M = await L.open({ as: 'Mehriban Rzayeva' }); const { page } = M
  let first = null; page.on('response', async r => { if (!first && /rpc\/home_feed(\?|$)/.test(r.url()) && r.request().method() === 'POST') { try { first = await r.json() } catch { } } })
  await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor(); await page.waitForTimeout(2000)
  note('M_home', summary(first)); await L.shot(page, 'RM01-mehriban-home')
  await page.getByRole('tab').nth(1).click(); await page.waitForTimeout(3000); await L.shot(page, 'RM02-mehriban-friends')
  note('M_friends_tab', await page.evaluate(() => document.getElementById('home-panel-friends').innerText.replace(/\s+/g, ' ').slice(0, 260)))
  note('M_friends_cards', await page.evaluate(() => [...document.querySelectorAll('#home-panel-friends .soc-feed-slot')].map(e => e.innerText.replace(/\s+/g, ' ').slice(0, 45))))
  await page.goto(L.BASE + '/post/new', { waitUntil: 'load' }); await page.waitForTimeout(1500); await L.shot(page, 'RM03-composer')
  note('composer', lines(await page.evaluate(() => document.body.innerText)))
  note('composer_controls', await page.evaluate(() => [...document.querySelectorAll('button, input, textarea, select')].filter(e => e.getBoundingClientRect().width > 0).map(e => `${e.tagName.toLowerCase()}|${e.getAttribute('aria-label') || e.getAttribute('placeholder') || e.innerText.slice(0, 14) || (document.querySelector(`label[for="${e.id}"]`) || {}).innerText || ''}|${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`)))
  // where her posts rank for a signed-out visitor and for Fərid
  for (const who of [null, 'Fərid Məlikov']) {
    const s = await L.open(who ? { as: who } : {}); const p = s.page; let res = null
    p.on('response', async r => { if (!res && /rpc\/home_feed(\?|$)/.test(r.url()) && r.request().method() === 'POST') { try { res = await r.json() } catch { } } })
    await p.goto(L.BASE + '/', { waitUntil: 'load' }); await p.locator('.soc-feed-slot').first().waitFor(); await p.waitForTimeout(1000)
    note(`her_posts_rank_for_${who ? 'ferid' : 'anon'}`, (res.items || []).map((i, k) => /Round two|Lunch at Burger Qala/.test(i.caption || '') ? `#${k + 1} ${(i.caption || '').slice(0, 22)} pool=${i.pool}` : null).filter(Boolean))
    await s.close()
  }
  L.save('r2-mehriban', out); await M.close()
})()
