// Round 3, last checks: (1) flick velocity vs dismiss on the dish sheet with realistic touch sampling, (2) double-tap twice must not unlike,
// (3) Cappuccino rating consistent across Search trending / Search filter / dish sheet, (4) bottom-nav labels.
const L = require('./aysel-r3-lib')
const sleep = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova')
  const page = A.page
  const cdp = await A.ctx.newCDPSession(page)
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
  const state = () => page.evaluate(() => { const p = document.querySelector('.bs-panel'); const r = p && p.getBoundingClientRect(); return { open: !!p, top: r ? Math.round(r.top) : null } })
  const drag = async (x, y0, dy, steps, gap) => {
    const t0 = Date.now()
    await touch('touchStart', [{ x, y: y0 }])
    for (let i = 1; i <= steps; i++) { await touch('touchMove', [{ x, y: y0 + (dy * i) / steps }]); if (gap) await sleep(gap) }
    await touch('touchEnd', [])
    return Date.now() - t0
  }
  await L.step('flick velocity vs dismiss (dy 120 px = 15 % of the panel)', async () => {
    await page.goto(L.CONSUMER + '/restaurant/bella-roma?tab=menu'); await page.waitForSelector('.mn-row'); await sleep(1500)
    for (const [steps, gap] of [[12, 6], [12, 10], [12, 14], [12, 20], [12, 30]]) {
      for (const where of ['content', 'handle']) {
        if (!(await state()).open) { await page.locator('.mn-row-btn').nth(8).scrollIntoViewIfNeeded(); await page.locator('.mn-row-btn').nth(8).click(); await page.waitForSelector('.bs-panel'); await sleep(900) }
        const s = await state()
        const y0 = where === 'content' ? s.top + 140 : s.top + 14
        const dt = await drag(206, y0, 120, steps, gap); await sleep(900)
        const after = await state()
        L.log(where.padEnd(8), 'dy 120 px in', String(dt).padStart(4), 'ms =', (120 / dt).toFixed(2), 'px/ms ->', after.open ? 'stayed open (top ' + after.top + ')' : 'CLOSED')
      }
    }
    await page.keyboard.press('Escape'); await sleep(600)
  })
  await L.step('double-tap twice on one photo: must not unlike', async () => {
    await page.goto(L.CONSUMER + '/'); await page.waitForSelector('article'); await sleep(1500)
    const cards = page.locator('article').filter({ has: page.locator('.soc-photo') })
    const n = await cards.count(); let idx = -1
    for (let i = 0; i < n; i++) { if (await cards.nth(i).getByRole('button', { name: 'Like', exact: true }).count()) { idx = i; break } }
    const card = cards.nth(idx); await card.scrollIntoViewIfNeeded(); await sleep(600)
    const who = (await card.locator('.soc-post-head').innerText()).replace(/\n+/g, ' ')
    const box = await card.locator('.soc-photo').first().boundingBox(); const cx = Math.round(box.x + box.width / 2), cy = Math.round(box.y + box.height / 2)
    const read = async () => ({ likes: await card.locator('.soc-act-likes').innerText().catch(() => '0 likes'), label: await card.locator('button[aria-pressed]').first().getAttribute('aria-label') })
    const dbl = async () => { for (let k = 0; k < 2; k++) { await touch('touchStart', [{ x: cx, y: cy }]); await sleep(40); await touch('touchEnd', []); if (k === 0) await sleep(110) } }
    L.log('post', who, '| before', JSON.stringify(await read()))
    await dbl(); await sleep(1200); L.log('after 1st double-tap', JSON.stringify(await read()))
    await dbl(); await sleep(1200); L.log('after 2nd double-tap (must stay liked)', JSON.stringify(await read()))
    // single tap on the photo: what does it do?
    const u0 = page.url(); await touch('touchStart', [{ x: cx, y: cy }]); await sleep(40); await touch('touchEnd', []); await sleep(900)
    L.log('single tap on the photo ->', page.url().replace(L.CONSUMER, ''), '(from', u0.replace(L.CONSUMER, '') + ')', JSON.stringify(await read()))
    // clean up: unlike by the button
    await page.goto(L.CONSUMER + '/'); await page.waitForSelector('article'); await sleep(1200)
    const c2 = page.locator('article').filter({ hasText: who.split(' ·')[0] }).first()
    const rm = c2.getByRole('button', { name: 'Remove like', exact: true }).first()
    if (await rm.count()) { await rm.click(); await sleep(700); L.log('cleanup: unliked ->', JSON.stringify(await c2.locator('.soc-act-likes').innerText().catch(() => '?'))) }
  })
  await L.step('Cappuccino rating: Search trending / filter / dish sheet / dish_reviews', async () => {
    const api = await L.api('Aysel Məmmədova')
    const d = await api.rpc('dish_reviews', { p_dish_id: '80000001-0000-0000-0000-000000000019' }).catch(() => null)
    L.log('dish_reviews (id ..19)', d && JSON.stringify({ avg: d.avg_rating, n: d.review_count }))
    await page.goto(L.CONSUMER + '/explore'); await page.waitForSelector('.sr-row'); await sleep(2500)
    L.log('trending row:', await page.evaluate(() => [...document.querySelectorAll('.sr-row')].filter(r => /^Cappuccino/.test(r.innerText.trim())).map(r => r.innerText.replace(/\n+/g, ' | ')).join(' || ')))
    await page.goto(L.CONSUMER + '/explore?cuisine=Italian'); await sleep(3000)
    L.log('Italian filter row:', await page.evaluate(() => [...document.querySelectorAll('.sr-row')].filter(r => /^Cappuccino/.test(r.innerText.trim())).map(r => r.innerText.replace(/\n+/g, ' | ')).join(' || ')))
    await page.goto(L.CONSUMER + '/restaurant/bella-roma?tab=menu'); await page.waitForSelector('.mn-row'); await sleep(1500)
    L.log('menu row:', await page.evaluate(() => [...document.querySelectorAll('.mn-row')].filter(r => /Cappuccino/.test(r.innerText)).map(r => r.innerText.replace(/\n+/g, ' | ')).join(' || ')))
  })
  await L.step('bottom nav labels', async () => {
    await page.goto(L.CONSUMER + '/'); await page.waitForSelector('article'); await sleep(800)
    L.log('nav:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('nav a, .bottom-nav a, nav button, .bottom-nav button')].map(a => ({ href: a.getAttribute('href'), aria: a.getAttribute('aria-label'), text: a.innerText.trim(), w: Math.round(a.getBoundingClientRect().width), h: Math.round(a.getBoundingClientRect().height) })))))
  })
  L.log('errors', A.errors.filter(e => !/ERR_ABORTED/.test(e)))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
