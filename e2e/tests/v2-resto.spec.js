// v2 dashboard (WP4): /bills, /qr-sheet, /settings for the manager; role gating for the waiter. @staff.
// Read-only: nothing is saved, paid or printed. Sessions come from the Supabase auth API (no password typed
// into the form); the same localStorage key works on the dashboard origin because both apps share one project.
const { test, expect, settle } = require('../support/fixtures')
const { RESTO_URL, creds } = require('../support/env')
const { signInGuest } = require('../support/guest')

const url = path => RESTO_URL + path

test.describe('v2 dashboard', { tag: ['@staff', '@resto', '@v2'] }, () => {
  test.describe('manager', () => {
    test.skip(!creds.manager, 'set QA_MANAGER_EMAIL and QA_MANAGER_PASSWORD')
    test.beforeEach(async ({ page }) => { await signInGuest(page, creds.manager) })

    test('/bills loads with its stats and no console errors', async ({ page, watch }) => {
      await page.goto(url('/bills'))
      await expect(page.getByRole('heading', { name: 'Bills', exact: true })).toBeVisible()
      await expect(page.getByText('Active bills')).toBeVisible()
      await expect(page.getByText('Still to collect')).toBeVisible()
      await expect(page.getByRole('button', { name: /^Active \(\d+\)$/ })).toBeVisible()
      await settle(page)
      expect(watch.consoleErrors, 'console errors on /bills').toEqual([])
    })

    test('/qr-sheet shows QR cards and the per-page toggle re-paginates', async ({ page, watch }) => {
      await page.goto(url('/qr-sheet'))
      await expect(page.getByRole('heading', { name: 'QR sheet' })).toBeVisible()
      const cards = page.locator('.v2-qr-preview .v2-qr-card')
      await expect(cards.first()).toBeVisible()
      const total = await cards.count()
      expect(total).toBeGreaterThanOrEqual(1)
      await expect(page.locator('.v2-qr-preview .v2-qr-img').first()).toBeVisible()   // a real QR, not a spinner / failure

      const perPage = n => page.getByRole('radiogroup', { name: 'Per page' }).getByRole('radio', { name: String(n), exact: true })
      await perPage(1).click()
      await expect(perPage(1)).toHaveAttribute('aria-checked', 'true')
      await expect(page.locator('.v2-qr-preview .v2-qr-page--1')).toHaveCount(total)   // one card per sheet
      await perPage(4).click()
      await expect(page.locator('.v2-qr-preview .v2-qr-page--4')).toHaveCount(Math.ceil(total / 4))
      await expect(page.locator('.v2-qr-preview .v2-qr-page--1')).toHaveCount(0)
      expect(watch.consoleErrors, 'console errors on /qr-sheet').toEqual([])
    })

    test('/settings?tab=hours has seven day rows and a Save button', async ({ page }) => {
      await page.goto(url('/settings?tab=hours'))
      await expect(page.getByRole('tab', { name: 'Opening hours' })).toHaveAttribute('aria-selected', 'true')
      await expect(page.locator('.v2-day')).toHaveCount(7)
      await expect(page.getByRole('button', { name: 'Save hours' })).toBeVisible()   // disabled until something changes
    })

    test('/settings?tab=staff lists the team', async ({ page }) => {
      await page.goto(url('/settings?tab=staff'))
      await expect(page.getByRole('heading', { name: 'Team' })).toBeVisible()
      // Managers could only read their own staff row until sql/44 (restaurant_staff RPC) was applied.
      await expect(page.locator('.v2-staff-row').first()).toBeVisible()
      expect(await page.locator('.v2-staff-row').count()).toBeGreaterThanOrEqual(1)
    })
  })

  test('waiter is redirected away from /bills and /settings', async ({ page }) => {
    test.skip(!creds.waiter, 'set QA_WAITER_EMAIL and QA_WAITER_PASSWORD')
    await signInGuest(page, creds.waiter)
    for (const path of ['/bills', '/settings', '/qr-sheet']) {
      await page.goto(url(path))
      await expect(page, `waiter on ${path}`).toHaveURL(/\/waiter$/)   // RoleGate bounces to the role's home
    }
  })
})
