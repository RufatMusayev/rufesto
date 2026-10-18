// Round 3: the location icon, nearby labels and distances at Sabunchu and Fountains Square (signed out). ROUND=round3 node personas/ui/r3-geo.js
const L = require('./lib')
const out = {}
const note = (k, v) => { out[k] = v; console.log('##', k, typeof v === 'string' ? v : JSON.stringify(v)) }
const lines = t => [...new Set(t.split('\n').map(x => x.trim()).filter(Boolean))]
async function run(tag, geo) {
  const s = await L.open({ geo }); const { page } = s
  let feed = null, search = null
  page.on('response', async r => { try { if (/rpc\/home_feed/.test(r.url()) && r.request().method() === 'POST' && JSON.parse(r.request().postData() || '{}').p_lat) feed = await r.json(); if (/rpc\/discover/.test(r.url()) && r.request().method() === 'POST' && JSON.parse(r.request().postData() || '{}').p_lat) search = await r.json() } catch { } })
  await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor(); await page.waitForTimeout(1500)
  const btn = page.getByRole('button', { name: /location/i }).first()
  note(`${tag}_icon_before`, { label: await btn.getAttribute('aria-label'), pressed: await btn.getAttribute('aria-pressed') })
  const t0 = Date.now(); await btn.click(); await page.waitForFunction(() => /Nearby|within/.test(document.body.innerText) || document.querySelector('button[aria-pressed=true][aria-label*=ocation]'), null, { timeout: 15000 }).catch(() => { })
  await page.waitForTimeout(1800)
  note(`${tag}_icon_ms`, Date.now() - t0)
  const b2 = page.getByRole('button', { name: /near you|nearby/i }).first()
  note(`${tag}_icon_after`, { label: await b2.getAttribute('aria-label'), pressed: await b2.getAttribute('aria-pressed') })
  note(`${tag}_nearby_text`, lines(await page.evaluate(() => document.body.innerText)).filter(x => /Nearby|within|km/i.test(x)).slice(0, 4))
  await L.shot(page, `RG-${tag}-home`)
  note(`${tag}_home_km_on_cards`, await page.evaluate(() => [...document.querySelectorAll('.soc-feed-slot')].slice(0, 14).map(e => { const m = e.innerText.match(/(< ?100 m|\d+(\.\d)? ?km)/); return m ? m[0] : '' }).filter(Boolean)))
  note(`${tag}_radius`, feed ? feed.radius_km : null)
  await page.goto(L.BASE + '/explore', { waitUntil: 'load' }); await page.waitForTimeout(3000)
  await L.shot(page, `RG-${tag}-search`)
  note(`${tag}_search_headings`, await page.locator('h1,h2,h3').allInnerTexts())
  note(`${tag}_search_places`, await page.evaluate(() => { const h = [...document.querySelectorAll('h2')].find(x => /places|Places|near/i.test(x.innerText)); return h ? h.parentElement.innerText.replace(/\s+/g, ' ').slice(0, 520) : 'no places heading' }))
  note(`${tag}_search_nearby_label`, lines(await page.evaluate(() => document.body.innerText)).filter(x => /Nearby|within|near you/i.test(x)))
  await s.close()
}
;(async () => { await run('sabuncu', L.GEO.sabuncu); await run('fountains', L.GEO.fountains); L.save('r3-geo', out) })()
