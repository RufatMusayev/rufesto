const L = require('./aysel-r3-lib')
const sleep = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova')
  const page = A.page
  const cdp = await A.ctx.newCDPSession(page)
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
  await page.goto(L.CONSUMER + '/'); await page.waitForSelector('article'); await sleep(1500)
  const cards = page.locator('article').filter({ has: page.locator('.soc-photo') })
  const n = await cards.count()
  let idx = -1
  for (let i = 0; i < n; i++) { if (await cards.nth(i).getByRole('button', { name: 'Like', exact: true }).count()) { idx = i; break } }
  L.log('cards with a photo:', n, '| first unliked one:', idx)
  const card = cards.nth(idx)
  await card.scrollIntoViewIfNeeded(); await sleep(600)
  const box = await card.locator('.soc-photo').first().boundingBox()
  const cx = Math.round(box.x + box.width / 2), cy = Math.round(box.y + box.height / 2)
  const read = async () => ({ likes: await card.locator('.soc-act-likes').innerText().catch(() => '0 likes'), label: await card.locator('button[aria-pressed]').first().getAttribute('aria-label'), burst: await card.evaluate(a => !!a.querySelector('.soc-burst')) })
  L.log('before', JSON.stringify(await read()), 'photo center', cx, cy)
  // CDP touch double tap (two quick taps)
  for (let k = 0; k < 2; k++) { await touch('touchStart', [{ x: cx, y: cy }]); await sleep(40); await touch('touchEnd', []); if (k === 0) await sleep(110) }
  await sleep(120); L.log('after CDP double-tap (120 ms in)', JSON.stringify(await read())); await L.shot(page, '06b-double-tap-120ms')
  await sleep(900); L.log('after 1 s', JSON.stringify(await read()))
  // mouse double click as a desktop user
  await page.mouse.dblclick(cx, cy); await sleep(800); L.log('after mouse dblclick', JSON.stringify(await read()))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
