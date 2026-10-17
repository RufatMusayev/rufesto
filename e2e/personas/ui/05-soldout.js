'use strict'
// Leyla marks a dish sold out on /menu; two signed-out visitors (restaurant page + Home or Discover, both left open) must see it
// within ~5 s; then she puts it back on sale.  DISH=<name> TAB=home|discover node 05-soldout.js
const C = require('./common')

const DISH = process.env.DISH || 'Tiramisù'
const TAB = process.env.TAB || 'discover'

const soldOutOnRestaurant = page => page.evaluate(d => {
  const card = [...document.querySelectorAll('.menu-card')].find(c => c.innerText.includes(d))
  return card ? /sold out/i.test(card.innerText) : null
}, DISH)

/** Home / Discover: the smallest block that names the dish and carries an availability word. Returns { text, sold }. */
const feedProbe = page => page.evaluate(d => {
  const els = [...document.querySelectorAll('div,a,button,article,li')].filter(e => e.innerText && e.innerText.includes(d) && /available|sold out/i.test(e.innerText) && e.innerText.length < 200)
  const el = els.sort((a, b) => a.innerText.length - b.innerText.length)[0]
  return el ? { text: el.innerText.replace(/\n+/g, ' | '), sold: /sold out/i.test(el.innerText) } : null
}, DISH)

async function goFeed(page) {
  await page.goto(C.CONSUMER + '/'); await page.waitForTimeout(2000)
  if (TAB === 'discover') { await page.getByRole('tab', { name: /Discover/i }).first().click(); await page.waitForTimeout(2500) }
}

;(async () => {
  const browser = await C.launch()
  const sink = []
  const L = await C.open(browser, 'leyla', { who: 'Leyla', sink })
  const R = await C.open(browser, 'anon', { geo: true, sink })
  const H = await C.open(browser, 'anon', { geo: true, sink })
  await R.page.goto(C.CONSUMER + '/restaurant/bella-roma'); await R.page.locator('.menu-card').first().waitFor()
  await goFeed(H.page)
  await L.page.goto(C.RESTO + '/menu'); await L.page.locator('.avail-toggle').first().waitFor()
  console.log(`[${DISH} / ${TAB}] before: restaurant card sold out =`, await soldOutOnRestaurant(R.page), '| feed =', JSON.stringify(await feedProbe(H.page)))
  const card = L.page.locator('div', { has: L.page.locator('.avail-toggle'), hasText: DISH }).last()

  async function flip(label, expectSold) {
    sink.stage = label
    const t0 = Date.now()
    await card.locator('.avail-toggle').click()
    await L.page.waitForFunction(([d, off]) => { const c = [...document.querySelectorAll('div')].filter(e => e.innerText && e.innerText.includes(d) && e.querySelector('.avail-toggle')).pop(); return c && (off ? /\bOff\b/.test(c.innerText) : !/\bOff\b/.test(c.innerText)) }, [DISH, expectSold], { timeout: 10_000 }).catch(() => {})
    C.timing(`${label}: dashboard shows the new state`, Date.now() - t0)
    let tRt = null, tFeed = null
    while (Date.now() - t0 < 15_000 && (tRt === null || tFeed === null)) {
      if (tRt === null && (await soldOutOnRestaurant(R.page)) === expectSold) tRt = Date.now() - t0
      if (tFeed === null) { const p = await feedProbe(H.page); if (p && p.sold === expectSold) tFeed = Date.now() - t0 }
      await C.sleep(250)
    }
    C.timing(`${label}: consumer restaurant page, no reload`, tRt ?? 15_000, tRt === null ? 'NOT SEEN in 15 s' : '')
    C.timing(`${label}: consumer ${TAB} (${DISH}), no reload`, tFeed ?? 15_000, tFeed === null ? 'NOT SEEN in 15 s' : '')
    if (tFeed === null) {
      const t1 = Date.now(); await goFeed(H.page)
      console.log('  feed after reload:', JSON.stringify(await feedProbe(H.page)), `(reload+render ${Date.now() - t1} ms, ${Date.now() - t0} ms after click)`)
    }
  }

  await flip('sold-out ON', true)
  await C.shot(R.page, `11-consumer-restaurant-soldout-${TAB}`)
  await C.shot(L.page, `12-menu-soldout-${TAB}`)
  await C.shot(H.page, `13-consumer-${TAB}-soldout`, { full: false })
  await flip('sold-out OFF', false)
  await C.shot(H.page, `14-consumer-${TAB}-back`, { full: false })
  console.log('problems:', JSON.stringify(sink.map(s => `${s.stage} ${s.who} ${s.kind} ${s.text}`), null, 1))
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
