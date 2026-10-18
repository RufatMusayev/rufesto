// Consumer Friends tab: friends_feed ranked by day (V2-CONTRACT 18.1 / 18.3), day separators, a friend's post appears, the end of the
// ranked list (caught up + chronological tail by day), feed events with pool "friends", the API contract, empty state, phone layout.
// UI: client/src/features/feed/FriendsFeed.jsx, components/{DaySeparator,CaughtUp,MoreRow}.jsx; texts client/src/locales/en/social.json.
// Accounts (docs/REVIEW-ACCOUNTS.md, signed in over the auth API): review1 = viewer, review2 = their friend (existing friendship, never
// touched), review6 = a stranger to review1, review5 = no friends. Every post made here has a caption starting with the feature-spec tag
// ("qa-feat") and is deleted in `finally` (purgePosts). The preview also holds a simulated demo world: nothing here asserts a total, only
// the posts this spec made, and nothing of the demo data is changed.
// Paging is automatic (marker 3 cards from the end), so the tests scroll and never click "Load more" in the ranked list.
// Runs in the desktop and the mobile project (CONSUMER_SPECS in playwright.config.js).
const crypto = require('crypto')
const { test, expect, settle } = require('../support/fixtures')
const S = require('../support/feat-social')
const H = require('../support/feat-home')
const { walker } = require('../support/mobile')
const U = require('../support/ux')

const { TAG, RUN } = S
const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December'
const DAYS = 'Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday'
const LABEL = new RegExp(`^(Today|Yesterday|(${DAYS}), \\d{1,2} (${MONTHS})( \\d{4})?)$`)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const labels = loc => loc.evaluateAll(els => els.map(e => e.textContent.trim()))
/** The day separator a card sits under (the nearest h3.soc-day before it), or null. */
const dayOfCard = card => card.evaluate(el => {
  let n = el.closest('.soc-feed-slot') || el
  while ((n = n.previousElementSibling)) if (n.matches('h3.soc-day')) return n.textContent.trim()
  return null
})
const reach = (page, caption) => H.pageUntil(page, () => S.feedPost(page, caption), { items: H.friendsSlots })

/** review1 on the fixture page (the viewer) and review2 in a second context (their friend, the author). */
async function viewerAuthor(page, browser, testInfo) {
  const v = await S.asUser(page, 1)
  const au = await S.openUser(browser, testInfo, 2)
  await S.purgePosts(au)
  await S.purgePosts(v)
  return { v, au }
}

