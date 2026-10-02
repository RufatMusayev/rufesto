// C. Signed-in guest on the consumer app. Skips unless QA_GUEST_EMAIL / QA_GUEST_PASSWORD
// are set. Read-only: no ordering, nothing is booked, no table is claimed.
const { test, expect } = require('../support/fixtures')
const { CONSUMER_URL, creds } = require('../support/env')
const { signInGuest } = require('../support/guest')

const url = path => CONSUMER_URL + path
const timeSlots = page => page.getByRole('button', { name: /^\d{2}:\d{2}$/ })

test.describe('guest', { tag: ['@guest', '@consumer'] }, () => {
  test.skip(!creds.guest, 'set QA_GUEST_EMAIL and QA_GUEST_PASSWORD to run @guest specs')

  test.beforeEach(async ({ page }) => {
    await signInGuest(page, creds.guest)
  })

  test('signed-in guest sees their profile, not the sign-in prompt', async ({ page }) => {
    await page.goto(url('/profile'))
    // Signed-in markers: older builds list "Sign out" on the page, the new profile keeps it in the Settings sheet
    // and shows a "Settings" button instead.
    await expect(page.getByRole('button', { name: 'Sign out' }).or(page.getByRole('button', { name: 'Settings', exact: true })).first()).toBeVisible()
    await expect(page.getByText('Welcome to Rufesto')).toHaveCount(0)
  })

  test('opens a restaurant; the booking wizard offers time slots (nothing is submitted)', async ({ page }) => {
    await page.goto(url('/'))
    await page.getByRole('link', { name: /view menu/i }).first().click()
    await expect(page).toHaveURL(/\/restaurant\/[\w-]+$/)
    // The merged Reserve flow: one "Reserve a table" LINK to the /book/:slug wizard; its step 1 holds date, party size and slots.
    const reserve = page.getByRole('link', { name: /^reserve a table$/i })
    // FIXME(deploy pending): builds before the merged Reserve flow render a "Reserve a Table" button + modal instead.
    const live = await reserve.waitFor({ timeout: 8_000 }).then(() => true, () => false)
    test.fixme(!live, 'merged Reserve flow not deployed yet (preview still has the Reserve a Table modal button)')
    await reserve.click()
    await expect(page).toHaveURL(/\/book\/[\w-]+$/)
    await expect(page.getByRole('heading', { name: 'Choose a time' })).toBeVisible()

    // The restaurant may be closed on a given weekday, and today's earlier slots are greyed out (disabled):
    // walk forward from today until a day has an enabled slot.
    const free = page.locator('.slot-btn:enabled').first()
    let offered = false
    for (let day = 0; day <= 7 && !offered; day++) {
      await page.locator('.bk-day').nth(day).click()
      offered = await free.waitFor({ timeout: 3_000 }).then(() => true, () => false)
    }
    expect(offered, 'no bookable time slots in the next 7 days').toBe(true)
    expect(await timeSlots(page).count()).toBeGreaterThanOrEqual(1)
    await free.click()   // picking a slot only enables Continue; nothing is booked
    await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled()
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
