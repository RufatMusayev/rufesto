const L = require('./aysel-lib')
;(async () => {
  const b = await L.launch()
  // OS prefers light, nothing stored
  const A = await L.phone(b, 'Aysel Məmmədova', { colorScheme: 'light' })
  await A.page.goto(L.CONSUMER + '/'); await A.page.waitForSelector('.soc-feed-slot article')
  L.log('OS=light, first visit -> data-theme =', await A.page.evaluate(() => document.documentElement.getAttribute('data-theme')))
  const btn = A.page.getByRole('button', { name: /Toggle theme/i })
  const t0 = Date.now()
  await btn.click(); await A.page.waitForTimeout(400)
  L.log('after toggle:', await A.page.evaluate(() => document.documentElement.getAttribute('data-theme')), 'bg', await A.page.evaluate(() => getComputedStyle(document.body).backgroundColor))
  await A.page.reload(); await A.page.waitForSelector('.soc-feed-slot article')
  L.log('after reload:', await A.page.evaluate(() => document.documentElement.getAttribute('data-theme')))
  // flash of wrong theme on load? record first paint theme
  const A2 = await L.phone(b, 'Aysel Məmmədova', { storage: { rufesto_theme: 'light' } })
  await A2.ctx.addInitScript(() => { window.__themes = []; new MutationObserver(() => window.__themes.push(document.documentElement.getAttribute('data-theme') + '@' + Math.round(performance.now()))).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); window.__themes.push('init:' + document.documentElement.getAttribute('data-theme')) })
  await A2.page.goto(L.CONSUMER + '/'); await A2.page.waitForSelector('.soc-feed-slot article')
  L.log('theme attribute timeline with stored light:', JSON.stringify(await A2.page.evaluate(() => window.__themes)))
  // meta theme-color
  L.log('meta theme-color', await A2.page.evaluate(() => document.querySelector('meta[name=theme-color]')?.content))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
