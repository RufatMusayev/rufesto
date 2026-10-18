const L = require('./aysel-r3-lib')
;(async () => {
  const b = await L.launch()
  for (const thr of [false, true]) {
    const A = await L.phone(b, 'Aysel Məmmədova')
    const cdp = await A.ctx.newCDPSession(A.page)
    await cdp.send('Network.enable')
    if (thr) { await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 }) }
    const reqs = new Map()
    cdp.on('Network.requestWillBeSent', e => reqs.set(e.requestId, { url: e.request.url, type: e.type, bytes: 0 }))
    cdp.on('Network.loadingFinished', e => { const r = reqs.get(e.requestId); if (r) r.bytes = e.encodedDataLength })
    await A.page.goto(L.CONSUMER + '/explore', { timeout: 90000 })
    const t = await A.page.evaluate(() => new Promise(res => { const t0 = performance.now(); let firstRows = null; const tick = () => { const rows = document.querySelectorAll('.sr-row'); if (rows.length > 3 && firstRows == null) firstRows = performance.now(); const imgs = [...document.querySelectorAll('.sr-row img, .sr-chip img')]; const done = imgs.length && imgs.every(i => i.complete && i.naturalWidth > 0); if (done || performance.now() - t0 > 60000) return res({ rows: firstRows, allThumbs: done ? performance.now() : null, n: imgs.length }); requestAnimationFrame(tick) }; tick() }))
    await A.page.waitForTimeout(1500)
    const imgs = [...reqs.values()].filter(r => r.type === 'Image')
    const dims = await A.page.evaluate(() => [...document.querySelectorAll('.sr-row img')].slice(0, 3).map(i => i.naturalWidth + 'x' + i.naturalHeight + ' shown ' + Math.round(i.getBoundingClientRect().width) + 'x' + Math.round(i.getBoundingClientRect().height)))
    L.log(thr ? 'PHONE' : 'PC', '| rows painted', Math.round(t.rows), 'ms | all', t.n, 'thumbnails loaded', t.allThumbs ? Math.round(t.allThumbs) + ' ms' : 'NOT in 60 s', '| image bytes', Math.round(imgs.reduce((s, r) => s + r.bytes, 0) / 1024), 'KB in', imgs.length, 'requests | e.g.', dims.join(' ; '))
    await A.ctx.close()
  }
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
