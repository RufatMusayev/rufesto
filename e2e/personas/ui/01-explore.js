'use strict'
// Leyla's first look: every dashboard page, timed, with a screenshot and the visible text dumped to the scratchpad for reading.
const fs = require('fs')
const path = require('path')
const C = require('./common')

const PAGES = (process.env.PAGES || '/,/orders,/bookings,/bills,/tips,/menu,/posts,/promos,/tables,/kds,/waiter,/settings,/qr-sheet,/my-tips').split(',')

;(async () => {
  const browser = await C.launch()
  const sink = []
  const L = await C.open(browser, 'leyla', { who: 'Leyla', sink })
  const { page } = L
  fs.mkdirSync(path.join(C.SCRATCH, 'dump'), { recursive: true })
  for (const p of PAGES) {
    sink.stage = p
    const t0 = Date.now()
    await page.goto(C.RESTO + p, { waitUntil: 'domcontentloaded' })
    // "ready" = no spinner/skeleton and some heading text
    await page.waitForFunction(() => !document.querySelector('.skeleton, .spinner') && (document.querySelector('.dash-content')?.innerText || '').trim().length > 20, null, { timeout: 20_000 }).catch(() => {})
    const ms = Date.now() - t0
    C.timing('nav ' + p, ms)
    await page.waitForTimeout(800)
    const name = 'x' + (p === '/' ? 'home' : p.slice(1).replace(/\W/g, '-'))
    const f = await C.shot(page, name)
    const txt = await C.text(page, '.dash-content')
    fs.writeFileSync(path.join(C.SCRATCH, 'dump', name + '.txt'), txt)
    console.log(p, ms + 'ms', f, 'url=' + page.url().replace(C.RESTO, ''), 'chars=' + txt.length)
  }
  console.log('console/http problems:', JSON.stringify(sink.map(s => `${s.stage} ${s.kind} ${s.text}`), null, 1))
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
