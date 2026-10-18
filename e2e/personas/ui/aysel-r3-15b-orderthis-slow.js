const L = require('./aysel-r3-lib')
const sleep = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova')
  const cdp = await A.ctx.newCDPSession(A.page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })
  const reqs = []
  A.page.on('response', async r => { if (/rpc\/dish_reviews|rpc\/restaurant_menu/.test(r.url())) reqs.push(r.url().split('/').pop() + ' ' + r.status() + ' t=' + Math.round(performance.now())) })
  A.page.on('requestfailed', r => reqs.push('FAILED ' + r.url().split('/').pop().slice(0, 40)))
  await A.page.goto(L.CONSUMER + '/', { timeout: 90000 }); await A.page.waitForSelector('article', { timeout: 60000 }); await sleep(4000)
  const t0 = Date.now()
  await A.page.getByRole('link', { name: 'Order this' }).first().click()
  for (const s of [1, 2, 3, 5, 8, 12, 20]) {
    await sleep(Math.max(0, s * 1000 - (Date.now() - t0)))
    L.log('t+' + s + 's:', JSON.stringify(await A.page.evaluate(() => ({ url: location.search.slice(0, 50), panel: !!document.querySelector('.bs-panel'), title: (document.querySelector('.dds-titlerow')?.innerText || '').replace(/\n+/g, ' ').slice(0, 24), reviews: (document.querySelector('.rv-section')?.innerText || '(no section)').replace(/\n+/g, ' | ').slice(0, 70), skeletons: document.querySelectorAll('.rv-section [class*=skel]').length }))))
  }
  L.log(reqs)
  await L.shot(A.page, '15b-orderthis-slow-20s')
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
