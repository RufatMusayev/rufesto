// Page weight audit: bytes on the wire per page (CDP encodedDataLength) and image natural vs displayed size.
const L = require('./aysel-lib')

async function audit(b, label, path, { scroll = 0, tab = null } = {}) {
  const A = await L.phone(b, 'Aysel Məmmədova', tab ? { storage: { rufesto_home_tab: tab } } : {})
  const cdp = await A.ctx.newCDPSession(A.page)
  await cdp.send('Network.enable')
  const reqs = new Map()
  cdp.on('Network.requestWillBeSent', e => reqs.set(e.requestId, { url: e.request.url, type: e.type, bytes: 0 }))
  cdp.on('Network.loadingFinished', e => { const r = reqs.get(e.requestId); if (r) r.bytes = e.encodedDataLength })
  await A.page.goto(L.CONSUMER + path)
  await A.page.waitForTimeout(4500)
  for (let i = 0; i < scroll; i++) { await A.page.evaluate(() => window.scrollBy(0, 1400)); await A.page.waitForTimeout(500) }
  await A.page.waitForTimeout(1500)
  const list = [...reqs.values()]
  const by = t => list.filter(r => r.type === t)
  const sum = a => a.reduce((s, r) => s + r.bytes, 0)
  const kb = n => Math.round(n / 1024)
  const imgs = await A.page.evaluate(() => [...document.images].filter(i => i.complete && i.naturalWidth).map(i => ({ src: i.currentSrc, nw: i.naturalWidth, nh: i.naturalHeight, w: Math.round(i.getBoundingClientRect().width), h: Math.round(i.getBoundingClientRect().height) })))
  L.log(`\n### ${label}  ${path}`)
  L.log('total', kb(sum(list)), 'KB in', list.length, 'requests | JS', kb(sum(by('Script'))), 'KB (' + by('Script').length + ') | CSS', kb(sum(by('Stylesheet'))), 'KB | images', kb(sum(by('Image'))), 'KB (' + by('Image').length + ') | fetch/xhr', kb(sum(by('Fetch')) + sum(by('XHR'))), 'KB (' + (by('Fetch').length + by('XHR').length) + ') | fonts', kb(sum(by('Font'))), 'KB')
  const top = by('Image').sort((a, b2) => b2.bytes - a.bytes).slice(0, 5)
  L.log('biggest images:'); top.forEach(r => L.log('  ', kb(r.bytes), 'KB', r.url.replace(/^https?:\/\/[^/]+/, '').slice(0, 90)))
  const over = imgs.filter(i => i.nw > i.w * 2.7 && i.w > 30).length
  L.log('images in DOM', imgs.length, '| natural width > 2.7x displayed (oversized for a 2.6x phone):', over)
  const ex = imgs.sort((a, b2) => b2.nw * b2.nh - a.nw * a.nh).slice(0, 3).map(i => `${i.nw}x${i.nh} shown ${i.w}x${i.h}`)
  L.log('largest natural:', ex.join(' | '))
  const dupes = {}; for (const r of by('Image')) dupes[r.url] = (dupes[r.url] || 0) + 1
  L.log('image URLs requested more than once:', Object.values(dupes).filter(n => n > 1).length)
  await A.ctx.close()
}

;(async () => {
  const b = await L.launch()
  await audit(b, 'Home cold, first page', '/')
  await audit(b, 'Home after 6 scroll steps', '/', { scroll: 6 })
  await audit(b, 'Discover', '/', { tab: 'discover' })
  await audit(b, 'Restaurant (Fincan, 25 dishes)', '/restaurant/fincan-coffee', { scroll: 3 })
  await audit(b, 'Restaurant (Bella Roma)', '/restaurant/bella-roma', { scroll: 3 })
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
