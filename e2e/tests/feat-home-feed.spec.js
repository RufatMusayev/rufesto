// Consumer Home feed: tabs Home | Friends | Discover, the ranked Home tab (home_feed), restaurant posts as cards, location pill,
// feed events, promo slot. Contract: docs/V2-CONTRACT.md section 17 (sql/58_feed_schema, 59_home_feed, 59b_feed_events).
// UI: client/src/features/feed/*, client/src/features/social/components/{HomeTabs,FeedTab,PostCard,RestaurantPostParts}.jsx,
// texts from client/src/locales/en/social.json.
// Precondition (beforeAll): two Sakura House posts made as manager.sakura with create_restaurant_post (A = photo + available dish,
// B = caption + sold-out dish when Sakura has one). Their captions start with "qa-home"; afterAll deletes every such post and
// photo. Sakura only, never Trattoria Bella Roma. Signed in = the QA guest (QA_GUEST_* in e2e/.env). All sign-ins go through
// the Supabase auth API. Tolerant of other data: only these two posts are asserted by name, never totals.
// Paging is automatic (a marker 3 cards from the end loads the next page): the tests scroll, they never click "Load more".
// Friends (friends_feed) has its own spec, tests/feat-friends-feed.spec.js; Discover is in tests/feat-discovery.spec.js.
// Runs in the desktop and the mobile project (the mobile project needs it in CONSUMER_SPECS, playwright.config.js).
const crypto = require('crypto')
const { test, expect, settle } = require('../support/fixtures')
const S = require('../support/feat-social')
const FF = require('../support/feat-feed')
const { creds } = require('../support/env')
const { walker } = require('../support/mobile')

const { url } = S
const TAG = 'qa-home'
const RUN = Date.now().toString(36)
const cap = label => `${TAG} ${RUN} ${label}`
const BAKU = { latitude: 40.4093, longitude: 49.8671 }
const KINDS = ['impression', 'open', 'like', 'comment', 'save', 'order_tap', 'hide']
let fx = null   // { sakura {id,name,slug}, dish, soldOut, a {id,path,caption}, b {...} }

const { tab, slots, caughtUp, loadMore, bodyOf, rpcRequest, hrefsOf, commentLinks, anonRpc, asAnon, asGuest, openHome, pageUntil, findCard } = require('../support/feat-home')

