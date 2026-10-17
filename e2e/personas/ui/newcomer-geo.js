// Persona A (signed out) with geolocation granted at two places: Sabunchu (far from centre) and Fountains Square.
// node personas/ui/newcomer-geo.js   -> screenshots A2x-geo-*.png, results/geo.json
const L = require('./lib')
const out = {}
const note = (k, v) => { out[k] = v; console.log('##', k, typeof v === 'string' ? v : JSON.stringify(v)) }

async function run(tag, geo) {
  const s = await L.open({ geo })
  const { page, watch } = s
  const feeds = { home: [], discover: [] }
  page.on('response', async r => {
    const u = r.url()
    try {
      if (/rpc\/home_feed(\?|$)/.test(u) && r.request().method() === 'POST') feeds.home.push({ req: JSON.parse(r.request().postData() || '{}'), res: await r.json() })
      if (/rpc\/discover(\?|$)/.test(u) && r.request().method() === 'POST') feeds.discover.push({ req: JSON.parse(r.request().postData() || '{}'), res: await r.json() })
    } catch { /* body gone */ }
  })
  try {
    await page.goto(L.BASE + '/', { waitUntil: 'load' })
    await page.locator('.soc-feed-slot').first().waitFor({ timeout: 20000 })
    await page.waitForTimeout(1200)
    const before = await page.evaluate(() => [...document.querySelectorAll('.soc-feed-slot')].slice(0, 8).map(el => el.innerText.replace(/\s+/g, ' ').slice(0, 60)))
    await L.shot(page, `A20-${tag}-home-before`)
    const t0 = Date.now()
    await page.getByRole('button', { name: 'Use my location for nearby' }).first().click()
    await page.getByText(/Nearby: places within/).first().waitFor({ timeout: 15000 }).catch(() => note(`${tag}_no_radius_label`, true))
    note(`${tag}_pill_to_label_ms`, Date.now() - t0)
    await page.waitForTimeout(1500)
    await L.shot(page, `A21-${tag}-home-after`)
    note(`${tag}_radius_label`, await page.getByText(/Nearby: places within/).first().innerText().catch(() => 'none'))
    const after = await page.evaluate(() => [...document.querySelectorAll('.soc-feed-slot')].slice(0, 14).map(el => el.innerText.replace(/\s+/g, ' ').slice(0, 90)))
    note(`${tag}_home_after_first14`, after)
    note(`${tag}_home_km_labels`, await page.evaluate(() => [...document.querySelectorAll('.soc-feed-slot')].slice(0, 20).map(el => (el.innerText.match(/\d+(\.\d+)?\s?km|\d+\s?m\b/g) || []).join(',')).filter(Boolean)))
    note(`${tag}_home_before_first8`, before)
    const last = feeds.home[feeds.home.length - 1]
    if (last) {
      note(`${tag}_home_req`, last.req)
      note(`${tag}_home_radiusKm`, last.res.radius_km ?? last.res.radiusKm ?? Object.keys(last.res))
      note(`${tag}_home_items`, (last.res.items || []).slice(0, 12).map(i => `${i.kind}|${i.restaurant?.name || i.restaurant_name || i.author?.name || ''}|km=${i.km ?? i.restaurant?.km ?? ''}`))
    }
    // Discover
    await page.getByRole('tab', { name: 'Discover' }).click(); await page.waitForTimeout(3000)
    await L.shot(page, `A22-${tag}-discover`)
    note(`${tag}_discover_sections`, await page.evaluate(() => [...document.querySelectorAll('.dsc h2')].map(h => h.innerText)))
    note(`${tag}_discover_nearby_label`, await page.locator('.dsc .soc-geo-radius').first().innerText().catch(() => 'none'))
    const cards = await page.evaluate(() => {
      const sec = [...document.querySelectorAll('.dsc h2')].find(h => /Open now/.test(h.innerText))
      const rail = sec && sec.parentElement
      return rail ? [...rail.querySelectorAll('a, article')].map(a => a.innerText.replace(/\s+/g, ' ').slice(0, 80)) : []
    })
    note(`${tag}_discover_open_cards`, cards.slice(0, 12))
    note(`${tag}_discover_all_km`, await page.evaluate(() => (document.querySelector('.dsc').innerText.match(/\d+(\.\d+)?\s?km/g) || []).slice(0, 30)))
    const d = feeds.discover[feeds.discover.length - 1]
    if (d) { note(`${tag}_discover_req`, d.req); note(`${tag}_discover_keys`, Object.keys(d.res)); note(`${tag}_discover_radius`, d.res.radius_km ?? d.res.radiusKm); note(`${tag}_discover_allRestaurants`, (d.res.all_restaurants || d.res.allRestaurants || []).map(r => `${r.name}|${r.km ?? ''}`)); note(`${tag}_discover_openNow`, (d.res.open_now || d.res.openNow || []).map(r => `${r.name}|${r.km ?? ''}`)) }
    // reload: does the location stick?
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(3500)
    await L.shot(page, `A23-${tag}-reload`)
    note(`${tag}_after_reload_label`, await page.getByText(/Nearby: places within/).first().innerText().catch(() => 'none'))
    note(`${tag}_after_reload_pill`, await page.getByRole('button', { name: 'Use my location for nearby' }).count())
  } catch (e) { note(`${tag}_ERROR`, String(e).slice(0, 400)); await L.shot(page, `A29-${tag}-error`).catch(() => {}) }
  note(`${tag}_console`, watch.console.slice(0, 8)); note(`${tag}_bad`, watch.bad.slice(0, 8))
  await s.close()
}

;(async () => {
  await run('sabuncu', L.GEO.sabuncu)
  await run('fountains', L.GEO.fountains)
  L.save('geo', out)
})()
