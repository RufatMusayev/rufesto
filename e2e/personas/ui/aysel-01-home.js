const L = require('./aysel-lib')
const step = async (n, fn) => { try { L.log('\n=== ' + n); await fn() } catch (e) { L.log('STEP FAILED', n, String(e.message).split('\n')[0]) } }
;(async () => {
  const b = await L.launch()
  const { ctx, page, errors } = await L.phone(b, 'Aysel Məmmədova')
  const feeds = []
  page.on('response', async r => { if (/rpc\/home_feed/.test(r.url()) && r.request().method() === 'POST') { try { feeds.push({ req: JSON.parse(r.request().postData() || '{}'), body: await r.json() }) } catch {} } })

  await step('open home + scroll 4 pages', async () => {
    await page.goto(L.CONSUMER + '/'); await page.waitForSelector('.soc-feed-slot')
    await page.waitForTimeout(1500)
    for (let i = 0; i < 6; i++) {
      await L.shot(page, `01-home-scroll-${i}`)
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.9))
      await page.waitForTimeout(900)
    }
    // summary of all cards
    const cards = await page.evaluate(() => [...document.querySelectorAll('.soc-feed-slot')].map(s => {
      const a = s.querySelector('article'); const t = x => (a?.querySelector(x)?.innerText || '').trim().replace(/\s+/g, ' ')
      return { name: t('.soc-post-name'), time: t('.soc-post-time'), where: t('.soc-post-where') || t('.soc-chip-text'), text: t('.soc-caption').slice(0, 60), promo: !a, raw: !a ? s.innerText.slice(0, 50).replace(/\s+/g, ' ') : '' }
    }))
    cards.forEach((c, i) => L.log(i, JSON.stringify(c)))
    L.log('cards count', cards.length)
    L.log('feed calls', feeds.length, feeds.map(f => `items=${f.body?.items?.length} keys=${Object.keys(f.body || {}).join(',')} req=${JSON.stringify(f.req).slice(0, 120)}`))
    if (feeds[0]?.body?.items?.[0]) L.log('item0 keys', Object.keys(feeds[0].body.items[0]).join(','))
  })
  L.log('\nerrors', errors)
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
