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

  // The booking form (date + time slots) needs a session: BookingModal starts on its
  // 'auth' step when logged out. The slots check lives in guest.spec.js.
  test('reserve a table asks a logged-out visitor to sign in', async ({ page }) => {
    await page.goto(url('/restaurant/bella-roma'))
    await page.getByRole('button', { name: 'Reserve a Table' }).click()
    await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
    await expect(page.getByRole('button', { name: /continue with email/i })).toBeVisible()
    await expect(page.locator('input[type="date"]')).toHaveCount(0)
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
