// UX round: notifications as an Instagram-style activity list (docs/UX-PLAN-2026-10-18.md section 2, D5, acceptance 2.10;
// client/src/features/notifications/*).
//   - the inbox has no filter chips, no "Mark all read", no unread stripe / dot / tint; its header is back / title / gear only;
//   - the sections are New / This week / Earlier (never "Today" / "Yesterday"), names are bold (600), the time is short ("15m");
//   - at 390 px the first row starts <= 100 px from the top of the viewport, a one-line row is 64 px (+-2);
//   - a friend request carries inline Confirm / Delete: Confirm turns the sentence into "<name> is now your friend." without leaving the
//     page, creates the friendship and survives a reload; Delete collapses the row and removes the request;
//   - a post_like of a post with a photo shows that photo as the thumbnail;
//   - opening the inbox clears the bell within a second, leaving it marks every item read.
// Accounts: review5 (recipient, signed in on the fixture page) and review6 (sender, over the API): the "no friends" pair of
// docs/REVIEW-ACCOUNTS.md. Every test resets the pair first and undoes everything in `finally` (friendship, post, photo, notifications read).
// Phone context 390x844 in both projects.
const { test, expect } = require('../support/fixtures')
const S = require('../support/feat-social')
const U = require('../support/ux')

const { url } = S
const ME = 5, OTHER = 6
const li = (page, text) => page.locator('li.ntf-li').filter({ hasText: text })
/** The rows under "New": the ones this test just caused (the pair's older rows from earlier runs are read, so they are under This week / Earlier). */
const fresh = (page, text) => page.locator('section[aria-labelledby="ntf-sec-new"] li.ntf-li').filter({ hasText: text })
const nameOf = async u => (await u.api.get(`users?id=eq.${u.api.id}&select=name`)).data[0].name
const calm = async (...users) => { for (const u of users) await S.markRead(u, await S.unreadIds(u)) }
const link = async (a, b) => (await a.api.get(`friendships?or=(and(requester_id.eq.${a.api.id},addressee_id.eq.${b.api.id}),and(requester_id.eq.${b.api.id},addressee_id.eq.${a.api.id}))&select=id,status,requester_id`)).data
const guestUnseen = async u => (await u.api.rpc('notifications_badge')).data.guest_unseen

