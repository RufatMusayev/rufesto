// Notifications v2 (docs/V2-CONTRACT.md 21; consumer client/src/features/notifications, dashboard client-resto NotificationPanel / NotificationBell):
// grouped inbox items, the bell badge (unseen) vs the unread dot (read), Mark all read, notification settings, the staff bell of a waiter after a
// waiter call, and that a guest never sees staff rows. Clients cannot UPDATE notifications any more: reads go through my_notifications /
// notifications_badge, writes through mark_notifications / set_notification_prefs (RPCs).
// Accounts (docs/REVIEW-ACCOUNTS.md, signed in over the auth API): review1 = recipient of the likes, review2 + review3 = the likers (friends of
// review1, Murad R. and Leyla R.), review5 + review6 = settings test (the setting is restored in finally), review4 = the guest who calls the
// waiter at Sakura House T2, waiter1.sakura = the waiter whose staff bell is watched, manager.sakura = resets the table. Every post is purged,
// every table / waiter call is cleaned and the inboxes are marked read at the end. Desktop and mobile project for the consumer tests; the
// staff bell tests open their own contexts (a 390 px one for the phone header).
const { test, expect, settle } = require('../support/fixtures')
const S = require('../support/feat-social')
const F = require('../support/feat-dash')

const { url, TAG, RUN } = S
const SLA = 8000
const itemsOf = r => ((r && (r.data || r.body)) || {}).items || []   // S users answer in .data, F (dashboard) users in .body
const inbox = (user, args = {}) => user.api.rpc('my_notifications', { p_audience: 'guest', p_limit: 50, ...args })
const likeKey = id => `post_like:${id}`
const groupOf = async (user, id) => itemsOf(await inbox(user)).find(i => i.group_key === likeKey(id))
const readAll = user => user.api.rpc('mark_notifications', { p_ids: null, p_read: true, p_seen_only: false, p_audience: 'guest' })
const badge = async user => (await user.api.rpc('notifications_badge')).data
const like = (user, id) => user.api.rpc('toggle_post_like', { p_post_id: id })
const prefsOf = async user => { const r = await user.api.rpc('get_notification_prefs'); return Array.isArray(r.data) ? r.data[0] : r.data }

