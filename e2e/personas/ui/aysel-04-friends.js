const L = require('./aysel-lib')
const step = async (n, fn) => { try { L.log('\n=== ' + n); await fn() } catch (e) { L.log('STEP FAILED', n, String(e.message).split('\n')[0]) } }
;(async () => {
  const b = await L.launch()
  const { page, errors } = await L.phone(b, 'Aysel Məmmədova')
  await page.goto(L.CONSUMER + '/'); await page.waitForSelector('.soc-feed-slot'); await page.waitForTimeout(1000)
  await step('Friends tab', async () => {
    const t0 = Date.now()
    await page.getByRole('tab', { name: 'Friends', exact: true }).click()
    await page.waitForSelector('.soc-feed:visible h3.soc-day, .soc-feed:visible article', { timeout: 15000 })
    L.log('friends first content ms', Date.now() - t0)
    await page.waitForTimeout(800)
    for (let i = 0; i < 4; i++) { await L.shot(page, `04-friends-${i}`); await page.evaluate(() => window.scrollBy(0, window.innerHeight * 0.9)); await page.waitForTimeout(700) }
    const rows = await page.evaluate(() => [...document.querySelectorAll('.soc-feed:not([hidden]) h3.soc-day, .soc-feed:not([hidden]) article')].filter(e => e.offsetParent !== null).map(e => e.tagName === 'H3' ? '## ' + e.innerText : '   ' + (e.querySelector('.soc-post-name')?.innerText || '') + ' | ' + (e.querySelector('.soc-post-time')?.innerText || '') + ' | ' + (e.querySelector('.soc-post-where')?.innerText || e.querySelector('.soc-chip-text')?.innerText || '') + ' | ' + (e.querySelector('.soc-caption')?.innerText || '').slice(0, 50).replace(/\s+/g, ' ') + ' | ' + (e.className.includes('review') ? 'review' : '')))
    rows.forEach(r => L.log(r))
    L.log('rows', rows.length)
  })
  await step('open a friend post + comments', async () => {
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(500)
    const first = page.locator('.soc-feed:visible article').filter({ hasText: 'Könül' }).first()
    await first.scrollIntoViewIfNeeded()
    const link = first.locator('a[aria-label="Comments"]')
    L.log('comment link count', await link.count())
    if (await link.count()) { await link.click(); await page.waitForSelector('.soc-composer-input'); await page.waitForTimeout(800); await L.shot(page, '04-friend-post'); L.log((await page.evaluate(() => document.body.innerText)).slice(0, 800)) }
  })
  L.log('\nerrors', errors)
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
