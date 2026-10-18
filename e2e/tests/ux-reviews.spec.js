// UX round: the compact review row ("tweet card") and the places it lives in (docs/UX-PLAN-2026-10-18.md section 4, D6, acceptance 4.6;
// client/src/features/reviews/*): the dish sheet, the Search zero state ("Top reviews"), the restaurant reviews sheet and the replies sheet.
//   - a review row is at most 130 px high at 390 px (plan: 96-104 px with one body line, 116-124 px with two);
//   - real author names everywhere (the old dish sheet printed "Anonymous" for everybody but you): never "Anonymous" / "Rufesto guest" for a demo review,
//     signed in or out, and the names are the ones the dish_reviews RPC returns, in its order (own review first);
//   - the verified mark is an icon with a label (not a pill), the time is short, the stars carry a label, "...more" only sits on clamped text;
//   - the replies sheet opens from the reply button: the review on top, real names in the replies, a composer; a signed-out guest is asked to sign in;
//   - the restaurant reviews sheet (the Reviews stat of the restaurant page) shows the dish, not the venue, with Top | Newest;
//   - Azerbaijani: row 1 never wraps.
// Read only: nothing is liked, replied to or posted on the demo reviews (a like or a reply would notify a demo author for good).
// Phone context 390x844 in both projects. Data: Trattoria Bella Roma, "Espresso" (4 reviews, one with a reply) and "Cappuccino" (3).
const { test, expect } = require('../support/fixtures')
const S = require('../support/feat-social')
const U = require('../support/ux')

const { url } = U
const BELLA = '10000000-0000-0000-0000-000000000001'
const ESPRESSO = '80000001-0000-0000-0000-000000000020'
const CAPPUCCINO = '80000001-0000-0000-0000-000000000021'
const BAD_NAMES = /^(Anonymous|Rufesto guest|Rufesto qonağı|Anonim)$/
const AZ = o => ({ ...o, storageState: { cookies: [], origins: [{ origin: new URL(url('/')).origin, localStorage: [{ name: 'rufesto_lang', value: 'az' }] }] } })

const rows = scope => scope.locator('article.rv')
const dishSheet = page => page.locator('.bs-root.dds-root[data-state="open"] .bs-panel')

/** The dish_reviews answer as a signed-in user (or, with no user, as the anonymous role through the page's request context). */
async function dishReviews(t, dishId, sort = 'top', limit = 10) {
  if (t.api) return (await t.api.rpc('dish_reviews', { p_dish_id: dishId, p_sort: sort, p_limit: limit })).data
  const probe = await S.openUser(t.browserRef, t.testInfo, 1)    // only to learn the Supabase URL and the public key
  try {
    const res = await t.page.request.post(`${probe.auth.supabase.url}/rest/v1/rpc/dish_reviews`, {
      headers: { apikey: probe.auth.supabase.anonKey, 'Content-Type': 'application/json' }, data: { p_dish_id: dishId, p_sort: sort, p_limit: limit },
    })
    return await res.json()
  } finally { await probe.close() }
}

/** Open Bella Roma's dish sheet for `dishId` by the shareable link (?dish=) and wait for its review rows. */
async function openDishSheet(page, dishId, minRows = 2) {
  await page.goto(url(`/restaurant/bella-roma?tab=menu&dish=${dishId}`))
  await expect(page.locator('.bs-root.dds-root[data-state="open"]')).toBeVisible()
  await expect(rows(dishSheet(page)).nth(minRows - 1)).toBeVisible()
  await U.settled(page.locator('.bs-root.dds-root .bs-panel'))
}

