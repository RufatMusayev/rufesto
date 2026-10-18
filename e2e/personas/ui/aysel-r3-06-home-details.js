// Round 3, part 4: shell on each page, Settings (language, theme), location pin, double-tap like, pull to refresh, popular review taps, AZ kicker, hit areas.
const L = require('./aysel-r3-lib')
const sleep = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova')
  const page = A.page
  const cdp = await A.ctx.newCDPSession(page)
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })

  await L.step('shell on each page (top bar on Home only, no language/theme control, no FAB)', async () => {
    for (const p of ['/', '/explore', '/notifications', '/profile', '/map', '/table', '/friends']) {
      await page.goto(L.CONSUMER + p); await sleep(2200)
      const r = await page.evaluate(() => ({
        topbar: !!document.querySelector('.app-bar'), wordmark: [...document.querySelectorAll('.app-bar *')].some(e => e.children.length === 0 && /Rufesto/.test(e.textContent)),
        lang: !!([...document.querySelectorAll('button')].find(b => /^(EN|AZ)$/.test(b.innerText.trim()) && b.offsetParent)), themeBtn: !!document.querySelector('[aria-label*="theme" i]'), fab: !!document.querySelector('.soc-fab'),
        h1: document.querySelector('h1')?.innerText, headerH: Math.round((document.querySelector('header, .page-head, .app-bar')?.getBoundingClientRect().height) || 0), docOverflowX: document.documentElement.scrollWidth > innerWidth,
      }))
      L.log(p.padEnd(15), JSON.stringify(r))
      if (p === '/map') await L.shot(page, '06-map')
      if (p === '/table') await L.shot(page, '06-table-none')
    }
  })

  await L.step('Settings sheet: language + dark mode', async () => {
    await page.goto(L.CONSUMER + '/profile'); await sleep(2000)
    await page.getByRole('button', { name: /Settings/ }).first().click(); await sleep(900)
    await L.shot(page, '06-settings')
    const sw = page.locator('.bs-panel').getByRole('switch').or(page.locator('.bs-panel input[type=checkbox]')).first()
    L.log('dark mode switch:', await sw.evaluate(e => (e.getAttribute('aria-checked') ?? e.checked) + ' label=' + (e.closest('label, div')?.innerText || '').replace(/\n+/g, ' ').slice(0, 30)))
    await sw.click({ force: true }); await sleep(500)
    L.log('after toggle, data-theme:', await page.evaluate(() => document.documentElement.getAttribute('data-theme')), '| label now:', await page.evaluate(() => (document.querySelector('.bs-panel')?.innerText || '').replace(/\n+/g, ' | ').slice(0, 80)))
    await sw.click({ force: true }); await sleep(400)
    await page.locator('.bs-panel').getByRole('button', { name: 'AZ' }).click(); await sleep(1200)
    L.log('after AZ: settings text:', (await page.evaluate(() => (document.querySelector('.bs-panel')?.innerText || '').replace(/\n+/g, ' | ').slice(0, 120))))
    await page.keyboard.press('Escape'); await sleep(600)
    await page.goto(L.CONSUMER + '/'); await page.waitForSelector('article'); await sleep(1500)
    const pop = page.locator('article').filter({ hasText: /Populyar rəy/ }).first()
    L.log('AZ kicker on Home:', (await pop.count()) ? (await pop.innerText()).replace(/\n+/g, ' | ').slice(0, 120) : 'no popular review found')
    L.log('AZ tabs:', await page.evaluate(() => [...document.querySelectorAll('[role=tab]')].map(t => t.innerText.trim())))
    await L.shot(page, '06-home-az')
    // back to EN
    await page.goto(L.CONSUMER + '/profile'); await sleep(1500); await page.getByRole('button').filter({ has: page.locator('svg') }).first().click().catch(() => {})
    await page.evaluate(() => localStorage.setItem('rufesto_lang', 'en'))
  })

  await L.step('pin (location) button', async () => {
    const G = await L.phone(b, 'Aysel Məmmədova', { geo: { latitude: 40.386, longitude: 49.818 } })
    await G.page.goto(L.CONSUMER + '/'); await G.page.waitForSelector('article'); await sleep(1200)
    const pin = G.page.getByRole('button', { name: /location|nearby/i }).first()
    L.log('pin before:', await pin.evaluate(e => (e.getAttribute('aria-label') || '') + ' pressed=' + e.getAttribute('aria-pressed') + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height)))
    await pin.click(); await sleep(2500)
    await L.shot(G.page, '06-pin-on')
    L.log('pin after:', await G.page.evaluate(() => { const e = [...document.querySelectorAll('button')].find(b => /location|nearby/i.test(b.getAttribute('aria-label') || '')); return e ? (e.getAttribute('aria-label') + ' pressed=' + e.getAttribute('aria-pressed')) : '(no pin button)' }), '| radius note:', await G.page.evaluate(() => (document.body.innerText.match(/within \d+ km|Nearby[^\n]*/) || [''])[0]))
    L.log('first cards with km:', await G.page.evaluate(() => [...document.querySelectorAll('article')].slice(0, 4).map(a => (a.innerText.match(/\d(\.\d)? km|< 100 m/) || ['-'])[0])))
    await G.ctx.close()
  })

  await L.step('double-tap like on a post photo', async () => {
    await page.goto(L.CONSUMER + '/'); await page.waitForSelector('article'); await sleep(1500)
    const card = page.locator('article').filter({ has: page.getByRole('button', { name: 'Like', exact: true }) }).filter({ has: page.locator('.soc-photo') }).first()
    await card.scrollIntoViewIfNeeded(); await sleep(400)
    const photo = card.locator('.soc-photo').first()
    const box = await photo.boundingBox()
    const likeText = async () => (await card.locator('.soc-act-likes').innerText().catch(() => '0 likes'))
    const before = await likeText()
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2
    await page.touchscreen.tap(cx, cy); await sleep(120); await page.touchscreen.tap(cx, cy)
    await sleep(250)
    await L.shot(page, '06-double-tap-burst')
    L.log('burst element present:', await card.evaluate(a => !!a.querySelector('.soc-burst')), '| likes', before, '->', await likeText(), '| button label now:', await card.locator('button[aria-pressed]').first().getAttribute('aria-label'))
    await sleep(900)
    await page.touchscreen.tap(cx, cy); await sleep(120); await page.touchscreen.tap(cx, cy); await sleep(900)
    L.log('after a second double-tap (must not unlike):', await likeText(), '| single tap alone does nothing?')
    const afterSecond = await likeText()
    await page.touchscreen.tap(cx, cy); await sleep(900)
    L.log('after one single tap:', await likeText(), '(expected unchanged:', afterSecond, ')')
    // tidy: remove the like with the button
    await card.getByRole('button', { name: /Remove like|Unlike/i }).click().catch(() => {}); await sleep(600)
  })

  await L.step('pull to refresh', async () => {
    await page.goto(L.CONSUMER + '/'); await page.waitForSelector('article'); await sleep(1500)
    let calls = 0; page.on('request', r => { if (/rpc\/home_feed/.test(r.url())) calls++ })
    const frames = []
    await touch('touchStart', [{ x: 206, y: 250 }])
    for (let k = 1; k <= 12; k++) { await touch('touchMove', [{ x: 206, y: 250 + k * 18 }]); await sleep(30); if (k === 8) { await L.shot(page, '06-pull-to-refresh'); frames.push(await page.evaluate(() => [...document.querySelectorAll('[class*=ptr], [class*=pull], [role=progressbar], .spinner')].filter(e => e.offsetParent).map(e => e.className + ' ' + Math.round(e.getBoundingClientRect().top)).slice(0, 3))) } }
    await touch('touchEnd', []); await sleep(2500)
    L.log('pull 216 px: home_feed calls after release', calls, '| indicator while pulling', JSON.stringify(frames), '| scrollY', await page.evaluate(() => scrollY))
  })

  await L.step('popular review: tap, hit areas, heights', async () => {
    await page.goto(L.CONSUMER + '/'); await page.waitForSelector('article'); await sleep(1500)
    const pop = page.locator('article').filter({ hasText: 'Popular review' }).first()
    await pop.scrollIntoViewIfNeeded(); await sleep(400)
    const geo = await pop.evaluate(a => {
      const like = [...a.querySelectorAll('button')].find(b => /Like|like/.test(b.getAttribute('aria-label') || '')); const r = like.getBoundingClientRect()
      const probe = (dx, dy) => { const e = document.elementFromPoint(r.left + r.width / 2 + dx, r.top + r.height / 2 + dy); return !!(e && (e === like || like.contains(e))) }
      const nm = a.querySelector('.rv-name'); const nr = nm && nm.getBoundingClientRect()
      return { likeBox: Math.round(r.width) + 'x' + Math.round(r.height), likeHit: { left10: probe(-10, 0), right10: probe(10, 0), up10: probe(0, -10), down10: probe(0, 10), up16: probe(0, -16), down16: probe(0, 16) }, nameBox: nr ? Math.round(nr.width) + 'x' + Math.round(nr.height) : null, height: Math.round(a.getBoundingClientRect().height), kicker: (a.innerText.match(/Popular review[^\n]*/) || [''])[0] }
    })
    L.log('popular review card:', JSON.stringify(geo))
    await pop.locator('.rv-body, .rv-text, p').first().click().catch(() => {})
    await sleep(1500)
    L.log('tap on the card lands on:', page.url().replace(L.CONSUMER, ''), '| sheet open:', await page.locator('.bs-panel').count())
    await L.shot(page, '06-popular-tap')
  })
  L.log('errors', A.errors.filter(e => !/ERR_ABORTED/.test(e)))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
