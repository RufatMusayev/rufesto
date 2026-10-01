// C. Signed-in guest on the consumer app. Skips unless QA_GUEST_EMAIL / QA_GUEST_PASSWORD
// are set. Read-only: no ordering, nothing is booked, no table is claimed.
const { test, expect } = require('../support/fixtures')
const { CONSUMER_URL, creds } = require('../support/env')
const { signInGuest, bakuDate } = require('../support/guest')

const url = path => CONSUMER_URL + path
const timeSlots = page => page.getByRole('button', { name: /^\d{2}:\d{2}$/ })

test.describe('guest', { tag: ['@guest', '@consumer'] }, () => {
  test.skip(!creds.guest, 'set QA_GUEST_EMAIL and QA_GUEST_PASSWORD to run @guest specs')

  test.beforeEach(async ({ page }) => {
    await signInGuest(page, creds.guest)
  })

  test('signed-in guest sees their profile, not the sign-in prompt', async ({ page }) => {
    await page.goto(url('/profile'))
    await expect(page.getByRole('button', { name: 'Sign out' }).first()).toBeVisible()
    await expect(page.getByText('Welcome to Rufesto')).toHaveCount(0)
  })

  test('opens a restaurant; the booking form offers time slots (nothing is submitted)', async ({ page }) => {
    await page.goto(url('/'))
    await page.getByRole('link', { name: /view menu/i }).first().click()
    await expect(page).toHaveURL(/\/restaurant\/[\w-]+$/)
    await page.getByRole('button', { name: 'Reserve a Table' }).click()
    await expect(page.getByRole('heading', { name: 'Reserve a Table' })).toBeVisible()

    // The restaurant may be closed on a given weekday; walk forward until a day has slots.
    const date = page.locator('input[type="date"]')
    let offered = false
    for (let day = 1; day <= 7 && !offered; day++) {
      await date.fill(bakuDate(day))
      offered = await timeSlots(page).first().waitFor({ timeout: 3_000 }).then(() => true, () => false)
    }
    expect(offered, 'no bookable time slots in the next 7 days').toBe(true)
    expect(await timeSlots(page).count()).toBeGreaterThanOrEqual(1)
  })

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 } })   // BottomNav (QR button) only renders <= 768px

    test('opens the table-code sheet', async ({ page }) => {
      await page.goto(url('/'))
      const seated = await page.getByRole('button', { name: 'Active table' }).count()
      test.skip(seated > 0, 'guest account is already seated at a table')

      await page.getByRole('button', { name: 'Scan QR' }).click()
      await expect(page.getByRole('heading', { name: 'Scan Table QR' })).toBeVisible()
      await page.getByRole('button', { name: 'Enter code manually' }).click()
      await expect(page.getByPlaceholder('Paste table token (UUID)')).toBeVisible()
      await page.getByRole('button', { name: 'Cancel' }).click()
      await expect(page.getByRole('heading', { name: 'Scan Table QR' })).toHaveCount(0)
    })
  })
})
