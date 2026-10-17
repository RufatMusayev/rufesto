const L = require('./aysel-lib')
const step = async (n, fn) => { try { L.log('\n=== ' + n); await fn() } catch (e) { L.log('STEP FAILED', n, String(e.message).split('\n')[0]) } }
const card = (page, text) => page.locator('.soc-feed-slot').filter({ hasText: text }).first()
;(async () => {
  const b = await L.launch()
  const { page, errors } = await L.phone(b, 'Aysel Məmmədova')
  await page.goto(L.CONSUMER + '/'); await page.waitForSelector('.soc-feed-slot'); await page.waitForTimeout(1200)

  await step('page 2 load by scrolling', async () => {
    const t0 = Date.now()
    let n = await page.locator('.soc-feed-slot').count()
    for (let i = 0; i < 60; i++) {
      await page.evaluate(() => window.scrollBy(0, 1400)); await page.waitForTimeout(350)
      const c = await page.locator('.soc-feed-slot').count()
      if (c > n) { L.log('grew', n, '->', c, 'after', Date.now() - t0, 'ms and', i + 1, 'scroll steps'); n = c; break }
    }
    await L.shot(page, '02-home-page2-viewport')
    // scroll to the bottom completely
    for (let i = 0; i < 40; i++) { await page.evaluate(() => window.scrollBy(0, 2000)); await page.waitForTimeout(250) }
    L.log('slots after full scroll', await page.locator('.soc-feed-slot').count(), 'caught up?', await page.getByText("You're all caught up").count(), 'load more?', await page.getByRole('button', { name: 'Load more' }).count())
    await L.shot(page, '02-home-bottom')
  })

  await step('like a friend post (Könül, Bella Roma, 14h)', async () => {
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(500)
    const c = card(page, 'Könül Həsənova Bu gün Trattoria Bella Roma-də Cappuccino')
    await c.scrollIntoViewIfNeeded()
    await L.shot(page, '02-like-before')
    const btn = c.getByRole('button', { name: 'Like', exact: true })
    L.log('like btn count', await btn.count())
    const box = await btn.boundingBox(); L.log('like btn box', JSON.stringify(box))
    const before = (await c.locator('.soc-act-likes').innerText().catch(() => '(none)'))
    await btn.click(); await page.waitForTimeout(700)
    L.log('likes text', before, '->', await c.locator('.soc-act-likes').innerText().catch(() => '(none)'), 'pressed', await c.getByRole('button', { name: 'Unlike' }).count())
    await L.shot(page, '02-like-after')
  })

  await step('comment on a friend post (Səbinə tiramisu)', async () => {
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400)
    const c = card(page, 'Səbinə İbrahimova Şirniyyat')
    await c.scrollIntoViewIfNeeded()
    const t0 = Date.now()
    await c.locator('a[aria-label="Comments"]').click()
    await page.waitForURL(/\/post\//); await page.waitForSelector('.soc-composer-input')
    L.log('post page open ms', Date.now() - t0)
    await L.shot(page, '02-post-page')
    L.log((await page.evaluate(() => document.body.innerText)).slice(0, 700))
    await page.locator('.soc-composer-input').click()
    await page.locator('.soc-composer-input').fill('Looks so good! Tiramisù at Bella Roma is the best 😍')
    await L.shot(page, '02-comment-typed')
    await page.getByRole('button', { name: 'Send' }).click()
    await page.waitForTimeout(1200)
    await L.shot(page, '02-comment-sent')
    L.log('after send:', (await page.evaluate(() => document.body.innerText)).slice(0, 700))
    await page.goBack(); await page.waitForTimeout(1200)
    const c2 = card(page, 'Səbinə İbrahimova Şirniyyat')
    L.log('home card after returning: ', (await c2.innerText()).replace(/\s+/g, ' ').slice(-120))
    await L.shot(page, '02-back-home')
  })

  await step('Order this (Bella Roma post)', async () => {
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400)
    const c = card(page, 'Trattoria Bella Roma Today')
    await c.scrollIntoViewIfNeeded()
    await L.shot(page, '02-order-card')
    const t0 = Date.now()
    await c.getByRole('link', { name: 'Order this' }).click()
    await page.waitForURL(/dish=/)
    L.log('url', page.url().replace(L.CONSUMER, ''))
    await page.waitForSelector('.dish-sheet, [role="dialog"], .sheet', { timeout: 15000 }).catch(() => L.log('no sheet selector found'))
    L.log('sheet visible ms', Date.now() - t0)
    await page.waitForTimeout(800)
    await L.shot(page, '02-dish-sheet')
    L.log((await page.evaluate(() => document.body.innerText)).slice(0, 900))
  })
  L.log('\nerrors', errors)
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
