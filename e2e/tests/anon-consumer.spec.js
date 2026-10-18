// A. Logged-out visitor on the consumer app. Always runs; writes nothing.
const { test, expect, settle } = require('../support/fixtures')
const { CONSUMER_URL } = require('../support/env')
const R = require('../support/restaurant')

const url = path => CONSUMER_URL + path
// The restaurant list is the "All places" section of the Search tab (/explore zero state): one 64 px row per restaurant, linking to its page
// (the Discover tab and its "View menu" cards are gone, UX round 2026-10-18).
const placeRows = page => page.locator('.sr-zero a.sr-row')

test.describe('anon consumer', { tag: ['@anon', '@consumer'] }, () => {
  test('home loads on the ranked For you tab with no console errors', async ({ page, watch }) => {
    await page.goto(url('/'))
    await expect(page.getByRole('tab', { name: 'For you', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.soc-feed-slot').first().or(page.getByRole('heading', { name: "You're all caught up" }))).toBeVisible()
    await settle(page)
    expect(watch.consoleErrors, 'console errors on /').toEqual([])
  })

  test('the Search tab (zero state) loads with no console errors and lists restaurant rows', async ({ page, watch }) => {
    await page.goto(url('/explore'))
    await expect(page.getByRole('heading', { name: 'All places', level: 2 })).toBeVisible()
    await expect(placeRows(page).first()).toBeVisible()
    await settle(page)
    expect(watch.consoleErrors, 'console errors on Search').toEqual([])
  })

  test('Search lists at least one restaurant, each linking to its page', async ({ page }) => {
    await page.goto(url('/explore'))
    await expect(placeRows(page).first()).toBeVisible()
    const hrefs = await placeRows(page).evaluateAll(as => as.map(a => a.getAttribute('href')))
    expect(hrefs.length).toBeGreaterThanOrEqual(1)
    for (const href of hrefs) expect(href).toMatch(/^\/restaurant\/[\w-]+$/)
  })

  test('opening a restaurant shows a menu with at least one dish', async ({ page }) => {
    await page.goto(url('/explore'))
    const first = placeRows(page).first()
    await expect(first).toBeVisible()
    const href = await first.getAttribute('href')
    await first.click()
    await expect(page).toHaveURL(new RegExp(`${href}$`))
    await R.showMenu(page)   // the restaurant page opens on Posts; the menu is its Menu tab
    await expect(R.rows(page).first().locator('.mn-price')).toHaveText(/^₼\s*\d/)
    expect(await R.rows(page).count()).toBeGreaterThanOrEqual(1)
  })

  // The Map tab is a MapLibre vector map since fb305b0 (features/map/): .mp-screen, canvas.maplibregl-canvas, pins are button.mp-pin (aria-labelled) or .mp-cluster,
  // the places are also a list (li.mp-li). Without WebGL2 the screen is the list alone (.is-nomap).
  test('map page renders the map, its pins and the place list', async ({ page }) => {
    await page.goto(url('/map'))
    await expect(page.locator('.mp-screen')).toBeVisible()
    await expect(page.locator('li.mp-li').first()).toBeAttached({ timeout: 25_000 })
    if (!(await page.locator('.mp-screen.is-nomap').count())) {
      await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible({ timeout: 25_000 })
      await expect(page.locator('button.mp-pin, .mp-cluster').first()).toBeAttached({ timeout: 25_000 })
    }
  })

  // One "Reserve a table" LINK on the restaurant page opens the /book/:slug wizard. Date, party size and the free
  // slots are public (step 1); the sign-in is asked when the visitor goes on to confirm: the "Continue" button
  // turns into "Sign in to continue" and opens the sign-in sheet. Booking details are never shown signed out.
  test('reserve a table opens the booking wizard and asks a logged-out visitor to sign in to confirm', async ({ page }) => {
    await page.goto(url('/restaurant/bella-roma'))
    const reserve = page.getByRole('link', { name: /^reserve a table$/i })
    // FIXME(deploy pending): builds before the merged Reserve flow render a "Reserve a Table" button + modal instead.
    const live = await reserve.waitFor({ timeout: 8_000 }).then(() => true, () => false)
    test.fixme(!live, 'merged Reserve flow not deployed yet (preview still has the Reserve a Table modal button)')

    await expect(reserve).toHaveAttribute('href', '/book/bella-roma')
    await reserve.click()
    await expect(page).toHaveURL(url('/book/bella-roma'))
    await expect(page.getByRole('heading', { name: 'Choose a time' })).toBeVisible()

    // first bookable slot within a week, then Continue until the wizard needs a session
    const slot = page.locator('.slot-btn:enabled').first()
    for (let day = 0; day <= 7 && !(await slot.isVisible().catch(() => false)); day++) {
      await page.locator('.bk-day').nth(day).click()
      await slot.waitFor({ timeout: 3_000 }).catch(() => {})
    }
    await expect(slot, 'no bookable slot in the next 7 days').toBeVisible()
    await slot.click()
    const primary = page.locator('.bk-cta .btn')
    const gate = page.getByRole('heading', { name: /^welcome( back)?$|sign in to book/i }).first()
    // the sign-in sheet is lazy: give it time to appear after the click instead of clicking again behind its scrim
    for (let step = 0; step < 3 && !(await gate.isVisible()); step++) {
      await primary.click()
      await gate.waitFor({ timeout: 4_000 }).catch(() => {})
    }
    await expect(gate).toBeVisible()
    await expect(page.getByRole('button', { name: /continue with email/i }).first()).toBeVisible()
    await expect(page.getByLabel('Phone number')).toHaveCount(0)   // the contact form only exists for a signed-in guest
  })

  test('/t/:code while logged out shows the sign-in screen', async ({ page }) => {
    await page.goto(url('/t/SOME-CODE'))
    // Builds before the /t/:code route render an empty #root (nginx still answers 200).
    const routeLive = await page
      .waitForFunction(() => (document.getElementById('root')?.innerText || '').trim().length > 0, null, { timeout: 8_000 })
      .then(() => true, () => false)
    // FIXME(deploy pending): route lands with the next deploy; build bfaf042 has no /t/:code.
    test.fixme(!routeLive, '/t/:code route not deployed yet (blank page on bfaf042)')

    await expect(page.getByRole('heading', { name: /sign in to join your table/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /continue with email/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /join this table\?/i })).toHaveCount(0)
  })

  test('/profile while logged out shows the sign-in prompt', async ({ page }) => {
    await page.goto(url('/profile'))
    await expect(page.getByText('Welcome to Rufesto')).toBeVisible()
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('button', { name: /continue with email/i })).toBeVisible()
  })

  // The app follows the OS colour scheme on a first visit (the suite itself runs on dark: playwright.config.js colorScheme).
  for (const scheme of ['light', 'dark']) {
    test(`a first visit follows the OS colour scheme (${scheme})`, async ({ browser }, testInfo) => {
      const context = await browser.newContext({ colorScheme: scheme, storageState: testInfo.project.use.storageState })   // English forced like every other context
      try {
        const page = await context.newPage()
        await page.goto(url('/'))
        await expect(page.locator('html')).toHaveAttribute('data-theme', scheme)
      } finally { await context.close() }
    })
  }

  test('a stored theme choice wins over the OS colour scheme', async ({ browser }, testInfo) => {
    const context = await browser.newContext({ colorScheme: 'light', storageState: testInfo.project.use.storageState })
    try {
      const page = await context.newPage()
      await page.addInitScript(() => { try { localStorage.setItem('rufesto_theme', 'dark') } catch { /* storage blocked */ } })
      await page.goto(url('/'))
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    } finally { await context.close() }
  })
})
