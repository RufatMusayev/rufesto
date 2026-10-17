'use strict'
// What a signed-out visitor near Bella Roma sees: Home, Discover, restaurant page (dump text + screenshots).
const fs = require('fs')
const path = require('path')
const C = require('./common')

;(async () => {
  const browser = await C.launch()
  const sink = []
  const V = await C.open(browser, 'anon', { geo: true, sink })
  const { page } = V
  fs.mkdirSync(path.join(C.SCRATCH, 'dump'), { recursive: true })
  const look = async (name, url, wait) => {
    sink.stage = name
    const t0 = Date.now()
    await page.goto(C.CONSUMER + url, { waitUntil: 'domcontentloaded' })
    if (wait) await wait()
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
    await page.waitForTimeout(1200)
    C.timing('consumer ' + name, Date.now() - t0)
    await C.shot(page, 'c-' + name)
    const txt = await C.text(page, 'body')
    fs.writeFileSync(path.join(C.SCRATCH, 'dump', 'c-' + name + '.txt'), txt)
    console.log(name, 'chars', txt.length)
  }
  await look('home', '/')
  console.log((await C.text(page)).slice(0, 1500))
  await look('restaurant', '/restaurant/bella-roma')
  console.log((await C.text(page)).slice(0, 1200))
  console.log('tabs:', JSON.stringify(await page.getByRole('tab').allInnerTexts()))
  await page.goto(C.CONSUMER + '/')
  await page.waitForTimeout(1500)
  const disc = page.getByRole('tab', { name: /Discover/i }).first()
  if (await disc.count()) { await disc.click(); await page.waitForTimeout(2500); await C.shot(page, 'c-discover'); const t = await C.text(page); fs.writeFileSync(path.join(C.SCRATCH, 'dump', 'c-discover.txt'), t); console.log('DISCOVER', t.slice(0, 1800)) }
  console.log('problems:', JSON.stringify(sink.map(s => `${s.stage} ${s.kind} ${s.text}`), null, 1))
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
