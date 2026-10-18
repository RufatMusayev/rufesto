// Round 3: acceptance 2.10 #5 and #7 with real timings. Ceyhun requests, Aysel's bell, opening the inbox (bell -> 0), Confirm -> row text, reload.
const L = require('./aysel-r3-lib')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const poll = (page, fnSrc, lim = 5000) => page.evaluate(([src, l]) => new Promise(res => { const f = new Function('return (' + src + ')()'); const t0 = performance.now(); const tick = () => { if (f()) return res(Math.round(performance.now() - t0)); if (performance.now() - t0 > l) return res(null); requestAnimationFrame(tick) }; tick() }), [fnSrc, lim])
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova'); const page = A.page
  await page.goto(L.CONSUMER + '/'); await page.waitForSelector('article'); await sleep(1500)
  const bell = `() => { const e = document.querySelector('[aria-label*="otification" i]'); return e ? (e.getAttribute('aria-label') || '') + '|' + (e.innerText || '').trim() : '' }`
  L.log('bell before', await page.evaluate(new Function('return (' + bell + ')()')))
  const C = await L.phone(b, 'Ceyhun Məmmədli')
  await C.page.goto(L.CONSUMER + '/explore'); await sleep(2500)
  await C.page.getByPlaceholder(/Dishes, places, people/i).fill('aysel'); await sleep(2500)
  await C.page.getByRole('button', { name: /Add friend/i }).first().click()
  const t0 = Date.now()
  let n = null
  for (let i = 0; i < 80 && !n; i++) { await sleep(100); const t = await page.evaluate(new Function('return (' + bell + ')()')); if (/\d/.test(t.split('|')[1] || '')) n = Date.now() - t0 }
  L.log('bell shows a count', n, 'ms after Ceyhun tapped Add friend |', await page.evaluate(new Function('return (' + bell + ')()')))
  await C.ctx.close()
  // open the inbox: badge -> 0
  await page.evaluate(() => document.querySelector('[aria-label*="otification" i]').click())
  const zero = await poll(page, `() => { const e = document.querySelector('[aria-label*="otification" i]'); return !e || !/\d/.test((e.innerText || '').trim()) }`)
  L.log('after the tap on the bell: badge cleared in', zero, 'ms (on the inbox page the bell may be gone)', '| url', page.url().replace(L.CONSUMER, ''))
  await page.waitForSelector('li.ntf-li'); await sleep(1200)
  const rowTxt = () => page.evaluate(() => (document.querySelector('li.ntf-li')?.innerText || '').replace(/\n+/g, ' | '))
  L.log('first row', await rowTxt())
  const ms = await page.evaluate(() => new Promise(res => { const li = [...document.querySelectorAll('li.ntf-li')].find(l => /friend request/.test(l.innerText)); if (!li) return res('no request row'); const btn = [...li.querySelectorAll('button')].find(b => /Confirm/.test(b.innerText)); const t0 = performance.now(); btn.click(); const tick = () => { const cur = [...document.querySelectorAll('li.ntf-li')].find(l => /now your friend/.test(l.innerText)); if (cur) return res(Math.round(performance.now() - t0)); if (performance.now() - t0 > 4000) return res('no change in 4 s'); requestAnimationFrame(tick) }; tick() }))
  L.log('Confirm -> row text changed after (ms):', ms)
  await L.shot(page, '25-after-confirm')
  await page.reload(); await page.waitForSelector('li.ntf-li'); await sleep(1500)
  L.log('after reload, rows with "friend":', await page.evaluate(() => [...document.querySelectorAll('li.ntf-li')].filter(l => /friend/.test(l.innerText)).map(l => l.innerText.replace(/\n+/g, ' | ')).slice(0, 3)))
  // cleanup: unfriend Ceyhun through the UI
  await page.goto(L.CONSUMER + '/friends'); await sleep(2200)
  await page.locator('.soc-row').filter({ hasText: 'Ceyhun' }).first().locator('button').last().click(); await sleep(700)
  await page.getByRole('button', { name: 'Remove friend' }).click(); await sleep(900)
  L.log('cleanup: friends now', await page.evaluate(() => [...document.querySelectorAll('.soc-row-name')].map(e => e.innerText)))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
