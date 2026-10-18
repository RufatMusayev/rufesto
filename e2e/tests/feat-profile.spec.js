// Feature walk: PROFILE (header numbers incl. the Credits stat, the four tabs (Bookings moved into Visits), empty states, settings sheet, edit sheet, sign out), desktop and phone.
// UX round 2026-10-18: the Friends button and the credits pill are gone (the Friends and Credits stats are the buttons), Settings holds language + dark mode, Delete account is in Edit profile.
// Accounts (docs/REVIEW-ACCOUNTS.md, signed in through the auth API): review1 = rich account (visits, credits, 2 friends, read only),
// EMPTY = a staff account used as an ordinary guest (kitchen.sakura: never any posts / visits / bookings / credits; review5 and review6 are no longer
// empty, other suites pay bills with them) for the empty states and the name edit (restored), review4 = the one this spec WRITES on
// (posts, saved dish, booking) and restores.
// Not covered: the Reviews tab WITH data (a review pays +10 credits for ever and cannot be undone: no account has one, the empty guest shows the empty state).
const { test, expect } = require('../support/fixtures')
const S = require('../support/feat-social')
const { url, TAG, RUN } = S
const U = require('../support/ux')
const az = require('../../client/src/locales/az/profile.json')

const EMPTY = 'kitchen.sakura'
const sheet = p => U.sheet(p)
const tab = (p, name) => p.getByRole('tab', { name, exact: true })
const credits = p => p.locator('button.pf-stat').filter({ hasText: 'Credits' })   // the Credits stat is the button that opens the credits sheet (the pill is gone)
const UUID_IN_TEXT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}/i
const statNum = (p, label) => p.locator('.pf-stat').filter({ hasText: label }).locator('.pf-stat-num')
/** The number of a stat without its badge (the Friends stat carries the pending-request badge inside the same element). */
const statValue = async (p, label) => ((await statNum(p, label).innerText()).split('\n')[0] || '').trim()
const n = async r => (Array.isArray(r.data) ? r.data.length : Number(r.data))

/** The numbers the header should show, read from the DB as the user. */
async function dbCounts(u) {
  const posts = (await u.api.get(`posts?user_id=eq.${u.api.id}&select=id`)).data.length
  const visits = (await u.api.get(`visits?user_id=eq.${u.api.id}&select=id`)).data.length
  const friends = (await u.api.rpc('my_friends')).data.length
  const points = (await u.api.get(`loyalty_accounts?user_id=eq.${u.api.id}&select=points`)).data[0]?.points ?? 0
  return { posts, visits, friends, points }
}

