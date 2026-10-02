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
const { test, expect, settle } = require('../support/fixtures')
const { CONSUMER_URL, creds, tableCode } = require('../support/env')
const { signInGuest } = require('../support/guest')
const { openAs, resetTable, rest } = require('../support/v2')
const { walker, bottomNav, leafletStacking } = require('../support/mobile')

const url = path => CONSUMER_URL + path
const RESTAURANT = '/restaurant/bella-roma'

test.use({ viewport: { width: 390, height: 844 } })

const signIn = page => signInGuest(page, creds.review1)
const heading = (page, name) => page.getByRole('heading', { name })
const sheetClose = page => {
  const layer = page.locator('.overlay').last()
  return layer.getByRole('button', { name: /close/i }).or(layer.locator('.icon-btn')).first()   // the dish / floor sheets have an unnamed icon button
}

async function closeSheet(page, w, label) {
  await w.tap(sheetClose(page), `${label}: close button`)
  await expect(page.locator('.overlay')).toHaveCount(0)
}

async function openRestaurant(page) {
  await page.goto(url(RESTAURANT))
  await expect(heading(page, 'Trattoria Bella Roma').first()).toBeVisible()
  await expect(page.locator('.menu-card').first()).toBeVisible()
}

test.describe('mobile checklist', { tag: ['@mobile', '@consumer'] }, () => {
  test.skip(!creds.review1, 'review1 not found: set QA_REVIEW1_EMAIL / QA_REVIEW1_PASSWORD or keep docs/REVIEW-ACCOUNTS.md')
  test.beforeEach(async ({ isMobile }) => { expect(isMobile, 'this spec belongs to the mobile project').toBe(true) })

  test('Home: Discover and Feed tabs scroll without horizontal overflow', async ({ page, watch }, testInfo) => {
    const w = walker(page, watch, testInfo)
    await signIn(page)
    await page.goto(url('/'))
    const tab = name => page.getByRole('tab', { name, exact: true })
    await expect(tab('Discover')).toHaveAttribute('aria-selected', 'true')
    const cards = page.getByRole('link', { name: /view menu/i })
    await expect(cards.first()).toBeVisible()
    await settle(page, 4_000)
    await w.check('home discover')
    await w.scrollThrough('home discover')

    await w.tap(tab('Feed'), 'Home tab Feed')
    await expect(tab('Feed')).toHaveAttribute('aria-selected', 'true')
    await expect(tab('All')).toHaveAttribute('aria-selected', 'true')
    await settle(page, 4_000)
    await w.check('home feed')
    await w.scrollThrough('home feed')

    await w.tap(tab('Friends'), 'Feed chip Friends')
    await expect(tab('Friends')).toHaveAttribute('aria-selected', 'true')
    await w.check('home feed, friends only')
    await w.tap(tab('All'), 'Feed chip All')

    // the "New post" button floats above the bottom nav, never under it
    const fab = page.getByRole('button', { name: 'New post' })
    await expect(fab).toBeVisible()
    const clash = await fab.evaluate(el => {
      const nav = [...document.querySelectorAll('nav')].find(n => n.querySelector('a[href="/map"]'))
      return nav ? el.getBoundingClientRect().bottom - nav.getBoundingClientRect().top : -1
    })
    expect.soft(clash, 'New post button overlaps the bottom nav by this many px').toBeLessThanOrEqual(0)
    expect.soft(await fab.evaluate(el => el.getBoundingClientRect().height), 'New post button height').toBeGreaterThanOrEqual(40)

    // Discover again, and a restaurant card leads to the restaurant page
    await w.tap(tab('Discover'), 'Home tab Discover')
    await w.tap(cards.first(), 'Discover "View menu" link')
    await expect(page).toHaveURL(/\/restaurant\/[\w-]+$/)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await w.check('restaurant opened from Home')
  })

  test('Explore: search, filters and the sideways filter row', async ({ page, watch }, testInfo) => {
    const w = walker(page, watch, testInfo)
    await signIn(page)
    const nav = bottomNav(page)
    await page.goto(url('/'))
    await w.tap(nav.explore, 'Explore nav')
    await expect(page).toHaveURL(url('/explore'))
    const dishes = page.locator('.stagger-item')   // dish cards are plain divs: no role to query
    await expect(dishes.first()).toBeVisible()
    const total = await dishes.count()
    await w.check('explore')

    const spicy = page.getByRole('button', { name: 'Spicy', exact: true })
    const row = spicy.locator('xpath=..')
    const dims = await row.evaluate(el => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }))
    expect(dims.scrollWidth, 'the filter pills should scroll sideways inside their own row at 390px').toBeGreaterThan(dims.clientWidth)
    await w.tap(spicy, 'Explore filter Spicy')
    await expect.poll(() => row.evaluate(el => el.scrollLeft), 'pill row scrolled to reveal Spicy').toBeGreaterThan(0)
    await expect.poll(() => dishes.count(), 'Spicy shows no more dishes than All').toBeLessThanOrEqual(total)
    await w.check('explore, Spicy filter')

    await w.tap(page.getByRole('button', { name: 'All', exact: true }), 'Explore filter All')
    await expect(dishes).toHaveCount(total)

    const search = page.getByPlaceholder('Dishes, restaurants…')
    await w.tap(search, 'Explore search field')
    await search.fill('zzzzqq')
    await expect(page.getByText('Nothing found')).toBeVisible()
    await w.check('explore, empty search')
    await search.fill('pizza')
    await expect(dishes.first()).toBeVisible()
    expect(await dishes.count()).toBeLessThan(total)
    await w.check('explore, search "pizza"')
    await w.scrollThrough('explore, search "pizza"')

    await w.tap(dishes.first(), 'Explore dish card')
    await expect(page.locator('.sheet')).toBeVisible()
    await w.check('explore dish sheet')
    await closeSheet(page, w, 'explore dish sheet')
  })

  test('Map: the map renders, a restaurant chip opens its popup, the popup opens the restaurant', async ({ page, watch }, testInfo) => {
    const w = walker(page, watch, testInfo)
    await signIn(page)
    const nav = bottomNav(page)
    await page.goto(url('/'))
    await w.tap(nav.map, 'Map nav')
    await expect(page).toHaveURL(url('/map'))
    await expect(page.locator('.leaflet-container')).toBeVisible()
    await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible()
    await w.check('map')

    const chip = page.getByRole('button', { name: /Trattoria Bella Roma/ })
    const chips = chip.locator('xpath=..')
    const dims = await chips.evaluate(el => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }))
    expect.soft(dims.scrollWidth, 'the restaurant chips scroll sideways inside their strip, not the page').toBeGreaterThan(dims.clientWidth)
    await w.tap(chip, 'Map restaurant chip')
    await expect(page.locator('.leaflet-popup')).toBeVisible()
    await w.tap(page.getByRole('button', { name: 'Zoom in' }), 'Map zoom in')
    await w.check('map, popup open')
    await w.tap(page.locator('.leaflet-popup').getByRole('link', { name: /view menu/i }), 'Map popup "View menu"')
    await expect(page).toHaveURL(url(RESTAURANT))
    await w.check('restaurant opened from the map popup')
  })

  // Rufat's reported glitch around the map. Two parts: (1) the Leaflet panes (z-index 200..1000) lived in the root
  // stacking context and painted over the app shell (sheets, modals, bottom nav) - see the next test; (2) leaving the
  // map right after tapping a restaurant chip (animated pan) throws "Cannot read properties of undefined (reading
  // '_leaflet_pos')" from Leaflet's _move, which this test reports as a console error on the next screen.
  test('Map: leaving the map for Home / Explore / Profile / Notifications leaves no map behind', async ({ page, watch }, testInfo) => {
    const w = walker(page, watch, testInfo)
    await signIn(page)
    const nav = bottomNav(page)
    const targets = [
      ['Home', () => w.tap(nav.home, 'Home nav'), '/'],
      ['Explore', () => w.tap(nav.explore, 'Explore nav'), '/explore'],
      ['Profile', () => w.tap(nav.profile, 'Profile nav'), '/profile'],
      ['Notifications', () => w.tap(page.getByRole('button', { name: 'Notifications' }), 'Notifications bell'), '/notifications'],
    ]
    const leaflet = page.locator('[class*="leaflet-"]:visible')
    for (const [name, go, path] of targets) {
      await page.goto(url('/'))
      await w.tap(nav.map, 'Map nav')
      await expect(page.locator('.leaflet-container')).toBeVisible()
      // use the map like a person would: tap a restaurant chip (animated pan + popup), then leave right away
      await w.tap(page.getByRole('button', { name: /Sakura House/ }), 'Map restaurant chip')
      await go()
      await expect(page).toHaveURL(url(path))
      expect.soft(await page.locator('.leaflet-container:visible').count(), `a .leaflet-container is visible on ${name} right after leaving the map`).toBe(0)
      await page.waitForTimeout(700)   // the glitch may show up after the route transition
      expect.soft(await leaflet.count(), `Leaflet elements are visible on ${name} after leaving the map`).toBe(0)
      await w.check(`${name} after the map`)
      if (await page.locator('.leaflet-container:visible').count()) await w.shot(`${name} with the map still visible`)
    }

    // and with the browser's Back button
    await page.goto(url('/'))
    await w.tap(nav.map, 'Map nav')
    await expect(page.locator('.leaflet-container')).toBeVisible()
    await page.goBack()
    await expect(page).toHaveURL(url('/'))
    expect.soft(await leaflet.count(), 'Leaflet elements are visible on Home after Back from the map').toBe(0)
    await w.check('Home after Back from the map')
  })

  test('Map: the QR sheet and other overlays open above the map', async ({ page, watch }, testInfo) => {
    const w = walker(page, watch, testInfo)
    await signIn(page)
    const nav = bottomNav(page)
    await page.goto(url('/'))
    await w.tap(nav.map, 'Map nav')
    await expect(page.locator('.leaflet-container')).toBeVisible()
    const chip = page.getByRole('button', { name: /Trattoria Bella Roma/ })
    await expect(chip).toBeVisible()

    await w.tap(nav.qr, 'Scan QR button')
    await expect(heading(page, 'Scan Table QR')).toBeVisible()
    await page.waitForTimeout(500)   // sheet slide-in
    const where = await page.evaluate(leafletStacking)
    const box = await chip.boundingBox()
    const top = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y)
      return el ? { inLayer: !!el.closest('.overlay, .sheet, [role="dialog"]'), what: el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0] } : null
    }, { x: box.x + box.width / 2, y: box.y + box.height / 2 })
    await w.shot('map under the QR sheet')
    expect.soft(top, 'what is on top of a map chip while the QR sheet is open').toMatchObject({ inLayer: true })
    expect.soft(where, 'Leaflet panes (z-index 200..1000) must sit in their own stacking context: nearest context above .leaflet-container is the page root').toMatchObject({ root: false })
    expect.soft(where?.z ?? 0, `nearest stacking context (${where?.el}) must stay below the bottom nav (z 90) and sheets (z 200)`).toBeLessThan(90)
    await page.getByRole('button', { name: 'Cancel' }).tap()
    await expect(heading(page, 'Scan Table QR')).toHaveCount(0)
  })

  test('Restaurant: menu categories scroll sideways, a dish sheet opens and closes', async ({ page, watch }, testInfo) => {
    const w = walker(page, watch, testInfo)
    await signIn(page)
    await openRestaurant(page)
    await w.check('restaurant')
    await w.scrollThrough('restaurant')

    const last = page.getByRole('button', { name: /Wines/ })
    const strip = page.getByRole('button', { name: /Pasta/ }).locator('xpath=ancestor::div[contains(@class,"no-scrollbar")][1]')
    const dims = await strip.evaluate(el => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }))
    expect(dims.scrollWidth, 'the category strip should scroll sideways at 390px').toBeGreaterThan(dims.clientWidth)
    await w.tap(last, 'Menu category (last one)')
    await expect.poll(() => strip.evaluate(el => el.scrollLeft), 'strip scrolled to the last category').toBeGreaterThan(0)
    await expect(page.locator('.menu-card').first()).toBeVisible()
    await w.check('restaurant, last category')
    await w.tap(page.getByRole('button', { name: /All/ }).first(), 'Menu category All')

    await w.tap(page.locator('.menu-card').first(), 'Menu dish card')
    await expect(page.locator('.sheet')).toBeVisible()
    await expect(page.locator('.sheet').getByText(/₼\s*\d/).first()).toBeVisible()
    await w.check('dish sheet')
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
      await w.tap(page.locator('.overlay').last().getByRole('button', { name: 'All', exact: true }), 'Floor plan zone chip All')
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
    const entry = page.locator('a[href="/friends"]').first()
    await w.tap(entry, 'Profile "Friends" entry')
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
    await search.fill('Mu')
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
        await w.tap(page.getByRole('link', { name: 'Add More Items' }), 'Add More Items link')
        await expect(page).toHaveURL(/\/restaurant\/[\w-]+$/)
        const add = page.getByRole('button', { name: /^Add to Order/ })
        const tiles = page.locator('.menu-card')
        await expect(tiles.first()).toBeVisible()
        for (let i = 0, n = await tiles.count(); i < n && !(await add.isVisible()); i++) {   // skip sold-out dishes
          await w.tap(tiles.nth(i), 'Menu dish card')
          await add.waitFor({ timeout: 2_000 }).catch(() => sheetClose(page).tap())
        }
        await w.check('dish sheet while seated')
        await w.tap(add, 'Add to Order button')
        const place = page.getByRole('button', { name: /^Place Order/ })
        if (!(await place.isVisible({ timeout: 3_000 }).catch(() => false))) await w.tap(page.getByRole('button', { name: 'Open cart' }), 'Open cart button')
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
    expect(names.length, 'profile tabs').toBeGreaterThanOrEqual(4)
    for (const name of names) {
      const tab = hasRoleTabs ? page.getByRole('tab', { name, exact: true }) : page.getByRole('button', { name, exact: true })
      await w.tap(tab, `Profile tab ${name}`)
      if (hasRoleTabs) await expect(tab).toHaveAttribute('aria-selected', 'true')
      await settle(page, 3_000)
      await w.check(`profile tab ${name}`)
    }
  })

  test('Language: EN / AZ can be switched on a phone and the page stays', async ({ page, watch }, testInfo) => {
    const w = walker(page, watch, testInfo)
    await signIn(page)
    const nav = bottomNav(page)
    await page.goto(url('/profile'))
    await expect(heading(page, 'Aysel R.')).toBeVisible()
    const az = page.getByRole('button', { name: 'AZ', exact: true })
    const en = page.getByRole('button', { name: 'EN', exact: true })
    if (!(await az.isVisible())) {   // newer builds keep it in the Settings sheet
      const settings = page.getByRole('button', { name: /^settings$/i })
      if (await settings.count()) await w.tap(settings, 'Profile settings button')
    }
    await expect(az, 'the EN/AZ switch must be reachable on a phone (only the desktop sidebar renders it on builds without the Settings sheet)').toBeVisible({ timeout: 3_000 })

    const before = page.url()
    await w.tap(az, 'AZ button')
    await expect(nav.home, 'bottom nav is still in English').toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Ana Səhifə', exact: true })).toBeVisible()
    expect(page.url(), 'the page must not change when the language does').toBe(before)
    expect(await page.evaluate(() => localStorage.getItem('rufesto_lang'))).toBe('az')
    await w.check('profile in Azerbaijani')

    await w.tap(en, 'EN button')
    await expect(nav.home).toBeVisible()
    expect(page.url()).toBe(before)
    expect(await page.evaluate(() => localStorage.getItem('rufesto_lang'))).toBe('en')
    await w.check('profile back in English')
  })

  test('Theme: the dark / light toggle flips the theme and survives a reload', async ({ page, watch }, testInfo) => {
    const w = walker(page, watch, testInfo)
    await signIn(page)
    await page.goto(url('/'))
    const html = page.locator('html')
    const toggle = page.getByRole('button', { name: 'Toggle theme' })
    const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
    const start = await html.getAttribute('data-theme')
    const other = start === 'light' ? 'dark' : 'light'
    const startBg = await background()

    await w.tap(toggle, 'Toggle theme button')
    await expect(html).toHaveAttribute('data-theme', other)
    await expect.poll(background, 'page background changes with the theme').not.toBe(startBg)
    await w.check(`home, ${other} theme`)
    await w.scrollThrough(`home, ${other} theme`)

    await page.reload()
    await expect(html).toHaveAttribute('data-theme', other)
    await w.check(`home, ${other} theme after reload`)

    await w.tap(toggle, 'Toggle theme button')
    await expect(html).toHaveAttribute('data-theme', start)
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