test.describe('ux notifications', { tag: ['@guest', '@consumer', '@feat', '@ux'] }, () => {
  test.skip(!S.have(ME, OTHER), 'review5 / review6 not found: keep docs/REVIEW-ACCOUNTS.md')
  test.describe.configure({ mode: 'default' })

  /** me = review5 on a phone page (signed in), other = review6 over the API; no friendship between them, both bells at 0. */
  async function pair(browser, testInfo) {
    const me = await U.phone(browser, testInfo, ME)
    const other = await S.openUser(browser, testInfo, OTHER)
    await S.resetPair(me, other)
    await calm(me, other)
    return { me, other, otherName: await nameOf(other) }
  }
  const done = async (me, other) => {
    try { await S.resetPair(me, other); await S.purgePosts(me); await S.purgePosts(other); await calm(me, other) } finally { await other.close(); await me.close() }
  }
  const request = async (other, me) => {
    const r = await other.api.rpc('send_friend_request', { p_user_id: me.api.id })
    expect(r.ok, JSON.stringify(r.data)).toBe(true)
    return r.data.id
  }

  // ------------------------------------------------------------------------------------------------- layout
  test('layout: header = back / title / gear, no chips, no Mark all read, no unread marks; New / This week / Earlier only; short times; bold names', async ({ browser }, testInfo) => {
    const { me, other, otherName } = await pair(browser, testInfo)
    try {
      await request(other, me)
      const { page } = me
      await page.goto(url('/notifications'))
      await expect(li(page, `${otherName} sent you a friend request.`)).toBeVisible()
      // header
      await expect(page.getByRole('heading', { name: 'Notifications', level: 1 })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Notification settings' })).toHaveAttribute('href', '/settings/notifications')
      expect(await page.locator('.ntf-head button, .ntf-head a').count(), 'back (only with history) and the gear').toBeLessThanOrEqual(2)
      // no chips, no mark-all, no count pill
      for (const chip of ['All', 'Social', 'Dine-in', 'Bookings', 'Places']) {
        await expect(page.getByRole('button', { name: chip, exact: true }), `no filter chip "${chip}"`).toHaveCount(0)
        await expect(page.getByRole('tab', { name: chip, exact: true }), `no filter tab "${chip}"`).toHaveCount(0)
      }
      await expect(page.getByRole('button', { name: /mark all read/i })).toHaveCount(0)
      await expect(page.locator('.ntf-count')).toHaveCount(0)
      // sections
      const heads = (await page.locator('h2.ntf-sec').allInnerTexts()).map(s => s.trim())
      expect(heads.length).toBeGreaterThanOrEqual(1)
      for (const h of heads) expect(['New', 'This week', 'Earlier'], `section "${h}"`).toContain(h)
      expect(heads[0], 'the unseen request opens the list under New').toBe('New')
      await expect(page.locator('section', { has: page.getByRole('heading', { name: 'New', level: 2 }) }).locator('li.ntf-li').filter({ hasText: `${otherName} sent you a friend request.` })).toHaveCount(1)
      await expect(page.getByText(/\b(Today|Yesterday)\b/i).first(), 'no calendar-day headings').toHaveCount(0)
      // rows: no stripe / dot / tint for unread, bold names, short time
      const row = li(page, `${otherName} sent you a friend request.`)
      const look = await row.evaluate(el => {
        const main = el.querySelector('.ntf-main')
        const cs = getComputedStyle(el), cm = getComputedStyle(main)
        const strong = el.querySelector('.ntf-text strong')
        return {
          bg: cs.backgroundColor, bgMain: cm.backgroundColor, borderLeft: cs.borderLeftWidth, borderLeftMain: cm.borderLeftWidth,
          weight: strong ? getComputedStyle(strong).fontWeight : null, bold: strong ? strong.textContent : null,
          time: el.querySelector('time.ntf-time')?.textContent?.trim(),
          dots: el.querySelectorAll('.ntf-dot, .ntf-unread, .ntf-stripe, [class*="unread"]').length,
        }
      })
      expect(look.bg, 'no tint on the row').toBe('rgba(0, 0, 0, 0)')
      expect(look.bgMain, 'no tint on the row button').toBe('rgba(0, 0, 0, 0)')
      expect(look.borderLeft, 'no stripe').toBe('0px')
      expect(look.borderLeftMain, 'no stripe').toBe('0px')
      expect(look.dots, 'no unread dot').toBe(0)
      expect(Number(look.weight), 'names are weight 600').toBeGreaterThanOrEqual(600)
      expect(look.bold, 'the actor is the bold part').toBe(otherName)
      expect(look.time, 'short time').toMatch(/^(now|\d{1,2}m|\d{1,2}h|\d{1,2}d|\d{1,2}w|\d{1,2} [A-Z][a-z]{2}( \d{4})?)$/)
      // the 44 px avatar column, Confirm / Delete under the text
      await expect(row.getByRole('button', { name: 'Confirm' })).toBeVisible()
      await expect(row.getByRole('button', { name: 'Delete' })).toBeVisible()
      expect(me.watch.consoleErrors, 'console errors').toEqual([])
    } finally { await done(me, other) }
  })

  test('geometry at 390 px: the first row starts <= 100 px from the top, a one-line row is 64 px high', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo, 1)               // review1 holds the richest inbox; read only
    try {
      const { page } = t
      await page.goto(url('/notifications'))
      await expect(page.locator('li.ntf-li').first()).toBeVisible()
      await expect(page.locator('.ntf-fade')).toBeVisible()
      const first = await U.box(page.locator('li.ntf-li'))
      expect(first.top, 'top of the first row (was ~190 px before the round)').toBeLessThanOrEqual(100)
      const rows = await page.locator('li.ntf-li').evaluateAll(els => els.map(el => ({
        h: Math.round(el.getBoundingClientRect().height),
        textH: Math.round((el.querySelector('.ntf-text') || el).getBoundingClientRect().height),
        actions: !!el.querySelector('.ntf-actions'),
      })))
      const oneLine = rows.filter(r => !r.actions && r.textH <= 24)
      expect(oneLine.length, 'the inbox has rows with one line of text').toBeGreaterThanOrEqual(1)
      for (const r of oneLine) expect(Math.abs(r.h - 64), `a one-line row is 64 px (got ${r.h})`).toBeLessThanOrEqual(2)
      // the bold actor and the thumbnail column
      for (const w of await page.locator('.ntf-text strong').evaluateAll(els => els.slice(0, 5).map(e => getComputedStyle(e).fontWeight))) expect(Number(w)).toBeGreaterThanOrEqual(600)
      for (const hh of await page.locator('li.ntf-li .ntf-thumb').evaluateAll(els => els.slice(0, 6).map(e => Math.round(e.getBoundingClientRect().width)))) expect(hh, 'thumbnail is 44 px').toBe(44)
    } finally { await t.close() }
  })

  // ------------------------------------------------------------------------------------- friend request actions
  test('Confirm on a friend request: the row says "<name> is now your friend." within a moment, no navigation, friendship accepted, survives a reload', async ({ browser }, testInfo) => {
    const { me, other, otherName } = await pair(browser, testInfo)
    try {
      await request(other, me)
      const { page } = me
      await page.goto(url('/notifications'))
      const row = fresh(page, `${otherName} sent you a friend request.`)
      await expect(row).toBeVisible()
      const t0 = Date.now()
      await row.getByRole('button', { name: 'Confirm' }).tap()
      await expect(fresh(page, `${otherName} is now your friend.`)).toBeVisible({ timeout: 2_000 })
      const took = Date.now() - t0
      testInfo.annotations.push({ type: 'timing', description: `Confirm to "is now your friend": ${took} ms (acceptance: 200 ms + network)` })
      expect(took, 'the sentence changed fast').toBeLessThan(1_500)
      await expect(page).toHaveURL(url('/notifications'))
      await expect(fresh(page, `${otherName} is now your friend.`).getByRole('button', { name: 'Confirm' }), 'the buttons fade away').toHaveCount(0, { timeout: 2_000 })
      expect(await fresh(page, `${otherName} is now your friend.`).locator('.ntf-text strong').first().textContent()).toBe(otherName)
      await expect.poll(async () => (await link(me, other)).map(r => r.status), { message: 'friendships row' }).toEqual(['accepted'])
      expect((await me.api.rpc('my_friends')).data.map(f => f.name), 'the Friends list has them').toContain(otherName)
      await page.reload()
      await expect(li(page, `${otherName} is now your friend.`).first(), 'a reload still says so').toBeVisible()
      await expect(li(page, `${otherName} sent you a friend request.`), 'the request sentence is gone').toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Confirm' })).toHaveCount(0)
      expect(me.watch.consoleErrors, 'console errors').toEqual([])
    } finally { await done(me, other) }
  })

  test('Delete on a friend request: the row collapses, the request is gone, a reload does not list it', async ({ browser }, testInfo) => {
    const { me, other, otherName } = await pair(browser, testInfo)
    try {
      await request(other, me)
      const { page } = me
      await page.goto(url('/notifications'))
      const row = fresh(page, `${otherName} sent you a friend request.`)
      await expect(row).toBeVisible()
      await row.getByRole('button', { name: 'Delete' }).tap()
      await expect(row, 'the row collapsed').toHaveCount(0, { timeout: 2_000 })
      await expect(page).toHaveURL(url('/notifications'))
      await expect.poll(async () => (await link(me, other)).filter(r => r.status === 'pending' || r.status === 'accepted').length, { message: 'no pending request, no friendship' }).toBe(0)
      expect((await me.api.rpc('my_friends')).data.map(f => f.name)).not.toContain(otherName)
      await page.reload()
      await expect(page.locator('.ntf-fade, .ntf-empty').first()).toBeVisible()
      await expect(li(page, `${otherName} sent you a friend request.`)).toHaveCount(0)
    } finally { await done(me, other) }
  })

  test('tapping the sentence (not a button) of a friend request opens the Requests tab; the buttons do not navigate', async ({ browser }, testInfo) => {
    const { me, other, otherName } = await pair(browser, testInfo)
    try {
      await request(other, me)
      const { page } = me
      await page.goto(url('/notifications'))
      await li(page, `${otherName} sent you a friend request.`).locator('.ntf-main').tap()
      await expect(page).toHaveURL(/\/friends(\?tab=requests)?$/)
      await expect(page.getByRole('tab', { name: /^Requests/ })).toHaveAttribute('aria-selected', 'true')
      await expect(page.locator('.soc-row').filter({ hasText: otherName }).getByRole('button', { name: 'Accept' })).toBeVisible()
    } finally { await done(me, other) }
  })

  // -------------------------------------------------------------------------------------------------- thumbnail
  test('a like on a post with a photo shows the photo as a 44 px thumbnail on the right', async ({ browser }, testInfo) => {
    test.setTimeout(80_000)
    const { me, other, otherName } = await pair(browser, testInfo)
    try {
      const post = await S.newPhotoPost(me, `${S.TAG} ${S.RUN} thumb`)
      const liked = await other.api.rpc('toggle_post_like', { p_post_id: post.id })
      expect(liked.ok, JSON.stringify(liked.data)).toBe(true)
      const { page } = me
      await page.goto(url('/notifications'))
      const row = fresh(page, `${otherName} liked your post.`)
      await expect(row).toBeVisible()
      const thumb = row.locator('.ntf-thumb')
      await expect(thumb, 'the post photo is the thumbnail').toBeVisible({ timeout: 12_000 })
      await expect.poll(() => thumb.locator('img').evaluate(i => i.complete && i.naturalWidth > 0), { message: 'the thumbnail loaded' }).toBe(true)
      expect((await U.box(thumb)).width).toBe(44)
      expect((await U.box(thumb)).height).toBe(44)
      await row.locator('.ntf-main').tap()
      await expect(page).toHaveURL(url(`/post/${post.id}`))
    } finally { await done(me, other) }
  })

  // ----------------------------------------------------------------------------------------- bell, seen, read
  test('opening the inbox clears the bell within a second; leaving it marks every item read', async ({ browser }, testInfo) => {
    const { me, other, otherName } = await pair(browser, testInfo)
    try {
      const { page } = me
      await page.goto(url('/'))
      await S.channelsReady(page)
      await request(other, me)
      await expect.poll(() => S.bellCount(page), { message: 'the Home bell badge went up', timeout: 8_000 }).toBeGreaterThan(0)
      await expect(page.locator('.app-bar-badge')).toBeVisible()
      expect(await guestUnseen(me)).toBeGreaterThan(0)
      await page.getByRole('button', { name: 'Notifications' }).tap()
      await expect(page).toHaveURL(url('/notifications'))
      await expect(fresh(page, `${otherName} sent you a friend request.`)).toBeVisible()
      const t0 = Date.now()
      await expect.poll(() => guestUnseen(me), { message: 'badge = 0 after opening the inbox', timeout: 3_000, intervals: [100, 150, 250] }).toBe(0)
      testInfo.annotations.push({ type: 'timing', description: `inbox open to badge 0: ${Date.now() - t0} ms (acceptance: 500 ms after the list arrived)` })
      // New is a snapshot: the row stays under New while the page is open even though it is seen now
      await expect(page.locator('h2.ntf-sec').first()).toHaveText('New')
      expect((await me.api.rpc('my_notifications', { p_audience: 'guest', p_limit: 5 })).data.unread, 'still unread while the page is open').toBeGreaterThan(0)
      // leave inside the app (a full page load would cut the page off before it could mark anything): everything is read
      await page.getByRole('navigation').getByRole('link', { name: 'Home', exact: true }).tap()
      await expect(page).toHaveURL(url('/'))
      await expect.poll(async () => (await me.api.rpc('my_notifications', { p_audience: 'guest', p_limit: 5 })).data.unread, { message: 'all read after leaving', timeout: 6_000 }).toBe(0)
      await expect.poll(() => S.bellCount(page)).toBe(0)
      // coming back: the item is not "New" any more
      await page.goto(url('/notifications'))
      await expect(li(page, `${otherName} sent you a friend request.`)).toBeVisible()
      await expect(fresh(page, `${otherName} sent you a friend request.`), 'a seen item is not under New any more').toHaveCount(0)
      await expect(page.locator('section[aria-labelledby="ntf-sec-week"] li.ntf-li').filter({ hasText: `${otherName} sent you a friend request.` })).toHaveCount(1)
    } finally { await done(me, other) }
  })

  test('empty inbox: "No activity yet", the hint and a Find friends button', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo, 5)
    try {
      const { page } = t
      await page.route('**/rest/v1/rpc/my_notifications', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], next_cursor: null, unread: 0 }) }))
      await page.goto(url('/notifications'))
      await expect(page.getByRole('heading', { name: 'No activity yet', level: 2 })).toBeVisible()
      await expect(page.getByText("When friends like or reply to your posts and reviews, you'll see it here.")).toBeVisible()
      await page.getByRole('link', { name: 'Find friends' }).tap()
      await expect(page).toHaveURL(/\/friends\?tab=find/)
    } finally { await t.close() }
  })

  test('signed out: /notifications asks to sign in (header and a Sign in button), no sections', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await page.goto(url('/notifications'))
      await expect(page.getByRole('heading', { name: 'Notifications', level: 1 })).toBeVisible()
      await page.getByRole('button', { name: 'Sign in' }).tap()
      await expect(U.authSheet(page)).toBeVisible()
      await expect(page.locator('h2.ntf-sec')).toHaveCount(0)
    } finally { await t.close() }
  })
})