test.describe('feat notifications v2', { tag: ['@guest', '@consumer', '@feat'] }, () => {
  test.skip(!S.have(1, 2, 3, 4, 5, 6) || !F.accounts.waiter1 || !F.accounts.manager, 'review1-6 / waiter1.sakura / manager.sakura not found in docs/REVIEW-ACCOUNTS.md')
  test.describe.configure({ mode: 'default' })

  test('likes on one post collapse into ONE inbox item (server group), named once in the list; a third like joins it', async ({ page, browser }, testInfo) => {
    test.setTimeout(100_000)
    const v = await S.asUser(page, 1)
    const a = await S.openUser(browser, testInfo, 2)
    const b = await S.openUser(browser, testInfo, 3)
    const c = await S.openUser(browser, testInfo, 6)
    await S.purgePosts(v)
    await readAll(v)
    try {
      const id = await S.newPost(v, `${TAG} ${RUN} grouped like`, 'public')
      await like(a, id)
      await like(b, id)
      await expect.poll(async () => (await groupOf(v, id))?.count, { message: 'the two likes are one group of 2' }).toBe(2)
      const g = await groupOf(v, id)
      expect(g).toMatchObject({ type: 'post_like', category: 'social', read: false })
      expect(g.ids, 'the group lists both rows').toHaveLength(2)
      expect(g.actors.map(x => x.name).sort(), 'who liked').toEqual(['Leyla R.', 'Murad R.'])
      expect(itemsOf(await inbox(v)).filter(i => i.group_key === likeKey(id)), 'one item for the post, not one per like').toHaveLength(1)

      await page.goto(url('/notifications'))
      const text = page.locator('.ntf-item .ntf-text').filter({ hasText: /^(Murad and Leyla|Leyla and Murad) liked your post\.$/ })
      await expect(text, 'one inbox line names both').toHaveCount(1)
      await expect(text.locator('xpath=ancestor::button[1]')).toHaveClass(/unread/)

      await like(c, id)
      await expect.poll(async () => (await groupOf(v, id))?.count, { message: 'a third like joins the same item' }).toBe(3)
      expect(itemsOf(await inbox(v)).filter(i => i.group_key === likeKey(id))).toHaveLength(1)
      await page.reload()
      await expect(page.locator('.ntf-item .ntf-text').filter({ hasText: /liked your post\./ }).filter({ hasText: /Leyla|Murad/ }).first()).toBeVisible()
      await settle(page)
    } finally {
      await S.purgePosts(v)
      await readAll(v)
      await a.close(); await b.close(); await c.close()
    }
  })

  test('the bell counts what is unseen, opening the inbox clears the badge but keeps the items unread, Mark all read clears them for good', async ({ page, browser }, testInfo) => {
    test.setTimeout(100_000)
    const v = await S.asUser(page, 1)
    const a = await S.openUser(browser, testInfo, 2)
    await S.purgePosts(v)
    await readAll(v)
    try {
      await expect.poll(async () => (await badge(v)).guest_unseen, { message: 'bell badge after reading everything' }).toBe(0)
      await page.goto(url('/'))
      await expect.poll(() => S.bellCount(page)).toBe(0)
      const id = await S.newPost(v, `${TAG} ${RUN} bell`, 'public')
      await like(a, id)
      await expect.poll(async () => (await badge(v)).guest_unseen, { message: 'the like is unseen' }).toBeGreaterThanOrEqual(1)
      await expect.poll(() => S.bellCount(page), { timeout: SLA, message: 'the bell goes up by itself' }).toBeGreaterThanOrEqual(1)

      await page.goto(url('/notifications'))
      const unread = page.locator('.ntf-item.unread')
      await expect(unread.first(), 'the like is an unread item').toBeVisible()
      await expect(page.locator('.ntf-count'), 'the header counts unread items').toBeVisible()
      await expect.poll(async () => (await badge(v)).guest_unseen, { message: 'opening the inbox marks the rows seen' }).toBe(0)
      expect((await inbox(v)).data.unread, 'but they are not read').toBeGreaterThanOrEqual(1)
      await page.goto(url('/'))
      await expect.poll(() => S.bellCount(page), { message: 'bell after leaving the inbox' }).toBe(0)
      await page.goto(url('/notifications'))
      await expect(unread.first(), 'still unread after the badge was cleared').toBeVisible()

      await page.getByRole('button', { name: 'Mark all read' }).click()
      await expect(unread, 'no unread item left').toHaveCount(0)
      await expect(page.locator('.ntf-count')).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Mark all read' })).toHaveCount(0)
      await expect.poll(async () => (await inbox(v)).data.unread, { message: 'server unread' }).toBe(0)
      await page.reload()
      await expect(page.locator('.ntf-item').first()).toBeVisible()
      await expect(page.locator('.ntf-item.unread'), 'still read after a reload').toHaveCount(0)
    } finally {
      await S.purgePosts(v)
      await readAll(v)
      await a.close()
    }
  })

  test('settings: the switches and quiet hours persist across a reload, and a switched-off category creates no notification', async ({ page, browser }, testInfo) => {
    test.setTimeout(120_000)
    const u = await S.asUser(page, 5)
    const liker = await S.openUser(browser, testInfo, 6)
    await S.purgePosts(u)
    const reset = () => u.api.rpc('set_notification_prefs', { p: { social: true, dinein: true, bookings: true, places: true, quiet_from: null, quiet_to: null } })
    const sw = name => page.getByRole('switch', { name, exact: true })
    try {
      await reset()
      await page.goto(url('/settings/notifications'))
      for (const n of ['Social', 'Dine-in', 'Bookings', 'Places']) await expect(sw(n), `${n} starts on`).toHaveAttribute('aria-checked', 'true')
      await sw('Social').click()
      await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()
      await sw('Places').click()
      await expect.poll(() => prefsOf(u), { message: 'saved on the server' }).toMatchObject({ social: false, places: false, dinein: true, bookings: true })
      await page.reload()
      await expect(sw('Social')).toHaveAttribute('aria-checked', 'false')
      await expect(sw('Places')).toHaveAttribute('aria-checked', 'false')
      await expect(sw('Dine-in')).toHaveAttribute('aria-checked', 'true')
      await expect(sw('Bookings')).toHaveAttribute('aria-checked', 'true')

      const id = await S.newPost(u, `${TAG} ${RUN} prefs`, 'public')
      await like(liker, id)
      await page.waitForTimeout(1500)
      expect(await groupOf(u, id), 'Social is off: the like creates no inbox item').toBeUndefined()

      await sw('Social').click()
      await expect.poll(async () => (await prefsOf(u))?.social).toBe(true)
      await like(liker, id)   // unlike
      await like(liker, id)   // like again
      await expect.poll(async () => (await groupOf(u, id))?.count, { message: 'Social is on again: the like is an item' }).toBe(1)

      await sw('Quiet hours').click()
      await expect(page.getByLabel('From')).toBeVisible()
      await expect(page.getByLabel('Until')).toBeVisible()
      await expect.poll(async () => { const p = await prefsOf(u); return !!(p?.quiet_from && p?.quiet_to) }, { message: 'quiet hours saved as a pair' }).toBe(true)
      await page.reload()
      await expect(sw('Quiet hours')).toHaveAttribute('aria-checked', 'true')
      await expect(page.getByLabel('From')).toBeVisible()
      await sw('Quiet hours').click()
      await expect.poll(async () => { const p = await prefsOf(u); return [p?.quiet_from ?? null, p?.quiet_to ?? null] }).toEqual([null, null])
      await expect(page.getByLabel('From')).toHaveCount(0)
    } finally {
      await reset()
      await S.purgePosts(u)
      await liker.close()
    }
  })

  test('a waiter call lights the waiter\'s staff bell (badge, panel row, Mark all read, tap opens /waiter); a guest never sees staff rows', async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'dashboard bell: desktop project (the phone header is covered by the next test)')
    test.setTimeout(180_000)
    await F.acquireGuestLock()   // review4-6 are shared guests: nobody else may seat them meanwhile
    const mgr = await F.openAs(browser, testInfo, 'manager')
    const waiter = await F.openAs(browser, testInfo, 'waiter1')
    const guest = await S.openUser(browser, testInfo, 4)
    let table = null
    const staffRead = () => waiter.api.rpc('mark_notifications', { p_ids: null, p_read: true, p_seen_only: false, p_audience: 'staff' })
    try {
      table = await F.resetTable(mgr.api, 'T2', [])
      await staffRead()
      const claim = await guest.api.rpc('claim_table', { p_code: table.code })
      expect(claim.ok, `claim_table ${claim.status} ${JSON.stringify(claim.data)}`).toBe(true)

      const p = waiter.page
      await p.goto(F.RESTO_URL + '/waiter')
      await p.locator('.dash-layout').waitFor()
      const bell = p.getByRole('button', { name: /^Notifications/ })
      await expect(bell, 'a waiter has the staff bell').toBeVisible()
      await expect(bell).toHaveAttribute('aria-label', 'Notifications')

      const call = await guest.api.rpc('call_waiter', { p_table_id: table.id, p_kind: 'assist' })
      expect(call.ok, `call_waiter ${call.status} ${JSON.stringify(call.data)}`).toBe(true)
      await expect(p.getByRole('button', { name: /^Notifications, \d+ new$/ }), 'the bell shows a badge after the call').toBeVisible({ timeout: 20_000 })
      expect((await waiter.api.rpc('notifications_badge')).body.staff_unseen).toBeGreaterThanOrEqual(1)

      await bell.click()
      const panel = p.getByRole('dialog')
      await expect(panel.getByRole('heading', { name: 'Notifications' })).toBeVisible()
      const row = panel.locator('.notif-item').filter({ hasText: 'Waiter called' }).first()
      await expect(row, 'the waiter call is a row').toBeVisible()
      await expect(row).toHaveClass(/is-unread/)
      await expect(row).toContainText('T2')
      await panel.getByRole('button', { name: 'Mark all read' }).click()
      await expect(panel.locator('.notif-item.is-unread'), 'no unread row left').toHaveCount(0)
      await expect.poll(async () => (await waiter.api.rpc('my_notifications', { p_audience: 'staff', p_limit: 50 })).body.unread, { message: 'server unread (staff)' }).toBe(0)
      await row.click()
      await expect(p).toHaveURL(F.RESTO_URL + '/waiter')
      await expect(panel, 'the panel closes after a tap').toHaveCount(0)

      // a guest never sees staff rows: not the caller, not even the waiter acting as a guest
      for (const who of [guest, waiter]) {
        const guestItems = itemsOf(await who.api.rpc('my_notifications', { p_audience: 'guest', p_limit: 50 }))
        expect(guestItems.filter(i => i.category === 'staff'), 'staff rows in a guest inbox').toEqual([])
      }
      expect(itemsOf(await guest.api.rpc('my_notifications', { p_audience: 'staff', p_limit: 50 })), 'a plain guest has no staff inbox').toEqual([])
      const gp = guest.page
      await gp.goto(url('/notifications'))
      await expect(gp.getByRole('heading', { name: 'Notifications', level: 1 })).toBeVisible()
      await expect(gp.getByText(/called the waiter|asked for the bill|New booking request|Low stock/), 'no staff sentence in the guest inbox').toHaveCount(0)
    } finally {
      if (table) {
        await mgr.api.patch(`service_requests?table_id=eq.${table.id}&status=in.(open,acknowledged)`, { status: 'resolved' })
        await guest.api.rpc('leave_table', { p_table_id: table.id })
        await F.resetTable(mgr.api, 'T2', []).catch(() => {})
      }
      await staffRead().catch(() => {})
      await readAll(guest).catch(() => {})
      await guest.close(); await waiter.close(); await mgr.close()
      F.releaseGuestLock()
    }
  })

  test('every staff role has the bell, in the sidebar head on a desktop and in the header on a phone', async ({ browser }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'dashboard bell: desktop project (it opens its own 1280 and 390 px contexts)')
    test.skip(!F.accounts.kitchen, 'kitchen.sakura not found')
    for (const [key, home] of [['waiter1', '/waiter'], ['kitchen', '/kds'], ['manager', '/']]) {
      for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
        const s = await F.openAs(browser, testInfo, key, { viewport })
        try {
          await s.page.goto(F.RESTO_URL + home)
          await s.page.locator('.dash-layout').waitFor()
          const bell = s.page.getByRole('button', { name: /^Notifications/ })
          await expect(bell, `${key} at ${viewport.width}px: the staff bell`).toBeVisible()
          if (viewport.width < 768) expect.soft((await bell.boundingBox()).height, `${key}: bell tap target`).toBeGreaterThanOrEqual(40)
        } finally { await s.close() }
      }
    }
  })
})
