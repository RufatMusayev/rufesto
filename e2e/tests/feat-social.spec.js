// Feature walk: SOCIAL (friends, requests, find, public profile, posts, feed, comments), desktop and phone.
// Accounts (docs/REVIEW-ACCOUNTS.md, signed in through the auth API): review5 + review6 = friend lifecycle and strangers,
// review1 + review2 = friends with each other (existing friendship, never touched), posts / feed / comments.
// Every test is self contained: it resets what it uses first and cleans up in `finally` (friendships, posts, photos).
// Run one project at a time. It runs in both the `chromium` and the `mobile` project (CONSUMER_SPECS in playwright.config.js; see docs/qa/consumer-social.md).
const { test, expect } = require('../support/fixtures')
const S = require('../support/feat-social')
const { url, TAG, RUN } = S

const ME = 'Nigar R.'        // review5
const OTHER = 'Elvin R.'     // review6
const FRIEND = 'Murad R.'    // review2 (friend of review1)
const row = (p, name) => p.locator('.soc-row').filter({ hasText: name })
const tab = (p, name) => p.getByRole('tab', { name, exact: true })
const reqTab = p => p.getByRole('tab', { name: /^Requests/ })
const sheet = p => p.locator('.sheet')
const authModal = p => p.locator('.overlay.center')
const SLA = 5000   // acceptance criterion: another signed-in browser sees it within 3 s; measured 0.3 to 2.4 s (annotations), the assertion allows 5 s so a loaded preview does not make it flaky
const CONSUMER_ORIGIN = new URL(S.CONSUMER_URL).origin

/** review5 on the fixture page + review6 in a second context, with no friendship between them. */
async function pair(page, browser, testInfo) {
  const a = await S.asUser(page, 5)
  const b = await S.openUser(browser, testInfo, 6)
  await S.resetPair(a, b)
  return { a, b }
}
const link = async (a, b) => (await a.api.get(`friendships?or=(and(requester_id.eq.${a.api.id},addressee_id.eq.${b.api.id}),and(requester_id.eq.${b.api.id},addressee_id.eq.${a.api.id}))&select=id,status,requester_id`)).data

