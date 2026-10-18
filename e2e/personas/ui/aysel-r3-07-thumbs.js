const L = require('./aysel-r3-lib')
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova')
  const reqs = []
  A.page.on('requestfailed', r => reqs.push('FAILED ' + r.url().slice(0, 130)))
  A.page.on('response', r => { if (/storage\/v1\/object|render\/image/.test(r.url()) && r.status() >= 400) reqs.push(r.status() + ' ' + r.url().slice(0, 150)) })
  await A.page.goto(L.CONSUMER + '/notifications'); await A.page.waitForSelector('li'); await A.page.waitForTimeout(3500)
  const rows = await A.page.evaluate(() => [...document.querySelectorAll('li.ntf-li')].slice(0, 12).map(li => {
    const img = li.querySelector('img.ntf-thumb, [class*=thumb] img, img:not([class*=av])'); const th = li.querySelector('[class*=thumb]')
    return { text: li.innerText.replace(/\n+/g, ' ').slice(0, 46), hasThumbBox: !!th, thumbTag: th ? th.tagName + '.' + th.className : null, img: img ? { src: img.currentSrc.slice(-70), complete: img.complete, nw: img.naturalWidth, op: getComputedStyle(img).opacity } : null }
  }))
  rows.forEach(r => L.log(JSON.stringify(r)))
  L.log('failed/4xx image requests:', reqs.length, reqs.slice(0, 5))
  await L.shot(A.page, '07-thumbs')
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
