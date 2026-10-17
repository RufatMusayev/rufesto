// Persona A: signed-out visitor, Pixel 7. Home / Discover / restaurant / dish / like -> sign-in prompt.
// node personas/ui/newcomer-anon.js   -> screenshots tour-out/personas/newcomer/A-*.png, results/anon.json
const L = require('./lib')
const out = {}
const note = (k, v) => { out[k] = v; console.log('##', k, typeof v === 'string' ? v : JSON.stringify(v)) }

async function homeInventory(page) {
  return page.evaluate(() => [...document.querySelectorAll('.soc-feed-slot')].map((el, i) => {
    const a = el.querySelector('article') || el
    const hdr = el.querySelector('header')
    const imgs = [...el.querySelectorAll('img')]
    return {
      i, kind: /menu-card/.test(a.className) ? 'promo' : 'post',
      head: (hdr ? hdr.innerText : el.innerText).replace(/\s+/g, ' ').slice(0, 70),
      imgsNoAltAttr: imgs.filter(m => m.getAttribute('alt') === null).length,
      h: Math.round(el.getBoundingClientRect().height),
    }
  }))
}

;(async () => {
  const s = await L.open({})
  const { page, watch } = s
  try {
    // ---------------------------------------------------------------- Home
    const t0 = Date.now()
    await page.goto(L.BASE + '/', { waitUntil: 'load' })
    await page.locator('.soc-feed-slot').first().waitFor({ timeout: 20000 })
    note('home_first_card_ms', Date.now() - t0)
    await page.waitForTimeout(1500)
    await L.shot(page, 'A01-home-signedout-top')
    for (const [i, y] of [[1, 900], [2, 1800], [3, 3400]]) {
      await page.evaluate(yy => window.scrollTo(0, yy), y); await page.waitForTimeout(700)
      await L.shot(page, `A02-home-scroll-${i}`)
    }
    let rounds = 0
    for (; rounds < 30; rounds++) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(900)
      if (await page.getByText("You're all caught up").count()) break
    }
    await page.waitForTimeout(800)
    const inv = await homeInventory(page)
    note('home_items_total', inv.length)
    note('home_paging_rounds', rounds)
    note('home_promo_positions', inv.filter(x => x.kind === 'promo').map(x => x.i))
    note('home_inventory', inv.map(x => `${x.i}:${x.kind}:${x.head}`))
    note('home_caught_up', await page.getByText("You're all caught up").count())
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(500)
    await L.shot(page, 'A03-home-end')
    note('home_end_text', await page.evaluate(() => (document.querySelector('.soc-caught') || {}).innerText || 'none'))
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(500)
    await page.locator('.soc-feed-slot').first().getByRole('button', { name: 'Like' }).click()
    await page.waitForTimeout(800)
    await L.shot(page, 'A04-home-like-signin-prompt')
    note('like_prompt_text', await page.evaluate(() => (document.querySelector('[role=dialog], .modal, .sheet, [class*=auth]') || { innerText: 'NO DIALOG' }).innerText.replace(/\s+/g, ' ').slice(0, 300)))
    await page.keyboard.press('Escape'); await page.waitForTimeout(400)
    note('prompt_closed_by_escape', (await page.locator('[role=dialog]').count()) === 0)
    await page.reload({ waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor()
    const order = page.getByRole('button', { name: /Order this/ }).or(page.getByRole('link', { name: /Order this/ })).first()
    if (await order.count()) {
      const label = await order.evaluate(e => e.tagName + ' ' + (e.getAttribute('href') || ''))
      await order.click(); await page.waitForTimeout(1500)
      note('order_this_result', { label, url: page.url().replace(L.BASE, '') })
      await L.shot(page, 'A05-order-this')
      await page.goBack({ waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor()
    }

    // ---------------------------------------------------------------- Friends tab signed out
    await page.getByRole('tab', { name: 'Friends' }).click(); await page.waitForTimeout(1200)
    await L.shot(page, 'A06-friends-signedout')
    note('friends_signedout_text', await page.locator('.soc-feed:visible').first().innerText())

    // ---------------------------------------------------------------- Discover
    await page.getByRole('tab', { name: 'Discover' }).click(); await page.waitForTimeout(2200)
    await L.shot(page, 'A07-discover-top')
    note('discover_sections', await page.evaluate(() => [...document.querySelectorAll('.dsc h2')].map(h => h.innerText)))
    const hs = await page.evaluate(() => [...document.querySelectorAll('.dsc h2')].map(h => Math.round(h.getBoundingClientRect().top + scrollY)))
    for (let k = 0; k < Math.min(hs.length, 7); k++) {
      await page.evaluate(y => window.scrollTo(0, y - 80), hs[k]); await page.waitForTimeout(600)
      await L.shot(page, `A08-discover-section-${k}`)
    }
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.getByRole('button', { name: 'Italian' }).or(page.getByRole('tab', { name: 'Italian' })).first().click()
    await page.waitForTimeout(1800)
    await L.shot(page, 'A09-discover-italian')
    note('discover_italian_sections', await page.evaluate(() => [...document.querySelectorAll('.dsc h2')].map(h => h.innerText)))
    const followBtn = page.locator('.dsc').getByRole('button', { name: /^Follow/ }).first()
    note('discover_follow_buttons', await page.locator('.dsc').getByRole('button', { name: /^Follow/ }).count())
    if (await followBtn.count()) { await followBtn.click(); await page.waitForTimeout(800); await L.shot(page, 'A10-discover-follow-signin'); await page.keyboard.press('Escape'); await page.waitForTimeout(300) }
    await page.getByRole('button', { name: 'All', exact: true }).first().click().catch(() => {}); await page.waitForTimeout(1200)

    // ---------------------------------------------------------------- restaurant page + dish
    await page.goto(L.BASE + '/restaurant/trattoria-bella-roma', { waitUntil: 'load' }).catch(() => {})
    await page.waitForTimeout(2500)
    note('resto_url_after_goto', page.url())
    await L.shot(page, 'A11-restaurant-top')
    note('resto_text', (await L.text(page)).slice(0, 1800))
    await page.evaluate(() => window.scrollTo(0, 900)); await page.waitForTimeout(700)
    await L.shot(page, 'A12-restaurant-scroll')
  } catch (e) { note('ERROR', String(e).slice(0, 500)); await L.shot(page, 'A99-error').catch(() => {}) }
  note('console', watch.console.slice(0, 15)); note('pageErrors', watch.pageErrors); note('badRequests', watch.bad.slice(0, 15))
  L.save('anon', out)
  await s.close()
})()
