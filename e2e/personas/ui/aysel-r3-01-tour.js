// Round 3, part 1: a first look at every screen she touches, with the plan's measurable criteria. Screenshots to round3/.
const L = require('./aysel-r3-lib')
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova')
  const wait = ms => A.page.waitForTimeout(ms)
  await L.step('Home For you: top, popular review slot, heights', async () => {
    await A.page.goto(L.CONSUMER + '/'); await A.page.waitForSelector('article'); await wait(1800)
    await L.shot(A.page, '01-home-top')
    const info = await A.page.evaluate(() => {
      const slots = [...document.querySelectorAll('article')].map((a, i) => ({ i, h: Math.round(a.getBoundingClientRect().height), kicker: /Popular review/.test(a.innerText), name: (a.querySelector('.soc-post-name, .rv-name')?.innerText || '').slice(0, 20) }))
      return slots.slice(0, 22)
    })
    L.log('first 22 cards (index height popular? who):', info.map(s => `${s.i + 1}:${s.h}${s.kicker ? ' POPULAR' : ''} ${s.name}`).join(' | '))
    const pop = A.page.locator('article').filter({ hasText: 'Popular review' }).first()
    if (await pop.count()) { await pop.scrollIntoViewIfNeeded(); await wait(500); await L.shot(A.page, '01-home-popular-review'); L.log('popular review card height:', Math.round((await pop.boundingBox()).height), '| text:', (await pop.innerText()).replace(/\n+/g, ' | ')) }
  })
  await L.step('Home Friends tab', async () => {
    await A.page.evaluate(() => window.scrollTo(0, 0)); await wait(300)
    await A.page.getByRole('tab', { name: 'Friends', exact: true }).click(); await wait(1800)
    await L.shot(A.page, '01-home-friends')
    L.log('Friends text:', (await A.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 600))
    L.log('review rows heights:', await A.page.evaluate(() => [...document.querySelectorAll('.rv, [class*=rv-]')].filter(e => e.matches('article, .rv, li, div')).slice(0, 0).length), await A.page.evaluate(() => [...document.querySelectorAll('article')].filter(a => /★/.test(a.innerText) && !a.querySelector('.soc-photo')).slice(0, 6).map(a => Math.round(a.getBoundingClientRect().height) + 'px')))
  })
  await L.step('Search zero state', async () => {
    await A.page.goto(L.CONSUMER + '/explore'); await wait(2500)
    await L.shot(A.page, '01-search-zero')
    L.log('search text:', (await A.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 900))
    await A.page.evaluate(() => window.scrollBy(0, 900)); await wait(600)
    await L.shot(A.page, '01-search-zero-2')
  })
  await L.step('Notifications', async () => {
    await A.page.goto(L.CONSUMER + '/notifications'); await A.page.waitForSelector('li, [class*=ntf]'); await wait(2000)
    await L.shot(A.page, '01-notifications')
    L.log('text:', (await A.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 900))
    L.log('first row top / heights:', await A.page.evaluate(() => { const rows = [...document.querySelectorAll('li.ntf-li, li[class*=ntf]')]; return rows.slice(0, 8).map(r => 'top ' + Math.round(r.getBoundingClientRect().top) + ' h ' + Math.round(r.getBoundingClientRect().height)) }))
  })
  await L.step('Profile + settings', async () => {
    await A.page.goto(L.CONSUMER + '/profile'); await wait(2500)
    await L.shot(A.page, '01-profile')
    L.log('profile text:', (await A.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 500))
    await A.page.getByRole('button', { name: /Settings/ }).first().click().catch(() => {}); await wait(900)
    await L.shot(A.page, '01-settings')
    L.log('settings:', (await A.page.evaluate(() => document.querySelector('.bs-root, .sheet')?.innerText || '')).replace(/\n+/g, ' | ').slice(0, 400))
  })
  await L.step('Restaurant page', async () => {
    await A.page.goto(L.CONSUMER + '/restaurant/bella-roma'); await wait(3000)
    await L.shot(A.page, '01-restaurant')
    L.log('restaurant text:', (await A.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 700))
  })
  L.log('errors', A.errors.filter(e => !/ERR_ABORTED/.test(e)))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
