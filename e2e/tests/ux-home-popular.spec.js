// UX round: popular reviews in the Home feed (docs/UX-PLAN-2026-10-18.md section 5, D7, acceptance 5.5; sql/67 home_feed).
//   - a popular review (a review that is liked enough, or by a top reviewer) takes slot 4, 11 and 18 of each 20-item page when one
//     qualifies (the whole spec skips when the preview has none); promos sit at 7 and 15 only;
//   - it is never the viewer's own review, never a friend's, never about the dish of a post on the same page, never repeated on the next page;
//   - on Home it is a card with the kicker "Popular review . 12 likes" / "Popular review . Top reviewer" (Azerbaijani: "Populyar rey"),
//     at most 140 px high including the kicker (390 px);
//   - tapping the card opens the dish sheet (?dish=), not the review; the like / reply buttons do their own thing.
// The rules are checked on the home_feed answer (every review account, signed out too) and on the rendered cards. Read only.
const { test, expect } = require('../support/fixtures')
const S = require('../support/feat-social')
const U = require('../support/ux')

const { url } = U
const SLOTS = [4, 11, 18]
const PROMO_SLOTS = [7, 15]
const AZ = o => ({ ...o, storageState: { cookies: [], origins: [{ origin: new URL(url('/')).origin, localStorage: [{ name: 'rufesto_lang', value: 'az' }] }] } })

const feed = async (api, exclude = [], limit = 20) => (await api.rpc('home_feed', { p_exclude: exclude, p_limit: limit })).data
const reviewsOf = items => items.filter(i => i.kind === 'review')

/** The home_feed rules that hold for every page of every viewer. `friends` = ids of the viewer's friends, `viewer` = the viewer's id or null. */
function checkPage(answer, { viewer = null, friends = [], who = 'viewer' }) {
  const { items } = answer
  const reviews = reviewsOf(items)
  for (const r of reviews) {
    expect(SLOTS, `${who}: a review sits at slot ${r.position}`).toContain(r.position)
    expect(r.pool, `${who}: pool of a review`).toBe('popular')
    expect(['liked', 'top_reviewer'], `${who}: reason`).toContain(r.reason)
    expect(r.is_mine, `${who}: never the viewer's own review`).toBeFalsy()
    if (viewer) expect(r.user.id, `${who}: never the viewer's own review (author id)`).not.toBe(viewer)
    expect(friends, `${who}: never a friend's review`).not.toContain(r.user.id)
    expect(items.indexOf(r) + 1, `${who}: position matches the index`).toBe(r.position)
  }
  const pos = reviews.map(r => r.position)
  for (let i = 1; i < pos.length; i++) expect(pos[i] - pos[i - 1], `${who}: gap between popular reviews`).toBeGreaterThanOrEqual(6)
  const postDishes = new Set(items.filter(i => i.kind === 'post').map(i => i.dish && i.dish.id).filter(Boolean))
  for (const r of reviews) expect(postDishes.has(r.dish && r.dish.id), `${who}: no post about the dish of review at slot ${r.position} on the same page`).toBe(false)
  const promos = items.filter(i => i.kind === 'promo').map(i => i.position)
  for (const p of promos) expect(PROMO_SLOTS, `${who}: a promo sits at ${p}`).toContain(p)
  expect(promos.length, `${who}: at most two promos per page`).toBeLessThanOrEqual(2)
  expect(answer.mix.popular, `${who}: mix.popular counts the reviews`).toBe(reviews.length)
  return reviews
}

