// Consumer booking features, one test per feature, desktop and the `mobile` project: the merged reserve wizard
// (/book/:slug), the invite page (/b/:code), the booking screen (/bookings/:id), seating ("We're here", "Go to our
// table"), Profile -> Bookings, the /table banner, and the availability rules behind get_available_slots.
// Every group owns its accounts (support/feat-bookings.js `accounts`), so the groups run in parallel workers; the tests
// of one group run in order in one worker and do not depend on each other. Each test creates what it needs (through
// the API when the booking is not the thing under test) and cancels / leaves it in afterEach. The restaurant's side is
// read through REST as the QA manager (bookings, booking_members, booking_contacts). Findings: docs/qa/consumer-bookings.md.
const { test, expect } = require('../support/fixtures')
const { CONSUMER_URL } = require('../support/env')
const { bakuDate } = require('../support/guest')

const F = require('../support/feat-bookings')

const { url, BELLA, SAKURA, PHONE, CONSENT, accounts: A, call, req } = F
const noErrors = watch => expect(watch.consoleErrors, 'console errors').toEqual([])
const dateLabel = i => new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${bakuDate(i)}T12:00:00Z`))
const sheetBtn = (p, name) => p.locator('.bk-confirm-actions').getByRole('button', { name, exact: true })
const members = p => p.getByRole('region', { name: "Who's coming" })
const heading = (p, name) => p.getByRole('heading', { name })
const TAGS = ['@guest', '@consumer', '@feat', '@bookings']

/** Count requests whose URL matches `rx` (POSTs only) while the test runs. */
function countPosts(page, rx) {
  const seen = []
  page.on('request', r => { if (r.method() === 'POST' && rx.test(r.url())) seen.push(r.postDataJSON?.() ?? null) })
  return seen
}

/**
 * On the invite page: tick the consent box and, when the member's profile has no phone number, type one (the page asks for it:
 * the consent promises "name and phone", so the restaurant gets a number). Does not press Join.
 */
async function consentAndPhone(page) {
  await page.getByLabel(CONSENT).check()
  const phone = page.getByLabel('Phone number', { exact: true })
  if ((await phone.count()) && !(await phone.inputValue())) await phone.fill(PHONE)
}

/** The access code printed on the table a booking is (now) assigned to: what the host / members scan on arrival (read as the restaurant). */
async function tableCodeOf(page, mgr, bookingId) {
  const b = (await req(page, mgr, 'GET', `bookings?id=eq.${bookingId}&select=table_id`)).rows[0]
  const c = (await req(page, mgr, 'GET', `table_access_codes?table_id=eq.${b?.table_id}&select=access_code,qr_code_token`)).rows[0]
  return c?.access_code || c?.qr_code_token
}
/** The QR sheet ("Scan Table QR"): headless Chromium has no camera, so type the code like a guest whose camera is blocked would. */
async function scanByCode(p, code) {
  await expect(p.getByRole('heading', { name: 'Scan Table QR' })).toBeVisible()
  await p.getByRole('button', { name: 'Enter code manually' }).click()
  await p.getByPlaceholder('Paste table token (UUID)').fill(code)
  await p.getByRole('button', { name: 'Find Table' }).click()
}

/** Walk the wizard through step 1 (+ step 2 when party > 1) to the confirm form. Returns the picked { label, time }. */
async function toConfirm(page, { party = 2, fromDay = 2, index = 0, invites = null } = {}) {
  await page.goto(url('/book/bella-roma'))
  const picked = await F.wizardPick(page, { party, fromDay, index })
  expect(picked, `a bookable Bella Roma slot for ${party} from day ${fromDay}`).toBeTruthy()
  await page.getByRole('button', { name: 'Continue' }).click()
  if (party > 1) {
    await expect(heading(page, "Who's coming?")).toBeVisible()
    const sw = page.getByRole('switch', { name: 'Invite friends' })
    if (invites != null && (await sw.getAttribute('aria-checked')) !== String(invites)) await sw.click()
    await page.getByRole('button', { name: 'Continue' }).click()
  }
  await expect(page.getByLabel('Your name')).toBeVisible()
  return picked
}
async function fillConfirm(page, { phone = PHONE, consent = true, note = null } = {}) {
  const field = page.getByLabel('Phone number')
  if (phone != null && !(await field.inputValue())) await field.fill(phone)
  if (note != null) await page.getByLabel(/Note for the restaurant/).fill(note)
  if (consent) await page.getByLabel(CONSENT).check()
}

/* ================================================================== WIZARD */

test.describe('wizard', { tag: TAGS }, () => {
  test.describe.configure({ mode: 'default' })
  let host
  let mgr
  test.beforeEach(async ({ page }) => {
    test.skip(!!F.missing('wizardHost') || !!F.missing('bellaManager'), 'needs review5 and manager.bella (docs/REVIEW-ACCOUNTS.md)')
    host = await F.signIn(page, A.wizardHost())
    mgr = await F.apiLogin(page, A.bellaManager())
    await F.releaseAll(page, host)
  })
  test.afterEach(async ({ page }) => { if (host) await F.releaseAll(page, host) })

  test('date strip: 30 days from today with the right dates; a closed day shows the closed notice', async ({ page, watch }) => {
    const api = await F.anonApi(page)
    const hours = await api.get(`operating_hours?restaurant_id=eq.${BELLA}&select=day_of_week,is_closed`)
    const closedDow = hours.filter(h => h.is_closed).map(h => h.day_of_week)
    const chips = page.locator('.bk-day')
    await page.goto(url('/book/bella-roma'))
    await expect(chips).toHaveCount(30)
    await expect(chips.first()).toContainText('Today')
    await expect(chips.first()).toHaveAttribute('aria-pressed', 'true')
    for (let i = 0; i < 30; i++) await expect(chips.nth(i), `chip ${i}`).toHaveAttribute('aria-label', dateLabel(i))
    await expect(page.locator('.bk-day:disabled'), 'day chips are never disabled (closure is known only after tapping)').toHaveCount(0)

    expect(closedDow.length, 'Bella Roma has a weekly closed day').toBeGreaterThan(0)
    const i = Array.from({ length: 30 }, (_, k) => k).find(k => closedDow.includes(F.weekdayOf(bakuDate(k))))
    const answer = page.waitForResponse(r => /get_available_slots/.test(r.url()) && r.request().postDataJSON().p_date === bakuDate(i))
    await chips.nth(i).click()
    expect(await (await answer).json(), 'get_available_slots answers [] on a closed day').toEqual([])
    await expect(page.getByText('The restaurant is closed on this date.')).toBeVisible()
    await expect(page.locator('.slot-btn')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
    await page.getByRole('button', { name: 'Try another day' }).click()
    await chips.nth(i + 1).click()
    await expect(page.locator('.slot-btn').first()).toBeVisible()
    noErrors(watch)
  })

  test('today: slots before now + the minimum notice are disabled, the rest follow the opening hours', async ({ page }) => {
    const api = await F.anonApi(page)
    const hours = (await api.get(`operating_hours?restaurant_id=eq.${BELLA}&select=day_of_week,open_time,close_time,is_closed`))
      .find(h => h.day_of_week === F.weekdayOf(bakuDate(0)))
    const answer = page.waitForResponse(r => /get_available_slots/.test(r.url()) && r.request().postDataJSON().p_date === bakuDate(0))
    await page.goto(url('/book/bella-roma'))
    const slots = await (await answer).json()
    const now = Date.now()
    test.skip(!slots.length && hours.is_closed, 'closed today')
    expect(slots.length, 'slots offered today').toBeGreaterThan(0)
    // Late in the day every slot of today is past or too soon: the wizard then shows one notice instead of a grid of disabled buttons (SlotPicker).
    const anyAvailable = slots.some(s => s.available)
    if (anyAvailable) await expect(page.locator('.slot-btn')).toHaveCount(slots.length)
    else {
      await expect(page.locator('.slot-btn')).toHaveCount(0)
      await expect(page.getByText('No tables are free on this day for your party size.')).toBeVisible()
      test.info().annotations.push({ type: 'note', description: 'no slot left today: the grid of disabled buttons was not exercised (run earlier in the day)' })
    }
    expect(slots[0].slot_time, 'first slot = opening time').toBe(hours.open_time.slice(0, 5))
    const turn = 75   // party of 2
    expect(F.hm(slots.at(-1).slot_time) + turn, 'the last booking ends by closing time').toBeLessThanOrEqual(F.hm(hours.close_time.slice(0, 5)))
    let sawPast = false
    for (const s of slots) {
      const btn = page.locator('.slot-btn', { hasText: s.slot_time })
      const tooSoon = Date.parse(s.starts_at) < now + 30 * 60_000
      if (Math.abs(Date.parse(s.starts_at) - (now + 30 * 60_000)) < 120_000) continue   // clock skew margin
      if (tooSoon) { sawPast = true; expect(s.available, `${s.slot_time} is too soon`).toBe(false); expect(s.reason).toBe('too_soon'); if (anyAvailable) await expect(btn).toBeDisabled() }
      else if (s.tables_free > 0) { expect(s.available, `${s.slot_time} has tables`).toBe(true); await expect(btn).toBeEnabled() }
    }
    if (sawPast && anyAvailable) await expect(page.getByText('Greyed-out times are full or too soon.')).toBeVisible()
  })

  test('party stepper: 1 to 12, resets the picked time, reloads the slots', async ({ page }) => {
    await page.goto(url('/book/bella-roma'))
    const num = page.locator('.bk-stepper-num')
    const more = page.getByRole('button', { name: 'More guests' })
    const fewer = page.getByRole('button', { name: 'Fewer guests' })
    await expect(num).toHaveText('2')
    await F.wizardPick(page, { party: 2, fromDay: 2 })
    await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled()
    const reloaded = page.waitForResponse(r => /get_available_slots/.test(r.url()) && r.request().postDataJSON().p_party_size === 3)
    await more.click()
    await reloaded
    await expect(num).toHaveText('3')
    await expect(page.getByRole('button', { name: 'Continue' }), 'the picked time is cleared when the party changes').toBeDisabled()
    for (let n = 3; n < 12; n++) await more.click()
    await expect(num).toHaveText('12')
    await expect(more).toBeDisabled()
    await expect(page.getByText('guests', { exact: true })).toBeVisible()
    for (let n = 12; n > 1; n--) await fewer.click()
    await expect(num).toHaveText('1')
    await expect(fewer).toBeDisabled()
    await expect(page.getByText('guest', { exact: true })).toBeVisible()
  })

  test('party of 1 skips "Who\'s coming?", books without invites, and the restaurant sees it', async ({ page, watch }) => {
    await toConfirm(page, { party: 1, fromDay: 2 })
    await expect(page.getByRole('list', { name: 'Step 2 of 2' })).toBeVisible()
    await expect(heading(page, "Who's coming?")).toHaveCount(0)
    const summary = page.locator('.bk-summary')
    await expect(summary).toContainText('Trattoria Bella Roma')
    await expect(summary).toContainText('1 guest')
    await expect(summary).not.toContainText('Friends')
    await fillConfirm(page)
    await page.getByRole('button', { name: 'Request booking' }).click()
    await expect(heading(page, 'Request sent')).toBeVisible()
    await expect(page.getByTestId('invite-link'), 'a party of one has no invite link').toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Invite friends' }), 'nobody to invite for a party of one').toHaveCount(0)
    await page.getByRole('link', { name: 'View booking' }).click()
    await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}$/)
    const id = page.url().split('/').pop()
    const dash = await F.dashboardView(page, mgr, id)
    expect(dash.booking, 'the booking row the restaurant sees').toMatchObject({ status: 'pending', party_size: 1, user_id: host.session.user.id })
    expect(dash.booking.table_id, 'a table was assigned').toBeTruthy()
    expect(dash.contacts.map(c => c.phone.replace(/\D/g, '')), 'the host phone reaches the restaurant').toContain(PHONE.replace(/\D/g, ''))
    const inv = (await req(page, host, 'GET', `booking_invites?booking_id=eq.${id}&select=enabled,max_members`)).rows[0]
    expect(inv.enabled, 'invite link off for a party of one').toBe(false)
    noErrors(watch)
  })

  test('party of 2: invites are off by default, the booking is a request, "Invite friends" turns the link on later', async ({ page, watch }) => {
    await toConfirm(page, { party: 2, fromDay: 3 })
    // (toConfirm continued through step 2 with the default; check the default on a fresh pass below)
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(heading(page, "Who's coming?")).toBeVisible()
    await expect(page.getByRole('list', { name: 'Step 2 of 3' })).toBeVisible()
    await expect(page.getByRole('switch', { name: 'Invite friends' })).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByText("We'll book a table for 2 under your name, without a share link.")).toBeVisible()
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.locator('.bk-summary')).toContainText('Not inviting')
    const creates = countPosts(page, /rpc\/create_group_booking/)
    await fillConfirm(page, { note: 'Window seat please' })
    await page.getByRole('button', { name: 'Request booking' }).click()
    await expect(heading(page, 'Request sent')).toBeVisible()
    expect(creates.length).toBe(1)
    expect(creates[0].p_invites, 'the wizard sends p_invites=false').toBe(false)
    await expect(page.getByTestId('invite-link')).toHaveCount(0)
    const id = (await F.liveBookings(page, host)).find(b => b.my_role === 'host').booking_id
    const dash = await F.dashboardView(page, mgr, id)
    expect(dash.booking).toMatchObject({ status: 'pending', party_size: 2, special_requests: 'Window seat please' })

    await page.getByRole('button', { name: 'Invite friends' }).click()
    await expect(page.getByTestId('invite-link')).toBeVisible()
    await expect(heading(page, 'Booking created')).toBeVisible()
    const inv = (await req(page, host, 'GET', `booking_invites?booking_id=eq.${id}&select=enabled`)).rows[0]
    expect(inv.enabled, 'the link is on after "Invite friends"').toBe(true)
    noErrors(watch)
  })

  test('party of 4: invites are on by default, the created screen shows the invite link, Copy confirms', async ({ page, context, watch }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {})
    await toConfirm(page, { party: 4, fromDay: 3 })
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByRole('switch', { name: 'Invite friends' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByText("You'll get the link as soon as you book.")).toBeVisible()
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.locator('.bk-summary')).toContainText('Invite link')
    await fillConfirm(page, { note: 'x'.repeat(220) })
    await expect(page.getByLabel(/Note for the restaurant/), 'the note is capped at 200 characters').toHaveValue('x'.repeat(200))
    await page.getByRole('button', { name: 'Create booking & get link' }).click()
    await expect(heading(page, 'Booking created')).toBeVisible()
    const link = (await page.getByTestId('invite-link').innerText()).trim()
    expect(link).toMatch(new RegExp(`^${CONSUMER_URL}/b/[A-Z0-9-]+$`))
    await expect(page.getByText('1 of 4 joined')).toBeVisible()
    await page.getByRole('button', { name: 'Copy link' }).click()
    await expect(page.getByText('Copied')).toBeVisible()
    await page.getByRole('link', { name: 'View booking' }).click()
    await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}$/)
    const id = page.url().split('/').pop()
    await expect(page.getByTestId('invite-link')).toHaveText(link)
    await expect(members(page)).toContainText('1 of 4 joined')
    const dash = await F.dashboardView(page, mgr, id)
    expect(dash.booking).toMatchObject({ status: 'pending', party_size: 4 })
    expect(dash.booking.special_requests, 'the 200-character note').toBe('x'.repeat(200))
    const inv = (await req(page, host, 'GET', `booking_invites?booking_id=eq.${id}&select=enabled,max_members,code`)).rows[0]
    expect(inv).toMatchObject({ enabled: true, max_members: 4 })
    expect(link.endsWith(`/b/${inv.code}`)).toBe(true)
    noErrors(watch)
  })

  test('confirm form validation: consent, name and phone, and nothing is sent until they are valid', async ({ page }) => {
    await toConfirm(page, { party: 1, fromDay: 3 })
    const creates = countPosts(page, /rpc\/create_group_booking/)
    const name = page.getByLabel('Your name')
    const phone = page.getByLabel('Phone number')
    const submit = page.getByRole('button', { name: 'Request booking' })
    await name.fill('')
    await phone.fill('')
    await submit.click()
    await expect(page.getByText('Enter your name (2 to 80 characters).')).toBeVisible()
    await expect(page.getByText('Enter a valid phone number, for example +994 50 123 45 67.')).toBeVisible()
    await expect(page.getByText('Tick the box to continue.')).toBeVisible()
    await name.fill('A')
    await phone.fill('12345')
    await submit.click()
    await expect(page.getByText('Enter your name (2 to 80 characters).')).toBeVisible()
    await expect(page.getByText('Enter a valid phone number, for example +994 50 123 45 67.')).toBeVisible()
    await phone.fill('abcdefghij')
    await submit.click()
    await expect(page.getByText('Enter a valid phone number, for example +994 50 123 45 67.')).toBeVisible()
    await name.fill('QA Host')
    await phone.fill(PHONE)
    await submit.click()   // consent still missing
    await expect(page.getByText('Tick the box to continue.')).toBeVisible()
    await expect(page.getByText('Enter your name (2 to 80 characters).')).toHaveCount(0)
    await expect(page.getByText('Enter a valid phone number, for example +994 50 123 45 67.')).toHaveCount(0)
    expect(creates.length, 'no booking request before the form is valid').toBe(0)
    expect(await F.liveBookings(page, host)).toHaveLength(0)
  })

  test('a double tap on "Request booking" books once; the same slot again says "already have a booking"', async ({ page }) => {
    const picked = await toConfirm(page, { party: 1, fromDay: 3 })
    const creates = countPosts(page, /rpc\/create_group_booking/)
    await fillConfirm(page)
    await page.getByRole('button', { name: 'Request booking' }).evaluate(b => { b.click(); b.click() })
    await expect(heading(page, 'Request sent')).toBeVisible()
    expect(creates.length, 'create_group_booking calls for a double tap').toBe(1)
    expect(await F.liveBookings(page, host)).toHaveLength(1)

    // the same day and time again, as a second booking at the same restaurant
    await page.goto(url('/book/bella-roma'))
    await F.wizardPick(page, { party: 1, dayIndex: picked.day, index: 99 })   // only selects the day (no 100th slot to click)
    const again = page.locator('.slot-btn', { hasText: picked.time })
    await expect(again, 'the slot of our own booking is still offered').toBeVisible()
    if (await again.isEnabled()) {
      await again.click()
      await page.getByRole('button', { name: 'Continue' }).click()
      await fillConfirm(page)
      await page.getByRole('button', { name: 'Request booking' }).click()
      await expect(page.getByText('You already have a booking here around that time.')).toBeVisible()
      await page.getByRole('button', { name: 'Choose another time' }).click()
      await expect(page.locator('.slot-btn').first()).toBeVisible()
      await expect(page.getByRole('button', { name: 'Continue' }), 'the time is cleared after the error').toBeDisabled()
    }
    expect(await F.liveBookings(page, host)).toHaveLength(1)
  })

  test('back arrow keeps the choices: step 3 -> 2 -> 1 -> restaurant', async ({ page }) => {
    const picked = await toConfirm(page, { party: 3, fromDay: 3 })
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(heading(page, "Who's coming?")).toBeVisible()
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.locator('.slot-btn', { hasText: picked.time })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('.bk-stepper-num')).toHaveText('3')
    await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled()
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page).toHaveURL(/\/(restaurant\/bella-roma|book\/bella-roma)$/)
  })

  // Booking times are the restaurant's (Asia/Baku) clock whatever the guest's browser says: UTC+14 is on the next calendar day.
  test.describe('browser in another time zone', () => {
    test.use({ timezoneId: 'Pacific/Kiritimati' })
    test('day chips, slot times, the booking and the profile list keep the restaurant\'s clock', async ({ page }) => {
      expect(await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe('Pacific/Kiritimati')
      const answer = page.waitForResponse(r => /get_available_slots/.test(r.url()))
      await page.goto(url('/book/bella-roma'))
      const slots = await (await answer).json()
      for (let i = 0; i < 30; i++) await expect(page.locator('.bk-day').nth(i), `chip ${i}`).toHaveAttribute('aria-label', dateLabel(i))
      if (slots.some(s => s.available)) await expect(page.locator('.slot-btn')).toHaveText(slots.map(s => s.slot_time))
      else await expect(page.locator('.slot-btn'), 'no slot left today: the notice replaces the grid').toHaveCount(0)
      const picked = await toConfirm(page, { party: 1, fromDay: 3 })
      await fillConfirm(page)
      await page.getByRole('button', { name: 'Request booking' }).click()
      await expect(heading(page, 'Request sent')).toBeVisible()
      await expect(page.locator('.state-meta')).toContainText(picked.time)
      await page.getByRole('link', { name: 'View booking' }).click()
      const id = page.url().split('/').pop()
      await expect(page.locator('.bk-hero-when')).toContainText(picked.time)
      const dash = await F.dashboardView(page, mgr, id)
      expect(hhmm(Date.parse(dash.booking.reserved_from)), 'reserved_from on the Baku clock').toBe(picked.time)
      await page.goto(url('/profile?tab=bookings'))
      await expect(page.locator(`a.bk-row[href="/bookings/${id}"]`)).toContainText(picked.time)
    })
  })
})

/* ================================================================== INVITES */

/** Book through the API for `host`: first free slot for `party` from `from` days ahead. */
async function make(page, host, { party = 3, invites = true, from = 4, name = 'Elvin Tester', restaurantId = BELLA, skip = 0 } = {}) {
  const slot = await F.findSlot(page, host, { restaurantId, party, from, to: from + 12, skip })
  expect(slot, `a free slot for ${party} from day ${from}`).toBeTruthy()
  const r = await F.createBooking(page, host, { restaurantId, slot, party, invites, name })
  expect(r.ok, `create_group_booking: ${r.code}`).toBe(true)
  return { slot, id: r.booking.booking_id, code: r.booking.invite_code, booking: r.booking }
}
const notificationsOf = async (page, who, type, bookingId) => (await req(page, who, 'GET', `notifications?type=eq.${type}&select=payload`)).rows
  .filter(n => { try { return JSON.parse(n.payload).booking_id === bookingId } catch { return false } })

test.describe('invites', { tag: TAGS }, () => {
  test.describe.configure({ mode: 'default' })
  let host
  let member
  let observer
  let mgr
  test.beforeEach(async ({ page }) => {
    test.skip(!!F.missing('inviteHost', 'inviteMember', 'inviteObserver') || !!F.missing('bellaManager'), 'needs review6, review3, waiter2.sakura and manager.bella (docs/REVIEW-ACCOUNTS.md)')
    ;[host, member, observer, mgr] = await Promise.all([A.inviteHost(), A.inviteMember(), A.inviteObserver(), A.bellaManager()].map(a => F.apiLogin(page, a)))
    for (const w of [host, member, observer]) await F.releaseAll(page, w)
  })
  test.afterEach(async ({ page }) => { for (const w of [host, member, observer]) if (w) await F.releaseAll(page, w) })

  test('signed-out preview shows the restaurant, host first name, time and joined count, and no contact details anywhere', async ({ page, watch }) => {
    const b = await make(page, host, { party: 3, name: 'Elvin Tester' })
    const answered = page.waitForResponse(r => /rpc\/get_group_booking_preview/.test(r.url()))
    await page.goto(url(`/b/${b.code}`))
    const resp = await answered
    await expect(heading(page, 'Trattoria Bella Roma')).toBeVisible()
    await expect(page.getByText('Elvin invited you')).toBeVisible()
    await expect(page.getByText('1 of 3 joined')).toBeVisible()
    await expect(page.getByText(/Party of 3/)).toBeVisible()
    await expect(page.getByText(b.slot.time).first()).toBeVisible()
    await expect(page.getByText('Awaiting confirmation')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign in to join' })).toBeVisible()
    await expect(page.getByLabel(CONSENT), 'no consent box before signing in').toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Join this booking' })).toHaveCount(0)

    await test.step('no personal data in the page or in the preview response', async () => {
      const text = await page.locator('body').innerText()
      const raw = await resp.text()
      const json = JSON.parse(raw)
      const secrets = [host.session.user.email, host.session.user.id, 'Tester', '501234567', '994501234567', '50 123 45 67']
      for (const s of secrets) { expect(text, `page text contains ${s}`).not.toContain(s); expect(raw, `preview JSON contains ${s}`).not.toContain(s) }
      const allowed = ['restaurant', 'starts_at', 'ends_at', 'party_size', 'joined_count', 'member_count', 'spots_left', 'host_first_name', 'host_name',
        'status', 'is_full', 'is_expired', 'joinable', 'already_member', 'booking_id', 'invites_enabled']
      expect(Object.keys(json).filter(k => !allowed.includes(k)), 'unexpected keys in the preview').toEqual([])
      expect(Object.keys(json.restaurant).filter(k => !['id', 'name', 'slug', 'cover_photo', 'address'].includes(k))).toEqual([])
      expect(json.booking_id, 'the booking id stays hidden from non-members').toBeNull()
    })
    await test.step('anonymous REST reads of the booking tables return nothing', async () => {
      const api = await F.anonApi(page)
      for (const t of [`bookings?id=eq.${b.id}`, `booking_members?booking_id=eq.${b.id}`, `booking_contacts?booking_id=eq.${b.id}`, `booking_invites?booking_id=eq.${b.id}`]) {
        expect(await api.get(`${t}&select=*`), `anon read of ${t.split('?')[0]}`).toEqual([])
      }
    })
    await test.step('a lower-case code works, "Sign in to join" opens the sign-in sheet', async () => {
      await page.goto(url(`/b/${b.code.toLowerCase()}`))
      await expect(heading(page, 'Trattoria Bella Roma')).toBeVisible()
      await page.getByRole('button', { name: 'Sign in to join' }).click()
      await expect(page.getByRole('button', { name: /continue with email/i }).first()).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.getByRole('button', { name: /continue with email/i })).toHaveCount(0)
    })
    noErrors(watch)
  })

  test('signed in: consent is required, joining lands on the booking, a double tap joins once, the host is told', async ({ page, watch }) => {
    const b = await make(page, host, { party: 3 })
    await F.signIn(page, A.inviteMember())
    const joins = countPosts(page, /rpc\/join_group_booking/)
    await page.goto(url(`/b/${b.code}`))
    await expect(page.getByLabel(CONSENT)).toBeVisible()
    await page.getByRole('button', { name: 'Join this booking' }).click()
    await expect(page.getByText('Tick the box to continue.')).toBeVisible()
    expect(joins.length, 'no join request without consent').toBe(0)
    await consentAndPhone(page)
    await page.getByRole('button', { name: 'Join this booking' }).evaluate(btn => { btn.click(); btn.click() })
    await expect(page).toHaveURL(new RegExp(`/bookings/${b.id}$`))
    expect(joins.length, 'join_group_booking calls for a double tap').toBe(1)

    await test.step('member view of the booking', async () => {
      await expect(members(page)).toContainText('2 of 3 joined')
      await expect(members(page).locator('li.bk-member:not(.bk-member-open)')).toHaveCount(2)
      await expect(members(page).getByText('(you)')).toHaveCount(1)
      await expect(members(page).getByText('Host', { exact: true })).toHaveCount(1)
      await expect(page.getByText('Guest', { exact: true })).toBeVisible()
      await expect(members(page).locator('li.bk-member').filter({ hasNotText: '(you)' }).locator('a[href^="tel:"]'), "a member sees no other member's phone number (only their own, which they just typed)").toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Cancel booking' }), 'only the host cancels').toHaveCount(0)
      await expect(page.getByRole('button', { name: "We're here" }), 'only the host checks in').toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Scan table QR' }), 'a member arrives by scanning the table QR (disabled until 30 min before)').toBeDisabled()
      await expect(page.getByText(/^Available from /)).toBeVisible()
      await expect(page.getByRole('button', { name: 'Leave booking', exact: true })).toBeVisible()
    })
    await test.step('the restaurant and the host see the join', async () => {
      const dash = await F.dashboardView(page, mgr, b.id)
      const row = dash.members.find(m => m.user_id === member.session.user.id)
      expect(row, 'booking_members row of the joiner').toMatchObject({ status: 'joined' })
      expect(row.consented_at, 'consent time recorded').toBeTruthy()
      expect(dash.members.filter(m => ['joined', 'arrived'].includes(m.status))).toHaveLength(2)
      test.info().annotations.push({ type: 'dashboard', description: `joiner has a contact row: ${dash.contacts.some(c => c.user_id === member.session.user.id)} (the invite page asks for a phone when the profile has none)` })
      await expect.poll(async () => (await notificationsOf(page, host, 'booking_member_joined', b.id)).length, 'host notification').toBeGreaterThan(0)
    })
    noErrors(watch)
  })

  // The consent sentence says "name and phone": the invite page asks for the number (unless the profile has one) and the restaurant gets it.
  test('the restaurant gets a phone number for a guest who joins (the consent says name and phone)', async ({ page, browser }, testInfo) => {
    const b = await make(page, host, { party: 3 })
    const m = await F.openAs(browser, testInfo, A.inviteMember())
    await m.page.goto(url(`/b/${b.code}`))
    await consentAndPhone(m.page)
    await m.page.getByRole('button', { name: 'Join this booking' }).click()
    await expect(m.page).toHaveURL(new RegExp(`/bookings/${b.id}$`))
    const dash = await F.dashboardView(page, mgr, b.id)
    expect(dash.members.find(x => x.user_id === member.session.user.id), 'the joiner is on the booking').toMatchObject({ status: 'joined' })
    expect(dash.contacts.filter(c => c.user_id === member.session.user.id && digits(c.phone).length >= 7), 'booking_contacts row with a phone for the joiner').toHaveLength(1)
    await m.close()
  })

  test('joining twice is idempotent; the invite link of a member opens the booking', async ({ page }) => {
    const b = await make(page, host, { party: 3 })
    const a1 = await call(page, member, 'join_group_booking', { p_code: b.code, p_consent: true })
    const a2 = await call(page, member, 'join_group_booking', { p_code: b.code, p_consent: true })
    expect(a1.ok && a2.ok, `joins: ${a1.code} / ${a2.code}`).toBe(true)
    expect(a2.body.member_count, 'member_count after the second join').toBe(2)
    expect((await F.dashboardView(page, mgr, b.id)).members.filter(m => m.user_id === member.session.user.id)).toHaveLength(1)
    const noConsent = await call(page, observer, 'join_group_booking', { p_code: b.code, p_consent: false })
    expect(noConsent.code, 'a new joiner without consent').toBe('consent_required')
    await F.signIn(page, A.inviteMember())
    await page.goto(url(`/b/${b.code}`))
    await expect(page).toHaveURL(new RegExp(`/bookings/${b.id}$`))   // already a member: straight to the booking
    await expect(members(page)).toContainText('2 of 3 joined')
  })

  test('a full booking says so, offers no Join, refuses the API, and reopens when someone leaves', async ({ page, browser }, testInfo) => {
    const b = await make(page, host, { party: 2 })
    expect((await call(page, member, 'join_group_booking', { p_code: b.code, p_consent: true })).ok).toBe(true)
    const obs = await F.openAs(browser, testInfo, A.inviteObserver())
    const answered = obs.page.waitForResponse(r => /rpc\/get_group_booking_preview/.test(r.url()))
    await obs.page.goto(url(`/b/${b.code}`))
    const preview = await (await answered).json()
    expect(preview).toMatchObject({ is_full: true, joinable: false, joined_count: 2 })
    await expect(obs.page.getByText('This booking is full.')).toBeVisible()
    await expect(obs.page.getByRole('button', { name: 'Join this booking' })).toHaveCount(0)
    await expect(obs.page.getByLabel(CONSENT)).toHaveCount(0)
    const refused = await call(page, observer, 'join_group_booking', { p_code: b.code, p_consent: true })
    expect(refused.code, 'API join of a full booking').toBe('booking_full')

    expect((await call(page, member, 'leave_group_booking', { p_booking_id: b.id })).ok).toBe(true)
    await obs.page.reload()
    await consentAndPhone(obs.page)
    await obs.page.getByRole('button', { name: 'Join this booking' }).click()
    await expect(obs.page).toHaveURL(new RegExp(`/bookings/${b.id}$`))
    await expect(members(obs.page)).toContainText('2 of 2 joined')
    await obs.close()
  })

  test('a cancelled booking: preview says cancelled, members see it, Past lists it, members are notified', async ({ page, browser }, testInfo) => {
    const b = await make(page, host, { party: 3 })
    expect((await call(page, member, 'join_group_booking', { p_code: b.code, p_consent: true })).ok).toBe(true)
    expect((await call(page, host, 'cancel_booking', { p_booking_id: b.id })).ok).toBe(true)

    await page.goto(url(`/b/${b.code}`))   // signed out
    await expect(page.getByText('This booking was cancelled.')).toBeVisible()
    await expect(page.getByRole('button', { name: /Join this booking|Sign in to join/ })).toHaveCount(0)

    const m = await F.openAs(browser, testInfo, A.inviteMember())
    await m.page.goto(url(`/bookings/${b.id}`))
    await expect(m.page.getByText('This booking was cancelled.').first()).toBeVisible()
    await expect(m.page.getByText('Cancelled', { exact: true }).first()).toBeVisible()
    await expect(m.page.getByRole('button', { name: /Leave booking|Cancel booking|We're here/ })).toHaveCount(0)
    await expect(m.page.locator('a[href^="tel:"]')).toHaveCount(0)

    await m.page.goto(url('/profile?tab=bookings'))
    await expect(m.page.getByText('Nothing coming up')).toBeVisible()
    await m.page.getByRole('button', { name: 'Past', exact: true }).click()
    const row = m.page.locator(`a.bk-row[href="/bookings/${b.id}"]`)
    await expect(row).toHaveCount(1)
    await expect(row).toContainText('Cancelled')
    await expect(row).toContainText('Guest')

    await m.page.goto(url('/notifications'))
    await expect(m.page.getByText(/Your booking at Trattoria Bella Roma \(.*\) was cancelled\./).first()).toBeVisible()
    expect((await F.dashboardView(page, mgr, b.id)).booking).toMatchObject({ status: 'cancelled' })
    await m.close()
  })

  test('invalid codes, garbage and expired invites show "isn\'t valid anymore"', async ({ page }) => {
    for (const code of ['ZZZZZZZZ', 'x', "'; drop table bookings;--", 'A'.repeat(200), '%20%20', 'a%2Fb']) {
      await page.goto(url(`/b/${code}`))
      await expect(page.getByText("This invite isn't valid anymore", { exact: true }), `/b/${code}`).toBeVisible()
      await expect(page.getByRole('link', { name: 'Browse restaurants' })).toHaveAttribute('href', '/explore')
    }

    const old = (await req(page, mgr, 'GET', `booking_invites?expires_at=lt.${new Date().toISOString()}&select=code,booking_id,bookings(status)&limit=40`)).rows
      .find(r => r.bookings && r.bookings.status !== 'cancelled')
    if (old) {
      await page.goto(url(`/b/${old.code}`))
      await expect(page.getByText("This invite isn't valid anymore", { exact: true }), 'an expired invite').toBeVisible()
      await expect(page.getByRole('button', { name: /Join|Sign in to join/ })).toHaveCount(0)
    } else {
      test.info().annotations.push({ type: 'note', description: 'no expired, non-cancelled invite on the preview to open' })
    }
  })

  test('invites off (party of 2): the link says so, the API refuses, the host turns it on and the link works', async ({ page, browser }, testInfo) => {
    const b = await make(page, host, { party: 2, invites: false })
    await test.step('signed out and signed in strangers see "isn\'t accepting invites" and nothing about the booking', async () => {
      await page.goto(url(`/b/${b.code}`))
      await expect(page.getByText("This booking isn't accepting invites", { exact: true })).toBeVisible()
      await expect(page.getByText('The host has turned off the invite link. Ask them to turn it back on.')).toBeVisible()
      await expect(page.getByText('Trattoria Bella Roma')).toHaveCount(0)
      await expect(page.getByText('Elvin')).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'Browse restaurants' })).toBeVisible()
      expect((await call(page, observer, 'join_group_booking', { p_code: b.code, p_consent: true })).code).toBe('invites_disabled')
      const pv = await call(page, null, 'get_group_booking_preview', { p_code: b.code }, { anonOf: observer })
      expect(pv.code, 'anonymous preview of a disabled link').toBe('invites_disabled')
      const m = await F.openAs(browser, testInfo, A.inviteMember())
      await m.page.goto(url(`/b/${b.code}`))
      await expect(m.page.getByText("This booking isn't accepting invites", { exact: true })).toBeVisible()
      await m.close()
    })
    const h = await F.openAs(browser, testInfo, A.inviteHost())
    await test.step('the host\'s own link opens the booking, which offers "Invite friends"', async () => {
      await h.page.goto(url(`/b/${b.code}`))
      await expect(h.page).toHaveURL(new RegExp(`/bookings/${b.id}$`))
      await expect(h.page.getByTestId('invite-link')).toHaveCount(0)
      await h.page.getByRole('button', { name: 'Invite friends' }).click()
      await expect(h.page.getByTestId('invite-link')).toContainText(`/b/${b.code}`)
      await expect(h.page.getByText('1 of 2 joined').first()).toBeVisible()
    })
    await test.step('the link now works for a stranger', async () => {
      await page.reload()
      await expect(heading(page, 'Trattoria Bella Roma')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Sign in to join' })).toBeVisible()
      const joined = await call(page, observer, 'join_group_booking', { p_code: b.code, p_consent: true })
      expect(joined.ok, `join after enabling: ${joined.code}`).toBe(true)
    })
    await test.step('switching it off again keeps the people who joined and blocks new ones', async () => {
      expect((await call(page, host, 'set_booking_invites', { p_booking_id: b.id, p_enabled: false })).ok).toBe(true)
      expect((await call(page, member, 'join_group_booking', { p_code: b.code, p_consent: true })).code).toBe('invites_disabled')
      const detail = await call(page, observer, 'group_booking_detail', { p_booking_id: b.id })
      expect(detail.ok && detail.body.member_count, 'the earlier joiner is still in').toBe(2)
    })
    await h.close()
  })

  test('leaving: the sheet can be dismissed, the host sees the seat reopen live, the member can rejoin, the host cannot leave', async ({ page, browser }, testInfo) => {
    const b = await make(page, host, { party: 3 })
    expect((await call(page, member, 'join_group_booking', { p_code: b.code, p_consent: true })).ok).toBe(true)
    const h = await F.openAs(browser, testInfo, A.inviteHost())
    await h.page.goto(url(`/bookings/${b.id}`))
    await expect(members(h.page)).toContainText('2 of 3 joined')
    await expect(h.page.getByRole('button', { name: 'Leave booking' }), 'the host has no Leave button').toHaveCount(0)
    expect((await call(page, host, 'leave_group_booking', { p_booking_id: b.id })).code, 'host cannot leave').toBe('host_cannot_leave')

    await F.signIn(page, A.inviteMember())
    await page.goto(url(`/bookings/${b.id}`))
    await page.getByRole('button', { name: 'Leave booking', exact: true }).click()
    await expect(heading(page, 'Leave this booking?')).toBeVisible()
    await sheetBtn(page, 'Cancel').click()
    await expect(heading(page, 'Leave this booking?')).toHaveCount(0)
    await page.getByRole('button', { name: 'Leave booking', exact: true }).click()
    await page.keyboard.press('Escape')
    await expect(heading(page, 'Leave this booking?')).toHaveCount(0)
    expect((await F.liveBookings(page, member)).length, 'still a member after dismissing the sheet').toBe(1)
    await page.getByRole('button', { name: 'Leave booking', exact: true }).click()
    await sheetBtn(page, 'Leave booking').click()
    await expect(page).toHaveURL(url('/profile'))
    expect((await F.dashboardView(page, mgr, b.id)).members.find(m => m.user_id === member.session.user.id).status).toBe('left')
    await expect(members(h.page), 'the host sees the seat reopen without a reload').toContainText('1 of 3 joined', { timeout: 25_000 })

    await page.goto(url(`/b/${b.code}`))   // rejoin through the same link
    await consentAndPhone(page)
    await page.getByRole('button', { name: 'Join this booking' }).click()
    await expect(page).toHaveURL(new RegExp(`/bookings/${b.id}$`))
    await expect(members(page)).toContainText('2 of 3 joined')
    await h.close()
  })

  test('invite page and booking screen in Azerbaijani: no English, no raw keys, Azerbaijani dates', async ({ page }) => {
    const az = (ns, k) => F.azStr(page, ns, k)   // null when the deployed app does not ship the string yet
    const b = await make(page, host, { party: 3 })
    expect((await call(page, member, 'join_group_booking', { p_code: b.code, p_consent: true })).ok).toBe(true)
    await page.addInitScript(() => { try { localStorage.setItem('rufesto_lang', 'az') } catch { /* blocked */ } })
    await page.goto(url(`/b/${b.code}`))
    await expect(page.locator('.bk-preview-name')).toHaveText('Trattoria Bella Roma')
    const [signInToJoin, joinedOf, pending] = await Promise.all([az('bookings', 'invite.signInToJoin'), az('bookings', 'invite.joinedOf'), az('bookings', 'invite.status.pending')])
    if (signInToJoin) await expect(page.getByRole('button', { name: signInToJoin })).toBeVisible()
    if (joinedOf) await expect(page.getByText(joinedOf.replace('{{joined}}', '2').replace('{{total}}', '3'))).toBeVisible()
    if (pending) await expect(page.getByText(pending)).toBeVisible()
    await expect(page.getByText('Awaiting confirmation')).toHaveCount(0)
    expect(await F.rawKeys(page), 'invite page: raw keys').toEqual([])
    expect(await page.locator('.bk-preview-when').innerText(), 'Azerbaijani weekday').toMatch(/(baz|b\.e\.|ç\.a\.|çər|c\.a\.|cümə|şən)/)

    await F.signIn(page, A.inviteMember())
    await page.goto(url(`/bookings/${b.id}`))
    await expect(page.locator('.bk-members')).toBeVisible()
    for (const [ns, key] of [['bookings', 'detail.members'], ['bookings', 'detail.leave'], ['bookings', 'member.guest'], ['bookings', 'status.pending']]) {
      const s = await az(ns, key)
      if (s) await expect(page.getByText(s, { exact: false }).or(page.getByRole('button', { name: s })).first(), `${ns}:${key}`).toBeVisible()
    }
    for (const en of ['Leave booking', "Who's coming", 'Scan table QR', 'Pending', 'Guest']) await expect(page.getByText(en, { exact: false }), `"${en}" left in English`).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Cancel booking|We're here/ })).toHaveCount(0)
    expect(await F.rawKeys(page), 'booking screen: raw keys').toEqual([])
  })
})

/* ====================================================== BOOKING SCREEN + SEATING */

const hhmm = ms => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Baku', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms))
const digits = s => String(s || '').replace(/\D/g, '')

test.describe('booking screen, phones and seating', { tag: TAGS }, () => {
  test.describe.configure({ mode: 'default' })
  let host
  let member
  let outsider
  let mgr
  test.beforeEach(async ({ page }) => {
    test.skip(!!F.missing('detailHost', 'detailMember', 'detailOutsider') || !!F.missing('bellaManager'), 'needs review4, review2, waiter2.seda and manager.bella (docs/REVIEW-ACCOUNTS.md)')
    ;[host, member, outsider, mgr] = await Promise.all([A.detailHost(), A.detailMember(), A.detailOutsider(), A.bellaManager()].map(a => F.apiLogin(page, a)))
    for (const w of [host, member, outsider]) await F.releaseAll(page, w)
  })
  test.afterEach(async ({ page }) => { for (const w of [host, member, outsider]) if (w) await F.releaseAll(page, w) })

  const join = (page, b, who = member, extra = {}) => call(page, who, 'join_group_booking', { p_code: b.code, p_consent: true, ...extra })

  test('host and member see the same party with different controls; a stranger gets "Booking not found"', async ({ page, browser }, testInfo) => {
    const b = await make(page, host, { party: 3, from: 6 })
    expect((await join(page, b)).ok).toBe(true)
    await F.signIn(page, A.detailHost())
    await page.goto(url(`/bookings/${b.id}`))
    await test.step('host', async () => {
      await expect(page.getByRole('heading', { name: 'Booking', exact: true })).toBeVisible()
      await expect(page.locator('.bk-hero')).toContainText('Trattoria Bella Roma')
      await expect(page.locator('.bk-hero')).toContainText(b.slot.time)
      for (const t of ['Pending', 'Host', 'Party of 3']) await expect(page.locator('.bk-hero')).toContainText(t)
      await expect(page.locator('.bk-hero-table'), 'no table number before seating').toHaveCount(0)
      await expect(members(page)).toContainText('2 of 3 joined')
      await expect(members(page).locator('li.bk-member:not(.bk-member-open)')).toHaveCount(2)
      await expect(members(page).locator('li.bk-member-open')).toHaveCount(1)
      await expect(members(page).getByText('Open seat')).toBeVisible()
      await expect(page.getByTestId('invite-link')).toContainText(`/b/${b.code}`)
      await expect(page.getByRole('button', { name: 'Cancel booking', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: "We're here" })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Leave booking' })).toHaveCount(0)
    })
    const m = await F.openAs(browser, testInfo, A.detailMember())
    await m.page.goto(url(`/bookings/${b.id}`))
    await test.step('member', async () => {
      await expect(m.page.locator('.bk-hero')).toContainText('Guest')
      await expect(members(m.page)).toContainText('2 of 3 joined')
      await expect(m.page.getByRole('button', { name: 'Leave booking', exact: true })).toBeVisible()
      await expect(m.page.getByRole('button', { name: /Cancel booking|We're here/ })).toHaveCount(0)
      await expect(m.page.getByRole('button', { name: 'Scan table QR' }), 'a member scans the table QR to arrive').toBeDisabled()
      await expect(m.page.getByRole('button', { name: 'Go to our table' }), 'nothing to go to before the member holds a table session').toHaveCount(0)
    })
    const o = await F.openAs(browser, testInfo, A.detailOutsider())
    await test.step('a stranger', async () => {
      await o.page.goto(url(`/bookings/${b.id}`))
      await expect(o.page.getByText('Booking not found')).toBeVisible()
      await expect(o.page.getByText("It may have been removed, or it isn't yours to see.")).toBeVisible()
      await expect(o.page.getByRole('link', { name: 'Back to my bookings' })).toHaveAttribute('href', '/profile')
      await expect(o.page.getByText('Trattoria Bella Roma')).toHaveCount(0)
      expect((await call(page, outsider, 'group_booking_detail', { p_booking_id: b.id })).code).toBe('booking_not_found')
      expect((await req(page, outsider, 'GET', `booking_members?booking_id=eq.${b.id}&select=*`)).rows, 'REST read of the members as a stranger').toEqual([])
      expect((await req(page, outsider, 'GET', `bookings?id=eq.${b.id}&select=id`)).rows).toEqual([])
    })
    await m.close()
    await o.close()
  })

  test('phone numbers: the restaurant sees every member\'s number, the host and members only their own', async ({ page, browser }, testInfo) => {
    const HOST_PHONE = '+994 50 111 22 33'
    const MEMBER_PHONE = '+994 55 765 43 21'
    const hostRaw = await F.createBooking(page, host, {
      slot: await F.findSlot(page, host, { party: 3, from: 6, to: 18 }), party: 3, invites: true, name: 'Nigar Hosttest', phone: HOST_PHONE,
    })
    expect(hostRaw.ok, hostRaw.code).toBe(true)
    const b = { id: hostRaw.booking.booking_id, code: hostRaw.booking.invite_code }
    expect((await join(page, b, member, { p_name: 'Murad Membertest', p_phone: MEMBER_PHONE })).ok).toBe(true)

    await F.signIn(page, A.detailHost())
    await page.goto(url(`/bookings/${b.id}`))
    await expect(members(page)).toContainText('Murad Membertest')
    const hostText = await page.locator('body').innerText()
    expect(digits(hostText), 'the host page shows the member\'s number').not.toContain('557654321')
    for (const l of await page.locator('a[href^="tel:"]').all()) expect(digits(await l.getAttribute('href')), 'only the host\'s own number may appear').toBe(digits(HOST_PHONE))

    const m = await F.openAs(browser, testInfo, A.detailMember())
    await m.page.goto(url(`/bookings/${b.id}`))
    await expect(members(m.page)).toContainText('Nigar Hosttest')
    expect(digits(await m.page.locator('body').innerText()), 'the member page shows the host\'s number').not.toContain('501112233')
    await m.close()

    const phonesIn = async who => {
      const d = await call(page, who, 'group_booking_detail', { p_booking_id: b.id })
      expect(d.ok, `detail for ${who.session.user.email}: ${d.code}`).toBe(true)
      return Object.fromEntries(d.body.members.map(x => [x.name, x.phone ? digits(x.phone) : null]))
    }
    const asHost = await phonesIn(host)
    const asMember = await phonesIn(member)
    const asStaff = await phonesIn(mgr)
    expect(asHost, 'detail as host').toEqual({ 'Nigar Hosttest': digits(HOST_PHONE), 'Murad Membertest': null })
    expect(asMember, 'detail as member').toEqual({ 'Nigar Hosttest': null, 'Murad Membertest': digits(MEMBER_PHONE) })
    expect(asStaff, 'detail as floor staff').toEqual({ 'Nigar Hosttest': digits(HOST_PHONE), 'Murad Membertest': digits(MEMBER_PHONE) })
    expect((await req(page, host, 'GET', `booking_contacts?booking_id=eq.${b.id}&select=user_id`)).rows.map(r => r.user_id), 'REST booking_contacts as host').toEqual([host.session.user.id])
    expect((await req(page, member, 'GET', `booking_contacts?booking_id=eq.${b.id}&select=user_id`)).rows.map(r => r.user_id)).toEqual([member.session.user.id])
    expect((await F.dashboardView(page, mgr, b.id)).contacts, 'the restaurant reads both contacts').toHaveLength(2)
  })

  test('cancel: the sheet can be dismissed, confirming cancels for everyone, members see it live and are notified', async ({ page, browser }, testInfo) => {
    const b = await make(page, host, { party: 3, from: 6 })
    expect((await join(page, b)).ok).toBe(true)
    const m = await F.openAs(browser, testInfo, A.detailMember())
    await m.page.goto(url(`/bookings/${b.id}`))
    await expect(m.page.getByRole('button', { name: 'Leave booking', exact: true })).toBeVisible()

    await F.signIn(page, A.detailHost())
    await page.goto(url(`/bookings/${b.id}`))
    const status = async () => (await F.dashboardView(page, mgr, b.id)).booking.status
    await page.getByRole('button', { name: 'Cancel booking', exact: true }).click()
    await expect(heading(page, 'Cancel this booking?')).toBeVisible()
    await expect(page.getByText("Everyone in the party will be told. This can't be undone.")).toBeVisible()
    await sheetBtn(page, 'Cancel').click()
    await expect(heading(page, 'Cancel this booking?')).toHaveCount(0)
    expect(await status(), 'still pending after dismissing').toBe('pending')
    await page.getByRole('button', { name: 'Cancel booking', exact: true }).click()
    await page.keyboard.press('Escape')
    await expect(heading(page, 'Cancel this booking?')).toHaveCount(0)
    expect(await status(), 'still pending after Esc').toBe('pending')

    await page.getByRole('button', { name: 'Cancel booking', exact: true }).click()
    await sheetBtn(page, 'Cancel booking').click()
    await expect(page.getByText('This booking was cancelled.').first()).toBeVisible()
    await expect(page.locator('.bk-hero')).toContainText('Cancelled')
    await expect(page.getByRole('button', { name: /Cancel booking|We're here/ })).toHaveCount(0)
    await expect(page.getByTestId('invite-link'), 'no invite link on a cancelled booking').toHaveCount(0)
    await expect(m.page.getByText('This booking was cancelled.').first(), 'the member sees it without reloading').toBeVisible({ timeout: 25_000 })
    expect(await status()).toBe('cancelled')
    expect((await F.dashboardView(page, mgr, b.id)).booking.cancel_reason).toBe('cancelled_by_host')
    expect((await call(page, host, 'cancel_booking', { p_booking_id: b.id })).code, 'cancelling twice').toBe('booking_not_cancellable')
    expect((await notificationsOf(page, member, 'booking_cancelled', b.id)).length, 'member notification').toBeGreaterThan(0)
    await m.close()
  })

  test('"We\'re here" is the host\'s and only inside the window: disabled with the reason, refused by the server outside it', async ({ page, browser }, testInfo) => {
    const b = await make(page, host, { party: 3, from: 6 })
    expect((await join(page, b)).ok).toBe(true)
    await F.signIn(page, A.detailHost())
    await page.goto(url(`/bookings/${b.id}`))
    const btn = page.getByRole('button', { name: "We're here" })
    await test.step('too early', async () => {
      await expect(btn).toBeDisabled()
      await expect(page.getByText(/^Available from /)).toContainText(hhmm(b.slot.startsAt - 30 * 60_000))
      await btn.evaluate(el => el.click())
      await expect(heading(page, "Seat everyone at your table?"), 'a disabled button opens nothing').toHaveCount(0)
      const code = await tableCodeOf(page, mgr, b.id)
      expect((await call(page, host, 'claim_table_from_booking', { p_booking_id: b.id, p_code: code })).code).toBe('too_early')
      expect((await call(page, host, 'claim_table_from_booking', { p_booking_id: b.id, p_code: '  ' })).code, 'a blank code').toBe('invalid_code')
      expect((await call(page, host, 'claim_table_from_booking', { p_booking_id: b.id })).status, 'the code-less overload is gone').toBeGreaterThanOrEqual(400)
      expect((await call(page, member, 'claim_table_from_booking', { p_booking_id: b.id, p_code: code })).code, 'a member cannot check the party in').toBe('not_host')
      expect((await call(page, member, 'join_table_from_booking', { p_booking_id: b.id })).code, 'join_table_from_booking is a stub that tells old clients to scan the table QR').toBe('scan_table_qr')
      expect((await call(page, outsider, 'claim_table_from_booking', { p_booking_id: b.id, p_code: code })).code).toBe('booking_not_found')
    })
    await test.step('too late (the booking time has passed)', async () => {
      const moved = await F.moveIntoWindow(page, mgr, b.id, { startedMinutesAgo: 200, lengthMin: 75 })
      if (!moved.ok) return test.info().annotations.push({ type: 'note', description: `could not move the booking into the past today (${moved.why}); "late" not exercised` })
      await page.reload()
      await expect(btn).toBeDisabled()
      await expect(page.getByText('The booking time has passed.')).toBeVisible()
      expect((await call(page, host, 'claim_table_from_booking', { p_booking_id: b.id, p_code: await tableCodeOf(page, mgr, b.id) })).code).toBe('booking_expired')
    })
  })

  test('seating: the host scans the booked table, the table opens, the member scans the same QR and joins it', async ({ page, browser }, testInfo) => {
    test.setTimeout(150_000)
    const b = await make(page, host, { party: 3, from: 6 })
    expect((await join(page, b)).ok).toBe(true)
    const moved = await F.moveIntoWindow(page, mgr, b.id, { startedMinutesAgo: 5, lengthMin: 80 })
    test.skip(!moved.ok, `the restaurant is not open right now, so the check-in window cannot be reached (${moved.why})`)
    const code = await tableCodeOf(page, mgr, b.id)
    const m = await F.openAs(browser, testInfo, A.detailMember())
    try {
      await m.page.goto(url(`/bookings/${b.id}`))
      await expect(m.page.getByRole('button', { name: 'Scan table QR' }), 'inside the window a member can scan').toBeEnabled()
      await expect(m.page.getByText('Scan the table QR when you arrive')).toBeVisible()
      await expect(m.page.getByRole('button', { name: 'Go to our table' }), 'no table session yet').toHaveCount(0)
      await F.signIn(page, A.detailHost())
      await page.goto(url(`/bookings/${b.id}`))
      await expect(page.getByRole('button', { name: "We're here" })).toBeEnabled()
      await expect(page.getByText(/^Available from /)).toHaveCount(0)
      await expect(page.getByText('Scan the QR code on your table to check in.')).toBeVisible()
      await page.getByRole('button', { name: "We're here" }).click()
      await scanByCode(page, code)
      await expect(page.getByText("You're seated!")).toBeVisible()
      await expect(page).toHaveURL(url('/table'))
      const dash = await F.dashboardView(page, mgr, b.id)
      expect(dash.booking.status, 'booking after check-in').toBe('seated')
      expect(dash.members.find(x => x.user_id === host.session.user.id).status, 'host member status').toBe('arrived')
      expect(dash.members.find(x => x.user_id === member.session.user.id).status, 'the member has not scanned yet').toBe('joined')
      const table = (await req(page, mgr, 'GET', `tables?id=eq.${dash.booking.table_id}&select=table_number,state`)).rows[0]
      expect(table.state, 'the scanned table').toBe('occupied')
      await expect(page.getByText(`#${table.table_number}`).first(), 'the /table screen shows the scanned table (#T2)').toBeVisible()

      // an invite code never seats anyone (sql/54): a member who joins a party that already sits is a member without a table session
      const late = await join(page, b, outsider, { p_name: 'Olga Latejoiner', p_phone: PHONE })
      expect(late.ok, `join_group_booking after the party was seated: ${late.code}`).toBe(true)
      expect(late.body, 'join answer for a party that already sits').toMatchObject({ status: 'joined', seated: false, party_seated: true, table_id: dash.booking.table_id })
      expect((await req(page, mgr, 'GET', `table_sessions?table_id=eq.${dash.booking.table_id}&user_id=eq.${outsider.session.user.id}&ended_at=is.null&select=id`)).rows, 'no table session from an invite code').toEqual([])

      // the member scans the same QR like any guest (claim_table); the host approves a join request unless the booking lets them straight in
      await m.page.goto(url(`/bookings/${b.id}`))
      await m.page.getByRole('button', { name: 'Scan table QR' }).click()
      await scanByCode(m.page, code)
      await expect(m.page.getByText(/You're seated!|Request Sent/)).toBeVisible()
      let mine = (await req(page, mgr, 'GET', `table_sessions?table_id=eq.${dash.booking.table_id}&user_id=eq.${member.session.user.id}&ended_at=is.null&select=id,status`)).rows[0]
      expect(mine, 'the member holds a table session after scanning').toBeTruthy()
      if (mine.status === 'pending') {
        const ok = await call(page, host, 'respond_join_request', { p_session_id: mine.id, p_approve: true })
        expect(ok.ok, `host approves the join request: ${ok.code}`).toBe(true)
      }
      await m.page.goto(url(`/bookings/${b.id}`))
      await expect(m.page.getByRole('button', { name: 'Go to our table' }), 'the member is offered the table once they hold a session').toBeVisible()
      await m.page.getByRole('button', { name: 'Go to our table' }).click()
      await expect(m.page).toHaveURL(url('/table'))
      await expect(m.page.getByText(`#${table.table_number}`).first(), 'the member sits at the same table').toBeVisible()
      const sessions = (await req(page, mgr, 'GET', `table_sessions?table_id=eq.${dash.booking.table_id}&ended_at=is.null&select=user_id,is_host,status`)).rows
      // an open session = ended_at is null (leaving a table only sets ended_at, status stays 'active'); look for ours, other runs may sit there too
      expect(sessions.map(s => s.user_id), 'both guests sit at the table').toEqual(expect.arrayContaining([host.session.user.id, member.session.user.id]))
      expect(sessions.find(s => s.user_id === host.session.user.id).is_host).toBe(true)
      expect(sessions.find(s => s.user_id === member.session.user.id).status, 'the member is active after approval').toBe('active')
      const after = await F.dashboardView(page, mgr, b.id)
      expect(after.booking.status).toBe('seated')

      await page.goto(url(`/bookings/${b.id}`))
      await expect(page.locator('.bk-hero')).toContainText('Seated')
      await expect(page.locator('.bk-hero-table')).toContainText(table.table_number)
      await expect(page.getByRole('button', { name: 'Go to our table' })).toBeVisible()
      await expect(page.getByRole('button', { name: "Cancel booking" }), 'a seated booking cannot be cancelled').toHaveCount(0)
    } finally {
      await F.closeSeated(page, mgr, b.id, [host, member])
      await m.close()
    }
  })

  // The banner reads list_my_bookings, which answers only the newest 100 rows by start time (cancelled ones included): on review4 (184 bookings) a
  // booking one hour away is not among them, so this test uses a guest with a short list (waiter2.bella). The cap itself is in docs/qa/RUN-REPORT.md.
  test('/table shows the booking banner only when the booking is within two hours', async ({ page }) => {
    test.skip(!!F.missing('bannerHost'), 'needs waiter2.bella (docs/REVIEW-ACCOUNTS.md)')
    const guest = await F.apiLogin(page, A.bannerHost())
    await F.releaseAll(page, guest)
    try {
    const b = await make(page, guest, { party: 2, from: 6 })
    await F.signIn(page, A.bannerHost())
    await page.goto(url('/table'))
    await expect(page.getByText('Enter a table code', { exact: false }).or(page.getByPlaceholder(/BELLA-T2/)).first()).toBeVisible()
    await expect(page.locator('.bk-banner'), 'a booking days away has no banner').toHaveCount(0)
    const moved = await F.moveIntoWindow(page, mgr, b.id, { startedMinutesAgo: -60, lengthMin: 75 })
    test.skip(!moved.ok, `could not move the booking to one hour from now (${moved.why}), restaurant closed?`)
    await page.reload()
    const banner = page.locator('.bk-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('Your booking at Trattoria Bella Roma is coming up')
    await expect(banner).toContainText(hhmm(moved.from.getTime()))
    await expect(banner.getByText('Open')).toBeVisible()
    await banner.click()
    await expect(page).toHaveURL(url(`/bookings/${b.id}`))
    } finally { await F.releaseAll(page, guest) }
  })

  test('Profile > Bookings: Upcoming and Past, newest rules, host and guest pills, empty states', async ({ page, browser }, testInfo) => {
    const b1 = await make(page, host, { party: 2, from: 6 })
    const b2 = await make(page, host, { party: 3, from: 9 })
    expect(b1.slot.date < b2.slot.date || b1.slot.startsAt < b2.slot.startsAt).toBe(true)
    expect((await join(page, b2)).ok).toBe(true)
    await F.signIn(page, A.detailHost())
    await page.goto(url('/profile'))
    await page.getByRole('tab', { name: 'Bookings' }).click()
    await expect(page).toHaveURL(/tab=bookings/)
    const rows = page.locator('a.bk-row')
    await expect(page.getByRole('button', { name: 'Upcoming', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(rows.nth(0), 'soonest first').toHaveAttribute('href', `/bookings/${b1.id}`)
    await expect(rows.nth(1)).toHaveAttribute('href', `/bookings/${b2.id}`)
    await expect(rows.nth(0)).toContainText('Trattoria Bella Roma')
    await expect(rows.nth(0)).toContainText('Party of 2')
    await expect(rows.nth(0)).toContainText(b1.slot.time)
    await expect(rows.nth(0)).toContainText('Pending')
    await expect(rows.nth(1)).toContainText('Host')
    await page.getByRole('button', { name: 'Past', exact: true }).click()
    await expect(page.locator(`a.bk-row[href="/bookings/${b1.id}"]`)).toHaveCount(0)

    expect((await call(page, host, 'cancel_booking', { p_booking_id: b1.id })).ok).toBe(true)
    await expect(page.locator(`a.bk-row[href="/bookings/${b1.id}"]`), 'a cancelled booking moves to Past (live)').toBeVisible({ timeout: 25_000 })
    await expect(page.locator(`a.bk-row[href="/bookings/${b1.id}"]`)).toContainText('Cancelled')
    await page.getByRole('button', { name: 'Upcoming', exact: true }).click()
    await expect(page.locator(`a.bk-row[href="/bookings/${b1.id}"]`)).toHaveCount(0)
    await page.locator(`a.bk-row[href="/bookings/${b2.id}"]`).click()
    await expect(page).toHaveURL(url(`/bookings/${b2.id}`))

    const m = await F.openAs(browser, testInfo, A.detailMember())
    await m.page.goto(url('/profile?tab=bookings'))
    await expect(m.page.locator(`a.bk-row[href="/bookings/${b2.id}"]`)).toContainText('Guest')
    await m.close()

    test.skip(!!F.missing('emptyGuest'), 'kitchen.sakura not found for the empty state')
    const e = await F.openAs(browser, testInfo, A.emptyGuest())
    if ((await F.myBookings(page, e)).length === 0) {
      await e.page.goto(url('/profile?tab=bookings'))
      await expect(e.page.getByText('No bookings yet')).toBeVisible()
      await e.page.getByRole('link', { name: 'Reserve a table' }).click()
      await expect(e.page).toHaveURL(url('/explore'))
    }
    await e.close()
  })
})

/* =============================================================== AVAILABILITY */

test.describe('availability rules', { tag: TAGS }, () => {
  test.describe.configure({ mode: 'default' })
  let hostA
  let hostB
  let hostC
  test.beforeEach(async ({ page }) => {
    test.skip(!!F.missing('coversHostA', 'coversHostB', 'coversHostC'), 'needs kitchen.seda, waiter1.seda, admin.seda (docs/REVIEW-ACCOUNTS.md)')
    ;[hostA, hostB, hostC] = await Promise.all([A.coversHostA(), A.coversHostB(), A.coversHostC()].map(a => F.apiLogin(page, a)))
    for (const w of [hostA, hostB, hostC]) await F.releaseAll(page, w)
  })
  test.afterEach(async ({ page }) => { for (const w of [hostA, hostB, hostC]) if (w) await F.releaseAll(page, w) })

  const slotsOf = (page, who, restaurantId, date, party) => call(page, null, 'get_available_slots', { p_restaurant_id: restaurantId, p_date: date, p_party_size: party }, { anonOf: who })

  test('get_available_slots: closed day, today\'s past slots, the 30-minute grid, party and date limits (anonymous)', async ({ page }) => {
    const api = await F.anonApi(page)
    const closedDow = (await api.get(`operating_hours?restaurant_id=eq.${BELLA}&select=day_of_week,is_closed`)).filter(h => h.is_closed).map(h => h.day_of_week)
    const closedDate = Array.from({ length: 14 }, (_, i) => bakuDate(i)).find(d => closedDow.includes(F.weekdayOf(d)))
    expect((await slotsOf(page, hostA, BELLA, closedDate, 2)).body, 'closed day').toEqual([])
    const openElsewhere = await slotsOf(page, hostA, SAKURA, closedDate, 2)
    expect(openElsewhere.body.length, 'the same date at another restaurant').toBeGreaterThan(0)

    const today = await slotsOf(page, hostA, BELLA, bakuDate(0), 2)
    expect(today.ok, today.code).toBe(true)
    const now = Date.now()
    for (const s of today.body) {
      if (Math.abs(Date.parse(s.starts_at) - (now + 30 * 60_000)) < 120_000) continue
      if (Date.parse(s.starts_at) < now + 30 * 60_000) expect({ t: s.slot_time, a: s.available, r: s.reason }, 'a slot inside the minimum notice').toEqual({ t: s.slot_time, a: false, r: 'too_soon' })
    }
    const times = today.body.map(s => F.hm(s.slot_time))
    expect(times, 'ascending').toEqual([...times].sort((a, b) => a - b))
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1], 'slot step').toBe(30)
    const six = await slotsOf(page, hostA, BELLA, bakuDate(5), 6)
    const two = await slotsOf(page, hostA, BELLA, bakuDate(5), 2)
    if (six.body.length && two.body.length) expect(Math.max(...six.body.map(s => s.tables_free)), 'fewer tables take 6 than 2').toBeLessThan(Math.max(...two.body.map(s => s.tables_free)))

    const errs = [
      [{ p_restaurant_id: BELLA, p_date: bakuDate(3), p_party_size: 0 }, 'invalid_party_size'],
      [{ p_restaurant_id: BELLA, p_date: bakuDate(3), p_party_size: 21 }, 'invalid_party_size'],
      [{ p_restaurant_id: BELLA, p_date: bakuDate(-1), p_party_size: 2 }, 'date_in_past'],
      [{ p_restaurant_id: BELLA, p_date: bakuDate(75), p_party_size: 2 }, 'date_too_far'],
      [{ p_restaurant_id: '00000000-0000-4000-8000-000000000000', p_date: bakuDate(3), p_party_size: 2 }, 'restaurant_not_found'],
      [{ p_restaurant_id: BELLA, p_date: null, p_party_size: 2 }, 'invalid_date'],
    ]
    for (const [args, code] of errs) expect((await call(page, null, 'get_available_slots', args, { anonOf: hostA })).code, JSON.stringify(args)).toBe(code)
    expect((await slotsOf(page, hostA, BELLA, bakuDate(60), 2)).ok, 'the 60th day is still bookable (max_days_ahead)').toBe(true)
  })

  // Sakura House only: its dashboard rules are changed for the test (max_covers_per_slot) and put back in `finally`.
  test('max covers per slot: slots turn "full" for the wizard and the server, then the rules are restored', async ({ page }, testInfo) => {
    test.skip(!!F.missing('sakuraManager'), 'manager.sakura not found in docs/REVIEW-ACCOUNTS.md')
    const smgr = await F.apiLogin(page, A.sakuraManager())
    const original = (await req(page, smgr, 'GET', `availability_rules?restaurant_id=eq.${SAKURA}&select=*`)).rows[0] || null
    const setCovers = v => original
      ? req(page, smgr, 'PATCH', `availability_rules?restaurant_id=eq.${SAKURA}`, { max_covers_per_slot: v })
      : req(page, smgr, 'POST', 'availability_rules', { restaurant_id: SAKURA, max_covers_per_slot: v })
    try {
      const set = await setCovers(2)
      test.skip(!set.ok, `the Sakura manager cannot set availability_rules here: ${JSON.stringify(set.body).slice(0, 160)}`)
      const slot = await F.findSlot(page, hostA, { restaurantId: SAKURA, party: 2, from: 4, to: 16 })
      expect(slot, 'a Sakura slot for 2').toBeTruthy()
      const three = await slotsOf(page, hostA, SAKURA, slot.date, 3)
      expect(three.body.every(s => !s.available && s.reason === 'full'), 'a party of 3 never fits under 2 covers').toBe(true)
      const at = async () => (await slotsOf(page, hostB, SAKURA, slot.date, 2)).body.find(s => s.slot_time === slot.time)
      expect(await at(), 'free before booking').toMatchObject({ available: true })

      const a = await F.createBooking(page, hostA, { restaurantId: SAKURA, slot, party: 2, name: 'Covers One' })
      expect(a.ok, a.code).toBe(true)
      expect(await at(), 'the same slot after 2 covers are booked').toMatchObject({ available: false, reason: 'full' })
      const later = (await slotsOf(page, hostB, SAKURA, slot.date, 2)).body.find(s => Date.parse(s.starts_at) >= slot.startsAt + 180 * 60_000 && s.available)
      if (later) expect(later.available, 'a slot after the first booking has ended').toBe(true)
      const refused = await F.createBooking(page, hostB, { restaurantId: SAKURA, slot, party: 1, name: 'Covers Two' })
      expect(refused.code, 'the server enforces max covers even for a party of 1').toBe('no_table_available')

      const ui = await F.openAs(page.context().browser(), testInfo, A.coversHostB())
      await ui.page.goto(url('/book/sakura-house'))
      const dayIdx = Math.round((Date.parse(slot.date) - Date.parse(bakuDate(0))) / 86_400_000)
      const answer = ui.page.waitForResponse(r => /get_available_slots/.test(r.url()))
      await ui.page.locator('.bk-day').nth(dayIdx).click()
      await answer
      await expect(ui.page.locator('.slot-btn', { hasText: slot.time }), 'the full slot is greyed out').toBeDisabled()
      await expect(ui.page.getByText('Greyed-out times are full or too soon.')).toBeVisible()
      await ui.close()
    } finally {
      await F.releaseAll(page, hostA)
      await F.releaseAll(page, hostB)
      if (original) await req(page, smgr, 'PATCH', `availability_rules?restaurant_id=eq.${SAKURA}`, { max_covers_per_slot: original.max_covers_per_slot })
      else await req(page, smgr, 'DELETE', `availability_rules?restaurant_id=eq.${SAKURA}`)
      const back = (await req(page, smgr, 'GET', `availability_rules?restaurant_id=eq.${SAKURA}&select=max_covers_per_slot`)).rows[0]
      expect(back?.max_covers_per_slot ?? null, 'Sakura rules restored').toBe(original ? original.max_covers_per_slot : null)
    }
  })

  test('the last table goes while the guest is on the confirm step: "No table is free any more" and the slot turns full', async ({ page, browser }, testInfo) => {
    test.setTimeout(150_000)
    const party = 6   // only T4 and T6 of Bella Roma take six
    const slot = await F.findSlot(page, hostA, { restaurantId: BELLA, party, from: 10, to: 24 })
    expect(slot, 'a Bella Roma slot for 6 with two free tables').toBeTruthy()
    expect(slot.tablesFree).toBeGreaterThanOrEqual(2)
    expect((await F.createBooking(page, hostB, { slot, party, name: 'Filler One' })).ok).toBe(true)
    const ui = await F.openAs(browser, testInfo, A.coversHostA())
    try {
      await ui.page.goto(url('/book/bella-roma'))
      const dayIdx = Math.round((Date.parse(slot.date) - Date.parse(bakuDate(0))) / 86_400_000)
      expect(await F.wizardPick(ui.page, { party, dayIndex: dayIdx, time: slot.time }), 'the slot is still offered with one table left').toBeTruthy()
      await ui.page.getByRole('button', { name: 'Continue' }).click()
      await ui.page.getByRole('button', { name: 'Continue' }).click()
      await fillConfirm(ui.page)
      expect((await F.createBooking(page, hostC, { slot, party, name: 'Filler Two' })).ok, 'the last table is taken meanwhile').toBe(true)
      await ui.page.getByRole('button', { name: /Create booking & get link|Request booking/ }).click()
      await expect(ui.page.getByText('No table is free at that time any more. Pick another time.')).toBeVisible()
      await ui.page.getByRole('button', { name: 'Choose another time' }).click()
      await expect(ui.page.locator('.slot-btn', { hasText: slot.time }), 'the slot is now full').toBeDisabled()
      const full = (await slotsOf(page, hostA, BELLA, slot.date, party)).body.find(s => s.slot_time === slot.time)
      expect(full).toMatchObject({ available: false, reason: 'full', tables_free: 0 })
      expect(await F.liveBookings(page, hostA), 'the refused guest holds no booking').toHaveLength(0)
    } finally {
      await ui.close()
    }
  })
})
