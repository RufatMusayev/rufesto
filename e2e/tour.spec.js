// @tour: a visual walk through the v2 flows that saves full-page PNGs into e2e/tour-out/ (numbered in flow
// order). It is a screenshot run for eyes, not a regression test: `npm test` never picks it up (it lives outside
// tests/), run it with `npm run tour`.
//   consumer 01-16 at 390x844 as the QA guest, dashboard 20-27 at 1280x800 as the QA manager.
// Sessions come from the Supabase auth API (no password is ever typed). Everything it creates (friendship, post,
// booking, table session, order, bill) is undone through the UI at the end, and the finally block repeats the
// cleanup over the API when a step failed halfway, like the v2 specs do. The orders and the settled bill stay
// behind as history rows, as in v2-bills.spec.js.
// Dashboard shots are taken mid-flow (while the bill / order / table are live) and so are not in numeric order.
// With QA_WAITER_* set the demo payment carries a 10 % tip for the QA waiter, so that 22-tips (manager, /tips) and
// 22b-my-tips (waiter, /my-tips), taken once the bill is settled, show real numbers.
const fs = require('fs')
const path = require('path')
const { test, expect } = require('@playwright/test')
const { CONSUMER_URL, RESTO_URL, creds, tableCode } = require('./support/env')
const { signInGuest } = require('./support/guest')
const { rpc, resetTable, tinyPng } = require('./support/v2')

const OUT = path.join(__dirname, 'tour-out')
const MOBILE = { width: 390, height: 844 }
const DESKTOP = { width: 1280, height: 800 }
const url = p => CONSUMER_URL + p
const rurl = p => RESTO_URL + p
const MANAGER = 'QA Manager'
const GUEST = 'QA Guest'
const PHONE = '+994 50 123 45 67'
const CONSENT = 'Share my name and phone with the restaurant for this booking'
const POST_PREFIX = 'qa-tour post'

const newContext = (browser, testInfo, viewport) => {
  const use = testInfo.project.use
  return browser.newContext({ storageState: use.storageState, viewport, locale: use.locale, userAgent: use.userAgent })
}

// PostgREST read/patch as `who`; resolves to the parsed rows ([] on any error, so cleanup never throws).
async function rest(page, who, method, p, data) {
  const res = await page.request.fetch(`${who.supabase.url}/rest/v1/${p}`, {
    method, data,
    headers: { apikey: who.supabase.anonKey, Authorization: `Bearer ${who.session.access_token}`, 'Content-Type': 'application/json' },
  })
  const json = await res.json().catch(() => null)
  return Array.isArray(json) ? json : []
}

/** Cancel every live booking the QA host still has from an aborted run (they would block the same slot). */
async function cancelStale(page, who) {
  const res = await rpc(page, who, 'list_my_bookings')
  const rows = res.ok ? JSON.parse(res.body) : []
  for (const b of rows.filter(r => ['pending', 'confirmed'].includes(r.status) && r.my_role === 'host')) {
    await rpc(page, who, 'cancel_booking', { p_booking_id: b.booking_id })
  }
}

/** Delete the guest's posts made by this tour (also those of an aborted run). */
async function deleteTourPosts(page, who) {
  const res = await rpc(page, who, 'get_public_profile', { p_user_id: who.session.user.id })
  const posts = res.ok ? (JSON.parse(res.body)?.posts || []) : []
  for (const p of posts.filter(x => (x.caption || '').startsWith(POST_PREFIX))) await rpc(page, who, 'delete_post', { p_id: p.id })
}

async function claimTable(page) {
  await page.goto(url(`/t/${tableCode}`))
  await expect(page.getByRole('heading', { name: 'Join this table?' })).toBeVisible()
  await page.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(page).toHaveURL(url('/table'))
  await expect(page.getByRole('heading', { name: 'Your Table' })).toBeVisible()
}

