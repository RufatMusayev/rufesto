const L = require('./aysel-lib')
const step = async (n, fn) => { try { L.log('\n=== ' + n); await fn() } catch (e) { L.log('STEP FAILED', n, String(e.message).split('\n')[0]) } }
const CODE = process.argv[2] || 'FINCAN-CEA5NX'
;(async () => {
  const b = await L.launch()
  const { page, errors } = await L.phone(b, 'Aysel Məmmədova')
  await step('scan /t/<code>', async () => {
    const t0 = Date.now()
    await page.goto(L.CONSUMER + '/t/' + CODE)
    await page.waitForTimeout(2500)
    L.log('ms', Date.now() - t0)
    await L.shot(page, '08-scan')
    L.log((await page.evaluate(() => document.body.innerText)).slice(0, 500))
    L.log('buttons', await page.evaluate(() => [...document.querySelectorAll('button,a')].filter(e => e.offsetParent).map(e => (e.innerText || e.getAttribute('aria-label') || '').trim()).filter(Boolean).slice(0, 20)))
    await page.getByRole('button', { name: 'Join', exact: true }).click()
    await page.waitForTimeout(2500)
    await L.shot(page, '08-joined')
    L.log('URL', page.url().replace(L.CONSUMER, ''))
    L.log((await page.evaluate(() => document.body.innerText)).slice(0, 700))
  })
  L.log('\nerrors', errors)
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
