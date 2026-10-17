const L = require('./aysel-lib')
const step = async (n, fn) => { try { L.log('\n=== ' + n); await fn() } catch (e) { L.log('STEP FAILED', n, String(e.message).split('\n')[0]) } }
;(async () => {
  const b = await L.launch()
  // geolocation at Yasamal
  const { page, errors } = await L.phone(b, 'Aysel Məmmədova', { geo: { latitude: 40.386, longitude: 49.818 } })
  const feeds = []
  page.on('response', async r => { if (/rpc\/home_feed/.test(r.url()) && r.request().method() === 'POST') { try { feeds.push({ req: JSON.parse(r.request().postData() || '{}'), body: await r.json() }) } catch {} } })
  await step('tap location pill', async () => {
    await page.goto(L.CONSUMER + '/'); await page.waitForSelector('.soc-feed-slot'); await page.waitForTimeout(1000)
    const before = await page.evaluate(() => [...document.querySelectorAll('.soc-feed-slot article')].map(a => (a.querySelector('.soc-post-name')?.innerText || '') + ' @ ' + (a.querySelector('.soc-post-where,.soc-chip-text')?.innerText || '')).slice(0, 10))
    L.log('before', before)
    const t0 = Date.now()
    await page.getByRole('button', { name: 'Use my location for nearby' }).click()
    await page.waitForFunction(() => document.querySelector('.soc-geo-radius') || document.querySelector('.soc-geo-note'), null, { timeout: 15000 }).catch(() => L.log('no radius note'))
    L.log('radius note after ms', Date.now() - t0, await page.locator('.soc-geo-note').allInnerTexts())
    await page.waitForTimeout(1500)
    await L.shot(page, '03-geo-on-top')
    const after = await page.evaluate(() => [...document.querySelectorAll('.soc-feed-slot article')].map(a => (a.querySelector('.soc-post-name')?.innerText || '') + ' @ ' + (a.querySelector('.soc-post-where,.soc-chip-text')?.innerText || '') + ' | ' + ([...a.querySelectorAll('*')].map(e=>e.innerText||'').find(t=>/km|m away/.test(t))||'')).slice(0, 12))
    L.log('after', after)
    L.log('feed calls', feeds.length, feeds.map(f => `req=${JSON.stringify(f.req).slice(0,100)} mix=${JSON.stringify(f.body.mix)} radius=${f.body.radius_km}`))
    const last = feeds[feeds.length - 1]
    last?.body?.items?.slice(0, 12).forEach((it, i) => L.log(i, it.kind, it.why, it.pool, 'km=' + it.km, it.author?.name || it.restaurant?.name, '|', it.restaurant?.name))
    // also persist? reload
    await page.reload(); await page.waitForSelector('.soc-feed-slot'); await page.waitForTimeout(1500)
    L.log('after reload pill?', await page.getByRole('button', { name: 'Use my location for nearby' }).count(), 'notes', await page.locator('.soc-geo-note').allInnerTexts())
    await L.shot(page, '03-geo-reload')
  })
  await step('restaurant page + dish sheet bottom', async () => {
    const p2 = await b.newContext({ ...L.devices['Pixel 7'] })
    await p2.close()
    await page.goto(L.CONSUMER + '/restaurant/bella-roma?dish=80000001-0000-0000-0000-000000000008')
    await page.waitForTimeout(3000)
    const sheet = page.locator('.overlay, .sheet, [role="dialog"]').last()
    L.log('sheet classes', await page.evaluate(() => [...document.querySelectorAll('[class*="sheet" i],[class*="overlay" i]')].map(e => e.className).slice(0, 6)))
    await page.evaluate(() => { const s = document.querySelector('.dish-sheet-body,.sheet-body,.dish-sheet,[class*="sheet"]'); if (s) s.scrollTop = 99999 })
    await page.mouse.move(200, 600); await page.mouse.wheel(0, 2500); await page.waitForTimeout(600)
    await L.shot(page, '03-dish-sheet-bottom')
    L.log((await page.evaluate(() => document.body.innerText)).slice(-900))
  })
  L.log('\nerrors', errors)
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
