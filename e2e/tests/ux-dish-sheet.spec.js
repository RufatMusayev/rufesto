// UX round: the redesigned dish sheet (docs/UX-PLAN-2026-10-18.md section 7, D9, acceptance 7.6; client/src/components/DishDetailSheet.jsx
// + components/dish/*).
//   - the first screen at 390x844 shows the photo (16:10), the name, the price, the meta line, the actions, the reviews header with the
//     first review, and the sticky footer is on screen at every scroll position;
//   - the clutter is gone: no header row with an emoji avatar, no "Available" badge, no price / rating badges on the photo, no "N likes" line,
//     no "Review" action, no "View menu" link, no order-hint paragraph, no hashtags; Like / Save / Share are three pills, "Write" sits in the
//     reviews header, allergens are folded into one "Ingredients & allergens" row;
//   - footer variants (not seated: "Scan QR to order" + "Reserve"; sold out: "Sold out today"); a signed-out "Scan QR" asks to sign in;
//   - the sheet is URL driven: a shared link opens it, the X closes it and removes ?dish=;
//   - double-tap on the photo likes once and never unlikes (the burst plays); a single tap does nothing; the like is undone at the end;
//   - "Write" opens the small review sheet over the dish sheet (nothing is posted).
// Seated variants ("Add to order" closes the sheet and shows the cart toast) are in feat-table (support/feat-table.js addToCart).
// Phone context 390x844 in both projects. Data: Trattoria Bella Roma, "Espresso" (reviews) and "Risotto alla Milanese" (the like test, review5).
const { test, expect } = require('../support/fixtures')
const S = require('../support/feat-social')
const U = require('../support/ux')

const { url } = U
const BELLA = '10000000-0000-0000-0000-000000000001'
const ESPRESSO = '80000001-0000-0000-0000-000000000020'
const panelOf = page => page.locator('.bs-root.dds-root[data-state="open"] .bs-panel')
const bodyOf = page => page.locator('.bs-root.dds-root .bs-body')

async function openByLink(page, dishId, base = '/restaurant/bella-roma?tab=menu') {
  await page.goto(url(`${base}${base.includes('?') ? '&' : '?'}dish=${dishId}`))
  await expect(panelOf(page)).toBeVisible()
  await expect(panelOf(page).locator('.dds-name')).toBeVisible()
  await U.settled(page.locator('.bs-root.dds-root .bs-panel'), 'the sheet finished sliding in')
}

