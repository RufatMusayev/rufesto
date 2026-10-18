const L = require('./aysel-r3-lib')
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova')
  await A.page.goto(L.CONSUMER + '/'); await A.page.waitForSelector('article'); await A.page.waitForTimeout(2000)
  L.log(await A.page.evaluate(() => ({
    slotArticle: !!document.querySelector('.soc-feed-slot article'), slots: document.querySelectorAll('.soc-feed-slot').length, photoImg: !!document.querySelector('.soc-feed-slot article .soc-photo img'),
    firstPhotoSrc: (document.querySelector('.soc-photo img')?.currentSrc || '').slice(-60), firstImgClasses: document.querySelector('.soc-photo img')?.className,
    tabs: [...document.querySelectorAll('[role=tab]')].map(t => t.innerText.trim()), navLinks: [...document.querySelectorAll('.bottom-nav a, nav a')].map(a => a.getAttribute('href') + ' ' + (a.getAttribute('aria-label') || a.innerText.trim())),
  })))
  await A.page.goto(L.CONSUMER + '/explore'); await A.page.waitForTimeout(2500)
  L.log('explore place row classes:', await A.page.evaluate(() => [...document.querySelectorAll('[class*=sr-row]')].slice(0, 3).map(r => r.tagName + '.' + r.className + ' href=' + (r.getAttribute('href') || r.querySelector('a')?.getAttribute('href')))))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
