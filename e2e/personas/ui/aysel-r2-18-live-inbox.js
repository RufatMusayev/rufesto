const L = require('./aysel-r2-lib')
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova')
  await A.page.goto(L.CONSUMER + '/notifications'); await A.page.waitForSelector('li.ntf-li'); await A.page.waitForTimeout(2000)
  const top = () => A.page.evaluate(() => [...document.querySelectorAll('li.ntf-li')].slice(0, 2).map(li => li.innerText.replace(/\n+/g, ' | ')))
  L.log('inbox top before:', await top())
  const K = await L.phone(b, 'Kamilla Rəsulova', { storage: { rufesto_home_tab: 'friends' } })
  await K.page.goto(L.CONSUMER + '/'); await K.page.waitForSelector('.soc-feed article'); await K.page.waitForTimeout(1500)
  const post = K.page.locator('.soc-feed article').filter({ hasText: 'Second round at Fincan' }).first()
  await post.scrollIntoViewIfNeeded()
  const t0 = Date.now()
  await post.getByRole('button', { name: 'Like', exact: true }).click()
  let seen = null
  for (let i = 0; i < 60; i++) { await A.page.waitForTimeout(250); const t = await top(); if (t.some(x => /Kamilla/.test(x))) { seen = Date.now() - t0; L.log('live update after', seen, 'ms:', t); break } }
  if (seen == null) L.log('NO live update in 15 s; top now:', await top())
  await L.shot(A.page, '18-inbox-live')
  L.log('bell on this page:', await A.page.evaluate(() => document.querySelector('[aria-label*="otification" i]')?.getAttribute('aria-label')))
  // unlike so the data stays tidy
  await post.getByRole('button', { name: /Remove like|Unlike/i }).click().catch(() => {})
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
