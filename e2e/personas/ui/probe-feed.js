// probe: what does home_feed return for a persona (keys + item summary). node personas/ui/probe-feed.js "<Name>"
const L = require('./lib')
;(async () => {
  const name = process.argv[2]
  const s = await L.open(name ? { as: name } : {})
  const { page } = s
  let first = null
  page.on('response', async r => {
    if (!first && /rpc\/home_feed(\?|$)/.test(r.url()) && r.request().method() === 'POST') { try { first = { req: JSON.parse(r.request().postData() || '{}'), res: await r.json() } } catch { } }
  })
  await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor({ timeout: 20000 }); await page.waitForTimeout(1500)
  console.log('req', JSON.stringify(first.req))
  console.log('top keys', Object.keys(first.res))
  const it = first.res.items || []
  console.log('item keys', Object.keys(it[0] || {}))
  console.log(JSON.stringify(it[0]).slice(0, 900))
  console.log(it.map(i => [i.kind, i.pool, i.reason, i.score, i.restaurant?.name || i.restaurantName || i.author?.name || '', i.source].filter(x => x !== undefined && x !== '').join('|')).join('\n'))
  await s.close()
})()
