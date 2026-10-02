// v2 group bookings (WP2): wizard -> invite link -> signed-out preview -> manager joins -> leaves -> host cancels.
// @guest (host = guest QA user, member = manager QA user). The booking is cancelled at the end; the finally
// block cancels / leaves over the API when a step failed, so a red run never blocks the next one.
const { test, expect } = require('../support/fixtures')
const { CONSUMER_URL, creds } = require('../support/env')
const { signInGuest } = require('../support/guest')
const { openAs, openAnon, rpc } = require('../support/v2')

const url = path => CONSUMER_URL + path
const PHONE = '+994 50 123 45 67'
const CONSENT = 'Share my name and phone with the restaurant for this booking'
const members = p => p.getByRole('region', { name: "Who's coming" })
const sheetButton = (p, name) => p.locator('.bk-confirm-actions').getByRole('button', { name })

/** Cancel every live booking the QA host still has from an aborted run (they would block the same slot). */
async function cancelStale(page, who) {
  const res = await rpc(page, who, 'list_my_bookings')
  const rows = res.ok ? JSON.parse(res.body) : []
  for (const b of rows.filter(r => ['pending', 'confirmed'].includes(r.status) && r.my_role === 'host')) {
    await rpc(page, who, 'cancel_booking', { p_booking_id: b.booking_id })
  }
}

test.describe('v2 bookings', { tag: ['@guest', '@consumer', '@v2'] }, () => {
  test.skip(!creds.guest || !creds.manager, 'set QA_GUEST_* and QA_MANAGER_*')

  test('book with friends, preview signed out, join, leave, cancel', async ({ page, browser, watch }, testInfo) => {
    test.setTimeout(150_000)
    const host = await signInGuest(page, creds.guest)
    const mgr = await openAs(browser, testInfo, creds.manager)
    const anon = await openAnon(browser, testInfo)
    let bookingId = null
    await cancelStale(page, host)

    try {
      let code
      await test.step('wizard: tomorrow, party of 4, first free slot, submit', async () => {
        await page.goto(url('/book/bella-roma'))
        await expect(page.locator('.bk-stepper-num')).toHaveText('4')
        let picked = false
        for (let day = 1; day <= 7 && !picked; day++) {   // the restaurant may be closed / full on a given weekday
          await page.locator('.bk-day').nth(day).click()
          await page.getByRole('button', { name: 'Continue' }).click()
          const slot = page.locator('.slot-btn:enabled').first()
          picked = await slot.waitFor({ timeout: 6_000 }).then(() => true, () => false)
          if (picked) await slot.click()
          else await page.getByRole('button', { name: 'Try another day' }).click()
        }
        expect(picked, 'no bookable slot in the next 7 days').toBe(true)
        await page.getByRole('button', { name: 'Continue' }).click()
        const phone = page.getByLabel('Phone number')
        if (!(await phone.inputValue())) await phone.fill(PHONE)
        await page.getByLabel(CONSENT).check()
        await page.getByRole('button', { name: 'Create booking & get link' }).click()
        await expect(page.getByRole('heading', { name: 'Booking created' })).toBeVisible()
        const link = await page.getByTestId('invite-link').innerText()
        expect(link).toMatch(/\/b\/[\w-]+$/)
        code = link.split('/b/')[1].trim()
        await page.getByRole('link', { name: 'View booking' }).click()
        await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}$/)
        bookingId = page.url().split('/').pop()
      })

      await test.step('signed-out preview shows the restaurant, no contact details, and a sign-in prompt', async () => {
        await anon.page.goto(url(`/b/${code}`))
        await expect(anon.page.getByRole('heading', { name: /Bella Roma/ })).toBeVisible()
        await expect(anon.page.getByRole('button', { name: 'Sign in to join' })).toBeVisible()
        const text = await anon.page.locator('body').innerText()
        expect(text).not.toContain(creds.guest.email)
        expect(text).not.toMatch(/\d{2}\s?123\s?45\s?67|@/)
      })

      await test.step('manager (a normal user) joins; host sees 2 members', async () => {
        await mgr.page.goto(url(`/b/${code}`))
        await mgr.page.getByLabel(CONSENT).check()
        await mgr.page.getByRole('button', { name: 'Join this booking' }).click()
        await expect(mgr.page).toHaveURL(new RegExp(`/bookings/${bookingId}$`))
        await page.reload()
        await expect(members(page).getByText('2 of 4 joined')).toBeVisible()
        await expect(members(page).locator('li.bk-member:not(.bk-member-open)')).toHaveCount(2)
        await expect(members(page).getByText('QA Manager')).toBeVisible()
      })

      await test.step('member leaves; host is alone again', async () => {
        await mgr.page.getByRole('button', { name: 'Leave booking', exact: true }).click()
        await sheetButton(mgr.page, 'Leave booking').click()
        await expect(mgr.page).toHaveURL(url('/profile'))
        await page.reload()
        await expect(members(page).getByText('1 of 4 joined')).toBeVisible()
      })

      await test.step('host cancels', async () => {
        await page.getByRole('button', { name: 'Cancel booking', exact: true }).click()
        await sheetButton(page, 'Cancel booking').click()
        await expect(page.getByText('This booking was cancelled.').first()).toBeVisible()
        bookingId = null
      })
      expect(watch.consoleErrors, 'console errors for the host').toEqual([])
    } finally {
      if (bookingId) {
        await rpc(page, mgr, 'leave_group_booking', { p_booking_id: bookingId })
        await rpc(page, host, 'cancel_booking', { p_booking_id: bookingId })
      }
      await mgr.close()
      await anon.close()
    }
  })
})
