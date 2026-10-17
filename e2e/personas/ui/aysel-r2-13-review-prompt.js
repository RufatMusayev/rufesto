const L = require('./aysel-r2-lib')
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova')
  await A.page.goto(L.CONSUMER + '/profile'); await A.page.waitForTimeout(2500)
  await A.page.getByRole('tab', { name: /Visits/ }).or(A.page.getByRole('button', { name: /Visits/ })).first().click(); await A.page.waitForTimeout(1200)
  const rows = await A.page.evaluate(() => [...document.querySelectorAll('a[href^="/receipt/"]')].map(a => a.getAttribute('href')))
  L.log('visit receipts:', rows.length)
  for (const href of rows.slice(0, 10)) {
    await A.page.goto(L.CONSUMER + href); await A.page.waitForTimeout(1800)
    const info = await A.page.evaluate(() => {
      const prompt = [...document.querySelectorAll('button')].filter(b => /^Rate .*: \d of 5$/.test(b.getAttribute('aria-label') || ''))
      const dishes = [...new Set(prompt.map(b => b.getAttribute('aria-label').replace(/^Rate (.*): \d of 5$/, '$1')))]
      return { dishes, lefts: dishes.map(d => Math.round(prompt.find(b => b.getAttribute('aria-label').startsWith('Rate ' + d + ':')).getBoundingClientRect().left)), tops: dishes.map(d => Math.round(prompt.find(b => b.getAttribute('aria-label').startsWith('Rate ' + d + ':')).getBoundingClientRect().top)) }
    })
    L.log(href.slice(-8), JSON.stringify(info))
    if (info.dishes.length >= 2) { const first = A.page.locator('button[aria-label^="Rate "]').first(); await first.scrollIntoViewIfNeeded(); await L.shot(A.page, '13-review-prompt-multi'); L.log('shot saved for multi-dish prompt'); break }
  }
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