test.describe('feat profile', { tag: ['@guest', '@consumer', '@feat'] }, () => {
  test.skip(!S.have(1, 4, EMPTY), 'review1/4 or kitchen.sakura not found: keep docs/REVIEW-ACCOUNTS.md or set QA_REVIEW<n>_EMAIL / _PASSWORD')
  test.describe.configure({ mode: 'default' })

  // ------------------------------------------------------------------------------------------------- header
  test('header: name and the Posts / Friends / Visits / Credits stats match the DB; the request badge sits on Friends', async ({ page, watch }) => {
    const u = await S.asUser(page, 1)
    await page.goto(url('/profile'))
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Aysel R.')
    const counts = await dbCounts(u)
    await expect.poll(async () => [await statValue(page, 'Posts'), await statValue(page, 'Friends'), await statValue(page, 'Visits'), await statValue(page, 'Credits')].join('/'),
      'Posts / Friends / Visits / Credits numbers').toBe(`${counts.posts}/${counts.friends}/${counts.visits}/${counts.points}`)
    // four stats in one row; the old "Friends" button and the credits pill under the name are gone
    expect(await page.locator('.pf-stat').count(), 'four stats').toBe(4)
    await expect(page.locator('a.soc-entry'), 'no separate Friends row / button').toHaveCount(0)
    await expect(page.getByRole('button', { name: /Resto-Credits, \d+ credits/ }), 'no credits pill').toHaveCount(0)
    const incoming = (await u.api.get(`friendships?addressee_id=eq.${u.api.id}&status=eq.pending&select=id`)).data.length
    if (incoming) await expect(page.locator('.pf-stat .pf-stat-badge'), 'the pending requests ride on the Friends stat').toHaveText(incoming > 9 ? '9+' : String(incoming))
    else await expect(page.locator('.pf-stat .pf-stat-badge')).toHaveCount(0)
    expect(await page.locator('.pf-head').innerText(), 'header never prints the email').not.toMatch(/@/)
    expect(watch.consoleErrors, 'console errors').toEqual([])
  })

  test('header: the stat buttons jump to their tab, Friends opens /friends', async ({ page }) => {
    await S.asUser(page, EMPTY)
    await page.goto(url('/profile'))
    await statNum(page, 'Visits').click()
    await expect(page).toHaveURL(/tab=visits/)
    await expect(tab(page, 'Visits')).toHaveAttribute('aria-selected', 'true')
    await statNum(page, 'Posts').click()
    await expect(tab(page, 'Posts')).toHaveAttribute('aria-selected', 'true')
    await expect(page).not.toHaveURL(/tab=/)
    await statNum(page, 'Friends').click()
    await expect(page).toHaveURL(url('/friends'))
  })

  test('tabs: four tabs (no Bookings), Posts is the default, ?tab deep links, ?tab=bookings lands on Visits, arrow keys, a bogus ?tab falls back to Posts', async ({ page }) => {
    await S.asUser(page, EMPTY)
    await page.goto(url('/profile'))
    for (const name of ['Posts', 'Reviews', 'Saved', 'Visits']) await expect(tab(page, name)).toBeVisible()
    await expect(tab(page, 'Bookings'), 'Bookings moved into Visits').toHaveCount(0)
    expect(await page.getByRole('tablist').getByRole('tab').count(), 'four tabs').toBe(4)
    await expect(tab(page, 'Posts')).toHaveAttribute('aria-selected', 'true')
    await page.goto(url('/profile?tab=bookings'))
    await expect(tab(page, 'Visits'), 'an old ?tab=bookings link lands on Visits').toHaveAttribute('aria-selected', 'true')
    for (const id of ['reviews', 'saved', 'visits']) {
      await page.goto(url(`/profile?tab=${id}`))
      await expect(tab(page, id[0].toUpperCase() + id.slice(1))).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByRole('tabpanel')).toBeVisible()
    }
    await page.goto(url('/profile?tab=bogus'))
    await expect(tab(page, 'Posts')).toHaveAttribute('aria-selected', 'true')
    await tab(page, 'Posts').focus()
    await page.keyboard.press('ArrowRight')
    await expect(tab(page, 'Reviews')).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('End')
    await expect(tab(page, 'Visits')).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Home')
    await expect(tab(page, 'Posts')).toHaveAttribute('aria-selected', 'true')
  })

  // ------------------------------------------------------------------------------------------- empty states
  test('empty states (empty guest): Posts, Reviews, Saved, Visits each explain themselves and offer the next step', async ({ page, watch }) => {
    const u = await S.asUser(page, EMPTY)
    const before = await dbCounts(u)
    const bookings = (await u.api.rpc('list_my_bookings')).data.length
    test.skip(before.posts + before.visits + bookings > 0, `${EMPTY} is not empty any more`)
    await page.goto(url('/profile'))
    await expect(page.getByText('No posts yet')).toBeVisible()
    await page.getByRole('link', { name: 'New post' }).click()
    await expect(page).toHaveURL(url('/post/new'))
    await page.goto(url('/profile?tab=reviews'))
    await expect(page.getByText('No reviews yet')).toBeVisible()
    await page.goto(url('/profile?tab=saved'))
    await expect(page.getByText('No saved dishes yet')).toBeVisible()
    await page.goto(url('/profile?tab=visits'))
    await expect(page.getByText('No visits yet')).toBeVisible()
    await page.getByRole('link', { name: 'Explore restaurants' }).click()
    await expect(page).toHaveURL(url('/explore'))
    expect(watch.consoleErrors, 'console errors').toEqual([])
  })

  test('credits (empty guest): the Credits stat says 0, the sheet shows an empty history', async ({ page }) => {
    const u = await S.asUser(page, EMPTY)
    test.skip((await dbCounts(u)).points > 0, `${EMPTY} has credits`)
    await page.goto(url('/profile'))
    await expect(credits(page).locator('.pf-stat-num'), 'the Credits stat says 0').toHaveText('0')
    await credits(page).click()
    await expect(sheet(page).getByText('Resto-Credits', { exact: true })).toBeVisible()
    await expect(sheet(page).getByText('No credit activity yet.')).toBeVisible()
    await expect(sheet(page).getByText('Earn 10 credits per review')).toBeVisible()
    await page.keyboard.press('Escape')
    await U.noSheet(page)
  })

  // ---------------------------------------------------------------------------------------------- with data
  test('visits (review1): one row per paid bill with restaurant, date and amount; a row opens its receipt', async ({ page }) => {
    const u = await S.asUser(page, 1)
    const rows = (await u.api.get(`visits?user_id=eq.${u.api.id}&select=id,bill_id,amount_paid&order=visited_at.desc&limit=50`)).data
    await page.goto(url('/profile?tab=visits'))
    const cards = page.locator('.pf-list > a.pf-card[href^="/receipt/"], .pf-list > div.pf-card')   // upcoming bookings (links to /bookings/...) sit above the visits
    await expect(cards.first()).toBeVisible()
    expect(await cards.count(), 'visit rows (newest 50)').toBe(Math.min(rows.length, 50))
    await expect(cards.first()).toContainText('Trattoria Bella Roma')
    await expect(cards.first()).toContainText(/\d{4}/)
    await expect(cards.first()).toContainText(/₼|AZN|\d+[.,]\d{2}/)
    await cards.first().click()
    await expect(page).toHaveURL(/\/receipt\/[\w-]+$/)
    await expect(page.getByText('Receipt not found')).toHaveCount(0)
    await expect(page.getByText('Trattoria Bella Roma').first()).toBeVisible()
  })

  test('credits (review1): the Credits stat opens the sheet: totals, tier and a readable history (no raw ids)', async ({ page }) => {
    const u = await S.asUser(page, 1)
    await page.goto(url('/profile'))
    const acct = (await u.api.get(`loyalty_accounts?user_id=eq.${u.api.id}&select=points,tier,points_earned`)).data[0]
    const tx = (await u.api.get(`loyalty_transactions?user_id=eq.${u.api.id}&select=id&limit=10`)).data
    await credits(page).click()
    const s = sheet(page)
    await expect(s.getByText('Available')).toBeVisible()
    await expect(s.getByText('Earned')).toBeVisible()
    await expect(s.getByText(new RegExp(`^${acct.tier}$`, 'i'))).toBeVisible()
    await expect(s.locator('.pf-credits-num').first()).toHaveText(/\d+/)
    await expect(s.locator('.pf-tx').first()).toBeVisible()
    expect(await s.locator('.pf-tx').count(), 'recent activity rows (max 10)').toBe(tx.length)
    const text = await s.locator('.pf-tx-list').innerText()
    expect(text, 'the history must not print raw ids (loyalty_transactions.reason is "bill_paid:<bill id>" or "review_posted:<review id>")').not.toMatch(UUID_IN_TEXT)
  })

  test('posts / saved / bookings (review4): rows appear in their tabs, saved dish can be removed, an upcoming booking sits on top of Visits until it is cancelled', async ({ page, browser, watch }, testInfo) => {
    test.setTimeout(100_000)
    const u = await S.asUser(page, 4)
    await S.purgePosts(u)
    const cap = `${TAG} ${RUN} profile`
    let booking = null, saved = null
    try {
      // --- posts: own public and friends-only posts are both listed; the "New post" tile is gone (one entry point: the Home "+"; it is only the empty state)
      const pub = await S.newPost(u, cap + ' public'), fr = await S.newPost(u, cap + ' friends', 'friends')
      await page.goto(url('/profile'))
      await expect(page.locator('a.pf-tile').first()).toBeVisible()
      await expect(page.locator('a.pf-tile-new'), 'no "New post" tile once there are posts').toHaveCount(0)
      await expect(page.locator('a.pf-tile').filter({ hasText: cap })).toHaveCount(2)
      await expect.poll(async () => statNum(page, 'Posts').innerText(), 'Posts stat counts both').toBe(String((await dbCounts(u)).posts))
      await page.locator('a.pf-tile').filter({ hasText: 'public' }).click()
      await expect(page).toHaveURL(url(`/post/${pub}`))
      // --- saved dish
      const dish = (await u.api.get('dishes?select=id,name,price,restaurant_id,restaurants(name)&available=eq.true&limit=1')).data[0]
      const sv = await u.api.post('saved_dishes', { user_id: u.api.id, dish_id: dish.id })
      expect(sv.ok, JSON.stringify(sv.data)).toBe(true)
      saved = sv.data[0].id
      await page.goto(url('/profile?tab=saved'))
      const row = page.locator('.pf-saved').filter({ hasText: dish.name })
      await expect(row).toBeVisible()
      await expect(row).toContainText(dish.restaurants.name)
      await row.getByRole('button', { name: `Remove ${dish.name} from saved` }).click()
      await expect(row).toHaveCount(0)
      await expect(page.getByText('No saved dishes yet')).toBeVisible()
      await expect.poll(async () => n(await u.api.get(`saved_dishes?id=eq.${saved}&select=id`))).toBe(0)
      saved = null
      // --- booking: pending, upcoming, then cancelled -> Past
      // Profile > Bookings shows what list_my_bookings answers: only the newest 100 rows by start time, cancelled ones included, and review4 holds
      // 180+ cancelled future bookings from earlier runs. So the slot is taken on or after the earliest start in that list: it is then inside the window.
      const mine = (await u.api.rpc('list_my_bookings')).data || []
      const earliest = mine.length >= 100 ? mine.map(x => x.starts_at).sort()[0] : null
      const slot = await S.findSlot(u, 'seda-ocagi', earliest ? Math.max(4, Math.ceil((Date.parse(earliest) - Date.now()) / 86_400_000) + 1) : 4)
      const b = await u.api.rpc('create_group_booking', {
        p_restaurant_id: slot.restaurant.id, p_date: slot.date, p_time: slot.time, p_party_size: 2, p_note: `${TAG} ${RUN}`,
        p_host_name: 'QA Tural', p_host_phone: '+994501234567', p_consent: true, p_invites: false,
      })
      expect(b.ok, JSON.stringify(b.data)).toBe(true)
      booking = b.data.booking_id
      await page.goto(url('/profile?tab=visits'))
      const card = page.locator(`a[href="/bookings/${booking}"]`)
      await expect(card, 'the upcoming booking is on top of Visits').toBeVisible()
      await expect(page.getByRole('heading', { name: 'Upcoming', exact: true })).toBeVisible()
      await expect(card).toContainText(slot.restaurant.name)
      await expect(card).toContainText('Party of 2')
      await expect(card).toContainText('Pending')
      await card.click()
      await expect(page).toHaveURL(url(`/bookings/${booking}`))
      expect((await u.api.rpc('cancel_booking', { p_booking_id: booking })).ok).toBe(true)
      await page.goto(url('/profile?tab=visits'))
      await expect(page.locator(`a[href="/bookings/${booking}"]`), 'a cancelled booking leaves the upcoming list').toHaveCount(0)
      booking = null
      expect(watch.consoleErrors, 'console errors').toEqual([])
    } finally {
      await S.purgePosts(u)
      if (saved) await u.api.del(`saved_dishes?id=eq.${saved}`)
      if (booking) await u.api.rpc('cancel_booking', { p_booking_id: booking })
    }
  })

  // ------------------------------------------------------------------------------------------ edit + settings
  test('edit profile (empty guest): validation, new name shows in the header and the DB, Cancel discards, restored afterwards', async ({ page }) => {
    const u = await S.asUser(page, EMPTY)
    const was = (await u.api.get(`users?id=eq.${u.api.id}&select=name,phone`)).data[0]
    try {
      await page.goto(url('/profile'))
      await page.getByRole('button', { name: 'Edit profile' }).click()
      const s = sheet(page)
      await expect(s.getByLabel('Name')).toHaveValue(was.name)
      await expect(s.getByText(`${EMPTY}@rufesto.test`), 'the owner sees their own email, read-only').toBeVisible()
      // "Delete account" left the settings list: it is a quiet text link at the bottom of Edit profile
      await expect(s.getByRole('button', { name: 'Delete account' })).toHaveAttribute('aria-expanded', 'false')
      await s.getByRole('button', { name: 'Delete account' }).click()
      await expect(s.getByText(/contact support/i).first()).toBeVisible()
      await s.getByRole('button', { name: 'Delete account' }).click()
      await s.getByLabel('Name').fill('')
      await s.getByRole('button', { name: 'Save' }).click()
      await expect(s.getByText('Name is required.')).toBeVisible()
      await s.getByLabel('Name').fill('x'.repeat(100))
      expect((await s.getByLabel('Name').inputValue()).length, 'name is cut at 80 (users.name CHECK, contract 12.6)').toBe(80)
      await s.getByLabel('Name').fill('QA Edit Name')
      await s.getByLabel('Phone').fill('abc')
      await s.getByRole('button', { name: 'Save' }).click()
      await expect(s.getByText(/valid phone number/)).toBeVisible()
      await s.getByLabel('Phone').fill('')
      await s.getByRole('button', { name: 'Save' }).click()
      await U.noSheet(page)
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('QA Edit Name')
      expect((await u.api.get(`users?id=eq.${u.api.id}&select=name`)).data[0]).toEqual({ name: 'QA Edit Name' })
      await page.reload()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('QA Edit Name')
      await page.getByRole('button', { name: 'Edit profile' }).click()   // Cancel discards
      await sheet(page).getByLabel('Name').fill('Discarded')
      await sheet(page).getByRole('button', { name: 'Cancel' }).click()
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('QA Edit Name')
    } finally { await u.api.patch(`users?id=eq.${u.api.id}`, { name: was.name, phone: was.phone }) }
  })

  // users_phone_check only takes E.164 digits (^\+?[0-9]{7,15}$): the form lets people type spaces, dashes and brackets and saves
  // the number normalised (client/src/lib/phone.js), so a typed "+994 50 731 4829" is stored as "+994507314829".
  test('edit profile (empty guest): a phone typed with spaces saves as E.164 digits', async ({ page }, testInfo) => {
    const u = await S.asUser(page, EMPTY)
    const was = (await u.api.get(`users?id=eq.${u.api.id}&select=name,phone`)).data[0]
    try {
      await page.goto(url('/profile'))
      await page.getByRole('button', { name: 'Edit profile' }).click()
      const s = sheet(page)
      await expect(s.getByLabel('Phone')).toHaveAttribute('placeholder', '+994501234567')
      await s.getByLabel('Phone').fill('+994 50 731 4829')
      const [res] = await Promise.all([
        page.waitForResponse(r => r.url().includes('/rest/v1/users') && r.request().method() === 'PATCH'),
        s.getByRole('button', { name: 'Save' }).click(),
      ])
      await S.shot(page, testInfo, 'edit-phone-with-spaces')
      expect(res.status(), `PATCH users with phone "+994 50 731 4829": ${await res.text()}`).toBeLessThan(300)
      await U.noSheet(page)
      expect((await u.api.get(`users?id=eq.${u.api.id}&select=phone`)).data[0].phone, 'stored without spaces').toBe('+994507314829')
    } finally { await u.api.patch(`users?id=eq.${u.api.id}`, { name: was.name, phone: was.phone }) }
  })

  test('settings: language EN/AZ and dark/light persist across a reload; the rows are language, Dark mode (fixed label), Notifications, Send feedback, Sign out', async ({ browser }, testInfo) => {
    const u = await S.openUser(browser, testInfo, 4)
    const p = u.page
    const s = sheet(p)
    try {
      await p.goto(url('/profile'))
      await p.getByRole('button', { name: 'Settings' }).click()
      await expect(s.getByRole('heading', { name: 'Settings' })).toBeVisible()
      // the rows: no Delete account (it is in Edit profile), one Notifications row (it opens the settings page, not a second "Notification settings" row)
      await expect(s.getByRole('button', { name: 'Delete account' })).toHaveCount(0)
      await expect(s.getByRole('link', { name: 'Notifications' })).toHaveCount(1)
      await expect(s.getByText('Notification settings')).toHaveCount(0)
      // language
      await s.locator('button[lang="az"]').click()
      await expect(s.getByText(az.settings, { exact: true })).toBeVisible()
      expect(await p.evaluate(() => localStorage.getItem('rufesto_lang'))).toBe('az')
      await p.reload()
      await expect(p.getByRole('tab', { name: az.tabPosts, exact: true }), 'AZ survives a reload').toBeVisible()
      await p.getByRole('button', { name: az.settings }).click()
      await s.locator('button[lang="en"]').click()
      await expect(s.getByRole('heading', { name: 'Settings' })).toBeVisible()
      // theme: the label is fixed ("Dark mode"), the switch says whether the theme is dark
      const theme = () => p.evaluate(() => document.documentElement.getAttribute('data-theme'))
      const toggle = s.getByRole('switch', { name: 'Dark mode' })
      const first = await theme()
      await toggle.click()
      const second = await theme()
      expect(second).not.toBe(first)
      await expect(toggle).toHaveAttribute('aria-checked', second === 'dark' ? 'true' : 'false')
      await expect(s.getByText('Light mode'), 'the label does not flip').toHaveCount(0)
      expect(await p.evaluate(() => localStorage.getItem('rufesto_theme'))).toBe(second)
      await p.reload()
      expect(await theme(), 'theme survives a reload').toBe(second)
      await p.getByRole('button', { name: 'Settings' }).click()
      await s.getByRole('switch', { name: 'Dark mode' }).click()
      expect(await theme()).toBe(first)
      // rows
      await s.getByRole('button', { name: 'Send feedback' }).click()
      await expect(p.getByText('Tell us what you think', { exact: false }).first()).toBeVisible()
      await p.keyboard.press('Escape')
      await U.noSheet(p)
      await p.getByRole('button', { name: 'Settings' }).click()
      await s.getByRole('link', { name: 'Notifications' }).click()
      await expect(p).toHaveURL(url('/settings/notifications'))
      expect(u.watch.consoleErrors, 'console errors').toEqual([])
    } finally { await u.close() }
  })

  test('signed out: /profile shows the welcome card, Sign in opens the modal, feedback validates before sending', async ({ browser }, testInfo) => {
    const anon = await S.openSignedOut(browser, testInfo)
    const p = anon.page
    try {
      await p.goto(url('/profile'))
      await expect(p.getByRole('heading', { name: 'Welcome to Rufesto' })).toBeVisible()
      await p.getByRole('button', { name: 'Sign in' }).click()
      await expect(U.authSheet(p)).toBeVisible()
      await p.keyboard.press('Escape')
      await U.noSheet(p)
      await p.getByRole('button', { name: 'Share feedback' }).click()
      await sheet(p).getByRole('button', { name: 'Send feedback' }).click()
      await expect(sheet(p).getByText(/Please select a rating|Name is required/)).toBeVisible()   // nothing is sent
    } finally { await anon.close() }
  })

  // The logout call is answered locally (204): supabase-js signs out with scope "global", which would end every session of review4
  // on the server, including the ones other suites are using. The app clears its own storage whatever the server says.
  test('settings: Sign out returns to the signed-out card and stays signed out after a reload', async ({ browser }, testInfo) => {
    const u = await S.openUser(browser, testInfo, 4)
    const p = u.page
    await p.route('**/auth/v1/logout*', route => route.fulfill({ status: 204, body: '' }))
    try {
      await p.goto(url('/profile'))
      await expect(p.getByRole('heading', { level: 1 })).toBeVisible()
      await p.getByRole('button', { name: 'Settings' }).click()
      await sheet(p).getByRole('button', { name: 'Sign out' }).click()
      await expect(p.getByRole('heading', { name: 'Welcome to Rufesto' })).toBeVisible()
      await U.noSheet(p)
      expect(await p.evaluate(() => Object.keys(localStorage).filter(k => /auth-token/.test(k)).length), 'session removed from storage').toBe(0)
      await p.reload()
      await expect(p.getByRole('heading', { name: 'Welcome to Rufesto' })).toBeVisible()
      await p.goto(url('/notifications'))
      await expect(p.getByRole('button', { name: 'Sign in' })).toBeVisible()
      expect(u.watch.consoleErrors, 'console errors').toEqual([])
    } finally { await u.close() }
  })
})