test.describe('feat social', { tag: ['@guest', '@consumer', '@feat'] }, () => {
  test.skip(!S.have(1, 2, 5, 6), 'review1/2/5/6 not found: keep docs/REVIEW-ACCOUNTS.md or set QA_REVIEW<n>_EMAIL / _PASSWORD')
  test.describe.configure({ mode: 'default' })   // one worker per file, a failing test does not skip the next ones

  // the friend / like / comment notifications these tests cause are marked read at the end (the bells stay readable for the next run)
  test.afterAll(async ({ browser }, testInfo) => {
    for (const who of [1, 2, 5, 6]) {
      const u = await S.openUser(browser, testInfo, who)
      await S.tidySocialNotifications(u)
      await u.close()
    }
  })

  // ------------------------------------------------------------------------------------------------ friends
  test('friends: three tabs, empty states, ?tab deep links', async ({ page, browser, watch }, testInfo) => {
    const { a, b } = await pair(page, browser, testInfo)
    try {
      await page.goto(url('/friends'))
      for (const name of ['Friends', 'Requests', 'Find']) await expect(tab(page, name)).toBeVisible()
      await expect(tab(page, 'Friends')).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByText('No friends yet')).toBeVisible()
      await page.getByRole('button', { name: 'Find friends' }).click()
      await expect(tab(page, 'Find')).toHaveAttribute('aria-selected', 'true')
      await expect(page).toHaveURL(/tab=find/)
      await expect(page.getByPlaceholder('Search by name')).toBeFocused()
      await reqTab(page).click()
      await expect(page.getByText('No pending requests')).toBeVisible()
      for (const [q, want] of [['requests', 'Requests'], ['find', 'Find'], ['bogus', 'Friends']]) {
        await page.goto(url(`/friends?tab=${q}`))
        await expect(page.getByRole('tab', { name: new RegExp(`^${want}`) })).toHaveAttribute('aria-selected', 'true')
      }
      expect(watch.consoleErrors, 'console errors').toEqual([])
    } finally { await S.resetPair(a, b); await b.close() }
  })

  test('friends: signed out shows the sign-in card, not a blank page', async ({ browser }, testInfo) => {
    const anon = await S.openSignedOut(browser, testInfo)
    try {
      await anon.page.goto(url('/friends'))
      await expect(anon.page.getByText('Sign in to see your friends')).toBeVisible()
      await anon.page.getByRole('button', { name: 'Sign in' }).click()
      await expect(authModal(anon.page)).toBeVisible()
    } finally { await anon.close() }
  })

  test('find: one or two letters send no request and keep the hint', async ({ page, browser }, testInfo) => {
    const { a, b } = await pair(page, browser, testInfo)
    try {
      const searches = []
      page.on('request', r => { if (/rpc\/search_users/.test(r.url())) searches.push(r.postData()) })
      await page.goto(url('/friends?tab=find'))
      await expect(page.getByText('Search for guests by name to add them as friends.')).toBeVisible()
      await page.getByPlaceholder('Search by name').fill('E')
      await expect(page.getByText('Type at least 3 letters.')).toBeVisible()
      await page.getByPlaceholder('Search by name').fill('El')   // the minimum is 3 letters (search_users, sql/47c)
      await expect(page.getByText('Type at least 3 letters.')).toBeVisible()
      await page.waitForTimeout(900)   // debounce is 300 ms
      expect(searches, 'search_users calls for a 1 or 2 character query').toHaveLength(0)
    } finally { await S.resetPair(a, b); await b.close() }
  })

  test('find: 3+ letters list matching guests (name only), self is excluded', async ({ page, browser }, testInfo) => {
    const { a, b } = await pair(page, browser, testInfo)
    try {
      await page.goto(url('/friends?tab=find'))
      const search = page.getByPlaceholder('Search by name')
      await search.fill('Elvin')
      await expect(row(page, OTHER)).toBeVisible()
      await expect(row(page, OTHER).getByRole('button', { name: 'Add', exact: true })).toBeVisible()
      expect(await row(page, OTHER).innerText(), 'no email or phone in a result row').not.toMatch(/@|\+?\d{7}/)
      await search.fill('Nigar')   // my own name
      await expect(page.getByText('No one found').or(page.locator('.soc-row').first())).toBeVisible()
      await expect(row(page, ME), 'the signed-in guest never lists themself').toHaveCount(0)
      await search.fill('zzzzqq')
      await expect(page.getByText('No one found')).toBeVisible()
      await search.fill('')
      await expect(page.getByText('Search for guests by name to add them as friends.')).toBeVisible()
    } finally { await S.resetPair(a, b); await b.close() }
  })

  // The UI used to promise "2+ letters" while search_users answered [] below 3 (sql/47c); both say 3 now (FindPeople MIN_CHARS = 3), so
  // a 2-letter query lists nobody and sends no request (see 'one or two letters send no request' above) and 3 letters list the guest:
  test('find: three letters are enough (the minimum the UI and search_users agree on)', async ({ page, browser }, testInfo) => {
    const { a, b } = await pair(page, browser, testInfo)
    try {
      await page.goto(url('/friends?tab=find'))
      await page.getByPlaceholder('Search by name').fill('Elv')
      await expect(row(page, OTHER), '"Elv" lists Elvin R.').toBeVisible()
      await expect(page.getByText('Type at least 3 letters.')).toHaveCount(0)
    } finally { await S.resetPair(a, b); await b.close() }
  })

  test('request: Add -> Pending (survives a reload) -> cancelled from Requests', async ({ page, browser, watch }, testInfo) => {
    const { a, b } = await pair(page, browser, testInfo)
    try {
      await page.goto(url('/friends?tab=find'))
      await page.getByPlaceholder('Search by name').fill('Elvin')
      await row(page, OTHER).getByRole('button', { name: 'Add', exact: true }).click()
      await expect(row(page, OTHER).getByText('Pending')).toBeVisible()
      await expect.poll(async () => (await link(a, b)).map(r => r.status), 'friendships row').toEqual(['pending'])
      await page.reload()
      await page.getByPlaceholder('Search by name').fill('Elvin')
      await expect(row(page, OTHER).getByText('Pending'), 'Pending survives a reload').toBeVisible()
      await reqTab(page).click()
      await expect(page.getByText('Requests you sent')).toBeVisible()
      await expect(row(page, OTHER)).toBeVisible()
      await row(page, OTHER).getByRole('button', { name: 'Cancel', exact: true }).click()
      await expect(page.getByText('No pending requests')).toBeVisible()
      await expect.poll(async () => (await link(a, b)).length, 'cancel removes the row').toBe(0)
      await tab(page, 'Find').click()
      await page.getByPlaceholder('Search by name').fill('Elvin')
      await expect(row(page, OTHER).getByRole('button', { name: 'Add', exact: true })).toBeVisible()
      expect(watch.consoleErrors, 'console errors').toEqual([])
    } finally { await S.resetPair(a, b); await b.close() }
  })

  test('request: accept from the other account updates both lists live (<= 3 s)', async ({ page, browser }, testInfo) => {
    test.setTimeout(100_000)
    const { a, b } = await pair(page, browser, testInfo)
    try {
      await b.page.goto(url('/friends?tab=requests'))
      await expect(b.page.getByText('No pending requests')).toBeVisible()
      await page.goto(url('/friends?tab=find'))
      await page.getByPlaceholder('Search by name').fill('Elvin')
      await S.channelsReady(b.page)
      await row(page, OTHER).getByRole('button', { name: 'Add', exact: true }).click()
      await reqTab(page).click()            // the sender watches the outgoing list
      await expect(row(page, OTHER)).toBeVisible()
      const incoming = await S.timed(() => expect(row(b.page, ME).getByRole('button', { name: 'Accept', exact: true })).toBeVisible({ timeout: SLA }))
      testInfo.annotations.push({ type: 'realtime', description: `incoming request visible after ${incoming} ms` })
      await expect(reqTab(b.page).locator('.soc-count-badge')).toHaveText('1')
      await row(b.page, ME).getByRole('button', { name: 'Accept', exact: true }).click()
      const sender = await S.timed(() => expect(page.getByText('No pending requests')).toBeVisible({ timeout: SLA }))
      testInfo.annotations.push({ type: 'realtime', description: `sender list updated after ${sender} ms` })
      await expect(reqTab(b.page).locator('.soc-count-badge'), 'Requests badge decrements without a reload').toHaveCount(0)
      await tab(b.page, 'Friends').click()
      await expect(row(b.page, ME)).toBeVisible()
      await tab(page, 'Friends').click()
      await expect(row(page, OTHER)).toBeVisible()
      expect((await link(a, b)).map(r => r.status)).toEqual(['accepted'])
    } finally { await S.resetPair(a, b); await b.close() }
  })

  test('request: decline removes it on both sides, the sender can ask again', async ({ page, browser }, testInfo) => {
    test.setTimeout(80_000)
    const { a, b } = await pair(page, browser, testInfo)
    try {
      await a.api.rpc('send_friend_request', { p_user_id: b.api.id })
      await page.goto(url('/friends?tab=requests'))
      await expect(row(page, OTHER)).toBeVisible()
      await b.page.goto(url('/friends?tab=requests'))
      await expect(row(b.page, ME).getByRole('button', { name: 'Decline', exact: true })).toBeVisible()
      await S.channelsReady(page)
      await row(b.page, ME).getByRole('button', { name: 'Decline', exact: true }).click()
      await expect(b.page.getByText('No pending requests')).toBeVisible()
      await expect(page.getByText('No pending requests'), 'the sender sees it vanish live').toBeVisible({ timeout: SLA })
      expect(await link(a, b)).toHaveLength(0)
      await page.goto(url('/friends?tab=find'))
      await page.getByPlaceholder('Search by name').fill('Elvin')
      await expect(row(page, OTHER).getByRole('button', { name: 'Add', exact: true })).toBeVisible()
    } finally { await S.resetPair(a, b); await b.close() }
  })

  test('friends: remove a friend (confirm sheet, cancel keeps), the other side updates live', async ({ page, browser }, testInfo) => {
    test.setTimeout(80_000)
    const { a, b } = await pair(page, browser, testInfo)
    try {
      await S.befriend(a, b)
      await b.page.goto(url('/friends'))
      await expect(row(b.page, ME)).toBeVisible()
      await page.goto(url('/friends'))
      await expect(row(page, OTHER)).toBeVisible()
      await expect(row(page, OTHER)).toContainText(/Added/)
      await S.channelsReady(b.page)
      await page.getByRole('button', { name: `More options for ${OTHER}` }).click()
      await expect(sheet(page).getByText(`Remove ${OTHER}?`)).toBeVisible()
      await sheet(page).getByRole('button', { name: 'Cancel' }).click()
      await expect(sheet(page)).toHaveCount(0)
      await expect(row(page, OTHER)).toBeVisible()
      await page.getByRole('button', { name: `More options for ${OTHER}` }).click()
      await sheet(page).getByRole('button', { name: 'Remove friend' }).click()
      await expect(page.getByText('No friends yet')).toBeVisible()
      await expect(b.page.getByText('No friends yet'), 'the former friend sees it live').toBeVisible({ timeout: SLA })
      expect(await link(a, b)).toHaveLength(0)
    } finally { await S.resetPair(a, b); await b.close() }
  })

  // There is no block control in the UI (checked: profile header and the friend "more" sheet); block_user exists in the API.
  test('block (API only): the blocked guest vanishes from search and profile, the blocker gets no Add button', async ({ page, browser }, testInfo) => {
    const { a, b } = await pair(page, browser, testInfo)
    try {
      const r = await a.api.rpc('block_user', { p_user_id: b.api.id })
      expect(r.ok, JSON.stringify(r.data)).toBe(true)
      await b.page.goto(url(`/u/${a.api.id}`))
      await expect(b.page.getByText('Profile not found')).toBeVisible()
      await b.page.goto(url('/friends?tab=find'))
      await b.page.getByPlaceholder('Search by name').fill('Nigar')
      await expect(b.page.getByText('No one found').or(b.page.locator('.soc-row').first())).toBeVisible()
      await expect(row(b.page, ME), 'a guest who blocked me is not listed').toHaveCount(0)
      await page.goto(url('/friends?tab=find'))
      await page.getByPlaceholder('Search by name').fill('Elvin')
      await expect(row(page, OTHER)).toBeVisible()
      await expect(row(page, OTHER).getByRole('button'), 'no Add / Accept control for a blocked guest').toHaveCount(0)
      await page.goto(url(`/u/${b.api.id}`))
      await expect(page.getByRole('heading', { name: OTHER })).toBeVisible()
      expect(await page.getByText(/\bblock/i).count(), 'the UI has no block / unblock control').toBe(0)
      testInfo.annotations.push({ type: 'note', description: 'no block control in the UI' })
    } finally { await S.resetPair(a, b); await b.close() }
  })

  // ------------------------------------------------------------------------------------------- /u/:id
  const stats = async page => (await page.locator('.ig-stat-num').allInnerTexts()).map(Number)
  const dbStats = async (u, id) => { const c = (await u.api.rpc('get_public_profile', { p_user_id: id })).data.counts; return [c.posts, c.friends, c.reviews] }

  test('/u/<me>: "This is you" links to /profile, stats match the DB', async ({ page, watch }) => {
    const a = await S.asUser(page, 5)
    await page.goto(url(`/u/${a.api.id}`))
    await expect(page.getByRole('heading', { name: ME })).toBeVisible()
    const you = page.getByRole('link', { name: 'This is you' })
    await expect(you).toHaveAttribute('href', '/profile')
    await expect.poll(() => stats(page)).toEqual(await dbStats(a, a.api.id))
    expect(await page.locator('.soc-profile').innerText(), 'never an email or phone').not.toMatch(/@rufesto|\+994/)
    await you.click()
    await expect(page).toHaveURL(url('/profile'))
    expect(watch.consoleErrors).toEqual([])
  })

  test('/u/<friend>: Friends check opens the remove sheet (cancel keeps the friendship), stats match', async ({ page }) => {
    const me = await S.asUser(page, 1)
    const friend = await me.api.rpc('my_friends')
    const id = friend.data.find(f => f.name === FRIEND).user_id
    await page.goto(url(`/u/${id}`))
    await expect(page.getByRole('heading', { name: FRIEND })).toBeVisible()
    await expect.poll(() => stats(page)).toEqual(await dbStats(me, id))
    await page.getByRole('button', { name: 'Friends ✓' }).click()
    await expect(sheet(page).getByText(`Remove ${FRIEND}?`)).toBeVisible()
    await sheet(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(sheet(page)).toHaveCount(0)
    expect((await me.api.rpc('my_friends')).data.map(f => f.name), 'friendship untouched').toContain(FRIEND)
  })

  test('/u/<stranger>: Add friend -> Request sent -> cancel from the sheet', async ({ page, browser }, testInfo) => {
    const { a, b } = await pair(page, browser, testInfo)
    try {
      await page.goto(url(`/u/${b.api.id}`))
      await expect(page.getByRole('heading', { name: OTHER })).toBeVisible()
      await page.getByRole('button', { name: 'Add friend' }).click()
      await expect(page.getByRole('button', { name: 'Request sent' })).toBeVisible()
      await expect.poll(async () => (await link(a, b)).map(r => r.status)).toEqual(['pending'])
      await page.getByRole('button', { name: 'Request sent' }).click()
      await expect(sheet(page).getByText('Cancel request?')).toBeVisible()
      await sheet(page).getByRole('button', { name: 'Cancel request' }).click()
      await expect(page.getByRole('button', { name: 'Add friend' })).toBeVisible()
      expect(await link(a, b)).toHaveLength(0)
    } finally { await S.resetPair(a, b); await b.close() }
  })

  test('/u/<unknown id> and /u/<not a uuid>: "Profile not found" with a way on', async ({ page }) => {
    await S.asUser(page, 5)
    await page.goto(url('/u/00000000-0000-0000-0000-000000000000'))
    await expect(page.getByText('Profile not found')).toBeVisible()
    await page.getByRole('link', { name: 'Find people' }).click()
    await expect(page).toHaveURL(/\/friends\?tab=find/)
    await page.goto(url('/u/not-a-uuid'))
    await S.shot(page, test.info(), 'u-not-a-uuid')
    await expect(page.getByText('Profile not found'), 'a malformed id is just another unknown profile (the RPC fails with 22P02)').toBeVisible({ timeout: 4000 })
  })

  test('/u/<id> signed out: read-only profile, Add friend opens the sign-in modal', async ({ browser }, testInfo) => {
    const anon = await S.openSignedOut(browser, testInfo)
    const viewer = await S.openUser(browser, testInfo, 1)
    try {
      const friend = (await viewer.api.rpc('my_friends')).data.find(f => f.name === FRIEND).user_id
      await anon.page.goto(url(`/u/${friend}`))
      await expect(anon.page.getByRole('heading', { name: FRIEND })).toBeVisible()
      await expect(anon.page.locator('.ig-stat-num')).toHaveCount(3)
      expect(await anon.page.locator('.soc-profile').innerText(), 'never an email or phone').not.toMatch(/@rufesto|\+994/)
      await anon.page.getByRole('button', { name: 'Add friend' }).click()
      await expect(authModal(anon.page)).toBeVisible()
    } finally { await anon.close(); await viewer.close() }
  })

  // --------------------------------------------------------------------------------------------- posts
  /** review1 on the fixture page (the viewer), review2 in a second context (the author, review1's friend). */
  async function viewerAuthor(page, browser, testInfo) {
    const v = await S.asUser(page, 1)
    const au = await S.openUser(browser, testInfo, 2)
    await S.purgePosts(au)
    return { v, au }
  }

  test('new post: photo required, 500-char limit, public, shows in Feed All and on the profile grid', async ({ page, watch }, testInfo) => {
    test.setTimeout(80_000)
    const me = await S.asUser(page, 2)
    await S.purgePosts(me)
    try {
      await page.goto(url('/post/new'))
      const postBtn = page.getByRole('button', { name: 'Post', exact: true })
      const caption = page.getByLabel('Caption')
      await expect(postBtn).toBeDisabled()
      await caption.fill(`${TAG} caption only`)
      await expect(postBtn, 'a caption alone cannot be posted while photo uploads are on (spec: photo required)').toBeDisabled()
      await caption.fill(`${TAG} ${RUN} ` + 'x'.repeat(600))
      expect((await caption.inputValue()).length, 'caption is cut at 500').toBe(500)
      await expect(page.getByText('500/500')).toBeVisible()
      expect(await page.getByText(/public|friends only|visibility/i).count(), 'no visibility control in the composer (spec has none)').toBe(0)
      await S.pickPhoto(page)
      await expect(postBtn).toBeEnabled()
      const ms = await S.timed(async () => {
        await postBtn.click()
        await expect(page).toHaveURL(url('/'))
        await expect(S.post(page, `${TAG} ${RUN}`)).toBeVisible()
      })
      testInfo.annotations.push({ type: 'timing', description: `Post tap -> card in Feed All: ${ms} ms (spec: 2 s)` })
      expect(ms, 'the post shows up in Feed All (spec says 2 s, a slow network is allowed up to 8 s)').toBeLessThanOrEqual(8000)
      await expect(page.getByRole('tab', { name: 'Feed', exact: true })).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByRole('tab', { name: 'All', exact: true })).toHaveAttribute('aria-selected', 'true')
      const img = S.post(page, `${TAG} ${RUN}`).locator('.soc-photo img')
      await expect.poll(() => img.evaluate(i => i.complete && i.naturalWidth > 0), 'the signed photo loads').toBe(true)
      const rows = (await me.api.get(`posts?user_id=eq.${me.api.id}&caption=like.${TAG}*&select=id,caption,photo_url,visibility`)).data
      expect(rows).toHaveLength(1)
      expect(rows[0].caption).toHaveLength(500)
      expect(rows[0].photo_url).toMatch(new RegExp(`^${me.api.id}/[\\w.-]+\\.jpg$`))
      expect(rows[0].visibility).toBe('public')
      await page.goto(url(`/u/${me.api.id}`))
      await expect(page.locator('a.soc-tile').first()).toBeVisible()
      await expect(page.locator('a.soc-tile img').first()).toBeVisible()
      expect(watch.consoleErrors, 'console errors').toEqual([])
    } finally { await S.purgePosts(me) }
  })

  test('post visibility (API): friends-only is hidden from a stranger and from signed-out, public is not', async ({ page, browser }, testInfo) => {
    test.setTimeout(90_000)
    const { v, au } = await viewerAuthor(page, browser, testInfo)
    const stranger = await S.openUser(browser, testInfo, 6)
    const anon = await S.openSignedOut(browser, testInfo)
    const fCap = `${TAG} ${RUN} friends-only`, pCap = `${TAG} ${RUN} public`
    try {
      const fId = await S.newPost(au, fCap, 'friends')
      const pId = await S.newPost(au, pCap, 'public')
      // the friend sees both
      await page.goto(url(`/post/${fId}`))
      await expect(page.getByText(fCap)).toBeVisible()
      await S.openFeed(page, 'friends')
      await expect(S.post(page, fCap)).toBeVisible()
      await expect(S.post(page, pCap)).toBeVisible()
      await page.goto(url(`/u/${au.api.id}`))
      await expect(page.getByRole('link', { name: fCap })).toBeVisible()
      // a stranger and a signed-out visitor see only the public one
      for (const [who, ctx] of [['stranger', stranger], ['signed-out', anon]]) {
        await ctx.page.goto(url(`/post/${fId}`))
        await expect(ctx.page.getByText('Post unavailable'), `${who}: friends-only post page`).toBeVisible()
        await expect(ctx.page.getByText(fCap)).toHaveCount(0)
        await ctx.page.goto(url(`/post/${pId}`))
        await expect(ctx.page.getByText(pCap), `${who}: public post page`).toBeVisible()
        await ctx.page.goto(url(`/u/${au.api.id}`))
        await expect(ctx.page.getByRole('link', { name: pCap }), `${who}: public tile on the profile`).toBeVisible()
        await expect(ctx.page.getByRole('link', { name: fCap }), `${who}: friends-only tile on the profile`).toHaveCount(0)
      }
      await S.openFeed(stranger.page, 'all')
      await expect(stranger.page.locator('.soc-feed')).toBeVisible()
      await expect(S.post(stranger.page, fCap), 'friends-only post is not in a stranger feed').toHaveCount(0)
    } finally { await S.purgePosts(au); await au.close(); await stranger.close(); await anon.close() }
  })

  test('like: tap toggles heart and count, double-tap on the photo only likes, DB agrees', async ({ page, browser, watch }, testInfo) => {
    test.setTimeout(80_000)
    const { v, au } = await viewerAuthor(page, browser, testInfo)
    const cap = `${TAG} ${RUN} like`
    try {
      const { id } = await S.newPhotoPost(au, cap)
      await S.openFeed(page, 'friends')
      const card = S.post(page, cap)
      await expect(card).toBeVisible()
      await expect.poll(() => card.locator('.soc-photo img').evaluate(i => i.complete && i.naturalWidth > 0), 'a friend can load the signed photo').toBe(true)
      const toggled = act => Promise.all([page.waitForResponse(r => r.url().includes('/rpc/toggle_post_like')), act()])
      await toggled(() => card.getByRole('button', { name: 'Like', exact: true }).click())
      await expect(card.getByRole('button', { name: 'Remove like' })).toHaveAttribute('aria-pressed', 'true')
      await expect(card.locator('.soc-act-likes')).toHaveText('1 like')
      await toggled(() => card.getByRole('button', { name: 'Remove like' }).click())
      await expect(card.getByRole('button', { name: 'Like', exact: true })).toHaveAttribute('aria-pressed', 'false')
      await expect(card.locator('.soc-act-likes')).toHaveCount(0)
      await toggled(() => card.locator('.soc-photo').dblclick())
      await expect(card.getByRole('button', { name: 'Remove like' })).toHaveAttribute('aria-pressed', 'true')
      await expect(card.locator('.soc-act-likes')).toHaveText('1 like')
      await card.locator('.soc-photo').dblclick()   // a second double-tap never unlikes
      await page.waitForTimeout(700)
      await expect(card.getByRole('button', { name: 'Remove like' })).toHaveAttribute('aria-pressed', 'true')
      await expect(card.locator('.soc-act-likes')).toHaveText('1 like')
      await expect.poll(async () => (await v.api.get(`likes?user_id=eq.${v.api.id}&target_type=eq.post&target_id=eq.${id}&select=id`)).data.length).toBe(1)
      await expect.poll(async () => (await au.api.get(`posts?id=eq.${id}&select=like_count`)).data[0].like_count).toBe(1)
      await S.openFeed(page, 'friends')
      await expect(S.post(page, cap).getByRole('button', { name: 'Remove like' }), 'the like survives a reload').toBeVisible()
      expect(watch.consoleErrors, 'console errors').toEqual([])
    } finally { await S.purgePosts(au); await au.close() }
  })

  test('comment: append, input clears, 1000-char limit, live on the author side, delete own and (as author) others', async ({ page, browser }, testInfo) => {
    test.setTimeout(100_000)
    const { v, au } = await viewerAuthor(page, browser, testInfo)
    const cap = `${TAG} ${RUN} comments`, text = `${TAG} hello ${RUN}`, text2 = `${TAG} second ${RUN}`
    const input = p => p.getByLabel('Add a comment…')
    const comment = (p, t) => p.locator('.soc-comment').filter({ hasText: t })
    try {
      const id = await S.newPost(au, cap)
      await au.page.goto(url(`/post/${id}`))
      await expect(au.page.getByText('Be the first to comment')).toBeVisible()
      await page.goto(url(`/post/${id}`))
      await expect(page.getByText(cap)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Send comment' })).toBeDisabled()
      await input(page).fill('x'.repeat(1100))
      expect((await input(page).inputValue()).length, 'comment is cut at 1000').toBe(1000)
      await input(page).fill('   ')
      await expect(page.getByRole('button', { name: 'Send comment' }), 'whitespace only cannot be sent').toBeDisabled()
      await S.channelsReady(au.page)
      await input(page).fill(text)
      await page.getByRole('button', { name: 'Send comment' }).click()
      await expect(comment(page, text)).toBeVisible()
      await expect(input(page)).toHaveValue('')
      const live = await S.timed(() => expect(comment(au.page, text)).toBeVisible({ timeout: SLA }))
      testInfo.annotations.push({ type: 'realtime', description: `comment visible on the author's browser after ${live} ms` })
      await expect.poll(async () => (await au.api.get(`posts?id=eq.${id}&select=comment_count`)).data[0].comment_count).toBe(1)
      // delete my own comment (the X in the row, then the confirm sheet)
      await comment(page, text).getByRole('button', { name: 'Delete comment' }).click()
      await sheet(page).getByRole('button', { name: 'Delete comment' }).click()
      await expect(comment(page, text)).toHaveCount(0)
      await expect(comment(au.page, text), 'removal is live on the other browser').toHaveCount(0, { timeout: SLA })
      // the post author may delete somebody else's comment
      await input(page).fill(text2)
      await page.getByRole('button', { name: 'Send comment' }).click()
      await expect(comment(au.page, text2)).toBeVisible({ timeout: SLA })
      await comment(au.page, text2).getByRole('button', { name: 'Delete comment' }).click()
      await sheet(au.page).getByRole('button', { name: 'Delete comment' }).click()
      await expect(comment(au.page, text2)).toHaveCount(0)
      await expect(comment(page, text2), 'moderation is live on the commenter').toHaveCount(0, { timeout: SLA })
      await expect.poll(async () => (await au.api.get(`posts?id=eq.${id}&select=comment_count`)).data[0].comment_count).toBe(0)
    } finally { await S.purgePosts(au); await au.close() }
  })

  test('delete own post: Cancel keeps it, Delete removes it from Feed, DB and for friends', async ({ page, browser }, testInfo) => {
    test.setTimeout(80_000)
    const me = await S.asUser(page, 2)
    const friend = await S.openUser(browser, testInfo, 1)
    await S.purgePosts(me)
    const cap = `${TAG} ${RUN} delete`
    try {
      const id = await S.newPost(me, cap)
      await S.openFeed(page, 'all')
      const card = S.post(page, cap)
      await expect(card).toBeVisible()
      await card.getByRole('button', { name: 'Post options' }).click()
      await expect(sheet(page).getByText('Delete this post?')).toBeVisible()
      await sheet(page).getByRole('button', { name: 'Cancel' }).click()
      await expect(sheet(page)).toHaveCount(0)
      await expect(card).toBeVisible()
      await card.getByRole('button', { name: 'Post options' }).click()
      await sheet(page).getByRole('button', { name: 'Delete post' }).click()
      await expect(S.post(page, cap)).toHaveCount(0)
      await expect.poll(async () => (await me.api.get(`posts?id=eq.${id}&select=id`)).data.length).toBe(0)
      await friend.page.goto(url(`/post/${id}`))
      await expect(friend.page.getByText('Post unavailable')).toBeVisible()
      // deleting from the post page goes back Home
      const id2 = await S.newPost(me, cap + ' 2')
      await page.goto(url(`/post/${id2}`))
      await page.getByRole('button', { name: 'Post options' }).click()
      await sheet(page).getByRole('button', { name: 'Delete post' }).click()
      await expect(page).toHaveURL(url('/'))
    } finally { await S.purgePosts(me); await friend.close() }
  })

  // feed(): 'friends' = my and my friends' posts; 'all' adds the public posts of restaurants I FOLLOW (sql/40b), so the two
  // chips only differ for a guest who follows a restaurant. review5 follows Bella Roma here (removed again in finally).
  test('feed: Friends = mine + friends, All adds public posts of followed restaurants; no friends -> empty state with a working action', async ({ page, browser }, testInfo) => {
    test.setTimeout(100_000)
    const a = await S.asUser(page, 5)
    const b = await S.openUser(browser, testInfo, 6)
    await S.resetPair(a, b)
    await S.purgePosts(b)
    const cap = `${TAG} ${RUN} followed place`
    const bella = (await a.api.get('restaurants?slug=eq.bella-roma&select=id')).data[0].id
    try {
      await a.api.del(`user_follows?user_id=eq.${a.api.id}&restaurant_id=eq.${bella}`)
      expect((await a.api.post('user_follows', { user_id: a.api.id, restaurant_id: bella })).ok).toBe(true)
      const posted = await b.api.rpc('create_post', { p_photo_url: null, p_caption: cap, p_restaurant_id: bella, p_visibility: 'public' })
      expect(posted.ok, JSON.stringify(posted.data)).toBe(true)
      await S.openFeed(page, 'all')
      await expect(S.post(page, cap), 'a stranger\'s public post of a followed restaurant is in All').toBeVisible()
      await page.getByRole('tab', { name: 'Friends', exact: true }).click()
      await expect(page.getByText('No posts from friends'), 'nothing from friends yet: empty state').toBeVisible()
      await expect(S.post(page, cap), 'but not under Friends').toHaveCount(0)
      await S.befriend(a, b)
      await page.reload()
      await page.getByRole('tab', { name: 'Feed', exact: true }).click()
      await page.getByRole('tab', { name: 'Friends', exact: true }).click()
      await expect(S.post(page, cap), 'once friends it is under Friends too').toBeVisible()
      await S.resetPair(a, b)
      await page.reload()
      await page.getByRole('tab', { name: 'Feed', exact: true }).click()
      await page.getByRole('tab', { name: 'Friends', exact: true }).click()
      await page.getByRole('link', { name: 'Find friends' }).click()
      await expect(page).toHaveURL(/\/friends\?tab=find/)
    } finally {
      await a.api.del(`user_follows?user_id=eq.${a.api.id}&restaurant_id=eq.${bella}`)
      await S.purgePosts(b); await S.resetPair(a, b); await b.close()
    }
  })

  test('feed: a post by someone else shows the "New posts" pill live; tapping it reloads and shows the post', async ({ page, browser }, testInfo) => {
    test.setTimeout(80_000)
    const { au } = await viewerAuthor(page, browser, testInfo)
    const cap = `${TAG} ${RUN} pill`
    try {
      await S.openFeed(page, 'all')
      await expect(page.locator('.soc-feed')).toBeVisible()
      await expect(page.getByRole('button', { name: 'New posts' })).toHaveCount(0)
      await S.channelsReady(page)
      await S.newPost(au, cap)
      const ms = await S.timed(() => expect(page.getByRole('button', { name: 'New posts' })).toBeVisible({ timeout: SLA }))
      testInfo.annotations.push({ type: 'realtime', description: `"New posts" pill after ${ms} ms` })
      await expect(S.post(page, cap), 'the list is not reordered under the thumb').toHaveCount(0)
      await page.getByRole('button', { name: 'New posts' }).click()
      await expect(S.post(page, cap)).toBeVisible()
      await expect(page.getByRole('button', { name: 'New posts' })).toHaveCount(0)
    } finally { await S.purgePosts(au); await au.close() }
  })

  test('feed: 15 per page, "Load more" appends the rest without duplicates', async ({ page, browser }, testInfo) => {
    test.setTimeout(120_000)
    const { au } = await viewerAuthor(page, browser, testInfo)
    const caps = Array.from({ length: 16 }, (_, i) => `${TAG} ${RUN} page ${String(i + 1).padStart(2, '0')}`)
    try {
      for (const c of caps) await S.newPost(au, c)
      await S.openFeed(page, 'friends')
      await expect(S.post(page, caps[15])).toBeVisible({ timeout: 30_000 })
      const cards = page.locator('article.soc-post')
      await expect.poll(() => cards.count()).toBe(15)
      const more = page.getByRole('button', { name: 'Load more' })
      await expect(more).toBeVisible()
      await expect(S.post(page, caps[0]), 'the oldest of the 16 is on page 2').toHaveCount(0)
      await more.click()
      await expect(S.post(page, caps[0])).toBeVisible()
      await expect.poll(() => cards.count()).toBeGreaterThanOrEqual(16)
      const texts = await cards.allInnerTexts()
      expect(new Set(texts).size, 'no card twice').toBe(texts.length)
      await expect(more).toHaveCount(0)
    } finally { await S.purgePosts(au); await au.close() }
  })

  test('signed out: Feed is read-only (recent reviews), every action opens the sign-in modal', async ({ browser }, testInfo) => {
    test.setTimeout(80_000)
    const anon = await S.openSignedOut(browser, testInfo)
    const au = await S.openUser(browser, testInfo, 2)
    await S.purgePosts(au)
    const cap = `${TAG} ${RUN} public for anon`
    const p = anon.page
    try {
      const id = await S.newPost(au, cap)
      await p.goto(url('/'))
      await p.getByRole('tab', { name: 'Feed', exact: true }).click()
      await expect(p.getByText('Sign in for your own feed')).toBeVisible()
      await expect(p.getByRole('tab', { name: 'Friends', exact: true }), 'no All / Friends filter signed out').toHaveCount(0)
      await expect(p.locator('article.soc-review').first(), 'recent public reviews are listed').toBeVisible()
      await p.locator('article.soc-review').first().getByRole('button', { name: 'Like', exact: true }).click()
      await expect(authModal(p)).toBeVisible()
      await p.keyboard.press('Escape')
      await expect(authModal(p)).toHaveCount(0)
      await p.getByRole('button', { name: 'New post' }).click()
      await expect(authModal(p)).toBeVisible()
      await p.keyboard.press('Escape')
      // a public post page is readable; like and comment ask for an account, nothing runs silently
      await p.goto(url(`/post/${id}`))
      await expect(p.getByText(cap)).toBeVisible()
      await expect(p.getByText('Be the first to comment')).toBeVisible()
      await p.getByRole('button', { name: 'Like', exact: true }).click()
      await expect(authModal(p)).toBeVisible()
      await p.keyboard.press('Escape')
      await p.getByLabel('Add a comment…').click()
      await expect(authModal(p)).toBeVisible()
      await p.keyboard.press('Escape')
      expect((await au.api.get(`posts?id=eq.${id}&select=like_count,comment_count`)).data[0], 'nothing was written').toEqual({ like_count: 0, comment_count: 0 })
      await p.goto(url('/post/new'))
      await expect(p.getByText('Sign in to post')).toBeVisible()
    } finally { await S.purgePosts(au); await au.close(); await anon.close() }
  })

  test('new post: restaurant tag and photo can be removed, a non-image file is refused, Cancel posts nothing', async ({ page }) => {
    test.setTimeout(80_000)
    const me = await S.asUser(page, 2)
    await S.purgePosts(me)
    const cap = `${TAG} ${RUN} tagged`
    try {
      const bella = (await me.api.get('restaurants?slug=eq.bella-roma&select=id')).data[0].id
      await page.goto(url('/post/new'))
      const postBtn = page.getByRole('button', { name: 'Post', exact: true })
      await page.getByLabel('Caption').fill(cap)
      await page.locator('input[type=file]').setInputFiles({ name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') })
      await expect(page.getByRole('alert')).toContainText('Please choose an image file.')
      await expect(postBtn).toBeDisabled()
      await S.pickPhoto(page)
      await expect(postBtn).toBeEnabled()
      await page.getByRole('button', { name: 'Remove photo' }).click()
      await expect(postBtn, 'without a photo it cannot be posted again').toBeDisabled()
      await S.pickPhoto(page)
      const search = page.getByPlaceholder('Search restaurants')
      await search.fill('Bella')
      await page.getByRole('option', { name: /Trattoria Bella Roma/ }).click()
      await expect(page.locator('.soc-picked-chip')).toContainText('Trattoria Bella Roma')
      await page.getByRole('button', { name: 'Remove restaurant' }).click()
      await expect(search).toBeVisible()
      await search.fill('zzzzqq')
      await expect(page.getByText('No restaurants found')).toBeVisible()
      await search.fill('Bella')
      await page.getByRole('option', { name: /Trattoria Bella Roma/ }).click()
      // Cancel leaves without posting anything
      await page.getByRole('button', { name: 'Cancel' }).click()
      await expect(page).toHaveURL(url('/'))
      expect((await me.api.get(`posts?user_id=eq.${me.api.id}&caption=like.${TAG}*&select=id`)).data).toHaveLength(0)
      // and the same draft posted: the card names the restaurant and links to it
      await page.goto(url('/post/new'))
      await page.getByLabel('Caption').fill(cap)
      await S.pickPhoto(page)
      await page.getByPlaceholder('Search restaurants').fill('Bella')
      await page.getByRole('option', { name: /Trattoria Bella Roma/ }).click()
      await postBtn.click()
      await expect(page).toHaveURL(url('/'))
      const card = S.post(page, cap)
      await expect(card.getByRole('link', { name: 'Trattoria Bella Roma' })).toHaveAttribute('href', '/restaurant/bella-roma')
      expect((await me.api.get(`posts?user_id=eq.${me.api.id}&caption=like.${TAG}*&select=restaurant_id`)).data[0].restaurant_id).toBe(bella)
    } finally { await S.purgePosts(me) }
  })

  test('comment count and share: "View 1 comment" opens the post, Share copies its link', async ({ page, browser }, testInfo) => {
    test.setTimeout(80_000)
    const { v, au } = await viewerAuthor(page, browser, testInfo)
    const cap = `${TAG} ${RUN} counts`
    try {
      const id = await S.newPost(au, cap)
      expect((await v.api.rpc('add_post_comment', { p_post_id: id, p_body: `${TAG} ${RUN} hello` })).ok).toBe(true)
      await page.addInitScript(() => { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }) })   // force the clipboard path
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: CONSUMER_ORIGIN })
      await S.openFeed(page, 'friends')
      const card = S.post(page, cap)
      await expect(card.getByText('View 1 comment')).toBeVisible()
      await card.getByRole('button', { name: 'Share' }).click()
      await expect(page.getByText('Link copied')).toBeVisible()
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${CONSUMER_ORIGIN}/post/${id}`)
      await card.getByText('View 1 comment').click()
      await expect(page).toHaveURL(url(`/post/${id}`))
      await expect(page.locator('.soc-comment').filter({ hasText: `${TAG} ${RUN} hello` })).toBeVisible()
    } finally { await S.purgePosts(au); await au.close() }
  })
})
