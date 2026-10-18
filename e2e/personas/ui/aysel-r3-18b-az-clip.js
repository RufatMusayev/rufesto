const L = require('./aysel-r3-lib')
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova', { lang: 'az' })
  await A.page.goto(L.CONSUMER + '/restaurant/bella-roma?tab=menu&dish=80000001-0000-0000-0000-000000000009'); await A.page.waitForTimeout(3500)
  L.log(await A.page.evaluate(() => [...document.querySelectorAll('.bs-panel *')].filter(e => e.offsetParent && e.children.length < 3 && e.scrollWidth > e.clientWidth + 2 && ['hidden', 'clip'].includes(getComputedStyle(e).overflowX) && (e.innerText || '').trim()).slice(0, 18).map(e => e.tagName + '.' + (e.className || '').toString().split(' ')[0] + ' "' + e.innerText.trim().slice(0, 24) + '" sw=' + e.scrollWidth + ' cw=' + e.clientWidth + ' ell=' + getComputedStyle(e).textOverflow)))
  await L.shot(A.page, '18b-az-dish-sheet')
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
