const L = require('./lib')
;(async () => {
  const s = await L.open({}); const { page } = s
  await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor(); await page.waitForTimeout(2500)
  const imgs = await page.evaluate(() => [...document.querySelectorAll('.soc-feed-slot img')].slice(0, 8).map(i => ({ src: i.currentSrc, loading: i.loading, fp: i.getAttribute('fetchpriority'), srcset: !!i.srcset, w: i.getAttribute('width'), h: i.getAttribute('height'), nat: i.naturalWidth + 'x' + i.naturalHeight, shown: Math.round(i.getBoundingClientRect().width) + 'x' + Math.round(i.getBoundingClientRect().height), alt: (i.alt || '').slice(0, 20) })))
  for (const i of imgs) {
    let kb = null
    try { const r = await page.request.get(i.src); kb = Math.round((await r.body()).length / 1024) } catch { }
    console.log([i.nat, 'shown', i.shown, 'loading=' + i.loading, 'fp=' + i.fp, 'srcset=' + i.srcset, 'wh=' + i.w + 'x' + i.h, kb + ' kB', i.src.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '').slice(-34)].join(' | '))
  }
  await s.close()
})()
