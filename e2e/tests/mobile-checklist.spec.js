// Mobile checklist: a feature-by-feature walk of the consumer app on a phone, as the signed-in review1 guest
// (docs/REVIEW-ACCOUNTS.md, signed in through the Supabase auth API, no password is ever typed) at 390x844.
// Runs only in the `mobile` project (npm run test:mobile). One test per feature so a failure stays local.
//
// On every screen the walk asserts (soft, so a screen reports all of its problems):
//   - no horizontal overflow (document.documentElement.scrollWidth <= innerWidth), also while scrolling
//   - no new console errors
//   - the main headings stay inside their container
//   - every tap target the walk uses is >= 40px tall (getBoundingClientRect), and is tapped with a touch event
// Failing screens save a PNG next to the test result (e2e/test-results/<test>/...png); small tap targets are
// outlined in red. The only writes: the table test seats review1 at a free Bella Roma table, orders, pays with
// the demo card and leaves; the QA manager resets that table in `finally` (QA_TABLE_CODE's table is never touched).
// UX round 2026-10-18 (docs/UX-PLAN-2026-10-18.md): Home is For you | Friends with the "+" and the bell in a top bar that only Home has; Discover lives in Search
// (/explore: zero state, typed results, Filters sheet); every sheet is a BottomSheet (.bs-root); language and theme are in Profile > Settings; the QR manual field asks
// for a table code; Profile has four tabs. New controls are held to the same 40 px tap rule.
const { test, expect, settle } = require('../support/fixtures')
const { CONSUMER_URL, creds, tableCode } = require('../support/env')
const { signInGuest } = require('../support/guest')
const { openAs, resetTable, rest } = require('../support/v2')
const { walker, bottomNav } = require('../support/mobile')
const R = require('../support/restaurant')
const U = require('../support/ux')

const url = path => CONSUMER_URL + path
const RESTAURANT = '/restaurant/bella-roma'

test.use({ viewport: { width: 390, height: 844 } })

const signIn = page => signInGuest(page, creds.review1)
const heading = (page, name) => page.getByRole('heading', { name })
const sheetClose = page => U.sheet(page).getByRole('button', { name: /^(close|bağla)$/i }).first()   // every BottomSheet has a labelled X (the dish sheet's sits on the photo); "Bağla" in Azerbaijani

async function closeSheet(page, w, label) {
  await w.tap(sheetClose(page), `${label}: close button`)
  await U.noSheet(page)
}

async function openRestaurant(page) {
  await page.goto(url(RESTAURANT))
  await expect(heading(page, 'Trattoria Bella Roma').first()).toBeVisible()
  await expect(R.tabBtn(page, 'Posts')).toBeVisible()   // the page opens on its Posts tab (the menu is the Menu tab, R.showMenu)
}

