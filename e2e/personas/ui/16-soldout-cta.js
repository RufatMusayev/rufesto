'use strict'
// A post whose tagged dish is sold out: does the Home card still offer "Order this", and what happens on tap? (dish switched off/on by API as Leyla, restored in finally)
const C = require('./common')
const DISH = 'Pizza Margherita'   // tagged on Leyla's post

;(async () => {
  const browser = await C.launch()
  const sink = []
  const lapi = C.makeApi(await C.login('Leyla'))
  const [d] = await lapi.rows(`dishes?restaurant_id=eq.${C.BELLA}&name=eq.${encodeURIComponent(DISH)}&select=id,available`)
  try {
    await lapi.patch(`dishes?id=eq.${d.id}`, { available: false })
    const V = await C.open(browser, 'anon', { geo: true, sink })
    const { page } = V
    await page.goto(C.CONSUMER + '/', { waitUntil: 'domcontentloaded' })
    const post = page.locator('article', { hasText: 'Pizza Margherita' }).filter({ hasText: 'Terrace tables' }).first()
    await post.waitFor({ timeout: 15_000 })
    console.log('card:', (await post.innerText()).split('\n').join(' | ').slice(0, 220))
    await post.scrollIntoViewIfNeeded()
    await post.screenshot({ path: C.OUT + '/95-home-post-soldout-dish.png' })
    const btn = post.getByRole('button', { name: /order this/i }).or(post.getByText('Order this')).first()
    console.log('Order this present?', await btn.count(), 'disabled?', await btn.isDisabled().catch(() => 'n/a'))
    await btn.click()
    await page.waitForTimeout(2500)
    console.log('after tap -> url', page.url())
    await C.shot(page, '96-order-this-on-soldout', { full: false })
    const sheet = await page.locator('.overlay, [role=dialog]').first().innerText().catch(() => '(no sheet)')
    console.log('sheet/dialog text:', sheet.split('\n').join(' | ').slice(0, 300))
    console.log('Add to order button enabled?', await page.getByRole('button', { name: /^Add to Order/ }).isEnabled().catch(() => 'no such button'))
  } finally {
    await lapi.patch(`dishes?id=eq.${d.id}`, { available: true })
    console.log('dish restored')
  }
  console.log('problems:', JSON.stringify(sink.map(s => `${s.stage} ${s.who} ${s.kind} ${s.text}`), null, 1))
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
