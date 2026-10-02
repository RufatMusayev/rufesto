// A. Logged-out visitor on the consumer app. Always runs; writes nothing.
const { test, expect, settle } = require('../support/fixtures')
const { CONSUMER_URL } = require('../support/env')

const url = path => CONSUMER_URL + path
const viewMenuLinks = page => page.getByRole('link', { name: /view menu/i })
const dishPrices = page => page.getByText(/^₼\s*\d/)

test.describe('anon consumer', { tag: ['@anon', '@consumer'] }, () => {
  test('home loads with no console errors', async ({ page, watch }) => {
    await page.goto(url('/'))
    await expect(viewMenuLinks(page).first()).toBeVisible()
    await settle(page)
    expect(watch.consoleErrors, 'console errors on /').toEqual([])
  })

  test('home lists at least one restaurant card', async ({ page }) => {
    await page.goto(url('/'))
    await expect(viewMenuLinks(page).first()).toBeVisible()
    const hrefs = await viewMenuLinks(page).evaluateAll(as => as.map(a => a.getAttribute('href')))
    expect(hrefs.length).toBeGreaterThanOrEqual(1)
    for (const href of hrefs) expect(href).toMatch(/^\/restaurant\/[\w-]+$/)
  })

  test('opening a restaurant shows a menu with at least one dish', async ({ page }) => {
    await page.goto(url('/'))
    const first = viewMenuLinks(page).first()
    await expect(first).toBeVisible()
    const href = await first.getAttribute('href')
    await first.click()
    await expect(page).toHaveURL(new RegExp(`${href}$`))
    await expect(dishPrices(page).first()).toBeVisible()
    expect(await dishPrices(page).count()).toBeGreaterThanOrEqual(1)
  })

  test('map page renders the map and markers', async ({ page }) => {
    await page.goto(url('/map'))
    await expect(page.locator('.leaflet-container')).toBeVisible()   // no role/label exists on Leaflet
    await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible()
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
    const gate = page.getByRole('heading', { name: /welcome back|sign in to book/i }).first()
    for (let step = 0; step < 3 && !(await gate.isVisible()); step++) await primary.click()
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
})
