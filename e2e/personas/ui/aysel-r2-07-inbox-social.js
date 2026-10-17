// Round 2, part 6: grouped social items, targets of each tap, filters, mark all read, settings.
const L = require('./aysel-r2-lib')
const rows = page => page.locator('li.ntf-li')
const texts = page => page.evaluate(() => [...document.querySelectorAll('li.ntf-li')].map(li => li.innerText.replace(/\n+/g, ' | ')))
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova')
  const api = await L.api('Aysel Məmmədova')
  await L.step('bell on Home', async () => {
    await A.page.goto(L.CONSUMER + '/'); await A.page.waitForSelector('.soc-feed-slot article'); await A.page.waitForTimeout(2500)
    L.log('bell:', await A.page.evaluate(() => { const e = document.querySelector('a[href="/notifications"], button[aria-label*="otification" i]'); return e ? (e.getAttribute('aria-label') + ' | ' + e.innerText.trim()) : null }))
    L.log('badge rpc:', JSON.stringify(await api.rpc('notifications_badge')))
    await L.shot(A.page, '07-home-bell')
  })
  await L.step('inbox top (en)', async () => {
    await A.page.locator('a[href="/notifications"], button[aria-label*="otification" i]').first().click(); await A.page.waitForSelector('li.ntf-li'); await A.page.waitForTimeout(1500)
    const t = await texts(A.page); L.log('top 8 items:\n' + t.slice(0, 8).join('\n'))
    await L.shot(A.page, '07-inbox-social')
    L.log('thumbs / leading on grouped like:', await A.page.evaluate(() => { const li = [...document.querySelectorAll('li.ntf-li')].find(l => /liked your post/.test(l.innerText)); return li ? li.querySelectorAll('img, [class*=avatar i]').length + ' avatars/imgs; classes ' + [...li.querySelectorAll('*')].map(e => typeof e.className === 'string' ? e.className : '').filter(c => /ntf-(lead|av|stack|thumb)/.test(c)).slice(0, 5).join(',') : 'none' }))
  })
  const tapAndReport = async (label, re) => {
    await L.step('tap: ' + label, async () => {
      await A.page.goto(L.CONSUMER + '/notifications'); await A.page.waitForSelector('li.ntf-li'); await A.page.waitForTimeout(1200)
      const li = A.page.locator('li.ntf-li').filter({ hasText: re }).first()
      if (!(await li.count())) { L.log('  no item for', label); return }
      L.log('  item:', (await li.innerText()).replace(/\n+/g, ' | '))
      await li.click(); await A.page.waitForTimeout(2200)
      const url = A.page.url().replace(L.CONSUMER, '')
      L.log('  lands on', url, '| text:', (await A.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 260))
      await L.shot(A.page, '07-tap-' + label.replace(/\W+/g, '-'))
    })
  }
  await tapAndReport('grouped likes on post', /liked your post/)
  await tapAndReport('comment on post', /commented/)
  await tapAndReport('review reply', /repl/i)
  await tapAndReport('review like', /liked your review/i)
  await tapAndReport('friend request', /friend request/)
  await tapAndReport('bill paid', /bill .* is paid/i)
  await tapAndReport('join table', /join your table/)
  await L.step('filters', async () => {
    await A.page.goto(L.CONSUMER + '/notifications'); await A.page.waitForSelector('li.ntf-li'); await A.page.waitForTimeout(1200)
    for (const f of ['Social', 'Dine-in', 'Bookings', 'Places', 'All']) {
      const t0 = Date.now()
      await A.page.getByRole('tab', { name: f }).or(A.page.getByRole('button', { name: f, exact: true })).first().click(); await A.page.waitForTimeout(900)
      const t = await texts(A.page)
      L.log(f.padEnd(9), 'items:', t.length, '| first:', (t[0] || '(empty state) ' + (await A.page.evaluate(() => document.querySelector('main')?.innerText.replace(/\n+/g, ' | ').slice(-120)))).slice(0, 110))
      if (f === 'Bookings' || f === 'Places') await L.shot(A.page, '07-filter-' + f)
    }
  })
  await L.step('mark all read', async () => {
    L.log('unread before (header):', await A.page.evaluate(() => document.querySelector('h1, .ntf-title')?.innerText))
    const t0 = Date.now()
    await A.page.getByRole('button', { name: /Mark all read/i }).click(); await A.page.waitForTimeout(1500)
    L.log('after: unread labels left:', await A.page.locator('li.ntf-li').filter({ hasText: 'Unread' }).count(), '| header:', (await A.page.evaluate(() => document.body.innerText)).match(/Notifications\s*\n?\s*(\d+)?/)?.[0].replace(/\n/g, ' '), '| mark-all button present:', await A.page.getByRole('button', { name: /Mark all read/i }).count())
    await L.shot(A.page, '07-after-mark-all')
    await A.page.reload(); await A.page.waitForSelector('li.ntf-li'); await A.page.waitForTimeout(1200)
    L.log('after reload: Unread labels', await A.page.locator('li.ntf-li').filter({ hasText: 'Unread' }).count(), '| rpc badge', JSON.stringify(await api.rpc('notifications_badge')))
  })
  await L.step('profile > settings rows', async () => {
    await A.page.goto(L.CONSUMER + '/profile'); await A.page.waitForTimeout(2000)
    await A.page.getByRole('button', { name: /Settings/ }).first().click().catch(() => {}); await A.page.waitForTimeout(900)
    await L.shot(A.page, '07-profile-settings')
    L.log('settings sheet:', (await A.page.evaluate(() => document.querySelector('.sheet')?.innerText || '')).replace(/\n+/g, ' | ').slice(0, 400))
  })
  L.log('errors', A.errors.filter(e => !/ERR_ABORTED/.test(e)))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
