const L = require('./aysel-r3-lib')
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova')
  const page = A.page
  await page.goto(L.CONSUMER + '/restaurant/bella-roma?tab=menu'); await page.waitForSelector('.mn-row'); await page.waitForTimeout(1500)
  for (const n of [19, 4, 13]) {
    await page.locator('.mn-row-btn').nth(n).scrollIntoViewIfNeeded()
    await page.evaluate(() => { window.__tl = []; const t0 = performance.now(); document.addEventListener('click', () => { window.__t0 = performance.now() }, { capture: true, once: true }); const tick = () => { const s = document.querySelector('.rv-section'); if (window.__t0 && s) { const txt = s.innerText.replace(/\n+/g, ' | ').slice(0, 60); const sk = s.querySelectorAll('[class*=skel]').length; const last = window.__tl[window.__tl.length - 1]; const key = txt + '#' + sk; if (!last || last.key !== key) window.__tl.push({ key, ms: Math.round(performance.now() - window.__t0), txt, skeletons: sk }) } if (performance.now() - (window.__t0 || t0) < 6000) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })
    await page.locator('.mn-row-btn').nth(n).click(); await page.waitForTimeout(3500)
    const title = await page.evaluate(() => document.querySelector('.dds-titlerow')?.innerText.replace(/\n+/g, ' ').slice(0, 24))
    L.log(n, title, JSON.stringify(await page.evaluate(() => window.__tl.map(x => x.ms + 'ms: ' + x.txt + (x.skeletons ? ' [' + x.skeletons + ' skeleton]' : '')))))
    await page.keyboard.press('Escape'); await page.waitForTimeout(700)
  }
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