test.describe('ux dish sheet', { tag: ['@consumer', '@feat', '@ux'] }, () => {
  test.describe.configure({ mode: 'default' })

  test('first screen at 390x844: photo (16:10), name, price, meta, actions, the reviews header and first review, sticky CTA', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await openByLink(page, ESPRESSO)
      const vh = page.viewportSize().height
      const panel = panelOf(page)
      const photo = await U.box(panel.locator('.dds-photo'))
      expect(photo.top, 'the photo starts at the top of the sheet').toBeLessThan(140)
      expect(photo.bottom).toBeLessThan(vh)
      expect(Math.abs(photo.width / photo.height - 1.6), `photo is 16:10 (${photo.width}x${photo.height})`).toBeLessThan(0.03)
      expect(photo.height, 'photo is at most 34 % of the screen').toBeLessThanOrEqual(Math.ceil(vh * 0.34))
      // everything of the first screen is inside the viewport, above the footer
      const foot = await U.box(panel.locator('.bs-foot'))
      for (const [what, sel] of [['name', '.dds-name'], ['price', '.dds-price'], ['meta line', '.dds-meta'], ['actions', '.dds-actions'], ['reviews header', '.rv-sec-head'], ['first review', 'article.rv']]) {
        const b = await U.box(panel.locator(sel))
        expect(b.top, `${what} starts below the top`).toBeGreaterThanOrEqual(0)
        expect(b.bottom, `${what} is visible without scrolling (above the footer at ${foot.top})`).toBeLessThanOrEqual(foot.top + 1)
      }
      await expect(panel.locator('.dds-name')).toHaveText('Espresso')
      await expect(panel.locator('.dds-price')).toHaveText(/₼\s?\d+\.\d{2}/)
      await expect(panel.locator('.dds-meta')).toContainText('Trattoria Bella Roma')
      await expect(panel.locator('.dds-meta')).toContainText(/★\d\.\d \(\d+\)/)
      // the footer is the sticky CTA at the bottom of the screen at every scroll position
      const body = bodyOf(page)
      const max = (await U.probe(page)).bodyMax
      for (const y of [0, Math.round(max / 2), max]) {
        await body.evaluate((el, top) => { el.scrollTop = top }, y)
        await U.wait(120)
        const f = await U.box(panel.locator('.bs-foot'))
        expect(f.bottom, `the footer is on screen at scroll ${y}/${max}`).toBe(vh)
        expect(f.top, 'the footer is one thin row').toBeGreaterThan(vh - 130)
        await expect(panel.getByRole('button', { name: 'Scan QR to order' })).toBeInViewport()
      }
      expect(t.watch.consoleErrors, 'console errors').toEqual([])
    } finally { await t.close() }
  })

  test('the clutter is gone and the new anatomy is there', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await openByLink(page, ESPRESSO)
      const panel = panelOf(page)
      // gone
      await expect(panel.getByText('Available', { exact: true }), 'no "Available" badge').toHaveCount(0)
      await expect(panel.getByText(/View menu/i), 'no "View menu" link').toHaveCount(0)
      await expect(panel.getByText(/^\d+ likes?$/), 'no separate "N likes" line').toHaveCount(0)
      await expect(panel.getByText(/#\w+/), 'no hashtags').toHaveCount(0)
      await expect(panel.getByRole('button', { name: 'Review', exact: true }), 'no "Review" action (it is "Write" in the reviews header)').toHaveCount(0)
      await expect(panel.locator('.dds-photo').getByText(/₼|★/), 'no price or rating badge on the photo').toHaveCount(0)
      await expect(panel.getByText(/^Scan the table QR|tap .* to order|Order from this menu/i), 'no order-hint paragraph').toHaveCount(0)
      expect(await panel.locator('.dds-name').count(), 'the dish name is printed once (no repeated header row)').toBe(1)
      await expect(panel.getByRole('heading', { name: 'Espresso' })).toHaveCount(1)
      // there: three pills, Write in the reviews header, one folded ingredients row
      const labels = await panel.locator('.dds-actions .dds-pill').evaluateAll(els => els.map(e => e.getAttribute('aria-label')))
      expect(labels.length, 'Like, Save, Share').toBe(3)
      expect(labels[0]).toMatch(/like/i)
      for (const h of await panel.locator('.dds-pill').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().height)))) expect(h, 'pill is 36 px').toBeGreaterThanOrEqual(36)
      await expect(panel.locator('.rv-sec-head').getByRole('button', { name: /^Write/ })).toBeVisible()
      await expect(panel.locator('.dds-ing-row')).toHaveText(/Ingredients & allergens/)
      await expect(panel.locator('.dds-ing-body'), 'ingredients and allergens are folded').toHaveCount(0)
      await panel.locator('.dds-ing-row').scrollIntoViewIfNeeded()
      await panel.locator('.dds-ing-row').tap()
      await expect(panel.locator('.dds-ing-body')).toBeVisible()
      await expect(panel.locator('.dds-ing-row')).toHaveAttribute('aria-expanded', 'true')
      // on the restaurant's own page the venue in the meta line is plain text (it links elsewhere)
      await expect(panel.locator('.dds-venue-link')).toHaveCount(0)
      await expect(panel.locator('.dds-venue')).toHaveText('Trattoria Bella Roma')
    } finally { await t.close() }
  })

  test('opened from Search the venue in the meta line links to the menu of that restaurant', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await openByLink(page, ESPRESSO, '/explore')
      const link = panelOf(page).locator('a.dds-venue-link')
      await expect(link).toHaveText('Trattoria Bella Roma')
      await expect(link).toHaveAttribute('href', '/restaurant/bella-roma?tab=menu')
      await link.tap()
      await expect(page).toHaveURL(url('/restaurant/bella-roma?tab=menu'))                 // replaces the dish URL: no ?dish= left behind
    } finally { await t.close() }
  })

  test('footer, not seated: primary "Scan QR to order" (asks a signed-out guest to sign in) and a ghost Reserve link to the booking wizard', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await openByLink(page, ESPRESSO)
      const panel = panelOf(page)
      const scan = panel.getByRole('button', { name: 'Scan QR to order' })
      const reserve = panel.getByRole('link', { name: 'Reserve', exact: true })
      await expect(scan).toBeVisible()
      await expect(reserve).toHaveAttribute('href', '/book/bella-roma')
      await expect(panel.getByRole('button', { name: /^Add to Order/ }), 'no add button when not seated').toHaveCount(0)
      const s = await U.box(scan), r = await U.box(reserve)
      expect(s.width, 'the primary takes the room').toBeGreaterThan(r.width)
      expect(Math.abs(s.top - r.top), 'on one row').toBeLessThanOrEqual(4)
      expect(s.height).toBeGreaterThanOrEqual(44)
      await scan.tap()
      await expect(U.authSheet(page), 'a signed-out guest is asked to sign in before the camera').toBeVisible()
    } finally { await t.close() }
  })

  test('footer, sold out: "Sold out today" instead of the button, a Sold out tag on the photo, Reserve stays', async ({ browser }, testInfo) => {
    const u = await S.openUser(browser, testInfo, 1)
    let gone = null
    try {
      const rows = (await u.api.get('dishes?available=eq.false&select=id,name,restaurant_id&limit=10')).data
      for (const d of Array.isArray(rows) ? rows : []) {
        const r = (await u.api.get(`restaurants?id=eq.${d.restaurant_id}&select=slug`)).data
        if (Array.isArray(r) && r[0]?.slug) { gone = { ...d, slug: r[0].slug }; break }
      }
    } finally { await u.close() }
    test.skip(!gone, 'no sold-out dish on the preview right now')
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await openByLink(page, gone.id, `/restaurant/${gone.slug}?tab=menu`)
      const panel = panelOf(page)
      await expect(panel.locator('.dds-name')).toHaveText(gone.name)
      await expect(panel.locator('.dds-soldtag')).toBeVisible()
      await expect(panel.locator('.dds-soldnote')).toHaveText('Sold out today')
      await expect(panel.getByRole('button', { name: 'Scan QR to order' })).toHaveCount(0)
      await expect(panel.getByRole('button', { name: /^Add to Order/ })).toHaveCount(0)
      await expect(panel.getByRole('link', { name: 'Reserve', exact: true })).toHaveAttribute('href', `/book/${gone.slug}`)
    } finally { await t.close() }
  })

  test('URL driven: a shared link opens the sheet, the X closes it and removes ?dish=, the page stays', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await openByLink(page, ESPRESSO)
      expect(page.url()).toContain(`dish=${ESPRESSO}`)
      await page.locator('.bs-root.dds-root .dds-x').tap()
      await U.noSheet(page)
      expect(page.url(), 'the dish left the URL').not.toContain('dish=')
      expect(new URL(page.url()).pathname).toBe('/restaurant/bella-roma')
      expect(new URL(page.url()).searchParams.get('tab'), 'the menu tab is kept').toBe('menu')
      await expect(page.locator('.mn-row').first()).toBeVisible()
    } finally { await t.close() }
  })

  test('double-tap on the photo likes once and never unlikes (burst plays); a single tap does nothing; undone at the end', async ({ browser }, testInfo) => {
    test.setTimeout(80_000)
    const t = await U.phone(browser, testInfo, 5)
    let dishId = null
    try {
      const { page } = t
      const found = (await t.api.get(`dishes?restaurant_id=eq.${BELLA}&name=eq.Risotto%20alla%20Milanese&select=id`)).data
      dishId = found[0].id
      const mine = async () => (await t.api.get(`likes?user_id=eq.${t.api.id}&target_type=eq.dish&target_id=eq.${dishId}&select=id`)).data.length
      await t.api.del(`likes?user_id=eq.${t.api.id}&target_type=eq.dish&target_id=eq.${dishId}`)       // a leftover of a crashed run
      await openByLink(page, dishId)
      const panel = panelOf(page)
      const like = panel.locator('.dds-actions .dds-pill').first()
      await expect(like).toHaveAttribute('aria-pressed', 'false')
      const count = async () => Number((await like.locator('.dds-pill-n').textContent().catch(() => '0')) || 0)
      const base = await count()
      const ph = await U.box(panel.locator('.dds-photo'))
      const x = ph.left + ph.width / 2, y = ph.top + ph.height / 2
      // one tap: nothing
      await page.touchscreen.tap(x, y)
      await U.wait(500)
      await expect(like).toHaveAttribute('aria-pressed', 'false')
      expect(await mine(), 'a single tap likes nothing').toBe(0)
      // double tap: liked, +1, the burst plays
      await page.touchscreen.tap(x, y)
      await page.touchscreen.tap(x, y)
      await expect(like).toHaveAttribute('aria-pressed', 'true')
      await expect(panel.locator('.dds-burst')).toBeVisible()
      await expect.poll(count, { message: 'the count went up by one' }).toBe(base + 1)
      await expect.poll(mine, { message: 'the like is stored' }).toBe(1)
      await expect(panel.locator('.dds-burst'), 'the burst fades out').toHaveCount(0, { timeout: 3_000 })
      // a second double tap does not unlike
      await U.wait(450)
      await page.touchscreen.tap(x, y)
      await page.touchscreen.tap(x, y)
      await expect(panel.locator('.dds-burst')).toBeVisible()
      await U.wait(700)
      await expect(like).toHaveAttribute('aria-pressed', 'true')
      expect(await count(), 'the count did not drop').toBe(base + 1)
      expect(await mine(), 'the like is still there').toBe(1)
      // undo with the pill (it toggles)
      await like.tap()
      await expect(like).toHaveAttribute('aria-pressed', 'false')
      await expect.poll(mine, { message: 'the like is removed' }).toBe(0)
      expect(t.watch.consoleErrors, 'console errors').toEqual([])
    } finally {
      if (dishId) await t.api.del(`likes?user_id=eq.${t.api.id}&target_type=eq.dish&target_id=eq.${dishId}`)
      await t.close()
    }
  })

  test('Write opens the small review sheet over the dish sheet (stars, text, Add photo, Post disabled until a rating); a signed-out guest is asked to sign in', async ({ browser }, testInfo) => {
    const anon = await U.phone(browser, testInfo)
    try {
      await openByLink(anon.page, ESPRESSO)
      await panelOf(anon.page).locator('.rv-sec-head').getByRole('button', { name: /^Write/ }).tap()
      await expect(U.authSheet(anon.page)).toBeVisible()
    } finally { await anon.close() }

    const t = await U.phone(browser, testInfo, 5)
    try {
      const { page } = t
      await openByLink(page, ESPRESSO)
      const write = panelOf(page).locator('.rv-sec-head').getByRole('button', { name: /^Write/ })
      test.skip(await write.count() === 0, 'review5 already reviewed this dish')
      await write.tap()
      const sheet = page.locator('.bs-root[data-state="open"] .bs-panel').filter({ has: page.locator('.dds-wr') })
      await expect(sheet).toBeVisible()
      await expect(sheet.getByRole('heading', { name: 'Write a review' })).toBeVisible()
      await expect(sheet.getByRole('radiogroup', { name: 'Your rating' }).getByRole('radio')).toHaveCount(5)
      await expect(sheet.getByRole('button', { name: 'Post', exact: true })).toBeDisabled()
      await sheet.getByRole('radio', { name: '4', exact: true }).tap()
      await expect(sheet.getByRole('button', { name: 'Post', exact: true })).toBeEnabled()
      await expect(sheet.getByRole('button', { name: /Add photo/ })).toBeVisible()
      // the dish sheet is still under it; Esc closes the top one only, nothing was posted
      await page.keyboard.press('Escape')
      await expect.poll(() => U.openSheets(page).count()).toBe(1)
      await expect(panelOf(page)).toBeVisible()
      expect((await t.api.get(`reviews?user_id=eq.${t.api.id}&dish_id=eq.${ESPRESSO}&select=id`)).data.length, 'nothing posted').toBe(0)
    } finally { await t.close() }
  })

  test('Save and Share: Share copies the link (toast) where the browser has no share sheet; the pills toggle', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo, 5)
    const had = (await t.api.get(`saved_dishes?user_id=eq.${t.api.id}&dish_id=eq.${ESPRESSO}&select=id`)).data.length > 0
    try {
      const { page } = t
      await t.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url('/')).origin }).catch(() => {})
      await page.addInitScript(() => { try { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }) } catch { /* keep */ } })
      await openByLink(page, ESPRESSO)
      const panel = panelOf(page)
      await panel.getByRole('button', { name: 'Share this dish' }).tap()
      await expect(panel.locator('.dds-toast')).toHaveText('Link copied')
      const link = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null)
      if (link) expect(link).toBe(url(`/restaurant/bella-roma?tab=menu&dish=${ESPRESSO}`))
      // save is undone at the end (saved_dishes is the guest's own list)
      const save = panel.locator('.dds-actions .dds-pill').nth(1)
      const before = await save.getAttribute('aria-pressed')
      await save.tap()
      await expect(save).toHaveAttribute('aria-pressed', before === 'true' ? 'false' : 'true')
      await expect(panel.locator('.dds-toast')).toContainText(/list/)
      await save.tap()
      await expect(save).toHaveAttribute('aria-pressed', before)
    } finally {
      if (!had) await t.api.del(`saved_dishes?user_id=eq.${t.api.id}&dish_id=eq.${ESPRESSO}`)   // only what this test made
      await t.close()
    }
  })

  // round 4 (QA round 3): the sheet opens at once from the card's own data (name, photo, price, venue) and the full row fills in the rest
  test('opened from a Search row the sheet shows the dish at once (name, price, venue) while the full read is still on its way', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await page.route('**/rest/v1/dishes?*', async route => {
        if (/[?&]id=eq\./.test(route.request().url())) await new Promise(r => setTimeout(r, 3_000))   // the by-id read of the sheet host
        await route.continue().catch(() => {})
      })
      await page.goto(url('/explore'))
      const row = page.locator('.sr-zero .sr-row-btn').first()
      await expect(row).toBeVisible({ timeout: 25_000 })
      const name = (await row.locator('.sr-name').innerText()).trim()
      const price = (await row.locator('.sr-price').innerText()).trim()
      const t0 = Date.now()
      await row.tap()
      await expect(panelOf(page).locator('.dds-name')).toHaveText(name, { timeout: 1_500 })
      const shownAfter = Date.now() - t0
      await expect(panelOf(page).locator('.dds-price')).toHaveText(price)
      await expect(panelOf(page).locator('.dds-meta')).not.toBeEmpty()
      await expect(panelOf(page).locator('.dds-photo')).toBeVisible()
      await expect(panelOf(page).locator('.dds-desc-sk'), 'a skeleton stands in for the description while the full read loads').toBeVisible()
      testInfo.annotations.push({ type: 'timing', description: `tap to the seeded sheet: ${shownAfter} ms (the full read was held back 3 s)` })
      expect(shownAfter, 'the sheet did not wait for the by-id read').toBeLessThan(2_000)
      await expect(panelOf(page).locator('.dds-desc-sk'), 'the full read filled it in').toHaveCount(0, { timeout: 8_000 })
      await expect(panelOf(page).locator('.dds-name')).toHaveText(name)
    } finally { await t.close() }
  })

  test('the close button and the Like / Save / Share pills are 44 px targets (round 4: the close disc was 36 px)', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await openByLink(page, ESPRESSO)
      const x = await U.box(panelOf(page).locator('.dds-x'))
      expect(x.width, 'close button width').toBeGreaterThanOrEqual(44)
      expect(x.height, 'close button height').toBeGreaterThanOrEqual(44)
      await expect(panelOf(page).locator('.dds-actions .dds-pill').first(), 'the Like pill has a word now').toContainText(/like/i)
      for (const pill of await panelOf(page).locator('.dds-actions .dds-pill').all()) {
        expect((await pill.evaluate(el => Math.round(el.getBoundingClientRect().height))), 'a pill is a 44 px box (36 px drawn inside it)').toBeGreaterThanOrEqual(44)
      }
    } finally { await t.close() }
  })
})
