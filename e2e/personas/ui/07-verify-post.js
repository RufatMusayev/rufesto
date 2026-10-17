'use strict'
// Does Leyla's post reach a signed-out visitor near Bella Roma: Home (with and without "Use my location") and Discover?
const fs = require('fs')
const path = require('path')
const C = require('./common')
const MARK = JSON.parse(fs.readFileSync(path.join(C.SCRATCH, 'leyla-post.json'), 'utf8'))
const KEY = MARK.caption.slice(0, 40)

;(async () => {
  const browser = await C.launch()
  const sink = []
  const V = await C.open(browser, 'anon', { geo: true, sink })
  const { page } = V
  sink.stage = 'home'
  let t0 = Date.now()
  await page.goto(C.CONSUMER + '/', { waitUntil: 'domcontentloaded' })
  const post = page.locator('article', { hasText: KEY }).first()
  const seen = await post.waitFor({ timeout: 15_000 }).then(() => true).catch(() => false)
  C.timing('visitor Home: post visible (cold load)', Date.now() - t0, seen ? '' : 'NOT FOUND')
  await page.waitForTimeout(1500)
  const articles = await page.locator('article').allInnerTexts()
  const idx = articles.findIndex(a => a.includes(KEY))
  console.log('home: post position among articles =', idx, 'of', articles.length)
  if (seen) { await post.scrollIntoViewIfNeeded(); await post.screenshot({ path: path.join(C.OUT, '22-consumer-home-post.png') }); console.log('post card text:', articles[idx].replace(/\n+/g, ' | ')) }
  await C.shot(page, '23-consumer-home-after-post', { full: false })

  // "Use my location for nearby"
  const near = page.getByRole('button', { name: /Use my location/i })
  if (await near.count()) {
    t0 = Date.now(); await near.first().click(); await page.waitForTimeout(3500)
    const articles2 = await page.locator('article').allInnerTexts()
    console.log('after "use my location": post position =', articles2.findIndex(a => a.includes(KEY)), 'of', articles2.length, `(${Date.now() - t0} ms)`)
    await C.shot(page, '24-consumer-home-near-me', { full: false })
    console.log('top of feed:', (await C.text(page, 'main')).slice(0, 500).replace(/\n+/g, ' | '))
  }

  // Order this (signed out)
  if (seen) {
    const orderBtn = post.getByRole('button', { name: /order this/i }).or(post.getByText('Order this')).first()
    if (await orderBtn.count()) { await orderBtn.click(); await page.waitForTimeout(1500); await C.shot(page, '25-consumer-order-this-signed-out', { full: false }); console.log('after Order this ->', page.url(), '|', (await C.text(page)).slice(0, 300).replace(/\n+/g, ' | ')) }
  }

  // Discover
  sink.stage = 'discover'
  await page.goto(C.CONSUMER + '/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('tab', { name: /Discover/i }).first().click()
  await page.waitForTimeout(4000)
  const dtxt = await C.text(page)
  fs.writeFileSync(path.join(C.SCRATCH, 'dump', 'c-discover2.txt'), dtxt)
  console.log('discover contains post caption?', dtxt.includes('Pizza Margherita'), '| contains KEY?', dtxt.includes(KEY))
  console.log('discover sections:', dtxt.split('\n').filter(l => /^(Trending|New places|Promos|Near|Open|Popular|Top|Posts|Latest|Recent|Friends)/i.test(l)).join(' | '))
  await C.shot(page, '26-consumer-discover')
  console.log('problems:', JSON.stringify(sink.map(s => `${s.stage} ${s.kind} ${s.text}`), null, 1))
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
