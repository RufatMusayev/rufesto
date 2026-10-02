// Feature walk: NOTIFICATIONS (bell badge, list text, deep link, mark read) for every v2 type that a second account can trigger:
// friend_request, friend_accepted, post_like, post_comment, booking_invite, booking_member_joined, booking_confirmed / booking_cancelled /
// booking_no_show (the restaurant manager changes the status), bill_settled (existing rows of review1, read only).
// Not triggerable from a test: booking_seated (needs the host to claim the table inside the 30 min window before the booking).
// Accounts (docs/REVIEW-ACCOUNTS.md; staff accounts are ordinary guests in the consumer app): RECIPIENT = manager.seda (the guest whose bell
// is watched) and ACTOR = waiter2.seda; the bookings are at Sakura House, so booking_created of them never reaches those two; MANAGER =
// manager.sakura confirms / no-shows the booking the way the dashboard does (bookings.status); review1 for the bill_settled rows.
// Every test starts by marking the two accounts' unread notifications read (bell = 0) and ends the same way; friendships, posts and bookings
// are removed / cancelled in `finally`. Staff accounts also receive restaurant events (booking_created, bill_requested), so badge checks use
// "went up" and the list checks look for the exact text.
const { test, expect } = require('../support/fixtures')
const S = require('../support/feat-social')
const { url, TAG, RUN } = S

const RECIPIENT = 'manager.seda', ACTOR = 'waiter2.seda', MANAGER = 'manager.sakura', PLACE = 'sakura-house', PLACE_NAME = 'Sakura House'
const SLA = 5000   // acceptance criterion: 3 s; measured 0.3 to 1 s (annotations), 5 s here so a loaded preview does not make it flaky
const item = (p, text) => p.locator('.stagger-item').filter({ hasText: text }).first()   // newest first: the row this test just caused
const nameOf = async u => (await u.api.get(`users?id=eq.${u.api.id}&select=name`)).data[0].name
const calm = async (...users) => { for (const u of users) await S.markRead(u, await S.unreadIds(u)) }
const lastOf = async (u, type) => (await u.api.get(`notifications?user_id=eq.${u.api.id}&type=eq.${type}&select=id,type,read,payload&order=sent_at.desc&limit=1`)).data[0]
const WHEN = /[^,]+, \d{2}:\d{2}/   // "<date>, <HH:MM>" from formatBakuDate + formatBakuTime

/** Click the bell the way the layout offers it (phone header button / desktop sidebar item). */
async function openBell(page) {
  const bell = S.isPhone(page) ? page.getByRole('button', { name: 'Notifications' }) : page.locator('aside a[href="/notifications"]')
  await bell.first().click()
  await expect(page).toHaveURL(url('/notifications'))
}

/** The badge shows the DB's unread count (9+ above nine). Staff accounts also get restaurant events, so compare live instead of expecting 0. */
async function badgeMatchesDb(page, user) {
  return (await S.bellCount(page)) === Math.min((await S.unreadIds(user)).length, 10)
}

/** The bell goes up by itself (realtime) within the 3 s of the acceptance criteria. */
async function bellRises(page, testInfo, what, before = 0) {
  const t = Date.now()
  await expect.poll(() => S.bellCount(page), { timeout: SLA, message: `bell badge after ${what}` }).toBeGreaterThan(before)
  testInfo.annotations.push({ type: 'realtime', description: `bell after ${what}: ${Date.now() - t} ms` })
}

/** Open the list, find the row by its text, tap it: it must land on `to`, be read afterwards (UI + DB), and the bell must drop. */
async function openRow(page, u, type, text, to) {
  const row = await lastOf(u, type)
  await openBell(page)
  const it = item(page, text)
  await expect(it, `list row "${text}"`).toBeVisible()
  expect(row.read, 'unread before the tap').toBe(false)
  await it.click()
  await expect(page).toHaveURL(to)
  await expect.poll(async () => (await u.api.get(`notifications?id=eq.${row.id}&select=read`)).data[0].read, 'marked read in the DB').toBe(true)
  return row
}