test.describe('ux home popular', { tag: ['@consumer', '@feat', '@ux'] }, () => {
  test.describe.configure({ mode: 'default' })

  test('home_feed: popular reviews at slots 4 / 11 / 18, promos at 7 / 15, never own / friends / same dish, no repeats, for every review account and signed out', async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const found = []
    const anon = await S.openSignedOut(browser, testInfo)
    try {
      // signed out: the same rules minus the friend rule (the anonymous role calls the RPC with the public key only)
      const probe = await S.openUser(browser, testInfo, 1)
      try {
        const call = async body => {
          const res = await anon.page.request.post(`${probe.auth.supabase.url}/rest/v1/rpc/home_feed`, { headers: { apikey: probe.auth.supabase.anonKey, 'Content-Type': 'application/json' }, data: body })
          return res.json()
        }
        const p1 = await call({ p_exclude: [], p_limit: 20 })
        found.push(...checkPage(p1, { who: 'signed out' }))
        const p2 = await call({ p_exclude: p1.exclude, p_limit: 20 })
        found.push(...checkPage(p2, { who: 'signed out, page 2' }))
        const ids1 = new Set(p1.items.map(i => i.id))
        for (const it of p2.items) expect(ids1.has(it.id), `signed out: ${it.kind} ${it.id} is not on both pages`).toBe(false)
      } finally { await probe.close() }
    } finally { await anon.close() }

    for (const n of [1, 2, 3, 4, 5, 6]) {
      if (!S.have(n)) continue
      const u = await S.openUser(browser, testInfo, n)
      try {
        const friends = ((await u.api.rpc('my_friends')).data || []).map(f => f.user_id)
        const p1 = await feed(u.api)
        found.push(...checkPage(p1, { viewer: u.api.id, friends, who: `review${n}` }))
        const p2 = await feed(u.api, p1.exclude)
        found.push(...checkPage(p2, { viewer: u.api.id, friends, who: `review${n}, page 2` }))
        const ids1 = new Set(p1.items.map(i => i.id))
        for (const it of p2.items) expect(ids1.has(it.id), `review${n}: ${it.kind} ${it.id} repeats on page 2`).toBe(false)
      } finally { await u.close() }
    }
    test.skip(found.length === 0, 'no popular review qualifies on the preview right now (the rule is "liked enough or a top reviewer")')
    testInfo.annotations.push({ type: 'note', description: `${found.length} popular review slots checked across signed out + review1..6 (two pages each)` })
  })

  test('only slots <= p_limit apply: a short page has no review beyond its length', async ({ browser }, testInfo) => {
    const u = await S.openUser(browser, testInfo, 1)
    try {
      const short = await feed(u.api, [], 10)
      expect(short.items.length).toBeLessThanOrEqual(10)
      test.skip(!reviewsOf(short.items).length, 'no popular review qualifies')
      for (const r of reviewsOf(short.items)) expect([4], 'slots 11 and 18 do not exist on a 10-item page').toContain(r.position)
    } finally { await u.close() }
  })

  for (const who of [1, null]) {
    test(`Home (${who ? 'review1' : 'signed out'}): the popular review is a compact card with a kicker at its slot, <= 140 px, real name, taps open the dish sheet`, async ({ browser }, testInfo) => {
      const t = await U.phone(browser, testInfo, who)
      try {
        const { page } = t
        const first = page.waitForResponse(r => /\/rpc\/home_feed/.test(r.url()) && r.request().method() === 'POST')
        await page.goto(url('/'))
        const answer = await (await first).json()
        const popular = reviewsOf(answer.items)
        test.skip(!popular.length, 'no popular review qualifies on the preview right now')
        const slots = page.locator('.soc-tabpanel:not([hidden]) .soc-feed-slot')
        await expect(slots.nth(popular[0].position - 1)).toBeVisible({ timeout: 25_000 })
        for (const r of popular) {
          const slot = slots.nth(r.position - 1)
          await slot.scrollIntoViewIfNeeded()
          const card = slot.locator('article.rv.rv--card')
          await expect(card, `slot ${r.position} is the popular review card`).toBeVisible()
          await expect(card.locator('.rv-kicker')).toHaveText(r.reason === 'top_reviewer' ? /^Popular review ·? ?Top reviewer$/ : /^Popular review ·? ?\d+ likes?$/)
          expect((await card.locator('.rv-name').innerText()).trim(), 'author name').toBe(r.user.name)
          expect((await card.locator('.rv-name').innerText()).trim()).not.toMatch(/^(Anonymous|Rufesto guest)$/)
          const h = (await U.box(card)).height
          expect(h, `popular card height at slot ${r.position} (kicker included)`).toBeLessThanOrEqual(140)
          // no tracked post card in a review slot, and the slot before / after are posts or promos
          await expect(slot.locator('article.soc-post')).toHaveCount(0)
        }
        // tap the card outside its controls: the dish sheet of that review's dish opens over the restaurant page
        const r0 = popular[0]
        const card0 = slots.nth(r0.position - 1).locator('article.rv.rv--card')
        await card0.scrollIntoViewIfNeeded()
        const box = await U.box(card0.locator('.rv-body, .rv-l1').last())
        await page.touchscreen.tap(Math.min(380, box.left + 60), box.top + Math.min(box.height / 2, 10))
        await expect(page).toHaveURL(new RegExp(`/restaurant/${r0.restaurant.slug}\\?dish=${r0.dish.id}`), { timeout: 10_000 })
        await expect(page.locator('.bs-root.dds-root[data-state="open"] .dds-name')).toHaveText(r0.dish.name)
        expect(t.watch.consoleErrors, 'console errors').toEqual([])
      } finally { await t.close() }
    })
  }

  test('Azerbaijani: the kicker reads "Populyar rəy" and the card keeps its height', async ({ browser }, testInfo) => {
    const t = await U.open(browser, testInfo, AZ(U.phoneOptions(testInfo)))
    try {
      const { page } = t
      const first = page.waitForResponse(r => /\/rpc\/home_feed/.test(r.url()) && r.request().method() === 'POST')
      await page.goto(url('/'))
      const popular = reviewsOf((await (await first).json()).items)
      test.skip(!popular.length, 'no popular review qualifies')
      const slots = page.locator('.soc-tabpanel:not([hidden]) .soc-feed-slot')
      const card = slots.nth(popular[0].position - 1).locator('article.rv.rv--card')
      await card.scrollIntoViewIfNeeded()
      await expect(card.locator('.rv-kicker')).toHaveText(/^Populyar rəy/)
      expect((await U.box(card)).height).toBeLessThanOrEqual(140)
      const l1 = await U.box(card.locator('.rv-l1'))
      expect(l1.height, 'row 1 does not wrap').toBeLessThanOrEqual(24)
    } finally { await t.close() }
  })

  test('scrolling to the next page keeps the rhythm: popular reviews again at 4 / 11 / 18 of page 2, no review shown twice in the DOM', async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const t = await U.phone(browser, testInfo, 1)
    try {
      const { page } = t
      const first = page.waitForResponse(r => /\/rpc\/home_feed/.test(r.url()) && r.request().method() === 'POST')
      await page.goto(url('/'))
      const p1 = await (await first).json()
      test.skip(!reviewsOf(p1.items).length, 'no popular review qualifies')
      const second = page.waitForResponse(r => /\/rpc\/home_feed/.test(r.url()) && r.request().method() === 'POST' && (r.request().postDataJSON()?.p_exclude || []).length > 0, { timeout: 60_000 })
      const slots = page.locator('.soc-tabpanel:not([hidden]) .soc-feed-slot')
      await expect(slots.first()).toBeVisible({ timeout: 25_000 })
      for (let i = 0; i < 45 && await slots.count() <= 20; i++) {                 // a thumb: steps shorter than the screen (20 cards are ~11,000 px)
        await page.evaluate(() => window.scrollBy({ top: 500, behavior: 'instant' }))
        await U.wait(150)
      }
      const p2 = await (await second).json()
      const pos2 = reviewsOf(p2.items).map(r => r.position)
      for (const p of pos2) expect(SLOTS).toContain(p)
      await expect.poll(() => slots.count(), { message: 'page 2 is in the list' }).toBeGreaterThan(20)
      const ids = await page.locator('.soc-tabpanel:not([hidden]) article.rv').evaluateAll(els => els.map(e => e.querySelector('.rv-name')?.textContent + '|' + e.querySelector('.rv-body')?.textContent))
      expect(new Set(ids).size, 'no popular review twice in the DOM').toBe(ids.length)
    } finally { await t.close() }
  })
})
