// Round 2 N03 precise check: one follow toggle at a time, does Home refetch on return and is the answer current? ROUND=round2 node personas/ui/r2-follow-reacts.js
const L = require('./lib')
const out = {}
const note = (k, v) => { out[k] = v; console.log('##', k, typeof v === 'string' ? v : JSON.stringify(v)) }
;(async () => {
  const s = await L.open({ as: 'Fərid Məlikov' }); const { page } = s
  const log = []; const t0 = Date.now(); const T = () => Date.now() - t0
  const followingNames = res => [...new Set((res.items || []).filter(i => i.pool === 'following').map(i => i.restaurant?.name || i.author?.name))]
  page.on('request', r => { if (/rpc\/home_feed(\?|$)/.test(r.url()) && r.method() === 'POST') log.push(`${T()}ms home_feed REQUEST`) })
  page.on('response', async r => { if (/rpc\/home_feed(\?|$)/.test(r.url()) && r.request().method() === 'POST') { try { const j = await r.json(); log.push(`${T()}ms home_feed RESPONSE following=${j.mix.following} places=[${followingNames(j)}]`) } catch { } } })
  const mark = m => log.push(`${T()}ms -- ${m}`)
  await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor(); await page.waitForTimeout(2000)
  mark('Home loaded')
  await page.getByRole('tab').nth(2).click(); await page.waitForTimeout(2500)
  const un = page.getByRole('button', { name: 'Unfollow Burger Qala', exact: true }).first(); await un.scrollIntoViewIfNeeded(); mark('tap Unfollow Burger Qala'); await un.click(); await page.waitForTimeout(1500)
  mark('tap Home tab'); await page.getByRole('tab').nth(0).click(); await page.waitForTimeout(4000)
  mark('Home shown 4 s')
  note('home_top6_after_unfollow', await page.evaluate(() => [...document.querySelectorAll('#home-panel-home .soc-feed-slot')].slice(0, 6).map(e => e.innerText.replace(/\s+/g, ' ').slice(0, 36))))
  await page.getByRole('tab').nth(2).click(); await page.waitForTimeout(1500)
  const fo = page.getByRole('button', { name: 'Follow Burger Qala', exact: true }).first(); await fo.scrollIntoViewIfNeeded(); mark('tap Follow Burger Qala'); await fo.click(); await page.waitForTimeout(1500)
  mark('tap Home tab'); await page.getByRole('tab').nth(0).click(); await page.waitForTimeout(4000)
  mark('Home shown 4 s')
  note('home_top6_after_follow', await page.evaluate(() => [...document.querySelectorAll('#home-panel-home .soc-feed-slot')].slice(0, 6).map(e => e.innerText.replace(/\s+/g, ' ').slice(0, 36))))
  note('timeline', log)
  L.save('r2-follow-reacts', out); await s.close()
})()
