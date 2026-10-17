const L = require('./aysel-lib')
const step = async (n, fn) => { try { L.log('\n=== ' + n); await fn() } catch (e) { L.log('STEP FAILED', n, String(e.message).split('\n')[0]) } }
;(async () => {
  const b = await L.launch()
  const { page, errors } = await L.phone(b, 'Aysel Məmmədova')
  await page.goto(L.CONSUMER + '/'); await page.waitForSelector('.soc-feed-slot'); await page.waitForTimeout(800)
  await step('Discover tab', async () => {
    const t0 = Date.now()
    await page.getByRole('tab', { name: 'Discover', exact: true }).click()
    await page.waitForSelector('.dsc .dsc-rc, .dsc h2', { timeout: 20000 })
    L.log('discover first section ms', Date.now() - t0)
    await page.waitForTimeout(1500)
    const heads = await page.evaluate(() => [...document.querySelectorAll('.dsc h2, .dsc .dsc-chip, .dsc [role="tab"], .dsc button.dsc-cuisine')].map(e => e.tagName + ':' + e.innerText.trim().replace(/\s+/g, ' ').slice(0, 30)))
    L.log(heads.join(' | '))
    for (let i = 0; i < 8; i++) { await L.shot(page, `05-discover-${i}`); await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.85)); await page.waitForTimeout(700) }
    const secs = await page.evaluate(() => [...document.querySelectorAll('.dsc section')].map(s => (s.querySelector('h2')?.innerText || '?') + ' n=' + s.querySelectorAll('article').length))
    L.log('sections', secs)
    L.log('docHeight', await page.evaluate(() => document.documentElement.scrollHeight))
  })
  L.log('\nerrors', errors)
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