test.describe('ux reviews', { tag: ['@consumer', '@feat', '@ux'] }, () => {
  test.describe.configure({ mode: 'default' })

  for (const who of [null, 1]) {
    test(`dish sheet (${who ? 'review1' : 'signed out'}): rows <= 130 px, real names in the order of dish_reviews, never "Anonymous"`, async ({ browser }, testInfo) => {
      const t = await U.phone(browser, testInfo, who)
      t.browserRef = browser; t.testInfo = testInfo
      try {
        const { page } = t
        const answer = await dishReviews(t, CAPPUCCINO)
        expect(answer.items.length, 'Cappuccino has reviews').toBeGreaterThanOrEqual(2)
        await openDishSheet(page, CAPPUCCINO, Math.min(3, answer.items.length))
        const panel = dishSheet(page)
        const names = (await rows(panel).locator('.rv-name').allInnerTexts()).map(s => s.trim())
        expect(names.length).toBeGreaterThanOrEqual(2)
        for (const n of names) expect(n, 'a real author name').not.toMatch(BAD_NAMES)
        expect(names, 'the names and the order come from dish_reviews').toEqual(answer.items.slice(0, names.length).map(i => i.user.name))
        const heights = await rows(panel).evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().height)))
        for (const h of heights) expect(h, `a review row is at most 130 px (got ${heights.join(', ')})`).toBeLessThanOrEqual(130)
        expect(Math.max(...heights), 'sanity: the rows are real rows').toBeGreaterThan(60)
        // the review summary in the header line: ★avg (n)
        await expect(panel.getByRole('heading', { name: /^Reviews/ })).toContainText(`${answer.summary.avg_rating.toFixed(1)} · ${answer.summary.review_count}`)
        expect(t.watch.consoleErrors, 'console errors').toEqual([])
      } finally { await t.close() }
    })
  }

  test('row anatomy: verified is an icon (no pill), short time, labelled stars, avatar, like and reply buttons with a 44 px hit area', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await openDishSheet(page, ESPRESSO, 3)
      const row = rows(dishSheet(page)).first()
      await expect(row.locator('svg[aria-label="Verified visit"], [aria-label="Verified visit"]').first(), 'verified is a labelled icon').toBeVisible()
      expect(await row.locator('.rv-l1').evaluate(el => el.innerText), 'no "Verified visit" pill text is drawn in the name line (the icon only has a label)').not.toMatch(/Verified/)
      await expect(row.locator('time.rv-time')).toHaveText(/^· (now|\d{1,2}m|\d{1,2}h|\d{1,2}d|\d{1,2}w|\d{1,2} [A-Z][a-z]{2}( \d{4})?)$/)
      await expect(row.locator('.rv-stars')).toHaveAttribute('role', 'img')
      await expect(row.locator('.rv-stars')).toHaveAttribute('aria-label', /^[1-5] of 5$/)
      const av = await U.box(row.locator('.rv-av'))
      expect(av.width, '32 px avatar').toBe(32)
      expect(await row.locator('.rv-av img, .rv-av [class*="avatar"]').count() + (await row.locator('.rv-av').innerText()).trim().length, 'avatar picture or initial').toBeGreaterThan(0)
      const row1 = await U.box(row.locator('.rv-l1'))
      expect(row1.height, 'row 1 is one line').toBeLessThanOrEqual(24)
      // 24 px to look at, 44 px to hit (an ::after of -10px): a tap 20 px above / below the middle of the glyph still lands on the button
      for (const sel of ['.rv-like', '.rv-act:not(.rv-like)']) {
        const btn = row.locator(sel).first()
        await btn.scrollIntoViewIfNeeded()
        const hit = await btn.evaluate(el => {
          const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2
          const on = y => { const t = document.elementFromPoint(cx, y); return !!t && (t === el || el.contains(t)) }
          return { visual: Math.round(r.height), up: on(cy - 20), down: on(cy + 20), far: on(cy + 40) }
        })
        expect(hit.visual, `${sel} looks 24 px high`).toBe(24)
        expect(hit.up && hit.down, `${sel} is hit 20 px above and below its middle (44 px target)`).toBe(true)
        expect(hit.far, `${sel} is not hit 40 px away`).toBe(false)
      }
      await expect(row.getByRole('button', { name: /^(Like|Remove like)$/ })).toBeVisible()
      await expect(row.getByRole('button', { name: /^(Reply|\d+ repl)/ })).toBeVisible()
    } finally { await t.close() }
  })

  test('"...more" only sits on text that is really clamped, and opening it does not move the page', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await page.goto(url('/explore'))
      await expect(page.locator('.sr-zero .rv').first()).toBeVisible({ timeout: 25_000 })
      const state = await page.locator('.sr-zero .rv').evaluateAll(els => els.map(el => {
        const body = el.querySelector('.rv-body')
        return { has: !!body, clamped: body ? body.scrollHeight > body.clientHeight + 1 : false, more: !!el.querySelector('.rv-more') }
      }))
      expect(state.length).toBeGreaterThanOrEqual(1)
      for (const s of state.filter(x => x.has)) expect(s.more, 'the "more" link sits exactly on clamped text').toBe(s.clamped)
      // a clamped one expands in place (none in the demo data now: then this only checks the rule above)
      const more = page.locator('.sr-zero .rv-more').first()
      if (await more.count()) {
        await more.scrollIntoViewIfNeeded()
        const y = (await U.probe(page)).winY
        await more.tap()
        await expect(page.locator('.sr-zero .rv-body.is-open').first()).toBeVisible()
        await U.wait(400)
        expect(Math.abs((await U.probe(page)).winY - y), 'the page did not jump').toBeLessThanOrEqual(2)
      } else {
        testInfo.annotations.push({ type: 'note', description: 'no review in the zero state is long enough to be clamped; checked the "more only on clamped text" rule only' })
      }
    } finally { await t.close() }
  })

  test('Search zero state: Top reviews are compact rows with real names', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await page.goto(url('/explore'))
      const reviews = page.locator('.sr-zero .rv')
      await expect(reviews.first()).toBeVisible({ timeout: 25_000 })
      expect(await reviews.count(), 'three top reviews').toBe(3)
      for (const n of await reviews.locator('.rv-name').allInnerTexts()) expect(n.trim(), 'a real author name').not.toMatch(BAD_NAMES)
      const heights = await reviews.evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().height)))
      for (const h of heights) expect(h, `row height (got ${heights.join(', ')})`).toBeLessThanOrEqual(130)
      // row 2 names the dish and the venue; it links to the dish sheet
      const where = reviews.first().locator('a.rv-where')
      await expect(where).toBeVisible()
      expect(await where.getAttribute('href')).toMatch(/^\/restaurant\/[\w-]+\?dish=[0-9a-f-]{36}$/)
      await expect(reviews.first().locator('.rv-where-dish')).not.toBeEmpty()
      await expect(reviews.first().locator('.rv-where-place')).not.toBeEmpty()
    } finally { await t.close() }
  })

  // ------------------------------------------------------------------------------------------------- replies
  for (const who of [null, 1]) {
    test(`replies sheet (${who ? 'review1' : 'signed out'}): opens from the reply button with the review on top, real names, a composer`, async ({ browser }, testInfo) => {
      const t = await U.phone(browser, testInfo, who)
      try {
        const { page } = t
        await openDishSheet(page, ESPRESSO, 3)
        const withReply = rows(dishSheet(page)).filter({ has: page.getByRole('button', { name: /^\d+ repl/ }) }).first()
        await expect(withReply, 'a review with a reply (the demo data has one)').toBeVisible()
        const author = (await withReply.locator('.rv-name').innerText()).trim()
        await withReply.getByRole('button', { name: /^\d+ repl/ }).tap()
        const replies = page.locator('.bs-root[data-state="open"] .bs-panel').filter({ has: page.locator('.rv-composer') })
        await expect(replies).toBeVisible()
        await expect(replies.getByRole('heading', { name: 'Replies' })).toBeVisible()
        await U.settled(replies)
        await expect(replies.locator('.rv-thread-review article.rv .rv-name')).toHaveText(author)
        await expect(replies.locator('.rv-thread-review .rv-actions'), 'no like / reply buttons on the review inside its own thread').toHaveCount(0)
        await expect(replies.locator('.rv-reply').first()).toBeVisible()
        for (const n of await replies.locator('.rv-reply-name').allInnerTexts()) expect(n.trim(), 'real reply author').not.toMatch(BAD_NAMES)
        await expect(replies.locator('.rv-reply .rv-time').first()).toHaveText(/^(now|\d{1,2}m|\d{1,2}h|\d{1,2}d|\d{1,2}w|\d{1,2} [A-Z][a-z]{2}( \d{4})?)$/)
        const input = replies.getByPlaceholder('Write a reply…')
        await expect(input).toBeVisible()
        await expect(replies.getByRole('button', { name: 'Reply', exact: true }), 'Reply is disabled while the field is empty').toBeDisabled()
        if (who) {
          await input.tap()
          await expect(U.authSheet(page)).toHaveCount(0)
          await input.fill('x')
          await expect(replies.getByRole('button', { name: 'Reply', exact: true })).toBeEnabled()
          await input.fill('')                                                    // nothing is posted
        } else {
          await input.tap()
          await expect(U.authSheet(page), 'a signed-out guest is asked to sign in').toBeVisible()
        }
        // Back closes the top sheet only (every sheet owns a history entry): the sheet below it stays
        const before = await U.openSheets(page).count()
        await page.goBack()
        await expect.poll(() => U.openSheets(page).count(), { message: 'Back closed the top sheet only' }).toBe(before - 1)
        await expect(dishSheet(page), 'the dish sheet is still there').toBeVisible()
        expect(t.watch.consoleErrors, 'console errors').toEqual([])
      } finally { await t.close() }
    })
  }

  // ------------------------------------------------------------------------------------ restaurant reviews sheet
  test('restaurant reviews sheet: the Reviews stat opens it, rows name the dish (not the venue), Top | Newest, heights <= 130 px', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await page.goto(url('/restaurant/bella-roma'))
      const stat = page.locator('.rst-stat--tap').filter({ hasText: 'Reviews' })
      await expect(stat).toBeVisible()
      await stat.tap()
      const panel = page.locator('.bs-root[data-state="open"] .bs-panel').filter({ has: page.locator('.rv-list') })
      await expect(panel).toBeVisible()
      await expect(panel.getByRole('heading', { name: 'Reviews of Trattoria Bella Roma' })).toBeVisible()
      await expect(rows(panel).nth(2)).toBeVisible()
      expect(await panel.locator('.rv-where-place').count(), 'the venue is not repeated in a list of one venue').toBe(0)
      expect(await panel.locator('.rv-where-dish').count(), 'every row names its dish').toBeGreaterThanOrEqual(3)
      for (const n of await rows(panel).locator('.rv-name').allInnerTexts()) expect(n.trim()).not.toMatch(BAD_NAMES)
      const top = await rows(panel).locator('.rv-name').allInnerTexts()
      await expect(panel.getByRole('button', { name: 'Top', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await panel.getByRole('button', { name: 'Newest', exact: true }).tap()
      await expect(panel.getByRole('button', { name: 'Newest', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect(rows(panel).first()).toBeVisible()
      const heights = await rows(panel).evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().height)))
      for (const h of heights) expect(h, `row height (got ${heights.slice(0, 8).join(', ')})`).toBeLessThanOrEqual(130)
      // newest first: the relative times never get younger down the list
      const times = () => rows(panel).locator('.rv-l1 time').evaluateAll(els => els.map(e => new Date(e.getAttribute('datetime')).getTime()))
      await expect.poll(async () => {
        const ages = await times()
        return ages.length >= 3 && ages.every((a, i) => i === 0 || a <= ages[i - 1])
      }, { message: 'Newest sorts by time, newest first (the old order stays on screen until the new list arrives)', timeout: 10_000 }).toBe(true)
      testInfo.annotations.push({ type: 'note', description: `Top order: ${top.slice(0, 4).join(', ')}` })
      await page.keyboard.press('Escape')
      await U.noSheet(page)
      await expect(page).toHaveURL(url('/restaurant/bella-roma'))
    } finally { await t.close() }
  })

  // ------------------------------------------------------------------------------------------------ Azerbaijani
  test('Azerbaijani: row 1 of a review never wraps (verified is an icon), nothing is cut at the right edge', async ({ browser }, testInfo) => {
    const t = await U.open(browser, testInfo, AZ(U.phoneOptions(testInfo)))
    try {
      const { page } = t
      await openDishSheet(page, ESPRESSO, 3)
      const panel = dishSheet(page)
      await expect(rows(panel).first()).toBeVisible()
      const l1 = await rows(panel).locator('.rv-l1').evaluateAll(els => els.map(e => ({ h: Math.round(e.getBoundingClientRect().height), over: e.scrollWidth > e.clientWidth + 1 })))
      expect(l1.length).toBeGreaterThanOrEqual(3)
      for (const r of l1) { expect(r.h, 'row 1 is one line in Azerbaijani').toBeLessThanOrEqual(24); expect(r.over, 'row 1 does not overflow').toBe(false) }
      await expect(rows(panel).first().locator('[aria-label="Təsdiqlənmiş ziyarət"]').first(), 'the verified icon has an Azerbaijani label').toBeVisible()
      const edge = await panel.evaluate(p => {
        const right = p.getBoundingClientRect().right
        return [...p.querySelectorAll('.rv-name, .rv-time, .rv-stars, .rv-body')].filter(e => e.getBoundingClientRect().right > right + 1).length
      })
      expect(edge, 'text cut off at the right edge').toBe(0)
      await page.keyboard.press('Escape')
      await U.noSheet(page)
      await page.goto(url('/explore'))
      await expect(page.locator('.sr-zero .rv').first()).toBeVisible({ timeout: 25_000 })
      const zero = await page.locator('.sr-zero .rv .rv-l1').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().height)))
      for (const h of zero) expect(h, 'row 1 in the Azerbaijani zero state').toBeLessThanOrEqual(24)
    } finally { await t.close() }
  })
})