test.describe('mobile checklist', { tag: ['@mobile', '@consumer'] }, () => {
  test.skip(!creds.review1, 'review1 not found: set QA_REVIEW1_EMAIL / QA_REVIEW1_PASSWORD or keep docs/REVIEW-ACCOUNTS.md')
  test.beforeEach(async ({ isMobile }) => { expect(isMobile, 'this spec belongs to the mobile project').toBe(true) })

  test('Home: the top bar ("+" and the bell), the For you and Friends tabs scroll without horizontal overflow', async ({ page, watch }, testInfo) => {
    const w = walker(page, watch, testInfo)
    await signIn(page)
    await page.goto(url('/'))
    const tab = name => page.getByRole('tab', { name, exact: true })
    await expect(tab('For you'), 'Home opens on the ranked For you tab').toHaveAttribute('aria-selected', 'true')
    await expect(tab('Discover'), 'Discover is not a Home tab any more').toHaveCount(0)
    await expect(page.locator('.soc-feed-slot').first().or(page.getByRole('heading', { name: "You're all caught up" }))).toBeVisible()
    await settle(page, 4_000)
    await w.check('home ranked')
    await w.scrollThrough('home ranked')

    await w.tap(tab('Friends'), 'Home tab Friends')
    await expect(tab('Friends')).toHaveAttribute('aria-selected', 'true')
    await settle(page, 4_000)
    await w.check('home friends')
    await w.scrollThrough('home friends')

    // the top bar (Home only): wordmark, "+" and the bell sit in the screen and are fingertip-sized; no floating "+" over the feed any more
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
    const bar = page.locator('header.app-bar')
    await expect(bar).toBeVisible()
    for (const name of ['New post', 'Notifications']) {
      const b = bar.getByRole('button', { name })
      await expect(b).toBeVisible()
      expect.soft(await b.evaluate(el => el.getBoundingClientRect().height), `${name} button height`).toBeGreaterThanOrEqual(40)
      expect.soft(await b.evaluate(el => el.getBoundingClientRect().right), `${name} button inside the screen`).toBeLessThanOrEqual(390)
    }
    expect(await page.getByRole('button', { name: 'New post' }).count(), 'the one "+" is in the bar').toBe(1)
    // the pin (location) is at the right end of the tab row
    const pin = page.getByRole('button', { name: /location/i }).first()
    if (await pin.count()) expect.soft(await pin.evaluate(el => el.getBoundingClientRect().height), 'location pin height').toBeGreaterThanOrEqual(40)
    await w.check('home top bar')
  })

  test('Search: the zero state, typing, the Filters sheet and a dish sheet', async ({ page, watch }, testInfo) => {
    const w = walker(page, watch, testInfo)
    await signIn(page)
    const nav = bottomNav(page)
    await page.goto(url('/'))
    await w.tap(nav.explore, 'Explore nav')
    await expect(page).toHaveURL(url('/explore'))
    const field = page.getByRole('searchbox', { name: 'Search dishes, places and people' })
    await expect(page.locator('.sr-zero h2.dsc-h').first()).toBeVisible({ timeout: 25_000 })
    await expect(page.locator('.sr-zero a.sr-row').first()).toBeVisible()
    await w.check('search zero state')
    await w.scrollThrough('search zero state')
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))

    // the popular chips and the cuisine chips scroll / wrap inside their own rows
    const cuisines = page.getByRole('group', { name: 'Cuisines' })
    if (await cuisines.count()) {
      const dims = await cuisines.evaluate(el => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }))
      expect.soft(dims.scrollWidth, 'the cuisine chips fit or scroll sideways inside their own row').toBeGreaterThanOrEqual(dims.clientWidth)
    }

    await w.tap(field, 'Search field')
    await field.fill('zzzzqq')
    await expect(page.getByText('No results for “zzzzqq”')).toBeVisible()
    await w.check('search, empty result')
    await field.fill('pizza')
    const dishes = page.locator('.sr-results .sr-row-btn')
    await expect(dishes.first()).toBeVisible()
    await w.check('search, "pizza"')
    await w.scrollThrough('search, "pizza"')

    // Filters: the button replaces Cancel once the field is blurred; the sheet is a BottomSheet with a sticky "Show results"
    await page.getByRole('button', { name: 'Cancel' }).tap()
    // Cancel clears the query and the address follows a moment later (debounced): a Filters tap before that lands closes the sheet again (APP DEFECT D-4, docs/qa/RUN-REPORT-ux.md)
    await expect(page).toHaveURL(url('/explore'))
    await w.tap(page.getByRole('button', { name: /^Filters/ }), 'Filters button')
    const filters = page.locator('.bs-root:has(.sr-fs)[data-state="open"] .bs-panel')
    await expect(filters).toBeVisible()
    await page.waitForTimeout(450)   // sheet slide-in
    await w.check('filters sheet')
    await w.tap(filters.getByRole('button', { name: 'Vegan', exact: true }), 'Filters diet chip Vegan')
    await w.tap(filters.getByRole('button', { name: 'Show results' }), 'Show results button')
    await U.noSheet(page)
    await expect(page.locator('.sr-active .sr-achip')).toContainText('Vegan')
    await w.check('search, Vegan filter')
    await w.tap(page.getByRole('button', { name: 'Remove filter Vegan' }), 'Active filter chip x')

    await field.fill('pizza')
    await expect(dishes.first()).toBeVisible()
    await w.tap(dishes.first(), 'Search dish row')
    await expect(U.sheet(page).locator('.dds-name')).toBeVisible()
    await page.waitForTimeout(450)
    await w.check('search dish sheet')
    await closeSheet(page, w, 'search dish sheet')
  })

  // The Map tab (fb305b0): a MapLibre map full-bleed, a snap sheet with the place list over it (peeking at 116 px), a card carousel while a place is selected
  // (.mp-card: Menu / Book / Directions). A list row is the selector; it is tapped through the DOM here because the peeking sheet clips it.
  const mapRow = (page, name) => page.locator('li.mp-li').filter({ hasText: name }).first().locator('button.sr-row')
  const mapUp = page => page.locator('.mp-screen')

  test('Map: the map renders, a place can be selected, its card opens the restaurant', async ({ page, watch }, testInfo) => {
    const w = walker(page, watch, testInfo)
    await signIn(page)
    const nav = bottomNav(page)
    await page.goto(url('/'))
    await w.tap(nav.map, 'Map nav')
    await expect(page).toHaveURL(url('/map'))
    await expect(mapUp(page)).toBeVisible()
    await expect(page.locator('li.mp-li').first()).toBeAttached({ timeout: 25_000 })
    if (!(await page.locator('.mp-screen.is-nomap').count())) await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible({ timeout: 25_000 })
    await w.check('map')

    await mapRow(page, 'Trattoria Bella Roma').evaluate(b => b.click())
    const card = page.locator('.mp-card').filter({ hasText: 'Trattoria Bella Roma' }).first()
    await expect(card).toBeVisible()
    await page.waitForTimeout(450)   // the carousel settles
    await w.check('map, card open')
    await w.tap(card.locator('.mp-act--menu'), 'Map card "Menu"')
    await expect(page).toHaveURL(url(RESTAURANT))
    await w.check('restaurant opened from the map card')
  })

  // Rufat's reported glitch around the map (an old Leaflet one: its panes painted over the shell and a pan that ran after leaving threw a console error).
  // Kept for the MapLibre map: leaving it right after selecting a place leaves nothing of the map behind and no console error.
  test('Map: leaving the map for Home / Search / Profile leaves no map behind', async ({ page, watch }, testInfo) => {
    const w = walker(page, watch, testInfo)
    await signIn(page)
    const nav = bottomNav(page)
    const targets = [
      ['Home', () => w.tap(nav.home, 'Home nav'), '/'],
      ['Search', () => w.tap(nav.explore, 'Search nav'), '/explore'],
      ['Profile', () => w.tap(nav.profile, 'Profile nav'), '/profile'],
      // (the bell is only in the Home top bar since the UX round: Notifications is reached from Home, see "Notifications: the bell opens the page")
    ]
    const leftovers = page.locator('.mp-screen:visible, canvas.maplibregl-canvas:visible, .maplibregl-map:visible, button.mp-pin:visible')
    for (const [name, go, path] of targets) {
      await page.goto(url('/'))
      await w.tap(nav.map, 'Map nav')
      await expect(mapUp(page)).toBeVisible()
      await expect(page.locator('li.mp-li').first()).toBeAttached({ timeout: 25_000 })
      // use the map like a person would: select a place (the camera flies to it), then leave right away
      await mapRow(page, 'Sakura House').evaluate(b => b.click())
      await go()
      await expect(page).toHaveURL(url(path))
      expect.soft(await mapUp(page).count(), `the map screen is on ${name} right after leaving the map`).toBe(0)
      await page.waitForTimeout(700)   // a leftover may show up after the route transition
      expect.soft(await leftovers.count(), `map elements are visible on ${name} after leaving the map`).toBe(0)
      await w.check(`${name} after the map`)
    }

    // and with the browser's Back button
    await page.goto(url('/'))
    await w.tap(nav.map, 'Map nav')
    await expect(mapUp(page)).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(url('/'))
    expect.soft(await leftovers.count(), 'map elements are visible on Home after Back from the map').toBe(0)
    await w.check('Home after Back from the map')
  })

  test('Map: the QR sheet and other overlays open above the map', async ({ page, watch }, testInfo) => {
    const w = walker(page, watch, testInfo)
    await signIn(page)
    const nav = bottomNav(page)
    await page.goto(url('/'))
    await w.tap(nav.map, 'Map nav')
    await expect(mapUp(page)).toBeVisible()
    await expect(page.locator('li.mp-li').first()).toBeAttached({ timeout: 25_000 })

    await w.tap(nav.qr, 'Scan QR button')
    await expect(heading(page, 'Scan Table QR')).toBeVisible()
    await page.waitForTimeout(500)   // sheet slide-in
    // what is on top at the middle of the screen, over the map: the sheet, not the map or its list sheet
    const top = await page.evaluate(() => {
      const el = document.elementFromPoint(innerWidth / 2, innerHeight * 0.6)
      return el ? { inLayer: !!el.closest('.bs-root, [role="dialog"]'), what: el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0] } : null
    })
    await w.shot('map under the QR sheet')
    expect.soft(top, 'what is on top of the map while the QR sheet is open').toMatchObject({ inLayer: true })
    await page.getByRole('button', { name: 'Cancel' }).tap()
    await expect(heading(page, 'Scan Table QR')).toHaveCount(0)
  })

  test('Restaurant: the Posts and Menu tabs fit, the section chips scroll sideways, a dish sheet opens and closes', async ({ page, watch }, testInfo) => {
    const w = walker(page, watch, testInfo)
    await signIn(page)
    await openRestaurant(page)
    await settle(page, 4_000)
    await w.check('restaurant, posts tab')
    await w.scrollThrough('restaurant, posts tab')

    await w.tap(R.tabBtn(page, 'Menu'), 'Menu tab')
    await R.showMenu(page)
    await w.check('restaurant, menu tab')
    await w.scrollThrough('restaurant, menu tab')

    const strip = page.locator('.mn-chips')
    const dims = await strip.evaluate(el => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }))
    expect(dims.scrollWidth, 'the section chips should scroll sideways at 390px').toBeGreaterThan(dims.clientWidth)
    await w.tap(page.locator('.mn-chip').last(), 'Menu section chip (last one)')
    await expect.poll(() => strip.evaluate(el => el.scrollLeft), 'chip row scrolled to the last section').toBeGreaterThan(0)
    await w.check('restaurant, last section')

    await w.tap(R.rowButtons(page).first(), 'Menu dish row')
    await expect(U.sheet(page).locator('.dds-name')).toBeVisible()
    await expect(U.sheet(page).locator('.dds-price')).toHaveText(/₼\s*\d/)
    await page.waitForTimeout(450)   // sheet slide-in
    await w.check('dish sheet')
    for (const sel of ['.dds-pill', '.bs-foot .btn']) {   // Like / Save / Share and the footer buttons are fingertip-sized
      for (const el of await U.sheet(page).locator(sel).all()) expect.soft(await el.evaluate(e => e.getBoundingClientRect().height), `dish sheet ${sel} height`).toBeGreaterThanOrEqual(36)
    }
    await closeSheet(page, w, 'dish sheet')
    await w.check('restaurant after the dish sheet')
  })

  test('Restaurant: Reserve opens the booking wizard', async ({ page, watch }, testInfo) => {
    const w = walker(page, watch, testInfo)
    await signIn(page)
    await openRestaurant(page)
    const link = page.getByRole('link', { name: /^reserve a table$/i })
    const button = page.getByRole('button', { name: /^reserve a table$/i })   // older builds: a modal instead of the /book/:slug wizard
    await expect(link.or(button)).toBeVisible()
    if (await link.count()) {
      await w.tap(link, 'Reserve a table link')
      await expect(page).toHaveURL(/\/book\/bella-roma$/)
      await expect(page.getByText('Party size')).toBeVisible()
      await expect(page.locator('.bk-day').first()).toBeVisible()
      await w.check('booking wizard step 1')
      await w.scrollThrough('booking wizard step 1')
    } else {
      await w.tap(button, 'Reserve a Table button')
      await expect(heading(page, 'Reserve a Table')).toBeVisible()
      await w.check('reserve modal')
      await closeSheet(page, w, 'reserve modal')
    }
  })

  test('Restaurant: the floor plan opens, filters by zone and closes', async ({ page, watch }, testInfo) => {
    const w = walker(page, watch, testInfo)
    await signIn(page)
    await openRestaurant(page)
    await w.tap(page.getByRole('button', { name: 'Floor plan' }), 'Floor plan button')
    await expect(heading(page, /floor plan/i)).toBeVisible()
    // tables are role=button groups named "Table T1, Free, 2 of 2 seats free"; older builds drew plain "T1" labels
    const tables = page.getByRole('button', { name: /^Table T\d+/ })
    await expect(tables.or(page.getByText(/^T\d+$/)).first()).toBeVisible()
    await page.waitForTimeout(400)   // sheet slide-in
    await w.check('floor plan')

    const indoor = page.getByRole('button', { name: 'Indoor', exact: true })
    if (await indoor.count()) {   // zone chips: All / Indoor / Terrace
      const all = await tables.count()
      await w.tap(indoor, 'Floor plan zone chip Indoor')
      await expect.poll(() => tables.count(), 'Indoor shows fewer tables than All').toBeLessThan(all)
      await w.check('floor plan, Indoor zone')
      await w.tap(U.sheet(page).getByRole('button', { name: 'All', exact: true }), 'Floor plan zone chip All')
      await expect(tables).toHaveCount(all)
    }
    await closeSheet(page, w, 'floor plan')
    await w.check('restaurant after the floor plan')
  })

  test('Notifications: the bell opens the page', async ({ page, watch }, testInfo) => {
    const w = walker(page, watch, testInfo)
    await signIn(page)
    await page.goto(url('/'))
    await w.tap(page.getByRole('button', { name: 'Notifications' }), 'Notifications bell')
    await expect(page).toHaveURL(url('/notifications'))
    await expect(heading(page, 'Notifications')).toBeVisible()
    await settle(page, 4_000)
    await w.check('notifications')
    await w.scrollThrough('notifications')
  })

  test('Friends: tabs, search, rows', async ({ page, watch }, testInfo) => {
    const w = walker(page, watch, testInfo)
    await signIn(page)
    await page.goto(url('/profile'))
    const entry = page.locator('button.pf-stat').filter({ hasText: 'Friends' })   // the Friends stat is the entry (the Friends button is gone)
    await w.tap(entry, 'Profile "Friends" stat')
    await expect(page).toHaveURL(/\/friends/)
    await expect(heading(page, 'Friends').first()).toBeVisible()
    const tab = name => page.getByRole('tab', { name })
    await expect(page.locator('.soc-row').first()).toBeVisible()   // review1 has friends
    await w.check('friends')

    await w.tap(tab(/^Requests/), 'Friends tab Requests')
    await expect(tab(/^Requests/)).toHaveAttribute('aria-selected', 'true')
    await w.check('friends, requests')
    await w.tap(tab(/^Find/), 'Friends tab Find')
    const search = page.getByPlaceholder('Search by name')
    await w.tap(search, 'Friends search field')
    await search.fill('Mur')   // 3 letters: the minimum of search_users and the Find tab
    await expect(page.locator('.soc-row').first()).toBeVisible()
    await w.check('friends, find')
    await w.tap(tab(/^Friends/), 'Friends tab Friends')
    await expect(page.locator('.soc-row').first()).toBeVisible()
    await w.scrollThrough('friends')
  })

  test('Table: join with /t/<code>, order, bill, pay (demo) and leave', async ({ page, browser, watch }, testInfo) => {
    test.skip(!creds.manager, 'needs QA_MANAGER_*: it finds a free table and resets it afterwards')
    test.setTimeout(180_000)
    const w = walker(page, watch, testInfo)
    const me = await signIn(page)
    const mgr = await openAs(browser, testInfo, creds.manager)
    // a free Bella Roma table that is not the QA table of v2-bills.spec.js (that one may be busy in parallel)
    const codes = await rest(mgr.page, mgr, 'GET', 'table_access_codes?select=access_code,table_id')
    const free = new Set((await rest(mgr.page, mgr, 'GET', 'tables?select=id&state=in.(free,cleared)')).map(t => t.id))
    const qaTable = codes.find(c => c.access_code === tableCode)?.table_id
    const candidates = [...new Map(codes.filter(c => free.has(c.table_id) && c.table_id !== qaTable).map(c => [c.table_id, c.access_code])).values()]
    if (!candidates.length) {
      await mgr.close()
      test.skip(true, 'no free Bella Roma table besides QA_TABLE_CODE right now')
    }

    let seated = null
    try {
      await test.step('/t/<code> -> Join -> table screen', async () => {
        for (const code of candidates) {
          await page.goto(url(`/t/${code}`))
          await expect(heading(page, 'Join this table?')).toBeVisible()
          if (!seated) await w.check('table join card')
          await w.tap(page.getByRole('button', { name: 'Join', exact: true }), 'Join table button')
          if (await page.waitForURL(url('/table'), { timeout: 8_000 }).then(() => true, () => false)) { seated = code; break }
        }
        expect(seated, 'none of the free tables accepted the join').not.toBeNull()
        await expect(heading(page, 'Your Table')).toBeVisible()
        await expect(page.getByText('No orders yet')).toBeVisible()
        await w.check('table screen, just seated')
      })

      await test.step('cart: add a dish, place the order', async () => {
        await w.tap(R.menuLink(page), 'Browse the menu / Add More Items link')
        await expect(page).toHaveURL(/\/restaurant\/[\w-]+$/)
        const add = page.getByRole('button', { name: /^Add to Order/ })
        await R.showMenu(page)
        const tiles = R.rowButtons(page)
        for (let i = 0, n = await tiles.count(); i < n && !(await add.isVisible()); i++) {   // skip sold-out dishes
          await w.tap(tiles.nth(i), 'Menu dish card')
          await add.waitFor({ timeout: 2_000 }).catch(() => sheetClose(page).tap())
        }
        await w.check('dish sheet while seated')
        await w.tap(add, 'Add to Order button')
        const place = page.getByRole('button', { name: /^Place Order/ })
        if (!(await place.waitFor({ timeout: 3_000 }).then(() => true, () => false))) await w.tap(page.getByRole('button', { name: 'Open cart' }), 'Open cart button')
        await expect(heading(page, 'Your Order')).toBeVisible()
        await w.check('cart sheet')
        const placed = page.waitForResponse(r => r.request().method() === 'POST' && /\/rest\/v1\/rpc\/place_order/.test(r.url()))
        await w.tap(place, 'Place Order button')
        expect((await placed).ok(), 'place_order rpc').toBe(true)
        await expect(heading(page, 'Order placed!')).toBeVisible()
        await w.check('order placed')
        await w.tap(page.getByRole('button', { name: 'Go to my table' }), 'Go to my table button')
        await expect(page).toHaveURL(url('/table'))
        await page.goto(url('/table'))   // fresh load: the order shows on the table screen
        await expect(page.getByText(/^Order #\d+/).first()).toBeVisible()
        await w.check('table screen with an order')
      })

      let billId
      await test.step('bill: card (demo), pay, receipt', async () => {
        await page.goto(url('/bill'))   // the table screen only links to the bill once staff served the order
        await expect(heading(page, 'Your bill')).toBeVisible()
        await expect(heading(page, 'Payment method')).toBeVisible()
        await w.check('bill')
        await w.scrollThrough('bill')
        const card = page.getByRole('radio', { name: /Card \(demo\)/ })
        await w.tap(card, 'Pay with card (demo) option')
        await expect(card).toHaveAttribute('aria-checked', 'true')
        await w.tap(page.getByRole('button', { name: /^Pay ₼/ }), 'Pay button')
        const confirm = page.getByRole('button', { name: /\(demo\)$/ })
        await expect(confirm).toBeVisible()
        await w.check('demo pay sheet')
        await w.tap(confirm, 'Confirm demo payment button')
        await expect(heading(page, 'Payment received')).toBeVisible({ timeout: 20_000 })
        await w.check('payment received')
        const receipt = page.getByRole('link', { name: 'View receipt' })
        billId = (await receipt.getAttribute('href')).split('/').pop()
        await w.tap(receipt, 'View receipt link')
        await expect(page).toHaveURL(url(`/receipt/${billId}`))
        await expect(page.getByRole('article', { name: 'Receipt' })).toContainText('Trattoria Bella Roma')
        await w.check('receipt')
      })

      await test.step('leave the table', async () => {
        await page.goto(url(`/bill/${billId}`))
        await w.tap(page.getByRole('button', { name: 'Leave table' }), 'Leave table button')
        await expect(page).toHaveURL(url('/'))
        await page.goto(url('/table'))
        await expect(page.getByText('No Active Table')).toBeVisible()
        await w.check('table screen after leaving')
      })
    } finally {
      if (seated) await resetTable(mgr.page, me, mgr, seated)   // cancel drafts, leave, manager release
      await mgr.close()
    }
  })

  test('Profile: every tab opens', async ({ page, watch }, testInfo) => {
    const w = walker(page, watch, testInfo)
    await signIn(page)
    await page.goto(url('/profile'))
    await expect(heading(page, 'Aysel R.')).toBeVisible()
    await w.check('profile')
    await w.scrollThrough('profile')

    const roleTabs = page.getByRole('tab')
    const hasRoleTabs = (await roleTabs.count()) > 0
    // older builds: five plain buttons; newer ones: a tablist with aria-labels
    const names = hasRoleTabs
      ? await roleTabs.evaluateAll(els => els.map(e => e.getAttribute('aria-label') || e.textContent.trim()))
      : ['Profile', 'Reviews', 'Orders', 'Bookings', 'Saved']
    expect(names.length, 'profile tabs: Posts, Reviews, Saved, Visits (Bookings moved into Visits)').toBe(4)
    for (const name of names) {
      const tab = hasRoleTabs ? page.getByRole('tab', { name, exact: true }) : page.getByRole('button', { name, exact: true })
      await w.tap(tab, `Profile tab ${name}`)
      if (hasRoleTabs) await expect(tab).toHaveAttribute('aria-selected', 'true')
      await settle(page, 3_000)
      await w.check(`profile tab ${name}`)
    }
  })

  test('Language: EN / AZ are in Profile > Settings and can be switched on a phone, the page stays', async ({ page, watch }, testInfo) => {
    const w = walker(page, watch, testInfo)
    await signIn(page)
    const nav = bottomNav(page)
    await page.goto(url('/profile'))
    await expect(heading(page, 'Aysel R.')).toBeVisible()
    await expect(page.locator('.lang-switcher:visible'), 'no EN | AZ outside Settings').toHaveCount(0)
    const before = page.url()
    await w.tap(page.getByRole('button', { name: 'Settings', exact: true }), 'Profile settings button')
    const sheet = U.sheet(page)
    await expect(sheet.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await page.waitForTimeout(450)
    await w.check('settings sheet')
    const az = sheet.locator('button[lang="az"]')
    await expect(az, 'EN / AZ must be reachable on a phone (Settings is their only home)').toBeVisible()
    await w.tap(az, 'AZ button')
    await expect(sheet.getByRole('heading', { name: 'Ayarlar' })).toBeVisible()
    await closeSheet(page, w, 'settings sheet')
    await expect(nav.home, 'bottom nav is no longer in English').toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Ana Səhifə', exact: true })).toBeVisible()
    expect(page.url(), 'the page must not change when the language does').toBe(before)
    expect(await page.evaluate(() => localStorage.getItem('rufesto_lang'))).toBe('az')
    await w.check('profile in Azerbaijani')

    await w.tap(page.getByRole('button', { name: 'Ayarlar', exact: true }), 'Settings button (AZ)')
    await w.tap(U.sheet(page).locator('button[lang="en"]'), 'EN button')
    await expect(U.sheet(page).getByRole('heading', { name: 'Settings' })).toBeVisible()
    await closeSheet(page, w, 'settings sheet')
    await expect(nav.home).toBeVisible()
    expect(page.url()).toBe(before)
    expect(await page.evaluate(() => localStorage.getItem('rufesto_lang'))).toBe('en')
    await w.check('profile back in English')
  })

  test('Theme: the Dark mode switch in Settings flips the theme and survives a reload', async ({ page, watch }, testInfo) => {
    const w = walker(page, watch, testInfo)
    await signIn(page)
    await page.goto(url('/profile'))
    await expect(heading(page, 'Aysel R.')).toBeVisible()
    const html = page.locator('html')
    const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    const start = await html.getAttribute('data-theme')
    const other = start === 'light' ? 'dark' : 'light'
    const startBg = await background()
    await expect(page.getByRole('button', { name: /toggle theme/i }), 'no theme toggle outside Settings').toHaveCount(0)

    await w.tap(page.getByRole('button', { name: 'Settings', exact: true }), 'Profile settings button')
    const toggle = U.sheet(page).getByRole('switch', { name: 'Dark mode' })
    await w.tap(toggle, 'Dark mode switch')
    await expect(html).toHaveAttribute('data-theme', other)
    await expect(toggle).toHaveAttribute('aria-checked', other === 'dark' ? 'true' : 'false')
    await closeSheet(page, w, 'settings sheet')
    await expect.poll(background, 'page background changes with the theme').not.toBe(startBg)
    await w.check(`profile, ${other} theme`)
    await w.scrollThrough(`profile, ${other} theme`)

    await page.reload()
    await expect(html).toHaveAttribute('data-theme', other)
    await w.check(`profile, ${other} theme after reload`)

    await w.tap(page.getByRole('button', { name: 'Settings', exact: true }), 'Profile settings button')
    await w.tap(U.sheet(page).getByRole('switch', { name: 'Dark mode' }), 'Dark mode switch')
    await expect(html).toHaveAttribute('data-theme', start)
  })

  // round 4: the Profile tab opens the guest page for a signed-out visitor, with Settings inline (Language, Dark mode, Send feedback)
  test('Profile (signed out): the guest page with Language and Dark mode inline, every control fingertip-sized', async ({ page, watch }, testInfo) => {
    const w = walker(page, watch, testInfo)
    const nav = bottomNav(page)
    await page.goto(url('/'))
    await w.tap(nav.profile, 'Profile nav')
    await expect(page).toHaveURL(url('/profile'))
    await expect(U.authSheet(page), 'the tab does not open the sign-in sheet').toHaveCount(0)
    await expect(heading(page, 'Welcome to Rufesto')).toBeVisible()
    await w.check('guest profile')
    await w.scrollThrough('guest profile')
    await w.tap(page.getByRole('button', { name: 'Sign in', exact: true }), 'Sign in button')
    await expect(U.authSheet(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await U.noSheet(page)
    const settings = page.locator('.pf-guest-settings')
    const html = page.locator('html')
    const start = await html.getAttribute('data-theme')
    await w.tap(settings.getByRole('switch', { name: 'Dark mode' }), 'Dark mode switch')
    await expect(html).not.toHaveAttribute('data-theme', start)
    await w.tap(settings.getByRole('switch', { name: 'Dark mode' }), 'Dark mode switch')
    await expect(html).toHaveAttribute('data-theme', start)
    await w.tap(settings.locator('button[lang="az"]'), 'AZ button')
    await expect(settings.getByRole('heading', { name: 'Ayarlar' })).toBeVisible()
    await w.check('guest profile in Azerbaijani')
    await w.tap(settings.locator('button[lang="en"]'), 'EN button')
    await expect(settings.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await w.tap(settings.getByRole('button', { name: 'Send feedback' }), 'Send feedback row')
    await expect(U.sheet(page).getByRole('heading', { name: 'Share feedback' })).toBeVisible()
    await page.waitForTimeout(450)
    await w.check('feedback sheet')
    await closeSheet(page, w, 'feedback sheet')
  })

  test('Azerbaijani copy fits at 390px on the main screens', async ({ page, watch }, testInfo) => {
    const w = walker(page, watch, testInfo)
    await signIn(page)
    await page.addInitScript(() => { try { localStorage.setItem('rufesto_lang', 'az') } catch { /* storage blocked */ } })
    for (const path of ['/', '/explore', '/map', RESTAURANT, '/notifications', '/friends', '/profile', '/book/bella-roma']) {
      await page.goto(url(path))
      await expect(page.getByRole('button', { name: 'QR Skan et' })).toBeVisible()   // Azerbaijani is active
      await settle(page, 4_000)
      await w.check(`${path} in Azerbaijani`)
    }
  })
})