test.describe('feat friends feed', { tag: ['@guest', '@consumer', '@feat'] }, () => {
  test.skip(!S.have(1, 2, 5, 6), 'review1/2/5/6 not found: keep docs/REVIEW-ACCOUNTS.md or set QA_REVIEW<n>_EMAIL / _PASSWORD')
  test.describe.configure({ mode: 'default' })

  // review1 - review2 are friends in docs/REVIEW-ACCOUNTS.md but the preview lost that friendship: make it for this file, undo it at the end
  let madeFriendship = false
  test.beforeAll(async ({ browser }, testInfo) => {
    const [a, b] = [await S.openUser(browser, testInfo, 1), await S.openUser(browser, testInfo, 2)]
    try { madeFriendship = await S.ensureFriends(a, b) } finally { await a.close(); await b.close() }
  })
  test.afterAll(async ({ browser }, testInfo) => {
    if (!madeFriendship) return
    const [a, b] = [await S.openUser(browser, testInfo, 1), await S.openUser(browser, testInfo, 2)]
    try { await S.resetPair(a, b) } finally { await a.close(); await b.close() }
  })

  test('a friend\'s new post, a friends-only post and my own post show under "Today"; separators are dated labels, newest day first; impressions carry pool friends', async ({ page, browser }, testInfo) => {
    test.setTimeout(120_000)
    const { v, au } = await viewerAuthor(page, browser, testInfo)
    const capA = `${TAG} ${RUN} friend public`, capB = `${TAG} ${RUN} friend only`, capMine = `${TAG} ${RUN} mine`
    try {
      const idA = await S.newPost(au, capA, 'public')
      await S.newPost(au, capB, 'friends')
      await S.newPost(v, capMine, 'public')
      const impression = H.rpcRequest(page, 'log_feed_events', b => (b.p_events || []).some(e => e.pool === 'friends' && e.event === 'impression'))
      const { body } = await H.openFriends(page)
      expect(body).toMatchObject({ p_exclude: [], p_limit: 20 })
      expect(body, 'no automatic location prompt: no GPS on the first load').not.toHaveProperty('p_lat')

      for (const c of [capA, capB, capMine]) {
        await reach(page, c)
        await expect(S.feedPost(page, c), `"${c}" on Friends, once`).toHaveCount(1)
        expect(await dayOfCard(S.feedPost(page, c)), `"${c}" sits under Today`).toBe('Today')
      }
      await expect(page.locator('.soc-feed:visible .soc-signin')).toHaveCount(0)
      const seps = await labels(H.daySeps(page))
      expect(seps[0], 'newest day first').toBe('Today')
      for (const t of seps) expect(t, 'a day separator reads Today, Yesterday or "Weekday, D Month"').toMatch(LABEL)
      expect(new Set(seps).size, 'one separator per day, never repeated').toBe(seps.length)
      await expect(H.daySeps(page).first(), 'the separator is a visible heading').toBeVisible()

      await S.feedPost(page, capA).scrollIntoViewIfNeeded()
      const req = await impression
      const events = H.bodyOf(req).p_events.filter(e => e.pool === 'friends')
      expect(events.length).toBeGreaterThan(0)
      for (const e of events) {
        expect(e.item_id).toMatch(UUID)
        expect(e.item_type, 'reviews are not feed-event items, only posts').toBe('post')
        expect(Number.isInteger(e.position) && e.position > 0).toBe(true)
      }
      expect((await req.response()).status(), 'log_feed_events accepts pool friends').toBe(200)
      expect(idA).toMatch(UUID)
    } finally { await S.purgePosts(au); await S.purgePosts(v); await au.close() }
  })

  test('the end of Friends: a stranger\'s post is absent, "You\'re all caught up" + a chronological tail grouped by day, no repeats, no Load more before it', async ({ page, browser }, testInfo) => {
    test.setTimeout(150_000)
    const { v, au } = await viewerAuthor(page, browser, testInfo)
    const stranger = await S.openUser(browser, testInfo, 6)
    await S.purgePosts(stranger)
    const capA = `${TAG} ${RUN} end friend`, capS = `${TAG} ${RUN} end stranger`
    try {
      await S.newPost(au, capA, 'public')
      await S.newPost(stranger, capS, 'public')
      await H.openFriends(page)
      const rounds = await H.pageUntil(page, null, { items: H.friendsSlots })
      await expect(H.caughtUp(page)).toBeVisible()
      await expect(page.getByText('Earlier posts from you and your friends, newest first:')).toBeVisible()
      await expect(S.feedPost(page, capA), 'the friend\'s post is in the ranked list or the tail, once').toHaveCount(1)
      await expect(S.feedPost(page, capS), 'a stranger\'s public post is not a friend\'s post').toHaveCount(0)

      await expect(page.locator('section.soc-caught ~ [aria-busy="true"]')).toHaveCount(0)   // the tail finished loading
      const ranked = await H.hrefsOf(H.commentLinks(page))
      const tail = await H.hrefsOf(page.locator('section.soc-caught ~ article a[aria-label="Comments"]'))
      expect(new Set(ranked).size, 'no post twice in the ranked list').toBe(ranked.length)
      expect(tail.filter(h => ranked.includes(h)), 'the tail repeats nothing the ranked list showed').toEqual([])
      const tailSeps = await labels(page.locator('section.soc-caught ~ h3.soc-day'))
      for (const t of tailSeps) expect(t, 'tail day separator').toMatch(LABEL)
      expect(new Set(tailSeps).size, 'one separator per day in the tail').toBe(tailSeps.length)
      testInfo.annotations.push({ type: 'friends-pages', description: `${rounds} scroll rounds, ${ranked.length} ranked, ${tail.length} in the tail` })
    } finally { await S.purgePosts(au); await S.purgePosts(stranger); await S.purgePosts(v); await au.close(); await stranger.close() }
  })

  test('friends_feed through the API: shape, day order, people only, exclusion paging, errors; signed out is refused', async ({ page }) => {
    const v = await S.asUser(page, 1)
    const call = args => v.api.rpc('friends_feed', args)
    const first = await call({ p_exclude: [], p_limit: 10 })
    expect(first.ok, `friends_feed HTTP ${first.status}`).toBe(true)
    const { items, exclude, caught_up: caughtUp } = first.data
    expect(typeof caughtUp).toBe('boolean')
    expect(items.length).toBeLessThanOrEqual(10)
    expect(exclude).toEqual(expect.arrayContaining(items.map(i => i.id)))
    items.forEach((it, i) => {
      expect(it, `item ${i + 1}`).toMatchObject({ pool: 'friends', position: i + 1 })
      expect(it.day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(['post', 'review']).toContain(it.kind)
      if (it.kind === 'post') expect(it.author.type, 'restaurant posts never appear in Friends').toBe('user')
    })
    const days = items.map(i => i.day)
    expect(days, 'newest day first').toEqual([...days].sort().reverse())
    const second = await call({ p_exclude: exclude, p_limit: 10 })
    expect(second.ok).toBe(true)
    expect(second.data.items.map(i => i.id).filter(id => items.some(x => x.id === id)), 'a page never repeats the excluded ids').toEqual([])

    for (const [args, message] of [
      [{ p_limit: 0 }, 'invalid_limit'], [{ p_limit: 31 }, 'invalid_limit'],
      [{ p_lat: 40.4 }, 'invalid_location'], [{ p_lat: 91, p_lng: 49.8 }, 'invalid_location'],
      [{ p_exclude: Array.from({ length: 301 }, () => crypto.randomUUID()) }, 'too_many_excluded'],
    ]) {
      const r = await call(args)
      expect(r.status, JSON.stringify(args).slice(0, 60)).toBe(400)
      expect(r.error).toBe(message)
    }
    const anon = await H.anonRpc(page.request, v.auth.supabase, 'friends_feed', {})
    expect(anon.ok, 'a signed-out viewer has no friends feed').toBe(false)
    // the contract says not_authenticated; the grant is authenticated-only, so PostgREST refuses before the function runs
    expect(String(anon.message), 'refused for anon').toMatch(/not_authenticated|permission denied/)
  })

  test('a guest without friends sees "No posts from friends" and a Find friends action that works', async ({ page }) => {
    const u = await S.asUser(page, 5)
    await S.purgePosts(u)
    const { answer } = await H.openFriends(page)
    test.skip(answer.items.length > 0, 'review5 has friends or posts of their own on this database now')
    await expect(page.getByText('No posts from friends')).toBeVisible()
    await page.getByRole('link', { name: 'Find friends' }).click()
    await expect(page).toHaveURL(/\/friends\?tab=find/)
  })

  test('Friends fits the phone: no horizontal overflow with day separators, no console errors', async ({ page, browser, watch }, testInfo) => {
    test.setTimeout(90_000)
    const { v, au } = await viewerAuthor(page, browser, testInfo)
    const cap = `${TAG} ${RUN} layout`
    try {
      await S.newPost(au, cap, 'public')
      const w = walker(page, watch, testInfo)
      await H.openFriends(page)
      await reach(page, cap)
      await expect(H.daySeps(page).first()).toBeVisible()
      await w.check('Friends with day separators')
      await w.scrollThrough('Friends')
      const size = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }))
      expect(size.sw, 'document scrollWidth <= innerWidth').toBeLessThanOrEqual(size.iw)
      await settle(page)
      expect(watch.consoleErrors, 'console errors on Friends').toEqual([])
    } finally { await S.purgePosts(au); await S.purgePosts(v); await au.close() }
  })

  // UX round (docs/UX-PLAN-2026-10-18.md 4): a friend's review in this feed is the compact card (variant "card"), not the old 200 px block.
  test('a review of a friend shows as a compact card: <= 140 px, a real name, a labelled verified icon, no "Verified visit" pill', async ({ page }) => {
    await S.asUser(page, 1)
    const { answer } = await H.openFriends(page)
    const reviews = answer.items.filter(i => i.kind === 'review')
    test.skip(reviews.length === 0, 'no friend review on the first page of the Friends feed of review1 right now')
    const cards = page.locator('.soc-feed:visible article.rv--card')
    await expect(cards.first()).toBeVisible()
    for (const c of await cards.all()) {
      await c.scrollIntoViewIfNeeded()
      expect((await U.box(c)).height, 'review card height').toBeLessThanOrEqual(140)
      expect((await c.locator('.rv-name').innerText()).trim()).not.toMatch(/^(Anonymous|Rufesto guest)$/)
      expect(await c.locator('.rv-l1').evaluate(el => el.innerText), 'no "Verified visit" pill text').not.toMatch(/Verified/)
    }
    await expect(page.locator('.soc-feed:visible .rv-kicker'), 'the "Popular review" kicker is Home only').toHaveCount(0)
  })
})
