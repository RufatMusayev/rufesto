// Misc persona checks: scroll restoration after opening a post, share button, notifications read state, friends page, post menu.
const L = require('./aysel-lib')
const step = async (n, fn) => { try { L.log('\n=== ' + n); await fn() } catch (e) { L.log('STEP FAILED', n, String(e.message).split('\n')[0]) } }
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova')
  await A.ctx.grantPermissions([], { origin: L.CONSUMER })
  const api = await L.api('Aysel Məmmədova')
  await A.page.goto(L.CONSUMER + '/'); await A.page.waitForSelector('.soc-feed-slot article'); await A.page.waitForTimeout(1500)

  await step('scroll restoration after post -> back', async () => {
    // scroll to the 7th card
    const y = await A.page.evaluate(() => { const c = document.querySelectorAll('.soc-feed-slot')[7]; c.scrollIntoView(); return Math.round(scrollY) })
    await A.page.waitForTimeout(800)
    const name = await A.page.evaluate(() => { const c = document.querySelectorAll('.soc-feed-slot')[7]; return c.innerText.replace(/\n+/g, ' ').slice(0, 60) })
    L.log('scrollY before', y, '| card:', name)
    // open comments of any card that has a comment link in the viewport
    const link = A.page.locator('.soc-feed-slot a[aria-label="Comments"], .soc-feed-slot a.soc-viewall').filter({ has: A.page.locator(':scope') }).first()
    await A.page.evaluate(() => { const els = [...document.querySelectorAll('.soc-feed-slot a[aria-label="Comments"]')]; const e = els.find(x => { const r = x.getBoundingClientRect(); return r.top > 0 && r.top < innerHeight }); (e || els[0]).click() })
    await A.page.waitForURL(/\/post\//); await A.page.waitForTimeout(1200)
    await A.page.goBack(); await A.page.waitForTimeout(1500)
    const y2 = await A.page.evaluate(() => Math.round(scrollY))
    L.log('scrollY after back', y2, y2 < y - 400 ? 'LOST (scrolled back to top / far off)' : 'restored')
    await L.shot(A.page, '22-after-back')
  })

  await step('share button', async () => {
    await A.page.evaluate(() => window.scrollTo(0, 0)); await A.page.waitForTimeout(500)
    await A.page.evaluate(() => { window.__shared = null; navigator.clipboard && (navigator.clipboard.writeText = async t => { window.__shared = 'clip:' + t }); })
    const btn = A.page.locator('.soc-feed-slot button[aria-label="Share"]').first()
    await btn.click(); await A.page.waitForTimeout(900)
    await L.shot(A.page, '22-share')
    L.log('shared:', await A.page.evaluate(() => window.__shared), '| toast/status:', await A.page.evaluate(() => [...document.querySelectorAll('[role=status],[role=alert],.toast,.soc-toast')].map(e => e.innerText).join(' / ')))
  })

  await step('post options menu (own post)', async () => {
    await A.page.locator('.soc-feed-slot button[aria-label="Post options"]').first().click(); await A.page.waitForTimeout(600)
    await L.shot(A.page, '22-post-menu')
    L.log((await A.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(-300))
    await A.page.keyboard.press('Escape'); await A.page.waitForTimeout(300)
  })

  await step('notifications', async () => {
    const before = await api.get('notifications?select=id&user_id=eq.' + api.uid + '&read=eq.false')
    L.log('unread before:', Array.isArray(before) ? before.length : before)
    await A.page.goto(L.CONSUMER + '/notifications'); await A.page.waitForTimeout(3000)
    await L.shot(A.page, '22-notifications')
    L.log((await A.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 900))
    const after = await api.get('notifications?select=id&user_id=eq.' + api.uid + '&read=eq.false')
    L.log('unread after opening list:', Array.isArray(after) ? after.length : after, '| bell badge:', await A.page.evaluate(() => document.querySelector('[aria-label*="otification"]')?.innerText))
    // tap the first notification
    const first = A.page.locator('main a, .notif-item, [class*="notif"] a').first()
    L.log('first notif tag', await first.evaluate(e => e.outerHTML.slice(0, 160)).catch(() => 'none'))
  })

  await step('friends page', async () => {
    await A.page.goto(L.CONSUMER + '/friends'); await A.page.waitForTimeout(2500)
    await L.shot(A.page, '22-friends-page')
    L.log((await A.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 600))
  })
  L.log('errors', A.errors.filter(e => !/ERR_ABORTED/.test(e)))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