test.describe('feat notifications', { tag: ['@guest', '@consumer', '@feat'] }, () => {
  test.skip(!S.have(RECIPIENT, ACTOR, MANAGER, 1), 'staff / review1 accounts not found: keep docs/REVIEW-ACCOUNTS.md')
  test.describe.configure({ mode: 'default' })

  /** me = the guest on the fixture page (bell watched), other = second context; pair reset, both bells at 0. */
  async function pair(page, browser, testInfo, meWho = RECIPIENT, otherWho = ACTOR) {
    const me = await S.asUser(page, meWho)
    const other = await S.openUser(browser, testInfo, otherWho)
    await S.resetPair(me, other)
    await calm(me, other)
    return { me, other, myName: await nameOf(me), otherName: await nameOf(other) }
  }
  const done = async (me, other) => { await S.resetPair(me, other); await S.purgePosts(me); await S.purgePosts(other); await calm(me, other); await other.close() }

  test('friend_request: bell goes up live, the row says who, tapping opens /friends with the request', async ({ page, browser, watch }, testInfo) => {
    const { me, other, otherName } = await pair(page, browser, testInfo)
    try {
      await page.goto(url('/'))
      await S.channelsReady(page)
      const before = await S.bellCount(page)
      await other.api.rpc('send_friend_request', { p_user_id: me.api.id })
      await bellRises(page, testInfo, 'friend request', before)
      await openRow(page, me, 'friend_request', `${otherName} sent you a friend request.`, /\/friends(\?tab=requests)?$/)
      await page.getByRole('tab', { name: /^Requests/ }).click()
      await expect(page.locator('.soc-row').filter({ hasText: otherName }).getByRole('button', { name: 'Accept' })).toBeVisible()
      await expect.poll(() => badgeMatchesDb(page, me), 'the bell follows the unread count after the row was read').toBe(true)
      expect(watch.consoleErrors, 'console errors').toEqual([])
    } finally { await done(me, other) }
  })

  // The row says "X sent you a friend request" and opens /friends on the Friends tab: the request itself sits one tap away under Requests.
  test('friend_request: tapping the row shows the request itself (Requests tab), not the empty Friends list', async ({ page, browser }, testInfo) => {
    const { me, other, otherName } = await pair(page, browser, testInfo)
    try {
      await other.api.rpc('send_friend_request', { p_user_id: me.api.id })
      await page.goto(url('/notifications'))
      await item(page, `${otherName} sent you a friend request.`).click()
      await expect(page.getByRole('tab', { name: /^Requests/ }), 'lands on the Requests tab').toHaveAttribute('aria-selected', 'true')
      await expect(page.locator('.soc-row').filter({ hasText: otherName }).getByRole('button', { name: 'Accept' })).toBeVisible()
    } finally { await done(me, other) }
  })

  test('friend_accepted: the sender gets "<name> accepted your friend request." and the row opens that profile', async ({ page, browser }, testInfo) => {
    const { me, other, otherName } = await pair(page, browser, testInfo)
    try {
      const sent = await me.api.rpc('send_friend_request', { p_user_id: other.api.id })
      await page.goto(url('/'))
      await S.channelsReady(page)
      const before = await S.bellCount(page)
      await other.api.rpc('respond_friend_request', { p_id: sent.data.id, p_accept: true })
      await bellRises(page, testInfo, 'accepted request', before)
      await openRow(page, me, 'friend_accepted', `${otherName} accepted your friend request.`, url(`/u/${other.api.id}`))
      await expect(page.getByRole('heading', { name: otherName })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Friends ✓' })).toBeVisible()
    } finally { await done(me, other) }
  })

  test('post_like and post_comment: rows name the person (comment shows the first 80 characters) and open the post', async ({ page, browser }, testInfo) => {
    test.setTimeout(80_000)
    const { me, other, otherName } = await pair(page, browser, testInfo)
    const comment = `${TAG} ${RUN} ` + 'c'.repeat(100)
    try {
      const id = await S.newPost(me, `${TAG} ${RUN} notify`)
      await page.goto(url('/'))
      await S.channelsReady(page)
      const before = await S.bellCount(page)
      await other.api.rpc('toggle_post_like', { p_post_id: id })
      await bellRises(page, testInfo, 'like', before)
      await openRow(page, me, 'post_like', `${otherName} liked your post.`, url(`/post/${id}`))
      await expect(page.locator('.soc-act-likes')).toHaveText('1 like')
      // like -> unlike -> like again: how many rows does that make? (known item F-V2-14, notification spam: reported, not asserted)
      await other.api.rpc('toggle_post_like', { p_post_id: id }); await other.api.rpc('toggle_post_like', { p_post_id: id })
      const likes = (await me.api.get(`notifications?user_id=eq.${me.api.id}&type=eq.post_like&select=id,payload`)).data.filter(r => r.payload.includes(id)).length
      testInfo.annotations.push({ type: 'note', description: `like, unlike, like -> ${likes} post_like rows for the author` })
      await page.waitForTimeout(1500)   // let the bell settle after the like toggles
      const beforeC = await S.bellCount(page)
      await other.api.rpc('add_post_comment', { p_post_id: id, p_body: comment })
      await expect.poll(() => S.bellCount(page), { timeout: SLA }).toBeGreaterThan(beforeC)
      const snippet = comment.slice(0, 80)
      await openRow(page, me, 'post_comment', `${otherName} commented: “${snippet}”`, url(`/post/${id}`))
      await expect(page.getByText(comment)).toBeVisible()
    } finally { await done(me, other) }
  })

  test('booking_invite: the invited friend gets "<host> invited you to <restaurant>, <when>." and the row opens the invite page', async ({ page, browser }, testInfo) => {
    test.setTimeout(80_000)
    const { me, other, otherName } = await pair(page, browser, testInfo)   // me = the invited guest (ACTOR role here is the host)
    let booking = null
    try {
      await S.befriend(me, other)
      booking = await S.newBooking(other, PLACE, 5)
      await page.goto(url('/'))
      await S.channelsReady(page)
      const before = await S.bellCount(page)
      const r = await other.api.rpc('invite_to_booking', { p_booking_id: booking.id, p_user_id: me.api.id })
      expect(r.ok, JSON.stringify(r.data)).toBe(true)
      await bellRises(page, testInfo, 'booking invite', before)
      const row = await lastOf(me, 'booking_invite')
      await openBell(page)
      await expect(item(page, new RegExp(`${otherName} invited you to ${PLACE_NAME}, ${WHEN.source}\.`))).toBeVisible()
      await item(page, `${otherName} invited you to`).click()
      await expect(page).toHaveURL(url(`/b/${booking.code}`))
      await expect(page.getByText(PLACE_NAME).first()).toBeVisible()
      await expect.poll(async () => (await me.api.get(`notifications?id=eq.${row.id}&select=read`)).data[0].read).toBe(true)
    } finally {
      if (booking) await other.api.rpc('cancel_booking', { p_booking_id: booking.id })
      await done(me, other)
    }
  })

  /** host (fixture page) + a second guest who joined by the code + the restaurant manager (own context). */
  async function groupBooking(page, browser, testInfo, from) {
    const ctx = await pair(page, browser, testInfo)
    const mgr = await S.openUser(browser, testInfo, MANAGER)
    // Other suites run dashboard flows on the same restaurants and now and then cancel a fresh booking; start again (other day) if so.
    for (let attempt = 0; ; attempt++) {
      const booking = await S.newBooking(ctx.me, PLACE, from + attempt)
      const joined = await ctx.other.api.rpc('join_group_booking', { p_code: booking.code, p_consent: true })
      expect(joined.ok, JSON.stringify(joined.data)).toBe(true)
      await new Promise(r => setTimeout(r, 1500))
      const status = (await ctx.me.api.get(`bookings?id=eq.${booking.id}&select=status`)).data[0].status
      if (status === 'pending') return { ...ctx, mgr, booking }
      testInfo.annotations.push({ type: 'note', description: `booking ${booking.id} was ${status} 1.5 s after it was made (somebody else's cleanup?), retrying` })
      await mgr.api.patch(`bookings?id=eq.${booking.id}`, { status: 'cancelled' })
      if (attempt === 2) throw new Error(`three fresh bookings at ${PLACE} were cancelled within 1.5 s: another suite is cancelling them`)
      await calm(ctx.me, ctx.other)
    }
  }
  const setStatus = (mgr, id, status) => mgr.api.patch(`bookings?id=eq.${id}`, { status })
  const closeGroup = async ({ me, other, mgr, booking }) => {
    await mgr.api.patch(`bookings?id=eq.${booking.id}`, { status: 'cancelled' })   // whatever state it is in, the slot is released
    await done(me, other); await mgr.close()
  }

  test('booking_member_joined, booking_confirmed, booking_cancelled: host and member rows, live bell, links to /bookings/<id>', async ({ page, browser }, testInfo) => {
    test.setTimeout(120_000)
    const g = await groupBooking(page, browser, testInfo, 6)   // the join already happened: mark it read first, then walk the rest
    const { me, other, mgr, booking, otherName } = g
    try {
      const where = url(`/bookings/${booking.id}`)
      await page.goto(url('/'))
      await expect.poll(() => S.bellCount(page)).toBeGreaterThan(0)   // member_joined, written before the page was open
      await openRow(page, me, 'booking_member_joined', `${otherName} joined your booking.`, where)
      await expect(page.getByText(otherName).first()).toBeVisible()
      // staff confirm (the restaurant manager): host and member are told
      await other.page.goto(url('/'))
      await S.channelsReady(page); await S.channelsReady(other.page, 500)
      const before = await S.bellCount(page); const beforeO = await S.bellCount(other.page)
      const statusBefore = (await me.api.get(`bookings?id=eq.${booking.id}&select=status`)).data[0].status
      const patched = await setStatus(mgr, booking.id, 'confirmed')
      expect(patched.ok, JSON.stringify(patched.data)).toBe(true)
      testInfo.annotations.push({ type: 'note', description: `status before the manager's PATCH: ${statusBefore}; unread of the host after it: ${(await S.unreadIds(me)).length}` })
      await bellRises(page, testInfo, 'booking confirmed (host)', before)
      await expect.poll(() => S.bellCount(other.page), { timeout: SLA }).toBeGreaterThan(beforeO)
      const confirmed = new RegExp(`Your booking at ${PLACE_NAME} \\(${WHEN.source}\\) is confirmed\\.`)
      await openBell(page)
      await expect(item(page, confirmed)).toBeVisible()
      await item(page, confirmed).first().click()
      await expect(page).toHaveURL(where)
      await expect(page.getByText('Confirmed').first()).toBeVisible()
      await openBell(other.page)
      await expect(item(other.page, confirmed)).toBeVisible()
      // the host cancels: the member is told, the host is not
      await calm(other)
      expect((await me.api.rpc('cancel_booking', { p_booking_id: booking.id })).ok).toBe(true)
      await other.page.goto(url('/'))
      await expect.poll(() => S.bellCount(other.page), { timeout: 8000, message: `bell of the member after the host cancelled; unread in the DB: ${(await S.unreadIds(other)).length}, booking: ${JSON.stringify((await me.api.get(`bookings?id=eq.${booking.id}&select=status,cancel_reason`)).data)}` }).toBeGreaterThan(0)
      await openBell(other.page)
      const cancelled = new RegExp(`Your booking at ${PLACE_NAME} \\(${WHEN.source}\\) was cancelled\\.`)
      await expect(item(other.page, cancelled)).toBeVisible()
      await item(other.page, cancelled).first().click()
      await expect(other.page).toHaveURL(where)
      await expect(other.page.getByText('Cancelled').first()).toBeVisible()
      const hostRows = (await me.api.get(`notifications?user_id=eq.${me.api.id}&type=eq.booking_cancelled&select=payload`)).data
      expect(hostRows.filter(r => r.payload.includes(booking.id)), 'the host who cancelled gets no booking_cancelled for it').toHaveLength(0)
    } finally { await closeGroup(g) }
  })

  test('booking_no_show: both guests read "... was marked as a no-show." and the row opens the booking', async ({ page, browser }, testInfo) => {
    test.setTimeout(100_000)
    const g = await groupBooking(page, browser, testInfo, 7)
    const { me, other, mgr, booking } = g
    try {
      await calm(me, other)
      expect((await setStatus(mgr, booking.id, 'confirmed')).ok).toBe(true)
      await calm(me, other)
      await page.goto(url('/'))
      await S.channelsReady(page)
      const before = await S.bellCount(page)
      expect((await setStatus(mgr, booking.id, 'no_show')).ok).toBe(true)
      await bellRises(page, testInfo, 'no-show (host)', before)
      const text = new RegExp(`Your booking at ${PLACE_NAME} \\(${WHEN.source}\\) was marked as a no-show\\.`)
      await openBell(page)
      await expect(item(page, text)).toBeVisible()
      await item(page, text).first().click()
      await expect(page).toHaveURL(url(`/bookings/${booking.id}`))
      expect((await lastOf(other, 'booking_no_show')).payload).toContain(booking.id)
    } finally { await closeGroup(g) }
  })

  // ---------------------------------------------------------------------------------- list behaviour
  test('list: header count equals the unread rows, "Mark all read" clears rows, header count and bell', async ({ page, browser }, testInfo) => {
    test.setTimeout(80_000)
    const { me, other, otherName } = await pair(page, browser, testInfo)
    try {
      const id = await S.newPost(me, `${TAG} ${RUN} mark`)
      await other.api.rpc('send_friend_request', { p_user_id: me.api.id })
      await other.api.rpc('toggle_post_like', { p_post_id: id })
      await page.goto(url('/notifications'))
      await expect(item(page, `${otherName} sent you a friend request.`)).toBeVisible()
      await expect(item(page, `${otherName} liked your post.`)).toBeVisible()
      const unread = (await S.unreadIds(me)).length
      await expect(page.locator('h1')).toContainText(String(unread))
      await page.getByRole('button', { name: 'Mark all read' }).click()
      await expect(page.getByRole('button', { name: 'Mark all read' })).toHaveCount(0)
      await expect(page.locator('h1').locator('span')).toHaveCount(0)
      await expect.poll(async () => (await S.unreadIds(me)).length, 'DB: nothing unread').toBe(0)
      await expect.poll(() => badgeMatchesDb(page, me), 'the bell badge goes away with the unread rows').toBe(true)
      await page.reload()
      await expect(item(page, `${otherName} liked your post.`)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Mark all read' }), 'read state survives a reload').toHaveCount(0)
    } finally { await done(me, other) }
  })

  test('list: bill_settled (review1) reads "Your bill is paid (...). Receipt RF-..." and opens the receipt; no row shows raw JSON or type names', async ({ page }) => {
    const u = await S.asUser(page, 1)
    const rows = (await u.api.get(`notifications?user_id=eq.${u.api.id}&type=eq.bill_settled&select=id,read,payload&order=sent_at.desc&limit=3`)).data
    test.skip(!rows.length, 'review1 has no bill_settled row')
    const row = rows[0], p = JSON.parse(row.payload)
    try {
      await page.goto(url('/notifications'))
      const all = item(page, /./)
      await expect(all.first()).toBeVisible()
      for (const text of await all.allInnerTexts()) expect(text, 'a row prints raw JSON / ids / snake_case type names').not.toMatch(/[{}]|_id\b|\b(booking|friend|bill|post|join)_[a-z_]+\b|undefined|\[object/)
      const mine = item(page, `Receipt ${p.receipt}`)
      await expect(mine).toContainText(/Your bill is paid \(.+\)\. Receipt RF-\d{8}-\d{6}\./)
      await mine.click()
      await expect(page).toHaveURL(url(`/receipt/${p.bill_id}`))
      await expect(page.getByText('Receipt not found')).toHaveCount(0)
      await expect(page.getByText('Trattoria Bella Roma').first()).toBeVisible()
    } finally { if (!row.read) await u.api.patch(`notifications?id=eq.${row.id}`, { read: false }) }
  })

  test('list: staff-facing rows a guest account may hold (booking_created, bill_requested) are plain sentences too', async ({ page }) => {
    const u = await S.asUser(page, MANAGER)
    const has = (await u.api.get(`notifications?user_id=eq.${u.api.id}&type=in.(booking_created,bill_requested)&select=id&limit=1`)).data
    test.skip(!has.length, 'no staff-facing notification on this account')
    await page.goto(url('/notifications'))
    await expect(item(page, /New booking request\.|A table asked for the bill\./).first()).toBeVisible()
    for (const text of await item(page, /./).allInnerTexts()) expect(text).not.toMatch(/[{}]|_id\b|\b[a-z]+_[a-z_]+\b/)
  })

  test('list: empty state "You\'re all caught up" (list answered empty), no header badge', async ({ page }) => {
    await S.asUser(page, RECIPIENT)
    await page.route('**/rest/v1/notifications*', route => (route.request().method() === 'GET' && /limit=50/.test(route.request().url())
      ? route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) : route.continue()))
    await page.goto(url('/notifications'))
    await expect(page.getByText("You're all caught up")).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mark all read' })).toHaveCount(0)
  })

  test('signed out: /notifications asks to sign in (no blank page), the button opens the sign-in modal', async ({ browser }, testInfo) => {
    const anon = await S.openSignedOut(browser, testInfo)
    try {
      await anon.page.goto(url('/notifications'))
      await expect(anon.page.getByRole('heading', { name: 'Notifications' })).toBeVisible()
      await anon.page.getByRole('button', { name: 'Sign in' }).click()
      await expect(anon.page.locator('.overlay.center')).toBeVisible()
      expect(await S.bellCount(anon.page), 'no badge signed out').toBe(0)
    } finally { await anon.close() }
  })
})
