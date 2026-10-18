// Round 3: dish sheet photo double-tap (plan 7.6 #4) and the same dish sheet signed out (plan 7.6 #3). Cleans up its own like.
const L = require('./aysel-r3-lib')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const DISH = '/restaurant/bella-roma?tab=menu&dish=80000001-0000-0000-0000-000000000009'
;(async () => {
  const b = await L.launch()
  await L.step('dish sheet photo double-tap', async () => {
    const A = await L.phone(b, 'Aysel Məmmədova'); const page = A.page
    const cdp = await A.ctx.newCDPSession(page); const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
    await page.goto(L.CONSUMER + DISH); await page.waitForSelector('.bs-panel .dds-photo'); await sleep(1500)
    const box = await page.locator('.bs-panel .dds-photo').first().boundingBox(); const cx = Math.round(box.x + box.width / 2), cy = Math.round(box.y + box.height / 2)
    const read = () => page.evaluate(() => { const p = document.querySelector('.bs-panel'); const pill = [...p.querySelectorAll('.dds-pill')][0]; return { label: pill.getAttribute('aria-label'), pressed: pill.getAttribute('aria-pressed'), text: pill.innerText.trim(), burst: !!p.querySelector('[class*=burst]') } })
    const dbl = async () => { for (let k = 0; k < 2; k++) { await touch('touchStart', [{ x: cx, y: cy }]); await sleep(40); await touch('touchEnd', []); if (k === 0) await sleep(110) } }
    L.log('before', JSON.stringify(await read()))
    await dbl(); await sleep(150); L.log('150 ms after the double-tap', JSON.stringify(await read())); await sleep(1100)
    L.log('after 1.2 s', JSON.stringify(await read()))
    await dbl(); await sleep(1200); L.log('after the 2nd double-tap (must stay liked)', JSON.stringify(await read()))
    const pill = page.locator('.bs-panel .dds-pill').first()
    if ((await pill.getAttribute('aria-pressed')) === 'true') { await pill.click(); await sleep(900); L.log('cleanup: unliked ->', JSON.stringify(await read())) }
    await A.ctx.close()
  })
  await L.step('signed out: same dish sheet', async () => {
    const ctx = await b.newContext({ ...L.devices['Pixel 7'], colorScheme: 'dark' }); const page = await ctx.newPage()
    await page.goto(L.CONSUMER + DISH); await page.waitForSelector('.bs-panel .dds-photo', { timeout: 20000 }); await sleep(2500)
    L.log('signed-out sheet:', (await page.evaluate(() => document.querySelector('.bs-panel').innerText)).replace(/\n+/g, ' | ').slice(0, 330))
    await L.shot(page, '27-dish-signed-out')
    await ctx.close()
  })
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