// ---- fixtures ---------------------------------------------------------------------------------------------------
test.describe('feat home feed', { tag: ['@consumer', '@feat'] }, () => {
  test.skip(!S.have('manager.sakura'), 'manager.sakura not found in docs/REVIEW-ACCOUNTS.md')
  test.describe.configure({ mode: 'default' })   // one worker per file: the posts below are shared by every test

  test.beforeAll(async ({ browser }, testInfo) => {
    const m = await S.openUser(browser, testInfo, S.account('manager.sakura'))
    try {
      const c = FF.client(m.context.request, m.auth)
      await FF.purgePosts(c, TAG)   // leftovers of a crashed run
      const sakura = (await c.get(`restaurants?id=eq.${FF.SAKURA_ID}&select=id,name,slug`)).data[0]
      const { available, soldOut } = await FF.sakuraDishes(c)
      const a = await FF.seedPost(c, { caption: cap('A photo and dish'), photo: true, dishId: available?.id })
      const b = await FF.seedPost(c, { caption: cap('B caption'), dishId: soldOut?.id })
      fx = { sakura, dish: available, soldOut, a, b }
    } finally { await m.close() }
  })
  test.afterAll(async ({ browser }, testInfo) => {
    const m = await S.openUser(browser, testInfo, S.account('manager.sakura'))
    try {
      await FF.purgePosts(FF.client(m.context.request, m.auth), TAG)   // likes on a restaurant post notify nobody (sql/58b), nothing else to tidy
    } finally { await m.close() }
  })

  // ================================================================================================ signed out
  test.describe('signed out', () => {
    test('Home is the default tab: ranked items, no sign-in card, no coordinates sent, no console errors', async ({ browser }, testInfo) => asAnon(browser, testInfo, async ({ page, watch }) => {
      const { body } = await openHome(page)
      await expect(tab(page, 'Home')).toHaveAttribute('aria-selected', 'true')
      for (const name of ['Friends', 'Discover']) await expect(tab(page, name)).toHaveAttribute('aria-selected', 'false')
      expect(body).toMatchObject({ p_exclude: [], p_limit: 20 })
      expect(body, 'no automatic location prompt: the first load has no GPS').not.toHaveProperty('p_lat')
      await expect(page.locator('.soc-signin'), 'reading Home needs no sign-in').toBeHidden()
      await expect(page.getByRole('button', { name: 'Use my location for nearby' })).toBeVisible()
      await settle(page)
      expect(watch.consoleErrors, 'console errors on Home').toEqual([])
    }))

    test('a restaurant post names the restaurant as author, links to it and shows the dish strip and the photo', async ({ browser }, testInfo) => asAnon(browser, testInfo, async ({ page }) => {
      await openHome(page)
      const card = await findCard(page, fx.a.caption)
      const path = `/restaurant/${fx.sakura.slug}`
      await expect(card.locator('header')).toContainText(fx.sakura.name)
      expect(new Set(await hrefsOf(card.locator('header a'))), 'every header link goes to the restaurant').toEqual(new Set([path]))
      await expect(card.locator('header a[href^="/u/"]'), 'no staff profile link').toHaveCount(0)
      expect(new Set(await hrefsOf(card.locator('.soc-caption a')))).toEqual(new Set([path]))
      const img = card.locator('.soc-photo img')
      await expect.poll(() => img.evaluate(i => i.complete && i.naturalWidth > 0), { message: 'the photo (signed r/<restaurant id>/ path) loads for a signed-out viewer' }).toBe(true)
      if (fx.dish) {
        const strip = card.locator('.soc-dish')
        await expect(strip).toContainText(fx.dish.name)
        await expect(strip.locator('.soc-dish-price')).toContainText(/\d/)
        // with a photo the live pill sits over the photo (PhotoChips), without one it is in the strip: look on the whole card
        await expect(card.getByText('Available now', { exact: true })).toBeVisible()
        await expect(strip.getByRole('link', { name: 'Order this' })).toHaveAttribute('href', `${path}?dish=${fx.dish.id}&src=post:${fx.a.id}`)
      }
      if (fx.soldOut) {
        const cardB = await findCard(page, fx.b.caption)
        const strip = cardB.locator('.soc-dish')
        await expect(cardB.getByText('Sold out', { exact: true })).toBeVisible()
        await expect(strip.getByRole('link', { name: 'Order this' }), 'a sold-out dish can still be opened').toBeVisible()
      }
      await card.getByRole('button', { name: 'Like', exact: true }).click()
      await expect(page.locator('.overlay.center'), 'like asks a signed-out viewer to sign in').toBeVisible()
    }))

    test('Friends shows the sign-in card (no All / Friends chips), Discover keeps the restaurant list, the tab is remembered', async ({ browser }, testInfo) => asAnon(browser, testInfo, async ({ page }) => {
      await page.goto(url('/'))
      await tab(page, 'Friends').click()
      await expect(tab(page, 'Friends')).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByText("Sign in to see your friends' posts")).toBeVisible()
      await expect(page.getByText('Posts from you and your friends show up here, newest first.')).toBeVisible()
      await expect(tab(page, 'All'), 'the old scope chips are gone').toHaveCount(0)
      await page.locator('.soc-signin').getByRole('button', { name: 'Sign in' }).click()
      await expect(page.locator('.overlay.center')).toBeVisible()
      await page.reload()
      await expect(tab(page, 'Friends'), 'the last tab is remembered').toHaveAttribute('aria-selected', 'true')
      await tab(page, 'Discover').click()
      await expect(page.getByRole('heading', { name: 'All restaurants', level: 2 }), 'Discover renders its sections').toBeVisible()
      for (const [stored, want] of [['feed', 'Friends'], ['bogus', 'Home']]) {   // the old two-tab build stored 'feed'
        await page.evaluate(v => localStorage.setItem('rufesto_home_tab', v), stored)
        await page.reload()
        await expect(tab(page, want), `remembered tab "${stored}"`).toHaveAttribute('aria-selected', 'true')
      }
    }))

    test('scrolling to the end pages by itself (no Load more) and reaches "You\'re all caught up": no repeats, both posts listed, no chronological tail', async ({ browser }, testInfo) => asAnon(browser, testInfo, async ({ page }) => {
      test.setTimeout(150_000)
      await openHome(page)
      const clicks = await pageUntil(page, null)
      await expect(caughtUp(page)).toBeVisible()
      await expect(page.getByText("Browse every restaurant in Discover, or sign in to see your friends' posts.")).toBeVisible()
      await expect(loadMore(page)).toHaveCount(0)
      await expect(page.locator('section.soc-caught ~ article'), 'a signed-out viewer gets no tail below the end').toHaveCount(0)
      const links = await hrefsOf(commentLinks(page))
      expect(new Set(links).size, 'no post is shown twice').toBe(links.length)
      for (const p of [fx.a, fx.b]) expect(links, `post ${p.id} is on Home`).toContain(`/post/${p.id}`)
      testInfo.annotations.push({ type: 'home-pages', description: `${clicks} scroll rounds, ${links.length} posts` })
      await page.getByRole('button', { name: 'Open Discover' }).click()
      await expect(tab(page, 'Discover')).toHaveAttribute('aria-selected', 'true')
    }))

    test('impressions go out with an anon_key and the call succeeds', async ({ browser }, testInfo) => asAnon(browser, testInfo, async ({ page }) => {
      const sent = rpcRequest(page, 'log_feed_events', b => (b.p_events || []).some(e => e.event === 'impression'))
      await openHome(page)
      const req = await sent
      const events = bodyOf(req).p_events
      expect(events.length).toBeGreaterThan(0)
      expect(events.length).toBeLessThanOrEqual(50)
      const key = await page.evaluate(() => localStorage.getItem('rufesto_feed_anon'))
      for (const e of events) {
        expect(e.item_id).toMatch(FF.UUID)
        expect(['post', 'promo']).toContain(e.item_type)
        expect(KINDS).toContain(e.event)
        expect(e.anon_key).toBe(key)
      }
      expect(key).toMatch(/^[A-Za-z0-9_-]{8,64}$/)
      const res = await req.response()
      expect(res.status()).toBe(200)
      expect(typeof (await res.json())).toBe('number')
    }))

    test('the location pill asks on tap: 3-decimal coordinates reach home_feed, the radius line shows, the next visit is silent', async ({ browser }, testInfo) => asAnon(browser, testInfo, async ({ page }) => {
      await openHome(page)
      const pill = page.getByRole('button', { name: 'Use my location for nearby' })
      const withGps = rpcRequest(page, 'home_feed', b => b.p_lat !== undefined)
      await pill.click()
      expect(bodyOf(await withGps)).toMatchObject({ p_lat: 40.409, p_lng: 49.867 })
      await expect(page.getByText(/^Nearby: places within \d+(\.\d+)? km$/)).toBeVisible()
      await expect(pill).toHaveCount(0)
      expect(await page.evaluate(() => localStorage.getItem('rufesto_geo_ok'))).toBe('1')
      const withDistance = await page.locator('.soc-post-where, .soc-chip').filter({ hasText: /\d km/ }).count()
      testInfo.annotations.push({ type: 'cards-with-distance', description: String(withDistance) })

      const next = rpcRequest(page, 'home_feed')
      await page.reload()
      expect(bodyOf(await next), 'the first load of the next visit already carries the coordinates').toMatchObject({ p_lat: 40.409, p_lng: 49.867 })
      await expect(page.getByText(/^Nearby: places within/)).toBeVisible()
    }, { permissions: ['geolocation'], geolocation: BAKU }))

    test('a location that cannot be had keeps the pill and the GPS-off feed', async ({ browser }, testInfo) => asAnon(browser, testInfo, async ({ page }) => {
      await openHome(page)
      const pill = page.getByRole('button', { name: 'Use my location for nearby' })
      await pill.click()   // no permission granted in this context
      await expect(page.getByRole('status').filter({ hasText: /Location is off for this site|Couldn't get your location/ })).toBeVisible({ timeout: 15_000 })
      await expect(pill).toBeVisible()
      await expect(page.getByText(/^Nearby: places within/)).toHaveCount(0)
      await expect(slots(page).first()).toBeVisible()
    }))

    test('promo slot: an active ad campaign shows as a Promoted card at position 5', async ({ browser }, testInfo) => asAnon(browser, testInfo, async ({ page }) => {
      const { supa } = await openHome(page)
      const camps = (await anonRpc(page.request, supa, 'public_ad_campaigns')).data
      const live = (Array.isArray(camps) ? camps : []).filter(c => !c.dishes || c.dishes.available)
      test.skip(live.length === 0, 'no active ad_campaign with an available dish on this database')
      test.skip(await slots(page).count() < 5, 'fewer than 5 ranked items: no promo slot yet')
      const promo = slots(page).nth(4)   // slots 5, 10, 15, 20 (1-based) are promo slots; signed out without GPS every active promo qualifies
      await expect(promo.getByText('Promoted', { exact: true })).toBeVisible()
      const text = await promo.innerText()
      expect(live.some(c => text.includes(c.restaurants.name)), 'the promo is one of the active campaigns').toBe(true)
    }))

    test('home_feed and home_feed_new_count contract through the public API: mixes, radius, limits, errors, no direct feed_events read', async ({ browser }, testInfo) => asAnon(browser, testInfo, async ({ page }) => {
      const { supa } = await openHome(page)
      const feed = args => anonRpc(page.request, supa, 'home_feed', args)
      const plain = await feed({ p_exclude: [], p_limit: 5 })
      expect(plain.ok).toBe(true)
      expect(plain.data).toMatchObject({ mix: { nearby: 0, following: 0, discover: 10 }, radius_km: null, caught_up: false })
      expect(plain.data.items.length).toBeLessThanOrEqual(5)
      plain.data.items.forEach((it, i) => expect(it).toMatchObject({ position: i + 1, pool: expect.stringMatching(/^(discover|promo)$/) }))
      const ids = plain.data.items.map(i => i.id)
      expect(plain.data.exclude).toEqual(expect.arrayContaining(ids))
      const second = await feed({ p_exclude: plain.data.exclude, p_limit: 5 })
      expect(second.data.items.map(i => i.id).filter(id => ids.includes(id)), 'a page never repeats the excluded ids').toEqual([])

      const gps = await feed({ p_lat: BAKU.latitude, p_lng: BAKU.longitude, p_exclude: [], p_limit: 10 })
      expect(gps.data.mix).toEqual({ nearby: 7, following: 0, discover: 3 })
      expect([3, 6, 12, 50]).toContain(Number(gps.data.radius_km))

      for (const [args, message] of [
        [{ p_limit: 0 }, 'invalid_limit'], [{ p_limit: 31 }, 'invalid_limit'],
        [{ p_lat: 40.4 }, 'invalid_location'], [{ p_lat: 91, p_lng: 49.8 }, 'invalid_location'],
        [{ p_exclude: Array.from({ length: 301 }, () => crypto.randomUUID()) }, 'too_many_excluded'],
      ]) {
        const r = await feed(args)
        expect(r.status, JSON.stringify(args).slice(0, 60)).toBe(400)
        expect(r.message).toBe(message)
      }
      const since = new Date(Date.now() - 3_600_000).toISOString()
      const fresh = await anonRpc(page.request, supa, 'home_feed_new_count', { p_since: since })
      expect(fresh.data, 'both fixture posts are newer than an hour').toBeGreaterThanOrEqual(2)
      expect(fresh.data).toBeLessThanOrEqual(50)
      expect((await anonRpc(page.request, supa, 'home_feed_new_count', { p_since: new Date(Date.now() + 60_000).toISOString() })).data).toBe(0)

      const noKey = await anonRpc(page.request, supa, 'log_feed_events', { p_events: [{ item_type: 'post', item_id: fx.a.id, event: 'impression' }] })
      expect(noKey.message, 'a signed-out viewer needs an anon_key').toBe('invalid_anon_key')
      const tooMany = await anonRpc(page.request, supa, 'log_feed_events', { p_events: Array.from({ length: 51 }, () => ({ item_type: 'post', item_id: fx.a.id, event: 'impression', anon_key: 'qa-home-key-1' })) })
      expect(tooMany.message).toBe('too_many_events')
      const direct = await page.request.get(`${supa.url}/rest/v1/feed_events?select=id&limit=1`, { headers: { apikey: supa.anonKey } })
      expect(direct.ok() ? await direct.json() : [], 'feed_events is not readable by clients').toEqual([])
    }))

    test('Home fits the phone: no horizontal overflow, tabs and pill on screen, Friends and Discover too', async ({ browser }, testInfo) => asAnon(browser, testInfo, async ({ page, watch }) => {
      const w = walker(page, watch, testInfo)
      await openHome(page)
      await w.check('Home')
      const size = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }))
      expect(size.sw, 'document scrollWidth <= innerWidth').toBeLessThanOrEqual(size.iw)
      const phone = S.isPhone(page)
      for (const name of ['Home', 'Friends', 'Discover']) {
        await expect(tab(page, name)).toBeVisible()
        const box = await tab(page, name).boundingBox()
        expect(box.x, `${name} tab left edge`).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width, `${name} tab right edge`).toBeLessThanOrEqual(size.iw + 0.5)
        if (phone) expect.soft(box.height, `${name} tab height`).toBeGreaterThanOrEqual(40)
      }
      const pill = page.getByRole('button', { name: 'Use my location for nearby' })
      if (phone) expect.soft((await pill.boundingBox()).height, 'location pill height').toBeGreaterThanOrEqual(40)
      await w.scrollThrough('Home')
      await tab(page, 'Friends').click()
      await w.check('Friends, signed out')
      await tab(page, 'Discover').click()
      await expect(page.getByRole('heading', { name: 'All restaurants', level: 2 })).toBeVisible()
      await w.check('Discover')
    }))
  })

  // ================================================================================================ signed in (QA guest)
  test.describe('signed in', () => {
    test.skip(!creds.guest, 'QA_GUEST_EMAIL / QA_GUEST_PASSWORD not set in e2e/.env')

    test('Home loads, shows no sign-in card; Friends is a feed or an empty state without restaurant posts', async ({ browser }, testInfo) => asGuest(browser, testInfo, async ({ page, watch }) => {
      await openHome(page)
      await expect(tab(page, 'Home')).toHaveAttribute('aria-selected', 'true')
      await expect(page.locator('.soc-signin')).toBeHidden()
      await tab(page, 'Friends').click()
      await expect(page.locator('.soc-signin'), 'a signed-in viewer does not get the sign-in card').toBeHidden()
      const friends = page.locator('.soc-feed:visible')
      await expect(friends.locator('article').or(friends.getByText('No posts from friends')).first()).toBeVisible()
      await expect(friends.locator('article').filter({ hasText: TAG }), 'restaurant posts are not in the Friends feed (sql/58b)').toHaveCount(0)
      await settle(page)
      expect(watch.consoleErrors, 'console errors').toEqual([])
    }))

    test('scrolling to the end reaches "You\'re all caught up" and a chronological tail follows without repeating Home', async ({ browser }, testInfo) => asGuest(browser, testInfo, async ({ page }) => {
      test.setTimeout(150_000)
      await openHome(page)
      await pageUntil(page, null)
      await expect(caughtUp(page)).toBeVisible()
      await expect(page.getByText("You've seen the latest. More from everyone, newest first:")).toBeVisible()
      await expect(page.getByRole('button', { name: 'Open Discover' }), 'the tail replaces the Discover shortcut').toHaveCount(0)
      await expect(page.locator('section.soc-caught ~ [aria-busy="true"]')).toHaveCount(0)
      const ranked = await hrefsOf(commentLinks(page))
      expect(new Set(ranked).size, 'no post is shown twice').toBe(ranked.length)
      const tail = await hrefsOf(page.locator('section.soc-caught ~ article a[aria-label="Comments"]'))
      expect(tail.filter(h => ranked.includes(h)), 'the tail repeats nothing Home showed').toEqual([])
    }))

    test('"Order this" opens the restaurant with the dish sheet and logs order_tap', async ({ browser }, testInfo) => asGuest(browser, testInfo, async ({ page }) => {
      test.skip(!fx.dish, 'Sakura House has no available dish')
      await openHome(page)
      const card = await findCard(page, fx.a.caption)
      const tapped = rpcRequest(page, 'log_feed_events', b => (b.p_events || []).some(e => e.event === 'order_tap' && e.item_id === fx.a.id))
      await card.getByRole('link', { name: 'Order this' }).click()
      await expect(page).toHaveURL(new RegExp(`/restaurant/${fx.sakura.slug}\\?`))
      const u = new URL(page.url())
      expect(u.searchParams.get('dish')).toBe(fx.dish.id)
      expect(u.searchParams.get('src')).toBe(`post:${fx.a.id}`)
      const sheet = page.locator('.overlay .sheet').last()
      await expect(sheet).toBeVisible()
      await expect(sheet).toContainText(fx.dish.name)
      const ev = bodyOf(await tapped).p_events.find(e => e.event === 'order_tap')
      expect(ev).toMatchObject({ item_type: 'post', item_id: fx.a.id })
      expect(['nearby', 'following', 'discover']).toContain(ev.pool)
      expect(Number.isInteger(ev.position) && ev.position > 0).toBe(true)
      await page.keyboard.press('Escape')
      await expect(page.locator('.overlay')).toHaveCount(0)
    }))

    test('like toggles on a restaurant post and the like count follows (card and server), logging a like event', async ({ browser }, testInfo) => asGuest(browser, testInfo, async ({ page, context, auth }) => {
      const c = FF.client(context.request, auth)
      const likes = async () => (await FF.restaurantPosts(c)).items.find(i => i.id === fx.a.id)?.like_count
      await openHome(page)
      const card = await findCard(page, fx.a.caption)
      const logged = rpcRequest(page, 'log_feed_events', b => (b.p_events || []).some(e => e.event === 'like' && e.item_id === fx.a.id))
      await card.getByRole('button', { name: 'Like', exact: true }).click()
      await expect(card.getByRole('button', { name: 'Remove like' })).toHaveAttribute('aria-pressed', 'true')
      await expect(card.getByText('1 like', { exact: true })).toBeVisible()
      await expect.poll(likes, { message: 'like_count on the server' }).toBe(1)
      await logged
      await card.getByRole('button', { name: 'Remove like' }).click()
      await expect(card.getByRole('button', { name: 'Like', exact: true })).toHaveAttribute('aria-pressed', 'false')
      await expect(card.locator('.soc-act-likes')).toHaveCount(0)
      await expect.poll(likes, { message: 'like_count after unliking' }).toBe(0)
    }))

    test('an impression is logged and acknowledged; home_feed answers the authenticated client; feed_events and created_by are not readable; a guest cannot delete a restaurant post', async ({ browser }, testInfo) => asGuest(browser, testInfo, async ({ page, context, auth, api }) => {
      const sent = rpcRequest(page, 'log_feed_events', b => (b.p_events || []).some(e => e.event === 'impression'))
      await openHome(page)
      await slots(page).first().scrollIntoViewIfNeeded()
      const req = await sent
      for (const e of bodyOf(req).p_events) {
        expect(e.item_id).toMatch(FF.UUID)
        expect(KINDS).toContain(e.event)
      }
      const res = await req.response()
      expect(res.status()).toBe(200)
      expect(await res.json(), 'rows written').toBeGreaterThanOrEqual(1)

      const c = FF.client(context.request, auth)
      const hf = await c.rpc('home_feed', { p_exclude: [], p_limit: 20 })
      expect(hf.ok, `home_feed HTTP ${hf.status}`).toBe(true)
      expect(hf.data.items.length).toBeGreaterThan(0)
      expect(hf.data.mix).toBeTruthy()
      for (const it of hf.data.items.filter(i => i.kind === 'post')) {
        expect(it.pool).toMatch(/^(nearby|following|discover)$/)
        expect(it.author.type).toMatch(/^(user|restaurant)$/)
        expect(typeof it.liked_by_me).toBe('boolean')
      }
      const direct = await api.get('feed_events?select=id&limit=1')
      expect(direct.ok ? direct.data : [], 'feed_events is not readable by clients (no policy, no grant)').toEqual([])

      // staff identity never reaches a client (sql/58: posts.created_by has no column grant) and sql/58b: only a manager of the restaurant may delete
      const who = await c.get(`posts?id=eq.${fx.a.id}&select=created_by`)
      expect(who.ok, 'posts.created_by must not be selectable by a guest').toBe(false)
      const del = await c.rpc('delete_post', { p_id: fx.a.id })
      expect(del.ok, `delete_post of a restaurant post as a guest (HTTP ${del.status})`).toBe(false)
      expect(del.message).toBe('forbidden')
      expect((await FF.restaurantPosts(c)).items.map(i => i.id), 'the post is still there').toContain(fx.a.id)
    }))
  })
})