/** Restaurant page -> first orderable dish -> cart sheet -> Place Order (v2-bills.spec.js). */
async function orderOneDish(page) {
  await page.getByRole('link', { name: 'Add More Items' }).click()
  await expect(page).toHaveURL(/\/restaurant\/[\w-]+$/)
  const add = page.getByRole('button', { name: /^Add to Order/ })
  const tiles = page.locator('.menu-card')
  await expect(tiles.first()).toBeVisible()
  for (let i = 0, n = await tiles.count(); i < n && !(await add.isVisible()); i++) {   // skip sold-out dishes
    await tiles.nth(i).click()
    await add.waitFor({ timeout: 2_000 }).catch(() => page.keyboard.press('Escape'))
  }
  await add.click()
  const place = page.getByRole('button', { name: /^Place Order/ })
  if (!(await place.isVisible({ timeout: 3_000 }).catch(() => false))) await page.getByRole('button', { name: 'Open cart' }).click()
  const placed = page.waitForResponse(r => r.request().method() === 'POST' && /\/rest\/v1\/rpc\/place_order/.test(r.url()))
  await place.click()
  expect((await placed).ok(), 'place_order rpc').toBe(true)
}

test.describe('v2 tour', { tag: ['@tour'] }, () => {
  test.skip(!creds.guest || !creds.manager || !tableCode, 'set QA_GUEST_*, QA_MANAGER_* and QA_TABLE_CODE')

  test('screenshot tour of the v2 flows', async ({ browser }, testInfo) => {
    test.setTimeout(600_000)
    fs.mkdirSync(OUT, { recursive: true })
    for (const f of fs.readdirSync(OUT)) if (/\.png$/i.test(f) || f === '_console.txt') fs.rmSync(path.join(OUT, f))

    const taken = []        // names of the PNGs written
    const missed = []       // soft steps that failed (the tour went on without them)
    const console_ = []     // console errors / failed calls, tagged with the step they happened in
    let stage = 'setup'
    const pages = {}

    const watch = (name, page) => {
      pages[name] = page
      const noise = u => /static\.cloudflareinsights\.com/i.test(u)
      page.on('console', msg => {
        if (msg.type() !== 'error') return
        const u = msg.location()?.url || ''
        if (noise(u) || (/status of 401/.test(msg.text()) && /supabase|\/(rest|auth|storage|realtime)\/v1\//i.test(u))) return
        console_.push(`[${stage}] ${name} console: ${msg.text()} ${u}`)
      })
      page.on('pageerror', err => console_.push(`[${stage}] ${name} uncaught: ${err.message}`))
      page.on('response', res => {
        if (res.status() >= 400 && !noise(res.url())) console_.push(`[${stage}] ${name} ${res.status()} ${res.request().method()} ${res.url()}`)
      })
    }

    /** Scroll through the page once so lazy images load, then back to the top (the window scrolls in both apps). */
    const warm = page => page.evaluate(async () => {
      const step = Math.max(300, innerHeight - 100)
      for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
        scrollTo({ top: y, behavior: 'instant' })
        await new Promise(r => setTimeout(r, 100))
      }
      scrollTo({ top: 0, behavior: 'instant' })
    }).catch(() => {})

    /**
     * Full page = the viewport grown to the document height for the shot, so fixed bars (bottom nav, FAB, pay
     * bar, sidebar) sit where they do when scrolled to the bottom instead of floating mid-page like in
     * Playwright's own fullPage mode. `full: false` for sheets / overlays: a plain viewport shot.
     */
    async function shot(page, name, { full = true } = {}) {
      stage = name
      const vp = page.viewportSize()
      await page.waitForLoadState('networkidle', { timeout: 4_000 }).catch(() => {})
      await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {})
      if (full) await warm(page)
      await page.waitForFunction(() => [...document.images].every(i => i.complete), null, { timeout: 5_000 }).catch(() => {})
      let grown = false
      if (full) {
        const h = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight))
        if (h > vp.height) { await page.setViewportSize({ width: vp.width, height: Math.min(h, 8_000) }); grown = true }
      }
      await page.waitForTimeout(grown ? 600 : 350)
      await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full, animations: 'disabled' })
      if (grown) await page.setViewportSize(vp)
      taken.push(name)
    }

    /** An independent screenshot: a failure is recorded and the tour continues. */
    async function soft(name, fn) {
      stage = name
      try { await fn() } catch (err) { missed.push(`${name}: ${String(err.message || err).split('\n')[0]}`) }
    }

    const noSkeleton = page => page.waitForFunction(() => !document.querySelector('.skeleton'), null, { timeout: 8_000 }).catch(() => {})

    // ---- contexts: guest (mobile), manager on the consumer app (mobile), signed-out (mobile), dashboard (desktop)
    const gctx = await newContext(browser, testInfo, MOBILE)
    const mctx = await newContext(browser, testInfo, MOBILE)
    const actx = await newContext(browser, testInfo, MOBILE)
    const dctx = await newContext(browser, testInfo, DESKTOP)
    const wctx = await newContext(browser, testInfo, DESKTOP)   // the QA waiter's dashboard (22b-my-tips); optional
    const [g, m, a, d, w] = await Promise.all([gctx.newPage(), mctx.newPage(), actx.newPage(), dctx.newPage(), wctx.newPage()])
    for (const [n, p] of [['guest', g], ['manager', m], ['anon', a], ['dash', d], ['waiter', w]]) watch(n, p)
    const guest = await signInGuest(g, creds.guest)
    const mgr = await signInGuest(m, creds.manager)
    await signInGuest(d, creds.manager)
    const waiter = creds.waiter ? await signInGuest(w, creds.waiter) : null

    const caption = `${POST_PREFIX} ${Date.now()}`
    let bookingId = null
    let billId = null
    let tableId = null
    let code = null
    const row = (p, name) => p.locator('.soc-row').filter({ hasText: name })

    try {
      // a clean start: stale friendship / bookings / posts / table session of an aborted run
      await rpc(g, guest, 'remove_friend', { p_user_id: mgr.session.user.id })
      await cancelStale(g, guest)
      await deleteTourPosts(g, guest)
      tableId = (await resetTable(g, guest, mgr, tableCode)).tableId

      // ---- friendship (needed for a populated 02 / 03), by the UI like v2-social.spec.js
      await test.step('friend request and accept', async () => {
        await g.goto(url('/friends'))
        await g.getByRole('tab', { name: 'Find', exact: true }).click()
        await g.getByPlaceholder('Search by name').fill(MANAGER)
        await row(g, MANAGER).getByRole('button', { name: 'Add', exact: true }).click()
        await expect(row(g, MANAGER).getByText('Pending')).toBeVisible()
        await m.goto(url('/friends?tab=requests'))
        await row(m, GUEST).getByRole('button', { name: 'Accept', exact: true }).click()
        await m.getByRole('tab', { name: 'Friends', exact: true }).click()
        await expect(row(m, GUEST)).toBeVisible()
      })

      // ---- 01 home feed, after one caption + photo post
      await test.step('01 home-feed', async () => {
        stage = '01 post'
        await g.goto(url('/post/new'))
        await g.locator('input[type=file]').setInputFiles({ name: 'qa.png', mimeType: 'image/png', buffer: tinyPng(480, 360) })
        await expect(g.getByAltText('Your photo')).toBeVisible()
        await g.getByLabel('Caption').fill(caption)
        const post = g.getByRole('button', { name: 'Post', exact: true })
        await post.click()
        if (await g.getByText('Photo upload coming soon').isVisible({ timeout: 5_000 }).catch(() => false)) {
          testInfo.annotations.push({ type: 'note', description: 'post-photos bucket missing: posted caption-only' })
          await post.click()
        }
        await expect(g).toHaveURL(url('/'))
        await expect(g.getByRole('tab', { name: 'Feed', exact: true })).toHaveAttribute('aria-selected', 'true')
        await expect(g.locator('article.soc-post').filter({ hasText: caption })).toBeVisible()
        await shot(g, '01-home-feed')
      })

      await soft('02-friends', async () => {
        await g.goto(url('/friends'))
        await expect(g.getByRole('tab', { name: 'Friends', exact: true })).toHaveAttribute('aria-selected', 'true')
        await expect(row(g, MANAGER)).toBeVisible()
        await shot(g, '02-friends')
      })

      await soft('03-public-profile', async () => {
        await g.goto(url(`/u/${mgr.session.user.id}`))
        await expect(g.getByText(MANAGER).first()).toBeVisible()
        await shot(g, '03-public-profile')
      })

      await soft('04-restaurant-bella-roma', async () => {
        await g.goto(url('/restaurant/bella-roma'))
        await expect(g.locator('.menu-card').first()).toBeVisible()
        await shot(g, '04-restaurant-bella-roma')
      })

      await soft('04b-floor-plan', async () => {   // restaurant page -> Floor plan button -> sheet, at 390 wide
        await g.goto(url('/restaurant/bella-roma'))
        await expect(g.locator('.menu-card').first()).toBeVisible()
        await g.getByRole('button', { name: 'Floor plan' }).click()
        const sheet = g.locator('.fl-sheet')
        await expect(sheet).toBeVisible()
        await expect(sheet.getByRole('button', { name: /^Table T\d+/ }).first()).toBeVisible()
        await shot(g, '04b-floor-plan', { full: false })   // the floor plan is an overlay
        await g.getByRole('button', { name: 'Close' }).click()
        await expect(g.locator('.overlay')).toHaveCount(0)
      })

      // ---- group booking wizard (merged flow: step 1 date + party + slot, step 2 "Who's coming?", step 3 confirm)
      await test.step('05-book-with-friends-step1', async () => {
        await g.goto(url('/book/bella-roma'))
        await expect(g.locator('.bk-stepper-num')).toHaveText('2')   // merged wizard default
        const more = g.getByRole('button', { name: 'More guests' })
        await more.click(); await more.click()
        await expect(g.locator('.bk-stepper-num')).toHaveText('4')
        await expect(g.locator('.bk-day').first()).toBeVisible()
        await shot(g, '05-book-with-friends-step1')
      })

      await test.step('06-book-step-slots (a later day, party of 4, slot chosen)', async () => {
        let picked = false
        for (let day = 1; day <= 7 && !picked; day++) {   // the restaurant may be closed / full on a given weekday
          const loaded = g.waitForResponse(r => /get_available_slots/.test(r.url()))
          await g.locator('.bk-day').nth(day).click()
          await loaded
          await g.locator('.slot-btn, .bk-slot-empty').first().waitFor({ timeout: 6_000 }).catch(() => {})
          picked = (await g.locator('.slot-btn:enabled').count()) > 0
          if (picked) await g.locator('.slot-btn:enabled').first().click()
        }
        expect(picked, 'no bookable slot in the next 7 days').toBe(true)
        await expect(g.getByRole('button', { name: 'Continue' })).toBeEnabled()
        await shot(g, '06-book-step-slots')
      })

      await test.step('07-booking-created', async () => {
        await g.getByRole('button', { name: 'Continue' }).click()   // step 2: Who's coming?
        await expect(g.getByRole('heading', { name: "Who's coming?" })).toBeVisible()
        await expect(g.getByRole('switch', { name: 'Invite friends' })).toHaveAttribute('aria-checked', 'true')   // on from 3 guests
        await g.getByRole('button', { name: 'Continue' }).click()   // step 3: confirm
        const phone = g.getByLabel('Phone number')
        if (!(await phone.inputValue())) await phone.fill(PHONE)
        await g.getByLabel(CONSENT).check()
        await g.getByRole('button', { name: 'Create booking & get link' }).click()
        await expect(g.getByRole('heading', { name: 'Booking created' })).toBeVisible()
        const link = await g.getByTestId('invite-link').innerText()
        expect(link).toMatch(/\/b\/[\w-]+$/)
        code = link.split('/b/')[1].trim()
        await shot(g, '07-booking-created')
        await g.getByRole('link', { name: 'View booking' }).click()
        await expect(g).toHaveURL(/\/bookings\/[0-9a-f-]{36}$/)
        bookingId = g.url().split('/').pop()
      })

      await test.step('08-invite-preview-signed-out', async () => {
        await a.goto(url(`/b/${code}`))
        await expect(a.getByRole('heading', { name: /Bella Roma/ })).toBeVisible()
        await expect(a.getByRole('button', { name: 'Sign in to join' })).toBeVisible()
        await shot(a, '08-invite-preview-signed-out')
      })

      // ---- table, order, bill
      await test.step('09-table-claimed', async () => {
        await claimTable(g)
        await expect(g.getByText('No orders yet')).toBeVisible({ timeout: 5_000 })
        await shot(g, '09-table-claimed')
      })

      await test.step('10-order-placed', async () => {
        await orderOneDish(g)
        await expect(g.getByText('Order placed!')).toBeVisible({ timeout: 5_000 })
        await shot(g, '10-order-placed', { full: false })   // the cart sheet is an overlay
      })

      await test.step('11-bill (View bill)', async () => {
        // The View bill button on /table only shows once staff served the order: serve it as the manager does.
        const orders = await rest(g, guest, 'GET', `orders?table_id=eq.${tableId}&user_id=eq.${guest.session.user.id}&status=in.(open,submitted,preparing,ready)&select=id`)
        for (const o of orders) await rest(m, mgr, 'PATCH', `orders?id=eq.${o.id}`, { status: 'served' })
        await g.goto(url('/table'))
        await expect(g.getByText(/^Order #\d+/).first()).toBeVisible()
        const viewBill = g.getByRole('link', { name: /^View bill/ })
        if (await viewBill.isVisible({ timeout: 5_000 }).catch(() => false)) await viewBill.click()
        else { missed.push('11-bill: no "View bill" button on /table (order not served?), opened /bill directly'); await g.goto(url('/bill')) }
        await expect(g).toHaveURL(/\/bill$/)
        await expect(g.getByRole('heading', { name: 'Payment method' })).toBeVisible()
        await shot(g, '11-bill')
      })

      await test.step('12-bill-split-equal (the manager joins the table)', async () => {
        const claim = await rpc(m, mgr, 'claim_table', { p_code: tableCode })
        expect(claim.ok, `manager claim_table: ${claim.body}`).toBe(true)
        const joined = JSON.parse(claim.body)
        if (joined.session_status === 'pending') {
          const ok = await rpc(g, guest, 'respond_join_request', { p_session_id: joined.session_id, p_approve: true })
          expect(ok.ok, `respond_join_request: ${ok.body}`).toBe(true)
        }
        await g.reload()
        const split = g.getByRole('radiogroup', { name: 'Split the bill' })
        await expect(split).toBeVisible()
        await split.getByRole('radio', { name: /^Split equally/ }).click()
        await expect(split.getByRole('radio', { name: /^Split equally/ })).toHaveAttribute('aria-checked', 'true')
        await shot(g, '12-bill-split-equal')
      })

      // ---- dashboard as the manager, while the booking, table, order and bill are live
      await soft('20-bills', async () => {
        await d.goto(rurl('/bills'))
        await expect(d.getByRole('heading', { name: 'Bills', exact: true })).toBeVisible()
        await expect(d.locator('.v2-bill-list')).toBeVisible()
        await shot(d, '20-bills')
      })
      await soft('21-qr-sheet', async () => {
        await d.goto(rurl('/qr-sheet'))
        await expect(d.locator('.v2-qr-preview .v2-qr-img').first()).toBeVisible()
        await shot(d, '21-qr-sheet')
      })
      await soft('21b-qr-sheet-per-chair', async () => {
        const cards = d.locator('.v2-qr-preview .v2-qr-img')
        await d.goto(rurl('/qr-sheet'))
        await expect(cards.first()).toBeVisible()
        const tables = await cards.count()
        await d.getByLabel('Per chair').check()
        await expect.poll(() => cards.count(), 'chair cards added after the table cards').toBeGreaterThan(tables)
        await shot(d, '21b-qr-sheet-per-chair')
      })
      await soft('22-settings-hours', async () => {
        await d.goto(rurl('/settings?tab=hours'))
        await expect(d.locator('.v2-day')).toHaveCount(7)
        await shot(d, '22-settings-hours')
      })
      await soft('23-settings-rules', async () => {
        await d.goto(rurl('/settings?tab=rules'))
        await expect(d.getByRole('tab', { name: 'Booking rules' })).toHaveAttribute('aria-selected', 'true')
        await noSkeleton(d)
        await shot(d, '23-settings-rules')
      })
      await soft('24-settings-staff', async () => {
        await d.goto(rurl('/settings?tab=staff'))
        await expect(d.locator('.v2-staff-row').first()).toBeVisible()
        await shot(d, '24-settings-staff')
      })
      await soft('25-bookings-with-group-panel', async () => {
        await d.goto(rurl('/bookings'))
        const toggles = d.locator('.v2-group-toggle')
        await toggles.first().waitFor({ timeout: 10_000 })
        let found = false
        for (let i = 0, n = await toggles.count(); i < n && !found; i++) {   // open each group panel until it is this booking's
          await toggles.nth(i).click()
          found = await d.locator('.v2-code-chip').filter({ hasText: code }).isVisible({ timeout: 3_000 }).catch(() => false)
          if (!found) await toggles.nth(i).click()
        }
        expect(found, `no group panel with invite code ${code}`).toBe(true)
        await shot(d, '25-bookings-with-group-panel')
      })
      await soft('26-tables', async () => {
        await d.goto(rurl('/tables'))
        await noSkeleton(d)
        await shot(d, '26-tables')
      })
      await soft('27-orders', async () => {
        await d.goto(rurl('/orders'))
        await noSkeleton(d)
        await shot(d, '27-orders')
      })

      // ---- pay: the manager leaves the table so the bill is solo again (the proven single-payer path)
      await test.step('13-demo-pay-sheet', async () => {
        await rpc(m, mgr, 'leave_table', { p_table_id: tableId })
        await g.reload()
        await expect(g.getByRole('heading', { name: 'Payment method' })).toBeVisible()
        const card = g.getByRole('radio', { name: /Card \(demo\)/ })
        await card.click()
        await expect(card).toHaveAttribute('aria-checked', 'true')
        if (waiter) {   // a 10 % tip for the QA waiter, so 22-tips / 22b-my-tips have something to show
          try {
            const [table] = await rest(m, mgr, 'GET', `tables?id=eq.${tableId}&select=restaurant_id`)
            const report = JSON.parse((await rpc(m, mgr, 'tip_report', { p_restaurant_id: table.restaurant_id })).body)
            const staffId = report.waiters.find(x => x.user_id === waiter.session.user.id)?.staff_id
            const listed = JSON.parse((await rpc(m, mgr, 'list_table_waiters', { p_table_id: tableId })).body)
            const at = listed.findIndex(x => x.staff_id === staffId)   // the picker shows this list in this order, then "Whole team"
            expect(at, 'the QA waiter is not offered for this table').toBeGreaterThanOrEqual(0)
            await g.getByRole('radiogroup', { name: 'Add a tip' }).getByRole('radio', { name: /^10%/ }).click()
            const radios = g.getByRole('radiogroup', { name: 'Who gets the tip?' }).getByRole('radio')
            await radios.nth(at).click()
            await expect(radios.nth(at)).toHaveAttribute('aria-checked', 'true')
          } catch (err) { missed.push(`13: tip for the QA waiter: ${String(err.message || err).split('\n')[0]}`) }
        }
        await g.getByRole('button', { name: /^Pay ₼/ }).click()
        await expect(g.getByRole('button', { name: /\(demo\)$/ })).toBeVisible()
        await shot(g, '13-demo-pay-sheet', { full: false })   // the pay sheet is an overlay
      })

      await test.step('14-bill-settled', async () => {
        const confirm = g.getByRole('button', { name: /\(demo\)$/ })
        await confirm.evaluate(b => { b.click(); b.click() })   // double tap: still exactly one payment
        await expect(g.getByRole('heading', { name: 'Payment received' })).toBeVisible({ timeout: 20_000 })
        await expect(g.getByText('Bill settled', { exact: true })).toBeVisible()
        await shot(g, '14-bill-settled')
      })

      await test.step('15-receipt', async () => {
        const receipt = g.getByRole('link', { name: 'View receipt' })
        billId = (await receipt.getAttribute('href')).split('/').pop()
        await receipt.click()
        await expect(g).toHaveURL(url(`/receipt/${billId}`))
        await expect(g.getByRole('article', { name: 'Receipt' })).toContainText('Trattoria Bella Roma')
        await shot(g, '15-receipt')
      })

      await test.step('16-profile-bookings', async () => {
        await g.goto(url('/profile'))
        await g.getByRole('tab', { name: 'Bookings', exact: true }).click()
        await expect(g.getByRole('tab', { name: 'Bookings', exact: true })).toHaveAttribute('aria-selected', 'true')
        await expect(g.locator('a.bk-row').first()).toBeVisible()
        await shot(g, '16-profile-bookings')
      })

      await soft('16b-profile-posts', async () => {   // the tour's own post is still there (deleted in the cleanup below)
        await g.getByRole('tab', { name: 'Posts', exact: true }).click()
        await expect(g.getByRole('tab', { name: 'Posts', exact: true })).toHaveAttribute('aria-selected', 'true')
        await expect(g.getByRole('link', { name: caption })).toBeVisible()
        await shot(g, '16b-profile-posts')
      })

      await soft('16c-profile-settings-sheet', async () => {
        await g.getByRole('button', { name: 'Settings', exact: true }).click()
        await expect(g.getByRole('dialog', { name: 'Settings' })).toBeVisible()
        await shot(g, '16c-profile-settings-sheet', { full: false })   // the settings sheet is an overlay
        await g.getByRole('button', { name: 'Close' }).click()
        await expect(g.getByRole('dialog')).toHaveCount(0)
      })

      await soft('20b-bills-paid', async () => {   // extra: the same bill on the dashboard once settled
        await d.goto(rurl('/bills'))
        await d.getByRole('button', { name: /^Paid/ }).click()
        await expect(d.locator('.v2-bill-list')).toBeVisible()
        await shot(d, '20b-bills-paid')
      })

      // ---- tips, once the bill is settled: the manager's per-waiter report and the waiter's own list
      await soft('22-tips', async () => {
        await d.goto(rurl('/tips'))
        await expect(d.getByRole('heading', { level: 1, name: 'Tips' })).toBeVisible()
        await expect(d.locator('.v2-tips-table')).toBeVisible()   // only rendered once the range has tips
        await noSkeleton(d)
        await shot(d, '22-tips')
      })
      await soft('22b-my-tips', async () => {
        if (!waiter) { testInfo.annotations.push({ type: 'note', description: '22b-my-tips skipped: no QA_WAITER_* credentials' }); return }
        await w.goto(rurl('/my-tips'))
        await expect(w.getByRole('heading', { level: 1, name: 'My tips' })).toBeVisible()
        await expect(w.locator('.v2-tip-list .v2-tip').first()).toBeVisible()
        await noSkeleton(w)
        await shot(w, '22b-my-tips')
      })

      // ---- undo through the UI, like the specs: leave the table, cancel the booking, delete the post, unfriend
      await soft('cleanup: leave table', async () => {
        await g.goto(url(`/bill/${billId}`))
        await g.getByRole('button', { name: 'Leave table' }).click()
        await expect(g).toHaveURL(url('/'))
      })
      await soft('cleanup: cancel booking', async () => {
        await g.goto(url(`/bookings/${bookingId}`))
        await g.getByRole('button', { name: 'Cancel booking', exact: true }).click()
        await g.locator('.bk-confirm-actions').getByRole('button', { name: 'Cancel booking' }).click()
        await expect(g.getByText('This booking was cancelled.').first()).toBeVisible()
        bookingId = null
      })
      await soft('cleanup: delete post', async () => {
        await g.goto(url(`/u/${guest.session.user.id}`))
        await g.getByRole('link', { name: caption }).click()
        await expect(g).toHaveURL(/\/post\/[\w-]+$/)
        await g.getByRole('button', { name: 'Post options' }).click()
        await g.getByRole('button', { name: 'Delete post' }).click()
        await expect(g).toHaveURL(url('/'))
      })
      await soft('cleanup: unfriend', async () => {
        await g.goto(url('/friends'))
        await g.getByRole('button', { name: `More options for ${MANAGER}` }).click()
        await g.getByRole('button', { name: 'Remove friend' }).click()
        await expect(g.getByText('No friends yet')).toBeVisible()
      })
    } catch (err) {
      for (const [n, p] of Object.entries(pages)) {   // what each browser was showing when a chain step failed
        await p.screenshot({ path: path.join(OUT, `_FAIL-${n}.png`), fullPage: false }).catch(() => {})
      }
      throw err
    } finally {
      // API fallback for anything the UI cleanup did not reach (also after a red run)
      const quiet = async fn => { try { await fn() } catch (e) { console.log(`[tour cleanup] ${String(e.message || e).split('\n')[0]}`) } }
      await quiet(() => cancelStale(g, guest))
      await quiet(() => deleteTourPosts(g, guest))
      await quiet(() => rpc(g, guest, 'remove_friend', { p_user_id: mgr.session.user.id }))
      await quiet(() => resetTable(g, guest, mgr, tableCode))
      fs.writeFileSync(path.join(OUT, '_console.txt'), console_.join('\n') + (console_.length ? '\n' : ''))
      await Promise.all([gctx, mctx, actx, dctx, wctx].map(c => c.close().catch(() => {})))
    }

    console.log(`[tour] ${taken.length} screenshots in ${OUT}: ${taken.join(', ')}`)
    if (console_.length) console.log(`[tour] ${console_.length} console error / failed call lines in _console.txt`)
    expect(missed, 'steps the tour could not complete').toEqual([])
  })
})
