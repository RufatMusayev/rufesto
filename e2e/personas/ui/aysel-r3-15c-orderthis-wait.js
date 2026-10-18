const L = require('./aysel-r3-lib')
const sleep = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova')
  const cdp = await A.ctx.newCDPSession(A.page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })
  await A.page.goto(L.CONSUMER + '/', { timeout: 90000 }); await A.page.waitForSelector('article', { timeout: 60000 }); await sleep(1500)
  await A.page.getByRole('link', { name: 'Order this' }).first().click()
  for (const ms of [600, 1600, 3000]) { await sleep(ms === 600 ? 600 : ms === 1600 ? 1000 : 1400); await L.shot(A.page, '15c-orderthis-wait-' + ms); L.log('t+' + ms + ' ms:', JSON.stringify(await A.page.evaluate(() => ({ path: location.pathname, panel: !!document.querySelector('.bs-panel'), h1: document.querySelector('h1')?.innerText, skeleton: document.querySelectorAll('[class*=skel]').length, text: document.body.innerText.replace(/\n+/g, ' | ').slice(0, 90) })))) }
  await sleep(4000); L.log('t+8 s panel:', await A.page.locator('.bs-panel').count())
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
