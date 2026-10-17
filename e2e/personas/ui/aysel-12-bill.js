const L = require('./aysel-lib')
const step = async (n, fn) => { try { L.log('\n=== ' + n); await fn() } catch (e) { L.log('STEP FAILED', n, String(e.message).split('\n')[0]) } }
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova')
  await A.page.goto(L.CONSUMER + '/bill'); await A.page.waitForTimeout(2500)
  await step('choose card', async () => {
    await A.page.evaluate(() => window.scrollBy(0, 300)); await A.page.waitForTimeout(300)
    await A.page.locator('button.bl-option').nth(1).click({ timeout: 8000 }); await A.page.waitForTimeout(900)
    await L.shot(A.page, '12-bill-card')
    L.log((await A.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(300, 1500))
    L.log('buttons', await A.page.evaluate(() => [...document.querySelectorAll('button,a,input')].filter(e => e.offsetParent).map(e => ((e.innerText || e.getAttribute('aria-label') || e.placeholder || '').trim().replace(/\n+/g,' ').slice(0, 40)) + ' h=' + Math.round(e.getBoundingClientRect().height)).filter(Boolean)))
  })
  L.log('errors', A.errors)
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
