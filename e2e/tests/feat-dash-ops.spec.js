// Dashboard operations, feature by feature, as the Sakura House staff (docs/REVIEW-ACCOUNTS.md) against RESTO_URL.
// Findings and screenshots: docs/qa/dashboard-ops.md. Tests that hit an app bug stay red on purpose (no fixme).
//
// Rules of this file:
//  - Sign-in goes through the Supabase auth API only (support/feat-dash.js); the only text ever typed into the
//    password field is a dummy that must be rejected (the wrong-password test, on an e-mail that does not exist).
//  - Everything written lives on Sakura House. Each stateful group owns its tables: overview B1/B2, orders+kitchen
//    T1/T3, tables T4, waiter T2. Groups are 'default' mode (sequential, a failure does not skip the rest) and every
//    group resets its tables before and after. Read-only groups run 'parallel'.
//  - Created dishes / campaigns / bookings are removed again (staff cannot delete orders: those end cancelled).
const fs = require('fs')
const path = require('path')
const { test: base, expect, settle } = require('../support/fixtures')
const F = require('../support/feat-dash')
// Tests that seat the shared guests (review4-6) request `guestLock`: a cross-process mutex (see support/feat-dash.js).
// It is a fixture so that waiting for the lock has its own timeout and does not eat the test's.
const test = base.extend({
  guestLock: [async ({}, use) => {
    const waited = await F.acquireGuestLock()
    try { await use(waited) } finally { F.releaseGuestLock() }
  }, { timeout: 25 * 60_000 }],
})
const { walker } = require('../support/mobile')

const url = p => F.RESTO_URL + p
const CONSUMER = F.CONSUMER_URL
const locale = (lang, ns) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'client-resto', 'src', 'locales', lang, ns + '.json'), 'utf8'))

test.skip(!F.haveAccounts, 'docs/REVIEW-ACCOUNTS.md must list the Sakura staff and review4-6')

// ---- shared helpers ---------------------------------------------------------------------------------------------
/** Sign `key` in over the auth API, open `p` and wait until the dashboard shell (after the role gate) is on screen. */
async function openDash(page, key, p = '/') {
  const api = F.apiFor(page, await F.authenticate(page, key))
  await page.goto(url(p))
  await page.locator('.dash-layout').waitFor()
  return api
}
const pathOf = page => new URL(page.url()).pathname
/** hrefs of the sidebar (desktop) or the bottom nav (<= 768px). */
const navHrefs = (page, sel = '.dash-nav a') => page.locator(sel).evaluateAll(as => as.map(a => new URL(a.href).pathname))
/** Render the app as a staff role it has no test account for: the staff row the dashboard reads gets another role. */
async function actAs(page, role) {
  await page.route(/\/rest\/v1\/staff\?/, async route => {
    const res = await route.fetch()
    const rows = await res.json().catch(() => null)
    await route.fulfill({ response: res, json: Array.isArray(rows) ? rows.map(r => ({ ...r, role })) : rows })
  })
}

const ALL_ROUTES = ['/', '/orders', '/kds', '/tables', '/menu', '/promos', '/bookings', '/waiter', '/bills', '/tips', '/my-tips', '/settings', '/qr-sheet']
const MANAGER_PAGES = ['/', '/orders', '/kds', '/tables', '/menu', '/promos', '/bookings', '/waiter', '/bills', '/tips', '/my-tips', '/settings', '/qr-sheet']
// role -> { routes it may open (lib/roles.js + features/v2/roles.js), home, sidebar items (nav.js + DashboardLayout) }
const ROLES = {
  admin:   { routes: ALL_ROUTES, home: '/', nav: ['/', '/orders', '/kds', '/tables', '/menu', '/promos', '/bookings', '/waiter', '/bills', '/tips', '/settings'] },
  manager: { routes: ALL_ROUTES, home: '/', nav: ['/', '/orders', '/kds', '/tables', '/menu', '/promos', '/bookings', '/waiter', '/bills', '/tips', '/settings'] },
  waiter:  { routes: ['/waiter', '/tables', '/orders', '/my-tips'], home: '/waiter', nav: ['/orders', '/tables', '/waiter', '/my-tips'] },
  host:    { routes: ['/waiter', '/tables', '/bookings', '/my-tips'], home: '/waiter', nav: ['/tables', '/bookings', '/waiter', '/my-tips'], mock: true },
  cashier: { routes: ['/waiter', '/orders', '/tables', '/bills', '/my-tips'], home: '/waiter', nav: ['/orders', '/tables', '/waiter', '/bills', '/my-tips'], mock: true },
  kitchen: { routes: ['/kds'], home: '/kds', nav: ['/kds'] },
}
const sorted = a => [...a].sort()

// =====================================================================================================================
// 1. Login page
// =====================================================================================================================
test.describe('login', { tag: ['@anon', '@resto', '@dash-ops'] }, () => {
  test.describe.configure({ mode: 'parallel' })

  test('the form renders its labels, notice and theme switch without console errors', async ({ page, watch }) => {
    await page.goto(url('/login'))
    await expect(page.getByRole('heading', { name: 'Sign in to your restaurant' })).toBeVisible()
    await expect(page.getByText('For Business')).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeEnabled()
    await expect(page.getByText('Restaurant accounts are created by Rufesto.')).toBeVisible()
    await page.getByRole('button', { name: 'Light', exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(page.getByRole('button', { name: 'Dark', exact: true })).toBeVisible()
    await settle(page)
    expect(watch.consoleErrors, 'console errors on /login').toEqual([])
  })

  test('submitting an empty form asks for e-mail and password', async ({ page }) => {
    await page.goto(url('/login'))
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
    await expect(page.getByText('Email and password are required')).toBeVisible()
    await page.getByLabel('Email').fill('someone@rufesto.test')
    await page.getByRole('button', { name: 'Sign In', exact: true }).click()
    await expect(page.getByText('Email and password are required')).toBeVisible()
    await expect(page).toHaveURL(url('/login'))
  })

  test('a wrong password shows the friendly error, not the raw auth message', async ({ page }) => {
    await page.goto(url('/login'))
    await page.getByLabel('Email').fill('nobody.dashops@rufesto.test')   // no such account
    await page.getByLabel('Password').fill('dummy-not-a-password')       // dummy: it must be rejected, never a real credential
    const signIn = page.getByRole('button', { name: 'Sign In', exact: true })
    await signIn.click()
    await expect(page.getByText('Incorrect email or password.')).toBeVisible()
    await expect(page.getByText(/invalid login credentials/i)).toHaveCount(0)
    await expect(page).toHaveURL(url('/login'))
    await expect(signIn).toBeEnabled()   // the spinner is gone, the user can retry
  })

  test('Azerbaijani copy on the login page (language comes from rufesto_lang)', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('rufesto_lang', 'az'))
    await page.goto(url('/login'))
    const dash = locale('az', 'dashboard')
    await expect(page.getByRole('heading', { name: dash.signInToRestaurant })).toBeVisible()
    await expect(page.getByRole('button', { name: dash.signIn, exact: true })).toBeVisible()
    await expect(page.getByText(dash.forBusiness)).toBeVisible()
    await expect(page.getByText(dash.accountsNotice)).toBeVisible()
    await page.getByRole('button', { name: dash.signIn, exact: true }).click()
    await expect(page.getByText(dash.errCredentialsRequired)).toBeVisible()
  })

  test('every protected route sends a signed-out visitor to /login', async ({ page }) => {
    for (const p of ALL_ROUTES) {
      await page.goto(url(p))
      await expect(page, `signed out on ${p}`).toHaveURL(url('/login'))
    }
  })

  for (const [key, home] of [['manager', '/'], ['waiter1', '/waiter'], ['kitchen', '/kds']]) {
    test(`a signed-in ${key} opening /login lands on the role home ${home}`, async ({ page }) => {
      await F.authenticate(page, key)
      await page.goto(url('/login'))
      await page.locator('.dash-layout').waitFor()
      expect(pathOf(page)).toBe(home)
    })
  }

  test('Sign Out ends the session: back to /login, token gone, refresh token revoked, routes bounce', async ({ page, browser }) => {
    // The only test that signs an account out (global sign-out). The session comes from a throw-away page and is
    // seeded by hand, so no init script puts the token back after the sign-out.
    const tmp = await browser.newPage()
    const who = await F.authenticate(tmp, 'waiter2')
    await tmp.close()
    const key = `sb-${new URL(who.supabase.url).hostname.split('.')[0]}-auth-token`
    await page.goto(url('/login'))
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [key, JSON.stringify(who.session)])
    await page.goto(url('/waiter'))
    await page.locator('.dash-layout').waitFor()
    await page.locator('.dash-sidebar').getByRole('button', { name: 'Sign Out' }).click()
    await expect(page).toHaveURL(url('/login'))
    expect(await page.evaluate(k => localStorage.getItem(k), key), 'auth token left in localStorage').toBeNull()
    await page.goto(url('/orders'))
    await expect(page).toHaveURL(url('/login'))
    const refresh = await page.request.post(`${who.supabase.url}/auth/v1/token?grant_type=refresh_token`, {
      headers: { apikey: who.supabase.anonKey, 'Content-Type': 'application/json' },
      data: { refresh_token: who.session.refresh_token }, failOnStatusCode: false,
    })
    expect(refresh.status(), 'the old refresh token must be revoked after Sign Out').toBeGreaterThanOrEqual(400)
    F.forget('waiter2')
  })
})

// =====================================================================================================================
// 2. Role gating on every route (direct URL), sidebar and bottom nav per role
// =====================================================================================================================
test.describe('role gating', { tag: ['@staff', '@resto', '@dash-ops'] }, () => {
  test.describe.configure({ mode: 'parallel' })

  for (const [role, spec] of Object.entries(ROLES)) {
    const acct = { admin: 'admin', manager: 'manager', waiter: 'waiter1', kitchen: 'kitchen', host: 'waiter1', cashier: 'waiter1' }[role]
    const how = spec.mock ? ' (staff row rewritten to this role: no account exists)' : ''

    test(`${role}: every route is opened or bounced to ${spec.home} by direct URL${how}`, async ({ page }) => {
      test.setTimeout(120_000)
      await F.authenticate(page, acct)
      if (spec.mock) await actAs(page, role)
      for (const p of ALL_ROUTES) {
        await page.goto(url(p))
        await page.locator('.dash-layout').waitFor()
        const want = spec.routes.includes(p) ? p : spec.home
        expect.soft(pathOf(page), `${role} on ${p}`).toBe(want)
      }
    })

    test(`${role}: sidebar and bottom nav show exactly the pages the role can open${how}`, async ({ page }) => {
      await F.authenticate(page, acct)
      if (spec.mock) await actAs(page, role)
      await page.goto(url(spec.home))
      await page.locator('.dash-layout').waitFor()
      expect(sorted(await navHrefs(page)), `${role} sidebar`).toEqual(sorted(spec.nav))
      await page.setViewportSize({ width: 390, height: 844 })
      expect(sorted(await navHrefs(page, '.dash-mobile-nav a')), `${role} bottom nav`).toEqual(sorted(spec.nav))
    })
  }

  test('the Access Denied screen is shown when the account has no staff row', async ({ page }) => {
    // review4 is a guest: valid session, no staff row
    await F.authenticate(page, 'review4')
    await page.goto(url('/'))
    await expect(page.getByRole('heading', { name: 'Access Denied' })).toBeVisible()
    await expect(page.getByText('No active staff record found. Contact your restaurant administrator.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible()
  })
})

// =====================================================================================================================
// 3. Every page loads for the manager without console or network errors
// =====================================================================================================================
test.describe('page smoke', { tag: ['@staff', '@resto', '@dash-ops'] }, () => {
  test.describe.configure({ mode: 'parallel' })
  for (const p of MANAGER_PAGES) {
    test(`manager: ${p} loads with its heading and no console errors`, async ({ page, watch }) => {
      await openDash(page, 'manager', p)
      await expect(page.locator('main h1').first()).toBeVisible()
      await settle(page)
      expect(watch.consoleErrors, `console errors on ${p}`).toEqual([])
      const bad = watch.failedCalls.filter(c => !/\/auth\/v1\//.test(c))
      expect(bad, `failed network calls on ${p}`).toEqual([])
    })
  }
})

// =====================================================================================================================
// 4. Azerbaijani on every page (no raw keys, headings from the az locale)
// =====================================================================================================================
const RAW_KEY = /\b[a-z]{2,}(?:[A-Z][a-z0-9]+)+(?:_[a-z]+)?\b|\b[a-z0-9]+:[a-z][A-Za-z]+[A-Z]?[A-Za-z]*\b/g
async function rawKeys(page) {
  return page.evaluate(src => {
    const re = new RegExp(src, 'g')
    const texts = [document.body.innerText]
    for (const el of document.querySelectorAll('[title],[aria-label],[placeholder]')) {
      for (const a of ['title', 'aria-label', 'placeholder']) { const v = el.getAttribute(a); if (v) texts.push(v) }
    }
    const found = new Set()
    for (const t of texts) for (const m of t.matchAll(re)) found.add(m[0])
    return [...found]
  }, RAW_KEY.source)
}

test.describe('azerbaijani', { tag: ['@staff', '@resto', '@dash-ops'] }, () => {
  test.describe.configure({ mode: 'parallel' })
  const dash = locale('az', 'dashboard')
  const v2 = locale('az', 'v2')
  const H1 = {
    '/': dash.navOverview, '/orders': dash.ordersTitle, '/kds': dash.kitchen, '/tables': dash.tablesTitle, '/menu': dash.menuTitle,
    '/promos': dash.promosTitle, '/bookings': dash.bookingsTitle, '/waiter': dash.navWaiter,
    '/bills': v2.billsTitle, '/tips': v2.tipsTitle, '/my-tips': v2.myTipsTitle, '/settings': v2.settingsTitle, '/qr-sheet': v2.qrSheetTitle,
  }
  for (const p of MANAGER_PAGES) {
    test(`${p}: heading and nav are Azerbaijani, no raw i18n keys`, async ({ browser }, testInfo) => {
      const s = await F.openAs(browser, testInfo, 'manager', { lang: 'az' })
      try {
        await s.page.goto(url(p))
        await s.page.locator('.dash-layout').waitFor()
        await settle(s.page)
        await expect(s.page.locator('main h1').first()).toHaveText(H1[p])
        const navText = (await s.page.locator('.dash-nav .dash-nav-label').allInnerTexts()).map(x => x.trim())
        expect(navText, 'sidebar labels').toEqual(expect.arrayContaining([dash.navOverview, dash.navOrders, dash.navKitchen, dash.navTables, dash.navMenu, dash.navPromos, dash.navBookings, dash.navWaiter, v2.navBills, v2.navSettings]))
        expect(await rawKeys(s.page), `raw i18n keys visible on ${p}`).toEqual([])
      } finally { await s.close() }
    })
  }

  test('the role label under the restaurant name is translated (it shows the raw role "manager")', async ({ browser }, testInfo) => {
    const s = await F.openAs(browser, testInfo, 'manager', { lang: 'az' })
    try {
      await s.page.goto(url('/')); await s.page.locator('.dash-layout').waitFor()
      const role = (await s.page.locator('.dash-resto-role').innerText()).trim().toLowerCase()
      expect(role, 'role label in Azerbaijani').not.toBe('manager')
    } finally { await s.close() }
  })

  test('the EN / AZ switch persists across a reload and flips every label', async ({ page }) => {
    await openDash(page, 'manager', '/orders')
    await expect(page.locator('main h1')).toHaveText('Orders')
    await page.locator('.lang-switcher').getByRole('button', { name: 'AZ' }).click()
    await expect(page.locator('main h1')).toHaveText(dash.ordersTitle)
    await page.reload()
    await expect(page.locator('main h1')).toHaveText(dash.ordersTitle)
    expect(await page.evaluate(() => localStorage.getItem('rufesto_lang'))).toBe('az')
    await page.locator('.lang-switcher').getByRole('button', { name: 'EN' }).click()
    await expect(page.locator('main h1')).toHaveText('Orders')
  })
})

// =====================================================================================================================
// 5. 390 px layout
// =====================================================================================================================
test.describe('mobile 390px', { tag: ['@staff', '@resto', '@dash-ops', '@mobile'] }, () => {
  test.describe.configure({ mode: 'parallel' })
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 390, height: 844 }) })

  test('manager pages: no horizontal overflow, no cut-off content, no console errors', async ({ page, watch }, testInfo) => {
    test.setTimeout(150_000)
    await openDash(page, 'manager', '/')
    const w = walker(page, watch, testInfo)
    for (const p of MANAGER_PAGES) {
      await page.goto(url(p))
      await page.locator('.dash-layout').waitFor()
      await settle(page)
      await w.check(`manager ${p}`)
      await w.scrollThrough(`manager ${p}`)
    }
  })

  test('waiter and kitchen pages fit 390px', async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    for (const [key, pages] of [['waiter1', ['/waiter', '/tables', '/orders', '/my-tips']], ['kitchen', ['/kds']]]) {
      const s = await F.openAs(browser, testInfo, key, { viewport: { width: 390, height: 844 } })
      try {
        const w = walker(s.page, s.watch, testInfo)
        for (const p of pages) {
          await s.page.goto(url(p))
          await s.page.locator('.dash-layout').waitFor()
          await settle(s.page)
          await w.check(`${key} ${p}`)
        }
      } finally { await s.close() }
    }
  })

  test('the bottom nav reaches every page of a manager (10+ items) and marks the current one', async ({ page }) => {
    await openDash(page, 'manager', '/')
    const nav = page.locator('.dash-mobile-nav')
    await expect(nav).toBeVisible()
    await expect(page.locator('.dash-sidebar')).toBeHidden()
    const items = nav.locator('a')
    const n = await items.count()
    expect(n).toBe(ROLES.manager.nav.length)
    for (let i = 0; i < n; i++) {
      const a = items.nth(i)
      const href = new URL(await a.getAttribute('href'), url('/')).pathname
      await a.scrollIntoViewIfNeeded()
      const box = await a.boundingBox()
      expect.soft(box.height, `bottom nav item ${href} height`).toBeGreaterThanOrEqual(40)
      await a.click()
      await expect(page).toHaveURL(url(href))
      await expect(a).toHaveClass(/active/)
    }
  })

  test('the bottom nav scrolls the current page into view (Waiter, Bills, Tips, Settings sit past the first 7 items)', async ({ page }) => {
    await openDash(page, 'manager', '/')
    for (const p of ['/waiter', '/bills', '/tips', '/settings']) {
      await page.goto(url(p))
      await page.locator('.dash-layout').waitFor()
      const active = page.locator('.dash-mobile-nav a.active')
      await expect(active).toHaveCount(1)
      await page.waitForTimeout(400)
      const b = await active.boundingBox()
      expect.soft(b.x >= 0 && b.x + b.width <= 390.5, `bottom nav item for ${p} is on screen (x ${Math.round(b.x)}..${Math.round(b.x + b.width)} of 390)`).toBe(true)
    }
  })

  test('tap targets on the phone are at least 40px: table code actions, filter chips, tabs', async ({ page }) => {
    await openDash(page, 'manager', '/tables')
    const tall = async (loc, label) => { const b = await loc.first().boundingBox(); expect.soft(b.height, `${label} height`).toBeGreaterThanOrEqual(40); expect.soft(b.width, `${label} width`).toBeGreaterThanOrEqual(40) }
    await tall(page.locator('.code-chip-btn[aria-label="Copy access code"]'), 'Copy access code button')
    await tall(page.locator('.code-chip-btn[aria-label="Show QR code"]'), 'Show QR code button')
    await tall(page.locator('.chip').first(), 'filter chip')
    await page.goto(url('/waiter'))
    await tall(page.locator('.chip', { hasText: 'My Tables' }), 'Waiter tab chip')
  })

  test('sign out, language and theme are reachable on a phone', async ({ page }) => {
    // The sidebar (which holds Sign Out, EN/AZ and Light/Dark) is display:none at <= 768px; the mobile header only shows the name.
    await openDash(page, 'waiter1', '/waiter')
    const signOut = page.getByRole('button', { name: 'Sign Out' })
    const lang = page.getByRole('button', { name: 'AZ', exact: true })
    const theme = page.getByRole('button', { name: /^(Light|Dark)$/ })
    expect.soft(await signOut.isVisible(), 'Sign Out visible at 390px').toBe(true)
    expect.soft(await lang.isVisible(), 'EN/AZ switch visible at 390px').toBe(true)
    expect.soft(await theme.isVisible(), 'theme switch visible at 390px').toBe(true)
  })

  test('forms and dialogs fit the phone viewport (Add Dish, New Campaign, table QR)', async ({ page }) => {
    await openDash(page, 'manager', '/menu')
    const fits = async (loc, label) => {
      const b = await loc.boundingBox()
      expect.soft(b.x, `${label} left edge`).toBeGreaterThanOrEqual(0)
      expect.soft(b.x + b.width, `${label} right edge`).toBeLessThanOrEqual(390.5)
    }
    await page.getByRole('button', { name: 'Add Dish' }).click()
    await fits(page.locator('.modal'), 'Add Dish modal')
    await expect(page.getByRole('button', { name: 'Add Dish' }).last()).toBeVisible()   // save button reachable inside the scrolling modal
    await page.locator('.modal').getByRole('button', { name: 'Cancel' }).click()
    await page.goto(url('/promos'))
    await page.getByRole('button', { name: 'New Campaign' }).click()
    await fits(page.locator('.modal'), 'New Campaign modal')
    await page.locator('.modal').getByRole('button', { name: 'Cancel' }).click()
    await page.goto(url('/tables'))
    await page.locator('.tbl-card-code-row button[aria-label="Show QR code"]').first().click()
    await fits(page.locator('.qr-modal'), 'QR modal')
  })
})

// =====================================================================================================================
// Shared setup of the stateful groups
// =====================================================================================================================
const money = n => '₼' + Number(n).toFixed(2)
const bakuToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Baku' }).format(new Date())
const todayStart = () => encodeURIComponent(`${bakuToday()}T00:00:00+04:00`)
const IDLE = ['free', 'cleared', 'maintenance']
const lastDiv = page => page.locator('main.dash-content > div > div:last-child > div')   // the list under the filter chips (Orders, Bookings, Promos, Menu)
const stat = (page, label) => page.locator('.stat-card').filter({ has: page.locator('.stat-label', { hasText: label }) }).locator('.stat-value')
const ordersToday = async page => parseInt(await page.locator('main h1 + span').innerText(), 10)
const kdsCol = (page, name) => page.locator('.kds-col').filter({ has: page.locator('.kds-col-title', { hasText: new RegExp(`^${name}$`, 'i') }) })
const chip = (page, re) => page.locator('.chip').filter({ hasText: re })

/**
 * Sessions for a stateful group: API handles for the manager and the guests (+ any other account in `keys`), the
 * cheapest Sakura dishes, and a reset of the group's tables before and after; `env.cleanups` run before the sessions close. `env.order(table, items, guestIdx?)`
 * seats a guest and places one order (the guest is picked by the caller so the 5-orders-per-10-minutes cap is never hit).
 */
function useEnv(tables, keys = [], { perTest = true } = {}) {
  const env = { tables, recent: [], cleanups: [] }
  env.clean = async () => { for (const t of tables) await F.resetTable(env.mgr, t, env.guests).catch(e => console.log(`[reset ${t}] ${e.message}`)) }
  const locked = async fn => { await F.acquireGuestLock(); try { return await fn() } finally { F.releaseGuestLock() } }
  test.beforeAll(async ({ browser }, testInfo) => {
    test.setTimeout(20 * 60_000)
    env.s = {}
    for (const k of ['manager', 'review4', 'review5', 'review6', ...keys]) env.s[k] = await F.openAs(browser, testInfo, k)
    env.mgr = env.s.manager.api
    env.guests = [env.s.review4.api, env.s.review5.api, env.s.review6.api]
    env.dishes = await F.sakuraDishes(env.mgr, 8)
    await locked(env.clean)
  })
  // perTest: every test holds the guest lock and starts from clean tables (groups whose tests mostly do not seat guests opt out)
  if (perTest) test.beforeEach(async ({ guestLock }) => { await env.clean() })
  test.afterAll(async () => {
    test.setTimeout(10 * 60_000)
    for (const f of env.cleanups) await f().catch(e => console.log(`[cleanup] ${e.message}`))
    await locked(env.clean)
    for (const s of Object.values(env.s || {})) await s.close()
  })
  /** The guest (index into review4-6) with the fewest orders at `table` in the last 9 minutes. */
  env.pick = async table => {
    const t = await F.tableInfo(env.mgr, table)
    const since = encodeURIComponent(new Date(Date.now() - 9.5 * 60_000).toISOString())
    const n = []
    for (const g of env.guests) n.push((await g.rows(`orders?table_id=eq.${t.id}&user_id=eq.${g.userId}&placed_at=gte.${since}&select=id`)).length)
    return n.indexOf(Math.min(...n))
  }
  env.order = async (table, items, i) => {
    if (i === undefined) i = await env.pick(table)
    const t = await F.tableInfo(env.mgr, table)
    const r = await F.seatAndOrder(env.guests[i], t.code, items)
    return { ...r, table: t, guest: env.guests[i], i }
  }
  env.items = (...qty) => qty.map((q, k) => ({ dish_id: env.dishes[k].id, qty: q }))
  return env
}

// =====================================================================================================================
// 6. Overview (Sakura B1 / B2)
// =====================================================================================================================
test.describe('overview', { tag: ['@staff', '@resto', '@dash-ops', '@do-overview'] }, () => {
  test.describe.configure({ mode: 'default' })
  const env = useEnv(['B1', 'B2'])

  test('stat cards (revenue, orders, active tables, menu) agree with the database', async ({ page }) => {
    const api = await openDash(page, 'manager', '/')
    const [tables, dishes, orders] = await Promise.all([
      api.rows(`tables?restaurant_id=eq.${F.SAKURA_ID}&is_active=eq.true&select=state`),
      api.rows(`dishes?restaurant_id=eq.${F.SAKURA_ID}&select=available`),
      api.rows(`orders?restaurant_id=eq.${F.SAKURA_ID}&placed_at=gte.${todayStart()}&select=status,total_amount`),
    ])
    const revenue = orders.filter(o => !['cancelled', 'refunded'].includes(o.status)).reduce((s, o) => s + Number(o.total_amount || 0), 0)
    await expect(stat(page, 'Revenue')).toHaveText(money(revenue))
    await expect(stat(page, 'Orders Today')).toHaveText(String(orders.length))
    await expect(stat(page, 'Active Tables')).toHaveText(`${tables.filter(t => !IDLE.includes(t.state)).length}/${tables.length}`)
    await expect(stat(page, 'Menu Available')).toHaveText(`${dishes.filter(d => d.available).length}/${dishes.length}`)
  })

  test('the Live badge carries today\'s date and the page has its sections', async ({ page }) => {
    await openDash(page, 'manager', '/')
    await expect(page.locator('main .dash-live-dot').first()).toBeVisible()
    const day = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    await expect(page.getByText(`Live · ${day}`)).toBeVisible()
    for (const s of ['RECENT ORDERS', 'TABLES', 'QUICK ACTIONS']) await expect(page.locator('.dash-section-title', { hasText: s })).toBeVisible()
    await expect(page.locator('main').getByText(/^(Free|Busy|Ordering|Reserved)$/)).toHaveCount(4)   // legend
  })

  test('Active Tables counts reserved tables but not tables in maintenance (live, no reload)', async ({ page }) => {
    const api = await openDash(page, 'manager', '/')
    const all = await api.rows(`tables?restaurant_id=eq.${F.SAKURA_ID}&is_active=eq.true&select=state`)
    const base = all.filter(t => !IDLE.includes(t.state)).length
    const b1 = await F.tableInfo(env.mgr, 'B1')
    const set = async s => expect((await env.mgr.patch(`tables?id=eq.${b1.id}`, { state: s })).ok, `B1 -> ${s}`).toBe(true)
    await expect(stat(page, 'Active Tables')).toHaveText(`${base}/${all.length}`)
    await set('reserved')
    await expect(stat(page, 'Active Tables')).toHaveText(`${base + 1}/${all.length}`, { timeout: 15_000 })
    await set('free')
    await expect(stat(page, 'Active Tables')).toHaveText(`${base}/${all.length}`, { timeout: 15_000 })
    await set('maintenance')
    await page.waitForTimeout(2_000)   // the realtime reload has run; the table is still not "active"
    await expect(stat(page, 'Active Tables')).toHaveText(`${base}/${all.length}`)
    await set('free')
  })

  test('a guest order bumps Orders Today, revenue, active tables, recent orders and the kitchen alert live', async ({ page }) => {
    const api = await openDash(page, 'manager', '/')
    const b2 = await F.tableInfo(env.mgr, 'B2')
    const text = async label => (await stat(page, label).innerText()).trim()
    const orders0 = parseInt(await text('Orders Today'), 10)
    const revenue0 = Number((await text('Revenue')).replace('₼', ''))
    const active0 = parseInt(await text('Active Tables'), 10)
    const { orderId } = await env.order('B2', env.items(1, 2))
    const [o] = await api.rows(`orders?id=eq.${orderId}&select=total_amount`)
    await expect(stat(page, 'Orders Today')).toHaveText(String(orders0 + 1), { timeout: 15_000 })
    await expect(stat(page, 'Revenue')).toHaveText(money(revenue0 + Number(o.total_amount)), { timeout: 15_000 })
    await expect(stat(page, 'Active Tables')).toHaveText(new RegExp(`^${active0 + 1}/`), { timeout: 15_000 })
    const first = page.locator('.dash-grid > div').first().locator('> div').last().locator('> div').first()
    await expect(first).toContainText(`Table ${b2.number}`)
    await expect(first).toContainText(money(o.total_amount))
    const banner = page.getByRole('link', { name: /in kitchen/ })
    await expect(banner).toBeVisible()
    expect(parseInt((await banner.innerText()).match(/\d+/)[0], 10), 'tickets in the kitchen alert').toBeGreaterThanOrEqual(2)
    await banner.click()
    await expect(page).toHaveURL(url('/kds'))
  })

  test('a pending booking raises the bookings alert, which opens /bookings', async ({ page }) => {
    await openDash(page, 'manager', '/')
    const b = await F.bookSlot(env.guests[0], { party: 2, pick: 6 })
    try {
      const alert = page.getByRole('link', { name: /pending booking/ })
      await expect(alert).toBeVisible({ timeout: 15_000 })
      await alert.click()
      await expect(page).toHaveURL(url('/bookings'))
    } finally { await env.guests[0].rpc('cancel_booking', { p_booking_id: b.id }) }
  })

  test('View all, Manage and the quick actions navigate', async ({ page }) => {
    await openDash(page, 'manager', '/')
    const go = async (name, to) => { await page.locator('main').getByRole('link', { name }).first().click(); await expect(page).toHaveURL(url(to)); await page.goBack(); await page.locator('.dash-layout').waitFor() }
    await go(/View all/, '/orders')
    await go(/Manage →/, '/tables')
    await go(/Open Kitchen Display/, '/kds')
    await go(/Toggle Menu Items/, '/menu')
    await go(/Manage Bookings/, '/bookings')
  })
})

// =====================================================================================================================
// 7. Orders and kitchen board (Sakura T1 / T3, guests review4-6, kitchen.sakura)
// =====================================================================================================================
async function consumerOrder(guest, code) {
  await guest.goto(`${CONSUMER}/t/${code}`)
  await expect(guest.getByRole('heading', { name: 'Join this table?' })).toBeVisible()
  await guest.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(guest).toHaveURL(`${CONSUMER}/table`)
  await guest.getByRole('link', { name: 'Add More Items' }).click()
  await expect(guest).toHaveURL(/\/restaurant\/[\w-]+$/)
  const add = guest.getByRole('button', { name: /^Add to Order/ })
  const tiles = guest.locator('.menu-card')
  await expect(tiles.first()).toBeVisible()
  for (let i = 0, n = await tiles.count(); i < n && !(await add.isVisible()); i++) {   // skip sold-out dishes
    await tiles.nth(i).click()
    await add.waitFor({ timeout: 2_000 }).catch(() => guest.keyboard.press('Escape'))
  }
  await add.click()
  const place = guest.getByRole('button', { name: /^Place Order/ })
  if (!(await place.isVisible({ timeout: 3_000 }).catch(() => false))) await guest.getByRole('button', { name: 'Open cart' }).click()
  const placed = guest.waitForResponse(r => r.request().method() === 'POST' && /\/rest\/v1\/rpc\/place_order/.test(r.url()))
  await place.click()
  const res = await placed
  expect(res.ok(), `place_order rpc: ${res.ok() ? '' : await res.text()}`).toBe(true)
  await expect(guest.getByText('Order placed!')).toBeVisible({ timeout: 10_000 })
}

test.describe('orders and kitchen', { tag: ['@staff', '@resto', '@dash-ops', '@do-orders'] }, () => {
  test.describe.configure({ mode: 'default' })
  const env = useEnv(['T1', 'T3'], ['kitchen'])

  test('an order placed in the consumer app appears on Orders live, with the right items, guest and totals', async ({ page, browser }, testInfo) => {
    test.setTimeout(150_000)
    const api = await openDash(page, 'manager', '/orders')
    await expect(page.locator('main h1')).toHaveText('Orders')
    const dbCount = async () => (await api.rows(`orders?restaurant_id=eq.${F.SAKURA_ID}&placed_at=gte.${todayStart()}&select=id`)).length
    await expect.poll(() => ordersToday(page), { message: 'orders today once the page has loaded' }).toBe(await dbCount())
    const before = await dbCount()
    const t1 = await F.tableInfo(env.mgr, 'T1')
    const guest = await F.openAs(browser, testInfo, 'review4')
    try { await consumerOrder(guest.page, t1.code) } finally { await guest.close() }
    await expect.poll(() => ordersToday(page), { timeout: 20_000, message: 'orders today after the guest ordered' }).toBe(before + 1)
    const [row] = await api.rows(`orders?table_id=eq.${t1.id}&order=placed_at.desc&limit=1&select=id,status,subtotal,tax_amount,service_charge,total_amount`)
    const card = lastDiv(page).first()
    await expect(card).toContainText('T1')
    await expect(card).toContainText('Tural R.')
    await expect(card).toContainText(money(row.total_amount))
    await card.locator('> div').nth(1).click()   // expand
    const sub = Number(row.subtotal), tax = Number(row.tax_amount || 0), svc = Number(row.service_charge || 0)
    expect(Math.abs(sub + tax + svc - Number(row.total_amount)), 'subtotal + tax + service charge = total').toBeLessThan(0.011)
    await expect(card).toContainText(`${money(sub)}`)
    await expect(card.getByRole('button', { name: 'Cancel' })).toBeVisible()
    const t = await F.tableInfo(env.mgr, 'T1')
    expect(t.state, 'table state after the guest joined and ordered').toBe('occupied')
  })

  test('status chips count and filter the list; empty optional chips stay hidden', async ({ page }) => {
    test.setTimeout(150_000)
    const api = await openDash(page, 'manager', '/orders')
    const statuses = ['open', 'submitted', 'preparing', 'ready', 'served', 'cancelled']
    const ids = []
    const g1 = await env.pick('T1'), g3 = await env.pick('T3')
    for (let k = 0; k < 3; k++) ids.push((await env.order('T1', env.items(1 + k), g1)).orderId)
    for (let k = 0; k < 3; k++) ids.push((await env.order('T3', env.items(1 + k), g3)).orderId)
    for (let k = 0; k < 6; k++) expect((await env.mgr.patch(`orders?id=eq.${ids[k]}`, { status: statuses[k] })).ok, `-> ${statuses[k]}`).toBe(true)
    await page.reload()
    await page.locator('.dash-layout').waitFor()
    const all = await api.rows(`orders?restaurant_id=eq.${F.SAKURA_ID}&placed_at=gte.${todayStart()}&select=status`)
    const count = s => all.filter(o => o.status === s).length
    const label = { open: 'Open', submitted: 'Submitted', preparing: 'Preparing', ready: 'Ready', served: 'Served', paid: 'Paid', cancelled: 'Cancelled', refunded: 'Refunded' }
    await expect(chip(page, /^All \(/)).toHaveText(`All (${all.length})`)
    for (const s of Object.keys(label)) {
      const c = chip(page, new RegExp(`^${label[s]} \\(`))
      if (['submitted', 'refunded'].includes(s) && count(s) === 0) { await expect(c, `${s} chip with no orders`).toHaveCount(0); continue }
      await expect(c).toHaveText(`${label[s]} (${count(s)})`)
      await c.click()
      if (count(s) === 0) await expect(page.getByText('No orders match filter')).toBeVisible()
      else {
        await expect(lastDiv(page), `cards under the ${s} filter`).toHaveCount(count(s))
        for (const card of await lastDiv(page).all()) await expect(card).toContainText(label[s])
      }
    }
    await chip(page, /^All \(/).click()
    await expect(lastDiv(page)).toHaveCount(all.length)
  })

  test('kitchen board: tickets appear live, advance New -> Preparing -> Ready -> Done, and the database follows', async ({ browser }, testInfo) => {
    test.setTimeout(150_000)
    const k = env.s.kitchen
    await k.page.goto(url('/kds'))
    await k.page.locator('.dash-layout').waitFor()
    await expect(k.page.locator('main h1')).toHaveText('Kitchen')
    const { orderId } = await env.order('T1', env.items(1, 2))
    const board = k.page
    const patches = []   // every write the board sends, to explain a ticket that does not move
    board.on('response', async r => { if (/kds_tickets/.test(r.url()) && r.request().method() === 'PATCH') patches.push(`${r.status()} ${(await r.text().catch(() => '')).slice(0, 100)}`) })
    const gets = []
    board.on('request', r => { if (r.method() === 'GET' && /kds_tickets\?/.test(r.url())) gets.push(Date.now() % 100000) })
    const appeared = await expect(kdsCol(board, 'New').locator('.kds-ticket')).toHaveCount(2, { timeout: 15_000 }).then(() => true, () => false)
    if (!appeared) {
      const db = await k.api.rows(`kds_tickets?select=status,order_items!order_item_id!inner(order_id)&order_items.order_id=eq.${orderId}`)
      expect(appeared, `2 new tickets expected on the board for a two-item order; board: ${(await board.locator('main').innerText()).split('\n').join(' / ').slice(0, 200)}; database tickets: ${db.map(t => t.status).join(',')}; board reloads: ${gets.length}`).toBe(true)
    }
    const tk = kdsCol(board, 'New').locator('.kds-ticket').first()
    await expect(tk.locator('.kds-table-num')).toHaveText('T1')
    await expect(tk.locator('.kds-qty')).toHaveText(/^\d+×$/)
    await expect(tk.locator('.kds-elapsed')).toHaveText(/^\d+m$/)
    await expect(tk.locator('.kds-advance-btn')).toHaveText('Start Preparing →')
    const items = await k.api.rows(`order_items?order_id=eq.${orderId}&select=id,quantity,dishes(name)`)
    const names = (await kdsCol(board, 'New').locator('.kds-dish-name').allInnerTexts()).sort()
    expect(names).toEqual(items.map(i => i.dishes.name).sort())
    const status = async () => (await k.api.rows(`kds_tickets?order_item_id=in.(${items.map(i => i.id).join(',')})&select=status,started_at,completed_at&order=status`))
    // Tickets are targeted by dish name, not by position: a realtime reload that lands right after a click can put the ticket
    // just advanced back in its old column for a moment (see the report), so "the first button" is not a stable target.
    const [nameA, nameB] = items.map(i => i.dishes.name)
    const inCol = (col, name) => kdsCol(board, col).locator('.kds-ticket', { hasText: name })
    const advance = async (name, from, to) => {
      await inCol(from, name).locator('.kds-advance-btn').click()
      await expect(inCol(to, name)).toHaveCount(1)
      await board.waitForTimeout(700)
    }
    await advance(nameA, 'New', 'Preparing')
    await expect(kdsCol(board, 'Preparing').locator('.kds-advance-btn').first()).toHaveText('Mark Ready →')
    await expect.poll(async () => (await status()).filter(t => t.status === 'preparing' && t.started_at).length).toBe(1)
    await advance(nameB, 'New', 'Preparing')
    await advance(nameA, 'Preparing', 'Ready')
    await advance(nameB, 'Preparing', 'Ready')
    await expect(kdsCol(board, 'Ready').locator('.kds-advance-btn').first()).toHaveText('Done →')
    for (const name of [nameA, nameB]) {
      await inCol('Ready', name).locator('.kds-advance-btn').click()
      await expect(inCol('Ready', name)).toHaveCount(0)
      await board.waitForTimeout(700)
    }
    const dbNow = (await status()).map(t => t.status).join(',')
    const cleared = await expect(board.locator('.kds-ticket')).toHaveCount(0, { timeout: 10_000 }).then(() => true, () => false)
    expect(cleared, `tickets left on the board after Done on both. Database now: ${dbNow}. PATCH responses: ${patches.join(' | ')}`).toBe(true)
    await expect(board.getByText('Kitchen is clear')).toBeVisible()
    const boardText = (await board.locator('main').innerText()).split('\n').join(' / ').slice(0, 160)
    await expect.poll(async () => (await status()).filter(t => t.status === 'done' && t.completed_at).length, { message: `tickets done in the database; PATCH responses: ${patches.join(' | ')}; board: ${boardText}` }).toBe(2)
    expect(k.watch.consoleErrors, 'kitchen console errors').toEqual([])
  })

  test('Done works when the ingredient deduction takes stock to its low-stock threshold', async ({}) => {
    test.setTimeout(120_000)
    // check_stock_threshold() builds its alert with format('... %.2f ...'), which Postgres rejects (22023), so the PATCH
    // that marks the ticket Done is rolled back: the kitchen cannot finish that dish until somebody restocks.
    // Stock levels are not readable through the API (ingredients has no SELECT grant for staff), so this relies on the data
    // read with the service tools on 2026-10-02: Miso Soup needs 300 Dashi stock per serving, 800 in stock, low threshold 400,
    // so 2 servings cross it. It passes by itself once the trigger is fixed or the stock is topped up.
    const [miso] = await env.mgr.rows(`dishes?restaurant_id=eq.${F.SAKURA_ID}&name=eq.Miso%20Soup&select=id`)
    test.skip(!miso, 'Sakura has no Miso Soup')
    const c = { dishId: miso.id, name: 'Miso Soup', qty: 2, ingredient: 'Dashi stock', stock: 800, low: 400, per: 300 }
    const k = env.s.kitchen
    await k.page.goto(url('/kds')); await k.page.locator('.dash-layout').waitFor()
    const { orderId } = await env.order('T3', [{ dish_id: c.dishId, qty: c.qty }])
    const patches = []
    k.page.on('response', async r => { if (/kds_tickets/.test(r.url()) && r.request().method() === 'PATCH') patches.push(`${r.status()} ${(await r.text().catch(() => '')).slice(0, 110)}`) })
    await expect(k.page.locator('.kds-ticket')).toHaveCount(1, { timeout: 15_000 })
    await k.page.locator('.kds-advance-btn').click()                                  // Start Preparing
    await expect(kdsCol(k.page, 'Preparing').locator('.kds-ticket')).toHaveCount(1)
    await k.page.locator('.kds-advance-btn').click()                                  // Mark Ready
    await expect(kdsCol(k.page, 'Ready').locator('.kds-ticket')).toHaveCount(1)
    await k.page.locator('.kds-advance-btn').click()                                  // Done
    await k.page.waitForTimeout(2_500)
    const [item] = await env.mgr.rows(`order_items?order_id=eq.${orderId}&select=id`)
    const [tk] = await env.mgr.rows(`kds_tickets?order_item_id=eq.${item.id}&select=status`)
    expect(tk.status, `ticket for ${c.qty}x ${c.name} (${c.ingredient}: ${c.stock} in stock, low threshold ${c.low}, ${c.per} per serving) after Done; PATCH responses: ${patches.join(' | ')}`).toBe('done')
    await expect(k.page.locator('.kds-ticket')).toHaveCount(0)
  })

  test('the order status follows the kitchen: it must leave Open once cooking starts (Preparing)', async ({ page }) => {
    await openDash(page, 'manager', '/orders')
    const { orderId } = await env.order('T1', env.items(1))
    const [item] = await env.mgr.rows(`order_items?order_id=eq.${orderId}&select=id`)
    const card = lastDiv(page).first()
    await expect(card).toContainText('Open', { timeout: 15_000 })
    const [tk] = await env.mgr.rows(`kds_tickets?order_item_id=eq.${item.id}&select=id`)
    expect((await env.mgr.patch(`kds_tickets?id=eq.${tk.id}`, { status: 'preparing' })).ok).toBe(true)
    await page.waitForTimeout(2_000)
    const [o] = await env.mgr.rows(`orders?id=eq.${orderId}&select=status`)
    expect(o.status, 'order status after the kitchen started its only ticket (Orders still lists it as Open; the Preparing and Submitted chips can never fill)').not.toBe('open')
  })

  test('all tickets Done -> the order is Ready (live) -> Mark Served; Mark Paid waits for the bill', async ({ page }) => {
    test.setTimeout(150_000)
    await openDash(page, 'manager', '/orders')
    const { orderId, table } = await env.order('T1', env.items(1, 1))
    const items = await env.mgr.rows(`order_items?order_id=eq.${orderId}&select=id`)
    const card = lastDiv(page).first()
    await expect(card).toContainText('Open', { timeout: 15_000 })
    for (const it of items) {
      const [tk] = await env.s.kitchen.api.rows(`kds_tickets?order_item_id=eq.${it.id}&select=id`)
      for (const st of ['preparing', 'ready', 'done']) expect((await env.s.kitchen.api.patch(`kds_tickets?id=eq.${tk.id}`, { status: st })).ok, `kitchen -> ${st}`).toBe(true)
    }
    await expect(card).toContainText('Ready', { timeout: 15_000 })
    await card.locator('> div').nth(1).click()
    await card.getByRole('button', { name: 'Mark Served' }).click()
    await expect(card).toContainText('Served')
    const pay = card.getByRole('button', { name: 'Mark Paid' })
    await expect(pay).toBeDisabled()
    await expect(card.locator('.order-pay-hint')).toHaveText(/Awaiting Pay/)
    await expect(pay).toHaveAttribute('title', /Awaiting Pay/)
    const [o] = await env.mgr.rows(`orders?id=eq.${orderId}&select=status`)
    expect(o.status).toBe('served')
    expect(table.state).toBeTruthy()
  })

  test('Mark Paid gate: disabled until the table is Awaiting Pay and its other orders are settled; paying clears the table', async ({ page }) => {
    test.setTimeout(150_000)
    await openDash(page, 'manager', '/orders')
    const g = await env.pick('T1')
    const a = await env.order('T1', env.items(1), g)
    const b = await env.order('T1', env.items(2), g)
    await env.mgr.patch(`orders?id=eq.${a.orderId}`, { status: 'served' })
    const card = lastDiv(page).nth(1)   // b (newer) first, a second
    await expect(card).toContainText('Served', { timeout: 15_000 })
    await card.locator('> div').nth(1).click()
    const pay = card.getByRole('button', { name: 'Mark Paid' })
    await expect(pay, 'table occupied, not awaiting payment').toBeDisabled()
    await expect(card.locator('.order-pay-hint')).toContainText('Awaiting Pay')
    for (const s of ['ordering', 'awaiting_payment']) expect((await env.mgr.patch(`tables?id=eq.${a.tableId}`, { state: s })).ok, `table -> ${s}`).toBe(true)
    await expect(card.locator('.order-pay-hint'), 'awaiting payment but another order is open').toContainText('Other orders on this table', { timeout: 15_000 })
    await expect(pay).toBeDisabled()
    await env.mgr.patch(`orders?id=eq.${b.orderId}`, { status: 'cancelled' })
    await expect(pay).toBeEnabled({ timeout: 15_000 })
    await expect(card.locator('.order-pay-hint')).toHaveCount(0)
    await pay.click()
    await expect(card).toContainText('Paid')
    await expect(card.getByRole('button', { name: 'Mark Paid' })).toHaveCount(0)
    await expect.poll(async () => (await env.mgr.rows(`tables?id=eq.${a.tableId}&select=state`))[0].state, { message: 'table state after Mark Paid' }).toBe('cleared')
  })

  test('Cancel on an Open order: Cancelled status, no actions left, and its tickets leave the kitchen board', async ({ page, browser }, testInfo) => {
    test.setTimeout(150_000)
    await openDash(page, 'manager', '/orders')
    const k = await F.openAs(browser, testInfo, 'kitchen')
    try {
      await k.page.goto(url('/kds')); await k.page.locator('.dash-layout').waitFor()
      const { orderId } = await env.order('T3', env.items(1, 1))
      await expect(k.page.locator('.kds-ticket')).toHaveCount(2, { timeout: 15_000 })
      const card = lastDiv(page).first()
      await expect(card).toContainText('Open', { timeout: 15_000 })
      await card.locator('> div').nth(1).click()
      await card.getByRole('button', { name: 'Cancel' }).click()
      await expect(card).toContainText('Cancelled')
      await expect(card.getByRole('button')).toHaveCount(0)
      await expect.poll(async () => (await env.mgr.rows(`orders?id=eq.${orderId}&select=status`))[0].status, { message: 'order status in the database after Cancel' }).toBe('cancelled')
      await expect(k.page.locator('.kds-ticket'), 'the kitchen keeps cooking a cancelled order: its tickets are still on the board').toHaveCount(0, { timeout: 10_000 })
    } finally { await k.close() }
  })

  test('kitchen: a special request shows on the ticket, and advancing on one board updates the other live', async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const k = env.s.kitchen
    await k.page.goto(url('/kds')); await k.page.locator('.dash-layout').waitFor()
    const mgrBoard = await F.openAs(browser, testInfo, 'manager')
    try {
      await mgrBoard.page.goto(url('/kds')); await mgrBoard.page.locator('.dash-layout').waitFor()
      await env.order('T1', [{ dish_id: env.dishes[0].id, qty: 1, notes: 'no wasabi please' }])
      for (const b of [k.page, mgrBoard.page]) {
        await expect(b.locator('.kds-ticket')).toHaveCount(1, { timeout: 15_000 })
        await expect(b.locator('.kds-special')).toHaveText(/no wasabi please/)
      }
      await k.page.locator('.kds-advance-btn').click()
      await expect(kdsCol(mgrBoard.page, 'Preparing').locator('.kds-ticket'), 'the manager board follows the kitchen board').toHaveCount(1, { timeout: 15_000 })
    } finally { await mgrBoard.close() }
  })

  test('kitchen: a burst of tickets is one reload, and a double-click advances only its own ticket', async ({ page }) => {
    test.setTimeout(120_000)
    await openDash(page, 'kitchen', '/kds')
    const reloads = []
    page.on('request', r => { if (r.method() === 'GET' && /\/rest\/v1\/kds_tickets\?/.test(r.url())) reloads.push(r.url()) })
    await env.order('T1', env.items(1, 1, 1, 1))
    await expect(page.locator('.kds-ticket')).toHaveCount(4, { timeout: 15_000 })
    await page.waitForTimeout(1_500)
    expect(reloads.length, 'GET kds_tickets reloads for one four-item order (debounced realtime)').toBeLessThanOrEqual(2)
    await kdsCol(page, 'New').locator('.kds-advance-btn').first().dblclick()
    await page.waitForTimeout(1_000)
    expect(await kdsCol(page, 'Preparing').locator('.kds-ticket').count(), 'tickets in Preparing after ONE double-click on one ticket').toBe(1)
    await expect(page.locator('main').getByText(/couldn.t|failed|permission/i)).toHaveCount(0)
  })
})

// =====================================================================================================================
// 8. Tables (Sakura T4; floor positions have no editor in the dashboard, so there is nothing to test there)
// =====================================================================================================================
const tblCard = (page, n) => page.locator('.tbl-grid > div').filter({ has: page.locator('.tbl-card-num', { hasText: new RegExp(`^${n}$`) }) })
const STATE_LABEL = { free: 'Free', reserved: 'Reserved', occupied: 'Occupied', ordering: 'Ordering', awaiting_payment: 'Awaiting Pay', cleared: 'Cleared', maintenance: 'Maintenance' }

test.describe('tables', { tag: ['@staff', '@resto', '@dash-ops', '@do-tables'] }, () => {
  test.describe.configure({ mode: 'default' })
  const env = useEnv(['T4'], ['waiter1'])
  const setState = async s => expect((await env.mgr.patch(`tables?id=eq.${(await F.tableInfo(env.mgr, 'T4')).id}`, { state: s })).ok, `T4 -> ${s}`).toBe(true)

  test('state chips, legend and area chips agree with the database', async ({ page }) => {
    const api = await openDash(page, 'manager', '/tables')
    const tables = await api.rows(`tables?restaurant_id=eq.${F.SAKURA_ID}&is_active=eq.true&select=state,section_id,sections(name)`)
    await expect(page.locator('.tbl-grid > div')).toHaveCount(tables.length)
    await expect(chip(page, /^All \(/)).toHaveText(`All (${tables.length})`)
    const legend = page.locator('.dash-section-title', { hasText: 'Legend' }).locator('..')
    for (const [s, label] of Object.entries(STATE_LABEL)) {
      const n = tables.filter(t => t.state === s).length
      await expect(legend).toContainText(new RegExp(`${label}\\s*${n}(?!\\d)`))
      const c = chip(page, new RegExp(`^${label} \\(`))
      if (n === 0) { await expect(c, `${label} chip with no tables`).toHaveCount(0); continue }
      await expect(c).toHaveText(`${label} (${n})`)
      await c.click()
      await expect(page.locator('.tbl-grid > div')).toHaveCount(n)
      for (const cardEl of await page.locator('.tbl-grid > div .tbl-card-state').all()) await expect(cardEl).toHaveText(label)
    }
    await chip(page, /^All \(/).click()
    const sections = [...new Set(tables.map(t => t.sections?.name))].filter(Boolean)
    await expect(chip(page, /^All Areas \(/)).toHaveText(`All Areas (${tables.length})`)
    for (const name of sections) {
      const n = tables.filter(t => t.sections?.name === name).length
      await chip(page, new RegExp(`^${name} \\(${n}\\)$`)).click()
      await expect(page.locator('.tbl-grid > div')).toHaveCount(n)
      for (const loc of await page.locator('.tbl-grid .tbl-card-loc').all()) await expect(loc).toContainText(name)
    }
  })

  test('the card buttons walk a table through the state machine and offer no illegal step', async ({ page }) => {
    test.setTimeout(120_000)
    await openDash(page, 'manager', '/tables')
    const c = tblCard(page, 'T4')
    await c.locator('.tbl-card-top').click()
    const next = async () => (await c.locator('button').filter({ hasText: /^→/ }).allInnerTexts()).map(x => x.trim())
    const walk = [
      ['free', ['→ Reserved', '→ Occupied', '→ Maintenance'], '→ Occupied', 'occupied'],
      ['occupied', ['→ Ordering', '→ Free'], '→ Ordering', 'ordering'],
      ['ordering', ['→ Awaiting Pay'], '→ Awaiting Pay', 'awaiting_payment'],
      ['awaiting_payment', ['→ Cleared', '→ Ordering'], '→ Cleared', 'cleared'],
      ['cleared', ['→ Free'], '→ Free', 'free'],
    ]
    for (const [from, offered, click, to] of walk) {
      await expect(c.locator('.tbl-card-state')).toHaveText(STATE_LABEL[from])
      expect(await next(), `buttons offered while ${from}`).toEqual(offered)
      await c.getByRole('button', { name: click, exact: true }).click()
      await expect(c.locator('.tbl-card-state')).toHaveText(STATE_LABEL[to])
      await expect.poll(async () => (await F.tableInfo(env.mgr, 'T4')).state, { message: `database after ${click}` }).toBe(to)
    }
    await c.getByRole('button', { name: '→ Maintenance', exact: true }).click()
    await expect(c.locator('.tbl-card-state')).toHaveText('Maintenance')
    expect(await next()).toEqual(['→ Free'])
    await c.getByRole('button', { name: '→ Free', exact: true }).click()
    await expect(c.locator('.tbl-card-state')).toHaveText('Free')
  })

  test('a refused transition shows the friendly message and puts the card back', async ({ page }) => {
    await openDash(page, 'manager', '/tables')
    await page.route(/\/rest\/v1\/tables\?id=eq\./, route => route.request().method() === 'PATCH'
      ? route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: 'Invalid table state transition: free -> occupied', details: null, hint: null }) })
      : route.continue())
    const c = tblCard(page, 'T4')
    await c.locator('.tbl-card-top').click()
    await c.getByRole('button', { name: '→ Occupied', exact: true }).click()
    await expect(page.getByText("This table can't move to that state right now.")).toBeVisible()
    await expect(c.locator('.tbl-card-state')).toHaveText('Free')
    await page.getByRole('button', { name: '✕' }).click()
    await expect(page.getByText("This table can't move to that state right now.")).toHaveCount(0)
  })

  test('the access code chip shows the code and Copy puts it on the clipboard', async ({ page }) => {
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(F.RESTO_URL).origin })
    await openDash(page, 'manager', '/tables')
    const { code } = await F.tableInfo(env.mgr, 'T4')
    const c = tblCard(page, 'T4')
    await expect(c.locator('.tbl-card-code')).toHaveText(code)
    await expect(c.locator('.tbl-card-code')).toHaveCSS('font-family', /mono|Mono|Courier/)
    const copy = c.getByRole('button', { name: 'Copy access code' })
    await copy.click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code)
    await expect(c.getByRole('button', { name: 'Copied!' })).toBeVisible()
    await expect(c.getByRole('button', { name: 'Copy access code' })).toBeVisible({ timeout: 4_000 })   // label resets
    await expect(c.locator('.tbl-card-title'), 'copying must not expand the card').toBeVisible()
    await expect(c.getByRole('button', { name: /^→/ })).toHaveCount(0)
  })

  test('QR dialog: image, link, Download PNG, Print, and every way to close it', async ({ page }) => {
    test.setTimeout(90_000)
    await openDash(page, 'manager', '/tables')
    const { code } = await F.tableInfo(env.mgr, 'T4')
    await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed += 1 } })
    const c = tblCard(page, 'T4')
    const modal = page.getByRole('dialog', { name: 'Table T4 QR code' })
    const open = async () => { await c.getByRole('button', { name: 'Show QR code' }).click(); await expect(modal).toBeVisible() }
    await open()
    const img = modal.locator('img.qr-modal-img')
    await expect(img).toBeVisible()
    expect(await img.getAttribute('src')).toMatch(/^data:image\/png;base64,/)
    expect(await img.evaluate(i => i.naturalWidth), 'QR image width').toBe(640)
    await expect(modal.locator('.qr-modal-link')).toHaveText(`${CONSUMER}/t/${code}`)
    expect((await page.request.get(`${CONSUMER}/t/${code}`)).status(), 'the QR link must open the consumer app').toBe(200)
    await expect(page.locator('body')).toHaveClass(/qr-printing/)
    const sheet = page.locator('.qr-print-sheet')
    await expect(sheet).toContainText('Sakura House')
    await expect(sheet).toContainText('Table T4')
    await expect(sheet).toContainText(code)
    const [dl] = await Promise.all([page.waitForEvent('download'), modal.getByRole('button', { name: 'Download PNG' }).click()])
    expect(dl.suggestedFilename()).toBe('table-T4-qr.png')
    const bytes = await require('fs').promises.readFile(await dl.path())
    expect(bytes.subarray(0, 8).toString('hex'), 'PNG signature').toBe('89504e470d0a1a0a')
    expect(bytes.readUInt32BE(16), 'PNG width').toBe(640)
    await modal.getByRole('button', { name: 'Print' }).click()
    expect(await page.evaluate(() => window.__printed)).toBe(1)
    await page.keyboard.press('Escape')                                           // 1. Escape
    await expect(modal).toBeHidden()
    await expect(page.locator('body')).not.toHaveClass(/qr-printing|modal-open/)
    await open(); await modal.locator('.qr-modal-actions').getByRole('button', { name: 'Close', exact: true }).click()   // 2. Close button
    await expect(modal).toBeHidden()
    await open(); await page.locator('.overlay').click({ position: { x: 5, y: 5 } })   // 3. click outside
    await expect(modal).toBeHidden()
    await open(); await modal.locator('.qr-modal-close').click()          // 4. the cross
    await expect(modal).toBeHidden()
  })

  test('a change made elsewhere shows live; a table with an order shows its spend and active orders', async ({ page }) => {
    test.setTimeout(120_000)
    await openDash(page, 'manager', '/tables')
    const c = tblCard(page, 'T4')
    await setState('reserved')
    await expect(c.locator('.tbl-card-state')).toHaveText('Reserved', { timeout: 15_000 })
    await expect(chip(page, /^Reserved \(1\)$/)).toBeVisible()
    await setState('free')
    await expect(c.locator('.tbl-card-state')).toHaveText('Free', { timeout: 15_000 })
    const { orderId } = await env.order('T4', env.items(2, 1))
    const [o] = await env.mgr.rows(`orders?id=eq.${orderId}&select=total_amount`)
    await expect(c.locator('.tbl-card-amount')).toHaveText(money(o.total_amount), { timeout: 15_000 })
    await expect(c.locator('.tbl-card-state')).toHaveText('Occupied')
    await c.locator('.tbl-card-top').click()
    await expect(c).toContainText('Active Orders')
    await expect(c).toContainText(`2× ${env.dishes[0].name}`)
    await expect(c).toContainText(`1× ${env.dishes[1].name}`)
    await expect(c).toContainText(money(o.total_amount))
  })

  test('manager has Print all QR codes; the waiter sees the floor and codes but not that link', async ({ page, browser }, testInfo) => {
    await openDash(page, 'manager', '/tables')
    await page.getByRole('link', { name: 'Print all QR codes' }).click()
    await expect(page).toHaveURL(url('/qr-sheet'))
    const w = await F.openAs(browser, testInfo, 'waiter1')
    try {
      await w.page.goto(url('/tables')); await w.page.locator('.dash-layout').waitFor()
      await expect(w.page.locator('.tbl-grid > div')).toHaveCount(6)
      await expect(w.page.getByRole('link', { name: 'Print all QR codes' })).toHaveCount(0)
      await expect(w.page.locator('.tbl-card-code').first()).toHaveText(/^SAKURA-/)
    } finally { await w.close() }
  })

  test('Azerbaijani with live data: order, ticket, table and waiter call are translated, no raw keys', async ({ browser }, testInfo) => {
    test.setTimeout(150_000)
    const az = locale('az', 'dashboard')
    const { tableId, guest } = await env.order('T4', env.items(1))
    expect((await guest.rpc('call_waiter', { p_table_id: tableId, p_kind: 'water' })).ok).toBe(true)
    const m = await F.openAs(browser, testInfo, 'manager', { lang: 'az' })
    const w = await F.openAs(browser, testInfo, 'waiter1', { lang: 'az' })
    try {
      const look = async (s, p) => { await s.page.goto(url(p)); await s.page.locator('.dash-layout').waitFor(); await settle(s.page) }
      await look(m, '/orders')
      await expect(m.page.locator('main')).toContainText(az.ordStatusOpen)
      await expect(chip(m.page, new RegExp(`^${az.ordStatusOpen} \\(`))).toBeVisible()
      expect(await rawKeys(m.page), 'raw keys on /orders').toEqual([])
      await look(m, '/kds')
      for (const k of ['colNew', 'colPreparing', 'colReady']) await expect(m.page.locator('.kds-col-title', { hasText: new RegExp(`^${az[k]}$`, 'i') })).toBeVisible()
      await expect(m.page.locator('.kds-advance-btn').first()).toHaveText(`${az.kdsStartPreparing} →`)
      expect(await rawKeys(m.page), 'raw keys on /kds').toEqual([])
      await look(m, '/tables')
      await expect(tblCard(m.page, 'T4').locator('.tbl-card-state')).toHaveText(az.stateOccupied)
      expect(await rawKeys(m.page), 'raw keys on /tables').toEqual([])
      await look(w, '/waiter')
      await w.page.locator('.chip', { hasText: /^Çağırışlar|^Calls/ }).click()
      await expect(w.page.locator('main')).toContainText(az.waiterKindWater)
      await expect(w.page.getByRole('button', { name: az.waiterOnMyWay })).toBeVisible()
      await expect(w.page.getByRole('button', { name: locale('az', 'common').done })).toBeVisible()
      expect(await rawKeys(w.page), 'raw keys on /waiter').toEqual([])
    } finally { await m.close(); await w.close() }
  })
})

// =====================================================================================================================
// 9. Waiter page (Sakura T2; waiter1 / waiter2, guest review4 through the consumer app)
// =====================================================================================================================
async function consumerJoin(guest, code) {
  await guest.goto(`${CONSUMER}/t/${code}`)
  await expect(guest.getByRole('heading', { name: 'Join this table?' })).toBeVisible()
  await guest.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(guest).toHaveURL(`${CONSUMER}/table`)
  await expect(guest.getByRole('heading', { name: 'Your Table' })).toBeVisible()
}

test.describe('waiter page', { tag: ['@staff', '@resto', '@dash-ops', '@do-waiter'] }, () => {
  test.describe.configure({ mode: 'default' })
  const env = useEnv(['T2'], ['waiter1', 'waiter2'])

  test('a Call waiter from the consumer app reaches the Calls tab live; On my way, then Done, flow back to the guest', async ({ page, browser }, testInfo) => {
    test.setTimeout(180_000)
    await openDash(page, 'waiter1', '/waiter')
    await expect(page.locator('.chip', { hasText: 'Calls (0)' })).toBeVisible()
    await expect(page.locator('.chip.active')).toHaveText('My Tables')
    const t2 = await F.tableInfo(env.mgr, 'T2')
    const guest = await F.openAs(browser, testInfo, 'review4')
    try {
      await consumerJoin(guest.page, t2.code)
      await guest.page.getByRole('button', { name: /Call waiter/ }).click()
      await expect(guest.page.getByRole('heading', { name: 'How can we help?' })).toBeVisible()
      await guest.page.getByRole('button', { name: /Water/ }).click()
      await expect(guest.page.getByRole('button', { name: /Waiter called/ })).toBeVisible()
      const calls = page.locator('.chip', { hasText: /^Calls \(/ })
      await expect(calls).toHaveText('Calls (1)', { timeout: 15_000 })
      await expect(calls.locator('span[style*="border-radius: 50%"]'), 'red dot for a new call while another tab is open').toBeVisible()
      await calls.click()
      await expect(calls.locator('span[style*="border-radius: 50%"]')).toHaveCount(0)
      const card = page.locator('main > div > div:last-child > div').first()
      await expect(card).toContainText('Table T2')
      await expect(card).toContainText('Main Floor')
      await expect(card).toContainText('Water')
      await expect(card).toContainText(/just now|\dm ago/)
      const [req] = await env.mgr.rows(`service_requests?table_id=eq.${t2.id}&select=id,status,kind&order=created_at.desc&limit=1`)
      expect(req).toMatchObject({ status: 'open', kind: 'water' })
      await card.getByRole('button', { name: 'On my way' }).click()
      await expect(card.getByRole('button', { name: 'On my way' })).toHaveCount(0)
      await expect(guest.page.getByRole('button', { name: /On the way/ }), 'the guest sees the waiter is coming').toBeVisible({ timeout: 15_000 })
      expect((await env.mgr.rows(`service_requests?id=eq.${req.id}&select=status`))[0].status).toBe('acknowledged')
      await card.getByRole('button', { name: 'Done', exact: true }).click()
      await expect(calls).toHaveText('Calls (0)')
      await expect(page.getByText('No calls right now')).toBeVisible()
      await expect(guest.page.getByRole('button', { name: /On the way|Waiter called/ }), 'the guest button resets after Done').toHaveCount(0, { timeout: 15_000 })
      expect((await env.mgr.rows(`service_requests?id=eq.${req.id}&select=status`))[0].status).toBe('done')
    } finally { await guest.close() }
  })

  test('Take Table and Release: mine / not mine across two waiters, live', async ({ page, browser }, testInfo) => {
    test.setTimeout(150_000)
    const { tableId } = await env.order('T2', env.items(1))
    await openDash(page, 'waiter1', '/waiter')
    const w2 = await F.openAs(browser, testInfo, 'waiter2')
    try {
      await w2.page.goto(url('/waiter')); await w2.page.locator('.dash-layout').waitFor()
      const tab = (p, name) => p.locator('.chip', { hasText: name })
      await tab(page, 'All Tables').click()
      const all1 = page.locator('main > div > div:last-child > div').filter({ hasText: 'Table T2' })
      await expect(all1).toContainText('Unassigned')
      await all1.getByRole('button', { name: 'Take Table' }).click()
      await expect(all1).toContainText('Mine')
      await expect(all1.getByRole('button', { name: 'Take Table' })).toHaveCount(0)
      await tab(page, 'My Tables').click()
      const mine = page.locator('main > div > div:last-child > div').filter({ hasText: 'Table T2' })
      await expect(mine).toContainText(/1 guest/)
      await expect(mine.getByRole('button', { name: 'Release' })).toBeVisible()
      expect((await env.mgr.rows(`table_service?table_id=eq.${tableId}&select=assigned_staff_id`)).length, 'table_service row after Take').toBe(1)
      // the other waiter sees it assigned and can take it over
      await tab(w2.page, 'All Tables').click()
      const all2 = w2.page.locator('main > div > div:last-child > div').filter({ hasText: 'Table T2' })
      // the page shows the assigned waiter's first name only ("Waiter" for both Sakura waiters), so look at the data for who holds it
      await expect(all2).not.toContainText('Unassigned', { timeout: 15_000 })
      await expect(all2).not.toContainText('Mine')
      const [svc] = await env.mgr.rows(`table_service?table_id=eq.${tableId}&select=assigned_staff_id`)
      const [w1] = await env.s.waiter1.api.rows(`staff?user_id=eq.${env.s.waiter1.api.userId}&select=id`)
      expect(svc.assigned_staff_id, 'table held by waiter 1').toBe(w1.id)
      await all2.getByRole('button', { name: 'Take Table' }).click()
      await expect(all2).toContainText('Mine')
      await expect(page.getByText("You don't have any tables yet"), 'waiter 1 loses the table live').toBeVisible({ timeout: 20_000 })
      await tab(w2.page, 'My Tables').click()
      await w2.page.getByRole('button', { name: 'Release' }).click()
      await expect(w2.page.getByText("You don't have any tables yet")).toBeVisible()
      expect((await env.mgr.rows(`table_service?table_id=eq.${tableId}&select=assigned_staff_id`)).length, 'table_service rows after Release').toBe(0)
    } finally { await w2.close() }
  })

  test('a table awaiting payment appears in Calls as a bill with the outstanding amount and a link to Orders', async ({ page }) => {
    test.setTimeout(120_000)
    const { tableId } = await env.order('T2', env.items(2))
    for (const s of ['ordering', 'awaiting_payment']) expect((await env.mgr.patch(`tables?id=eq.${tableId}`, { state: s })).ok, `T2 -> ${s}`).toBe(true)
    await openDash(page, 'waiter1', '/waiter')
    await expect(page.locator('.chip', { hasText: /^Calls \(/ })).toHaveText('Calls (1)')
    const ov = await env.mgr.rpc('waiter_overview', { p_restaurant_id: F.SAKURA_ID })
    const t = ov.body.tables.find(x => x.table_id === tableId)
    await expect(page.locator('main')).toContainText(`Bill requested — ${money(t.outstanding)}`)
    await expect(page.getByRole('button', { name: 'On my way' }), 'a bill has no On my way / Done').toHaveCount(0)
    await page.getByRole('link', { name: 'Orders' }).last().click()
    await expect(page).toHaveURL(url('/orders'))
  })

  test('My tips card on the Waiter page shows today and links to /my-tips', async ({ page }) => {
    await openDash(page, 'waiter1', '/waiter')
    const card = page.getByRole('link', { name: /My tips today/i })
    await expect(card).toBeVisible()
    await expect(card).toContainText(/₼\d+\.\d{2}/)
    await expect(card).toContainText(/\d+ tips?/)
    await card.click()
    await expect(page).toHaveURL(url('/my-tips'))
    await expect(page.locator('main h1')).toHaveText('My tips')
  })

  test('the waiter page with a call and a table fits 390px', async ({ page, watch }, testInfo) => {
    test.setTimeout(120_000)
    const { tableId, guest } = await env.order('T2', env.items(1), 2)   // review6: review4 called a waiter minutes ago (2-minute cooldown per guest)
    const call = await guest.rpc('call_waiter', { p_table_id: tableId, p_kind: 'assist' })
    expect(call.ok, `call_waiter: ${JSON.stringify(call.body)}`).toBe(true)
    await page.setViewportSize({ width: 390, height: 844 })
    await openDash(page, 'waiter1', '/waiter')
    const w = walker(page, watch, testInfo)
    await expect(page.locator('.chip', { hasText: 'Calls (1)' })).toBeVisible()
    await w.check('waiter calls')
    await page.locator('.chip', { hasText: 'All Tables' }).click()
    await expect(page.getByRole('button', { name: 'Take Table' })).toBeVisible()
    await w.check('waiter all tables')
    for (const b of [page.getByRole('button', { name: 'Take Table' })]) expect.soft((await b.boundingBox()).height, 'Take Table height').toBeGreaterThanOrEqual(40)
  })
})

// =====================================================================================================================
// 10. Menu (manager / admin; dishes named "QA Dashops …" are created here and removed again)
// =====================================================================================================================
const QA = 'QA Dashops'
const uniq = () => `${QA} ${Date.now().toString(36)}${Math.floor(Math.random() * 36).toString(36)}`
const { tinyPng } = require('../support/v2')
const dishRow = (page, name) => lastDiv(page).filter({ hasText: name })
const modalOf = page => page.locator('.modal')

test.describe('menu', { tag: ['@staff', '@resto', '@dash-ops', '@do-menu'] }, () => {
  test.describe.configure({ mode: 'default' })
  const env = useEnv([], ['waiter1'], { perTest: false })   // no guests are seated here, so no guest lock
  let dessert   // Sakura "Desserts" menu section
  const made = []
  const photoUrl = id => `${env.s.manager.who.supabase.url}/storage/v1/object/public/dish-photos/${F.SAKURA_ID}/${id}.png`
  const makeDish = async (name, extra = {}) => {
    const id = require('crypto').randomUUID()
    const r = await env.mgr.post('dishes', { id, restaurant_id: F.SAKURA_ID, name, price: 6.5, category: 'dessert', available: true, menu_section_id: await section(), ...extra })
    expect(r.ok, `insert dish ${name}: ${JSON.stringify(r.body)}`).toBe(true)
    made.push(id)
    return id
  }
  const section = async () => dessert ||= (await env.mgr.rows(`menu_sections?name=eq.Desserts&select=id,menus!inner(restaurant_id)&menus.restaurant_id=eq.${F.SAKURA_ID}`))[0].id
  env.cleanups.push(async () => {
    const left = await env.mgr.rows(`dishes?restaurant_id=eq.${F.SAKURA_ID}&name=like.${encodeURIComponent(QA + '*')}&select=id`)
    for (const d of left) {
      await env.mgr.del(`dish_photos?dish_id=eq.${d.id}`)
      await env.s.manager.page.request.delete(`${env.s.manager.who.supabase.url}/storage/v1/object/dish-photos/${F.SAKURA_ID}/${d.id}.png`, {
        headers: { apikey: env.s.manager.who.supabase.anonKey, Authorization: `Bearer ${env.s.manager.who.session.access_token}` }, failOnStatusCode: false })
      const r = await env.mgr.del(`dishes?id=eq.${d.id}`)
      if (!r.ok) console.log(`[menu cleanup] ${d.id}: ${r.status} ${JSON.stringify(r.body)}`)
    }
  })

  test('list: summary, section chips and their counts, filtering and the row details agree with the database', async ({ page }) => {
    const api = await openDash(page, 'manager', '/menu')
    const dishes = await api.rows(`dishes?restaurant_id=eq.${F.SAKURA_ID}&select=available,menu_section_id,name,price&order=sort_order`)
    const sections = await api.rows(`menu_sections?select=id,name,menus!inner(restaurant_id)&menus.restaurant_id=eq.${F.SAKURA_ID}&order=sort_order`)
    const avail = dishes.filter(d => d.available).length
    await expect(page.getByText(`${avail}/${dishes.length} available · ${dishes.length} total`)).toBeVisible()
    await expect(chip(page, /^All \(/)).toHaveText(`All (${dishes.length})`)
    await expect(lastDiv(page)).toHaveCount(dishes.length)
    for (const s of sections) {
      const mine = dishes.filter(d => d.menu_section_id === s.id)
      await chip(page, new RegExp(`^${s.name.replace(/[.*+?^${}()|[\]\\&]/g, '\\$&')} \\(${mine.length}\\)$`)).click()
      await expect(lastDiv(page), `rows under ${s.name}`).toHaveCount(mine.length)
      await expect(page.getByText(new RegExp(`^${mine.filter(d => d.available).length}/${mine.length} available`))).toBeVisible()
    }
    await chip(page, /^All \(/).click()
    const first = lastDiv(page).first()
    await expect(first).toContainText(/₼\d+\.\d{2}/)
    await expect(first.getByRole('button', { name: 'Edit' })).toBeVisible()
    await expect(first.getByRole('button', { name: 'Delete' })).toBeVisible()
    await expect(first.getByRole('button', { name: /Mark unavailable|Mark available/ })).toBeVisible()
  })

  test('create a dish with a photo: row, photo, section, flags and the database row', async ({ page }) => {
    test.setTimeout(90_000)
    const api = await openDash(page, 'manager', '/menu')
    const name = uniq()
    await page.getByRole('button', { name: 'Add Dish' }).click()
    const m = modalOf(page)
    await expect(m.getByRole('heading', { name: 'Add Dish' })).toBeVisible()
    await m.locator('input[type=file]').setInputFiles({ name: 'qa-dish.png', mimeType: 'image/png', buffer: tinyPng() })
    await expect(m.locator('img[alt="Preview"]')).toBeVisible()
    await m.locator('input.input').first().fill(name)
    await m.locator('input[type=number]').first().fill('7.5')
    await m.getByRole('button', { name: /dessert/i }).click()
    await m.locator('select').selectOption({ label: 'Desserts' })
    await m.locator('textarea').fill('Created by the dashboard ops test')
    await m.getByRole('button', { name: /Vegan/ }).click()
    await m.getByRole('checkbox').check()
    await m.getByRole('button', { name: 'Add Dish' }).click()
    await expect(m).toBeHidden({ timeout: 20_000 })
    const row = dishRow(page, name)
    await expect(row).toBeVisible({ timeout: 15_000 })
    await expect(row).toContainText('₼7.50')
    await expect(row).toContainText('Desserts')
    await expect(row).toContainText('★ Featured')
    await expect(row.locator('[title="Vegan"]')).toBeVisible()
    const img = row.locator('img')
    await expect(img).toHaveAttribute('src', /\/storage\/v1\/object\/public\/dish-photos\//)
    await expect.poll(() => img.evaluate(i => i.complete && i.naturalWidth), { message: 'the stored photo loads' }).toBeGreaterThan(0)
    const [d] = await api.rows(`dishes?restaurant_id=eq.${F.SAKURA_ID}&name=eq.${encodeURIComponent(name)}&select=id,price,category,available,is_vegan,is_featured,menu_section_id,photo,description`)
    made.push(d.id)
    expect(d).toMatchObject({ price: 7.5, category: 'dessert', available: true, is_vegan: true, is_featured: true, menu_section_id: await section(), description: 'Created by the dashboard ops test' })
    expect(d.photo).toContain(`/dish-photos/${F.SAKURA_ID}/${d.id}.png`)
    expect((await api.rows(`dish_photos?dish_id=eq.${d.id}&select=is_primary,url`))[0], 'dish_photos row').toMatchObject({ is_primary: true, url: d.photo })
  })

  test('edit name and description from the row; the change is saved and shown', async ({ page }) => {
    const api = await openDash(page, 'manager', '/menu')
    const name = uniq(), renamed = `${name} v2`
    const id = await makeDish(name)
    await page.reload(); await page.locator('.dash-layout').waitFor()
    await dishRow(page, name).getByRole('button', { name: 'Edit' }).click()
    const m = modalOf(page)
    await expect(m.getByRole('heading', { name: 'Edit Dish' })).toBeVisible()
    await expect(m.locator('input.input').first()).toHaveValue(name)
    await expect(m.locator('input[type=number]').first()).toHaveValue('6.5')
    await m.locator('input.input').first().fill(renamed)
    await m.locator('textarea').fill('qa edited description')
    await m.getByRole('button', { name: 'Save Changes' }).click()
    await expect(m).toBeHidden({ timeout: 15_000 })
    await expect(dishRow(page, renamed)).toContainText('₼6.50')
    expect((await api.rows(`dishes?id=eq.${id}&select=name,price,description`))[0]).toMatchObject({ name: renamed, price: 6.5, description: 'qa edited description' })
  })

  test('changing a dish price saves (the price-history trigger must be allowed to write)', async ({ page }) => {
    // UPDATE dishes SET price fires log_dish_price_change, which inserts into dish_price_history; the staff role has no INSERT
    // grant there (403 42501), so the whole update is refused and the dialog shows a permission error.
    const api = await openDash(page, 'manager', '/menu')
    const name = uniq()
    const id = await makeDish(name)
    await page.reload(); await page.locator('.dash-layout').waitFor()
    await dishRow(page, name).getByRole('button', { name: 'Edit' }).click()
    const m = modalOf(page)
    const failed = page.waitForResponse(r => r.request().method() === 'PATCH' && /\/rest\/v1\/dishes\?id=eq\./.test(r.url()))
    await m.locator('input[type=number]').first().fill('9.25')
    await m.getByRole('button', { name: 'Save Changes' }).click()
    const res = await failed
    expect(res.status(), `PATCH dishes with a new price: ${(await res.text()).slice(0, 200)}`).toBeLessThan(400)
    await expect(m).toBeHidden({ timeout: 15_000 })
    await expect(dishRow(page, name)).toContainText('₼9.25')
    expect((await api.rows(`dishes?id=eq.${id}&select=price`))[0].price).toBe(9.25)
  })

  test('the dish form can edit the Azerbaijani name and description', async ({ page }) => {
    // dishes.name_i18n / desc_i18n carry the AZ copy the consumer app shows in Azerbaijani; the form only has name and description.
    await openDash(page, 'manager', '/menu')
    await page.getByRole('button', { name: 'Add Dish' }).click()
    const m = modalOf(page)
    await expect(m.getByRole('heading', { name: 'Add Dish' })).toBeVisible()
    const azFields = m.locator('label, input, textarea').filter({ hasText: /Azerbaijani|\bAZ\b|Azərbaycan/i })
    const azPlaceholder = m.locator('input[placeholder*="AZ" i], input[placeholder*="Azərb" i], textarea[placeholder*="AZ" i]')
    expect(await azFields.count() + await azPlaceholder.count(), 'fields for the Azerbaijani name / description in the Add Dish form').toBeGreaterThan(0)
  })

  test('availability toggle: dashboard "Off" badge, and the consumer Explore flips to SOLD OUT live and after reload', async ({ page, browser }, testInfo) => {
    test.setTimeout(120_000)
    await openDash(page, 'manager', '/menu')
    const name = uniq()
    const id = await makeDish(name)
    await page.reload(); await page.locator('.dash-layout').waitFor()
    const guest = await F.openAs(browser, testInfo, 'review5')
    try {
      await guest.page.goto(`${CONSUMER}/explore`)
      await guest.page.getByPlaceholder('Dishes, restaurants…').fill(name)
      const tile = guest.page.locator('.stagger-item').filter({ hasText: name })
      await expect(tile).toBeVisible({ timeout: 15_000 })
      await expect(tile).toContainText('Available')
      const row = dishRow(page, name)
      await row.getByRole('button', { name: 'Mark unavailable' }).click()
      await expect(row).toContainText('Off')
      await expect(row.getByRole('button', { name: 'Mark available' })).toBeVisible()
      expect((await env.mgr.rows(`dishes?id=eq.${id}&select=available`))[0].available).toBe(false)
      await expect(tile, 'Explore without a reload').toContainText('Sold Out', { timeout: 20_000 })
      await guest.page.reload()
      await guest.page.getByPlaceholder('Dishes, restaurants…').fill(name)
      await expect(guest.page.locator('.stagger-item').filter({ hasText: name })).toContainText('Sold Out')
      await row.getByRole('button', { name: 'Mark available' }).click()
      await expect(row).not.toContainText('Off')
      await expect(guest.page.locator('.stagger-item').filter({ hasText: name })).toContainText('Available', { timeout: 20_000 })
    } finally { await guest.close() }
  })

  test('delete: confirmation names the dish, Cancel keeps it, Delete removes row, photo file and photo record', async ({ page }) => {
    test.setTimeout(90_000)
    const api = await openDash(page, 'manager', '/menu')
    const name = uniq()
    const id = require('crypto').randomUUID()
    const up = await env.s.manager.page.request.post(`${env.s.manager.who.supabase.url}/storage/v1/object/dish-photos/${F.SAKURA_ID}/${id}.png`, {
      headers: { apikey: env.s.manager.who.supabase.anonKey, Authorization: `Bearer ${env.s.manager.who.session.access_token}`, 'Content-Type': 'image/png', 'x-upsert': 'true' }, data: tinyPng() })
    expect(up.ok(), 'photo upload').toBe(true)
    expect((await api.post('dishes', { id, restaurant_id: F.SAKURA_ID, name, price: 3, category: 'dessert', menu_section_id: await section(), photo: photoUrl(id) })).ok).toBe(true)
    made.push(id)
    await api.post('dish_photos', { dish_id: id, url: photoUrl(id), is_primary: true })
    expect((await page.request.get(photoUrl(id))).status(), 'photo before delete').toBe(200)
    await page.reload(); await page.locator('.dash-layout').waitFor()
    const row = dishRow(page, name)
    await row.getByRole('button', { name: 'Delete' }).click()
    const m = modalOf(page)
    await expect(m.getByRole('heading', { name: 'Delete Dish' })).toBeVisible()
    await expect(m).toContainText(`Are you sure you want to delete ${name}?`)
    await m.getByRole('button', { name: 'Cancel' }).click()
    await expect(m).toBeHidden()
    await expect(row).toBeVisible()
    await row.getByRole('button', { name: 'Delete' }).click()
    await modalOf(page).getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(row).toHaveCount(0, { timeout: 15_000 })
    expect(await api.rows(`dishes?id=eq.${id}&select=id`)).toEqual([])
    expect(await api.rows(`dish_photos?dish_id=eq.${id}&select=id`), 'dish_photos rows after delete').toEqual([])
    // asked of the storage API itself: the public URL can stay cached at the edge for a while after the object is gone
    const w = env.s.manager
    const listed = async () => (await (await w.page.request.post(`${w.who.supabase.url}/storage/v1/object/list/dish-photos`, {
      headers: { apikey: w.who.supabase.anonKey, Authorization: `Bearer ${w.who.session.access_token}`, 'Content-Type': 'application/json' },
      data: { prefix: F.SAKURA_ID, search: id, limit: 5 } })).json()).filter(o => String(o.name).startsWith(id))
    await expect.poll(async () => (await listed()).length, { message: 'photo file left in the dish-photos bucket after the dish was deleted' }).toBe(0)
  })

  test('deleting a dish that was already ordered says why and keeps the dish', async ({ page }) => {
    // order_items.dish_id has no ON DELETE action, so the database refuses. An existing dish with order history is used on
    // purpose (a dish created here and then ordered could never be removed again, not even by this suite's cleanup).
    test.setTimeout(90_000)
    await openDash(page, 'manager', '/menu')
    const dish = env.dishes[0]
    const history = await env.mgr.rows(`order_items?dish_id=eq.${dish.id}&select=id&limit=1`)
    test.skip(!history.length, `${dish.name} has never been ordered`)
    const row = dishRow(page, dish.name)
    await row.getByRole('button', { name: 'Delete' }).click()
    await modalOf(page).getByRole('button', { name: 'Delete', exact: true }).click()
    const m = modalOf(page)
    await expect(m.locator('p').last(), 'an error under the question, translated').toContainText(/./, { timeout: 15_000 })
    expect(await m.innerText()).not.toMatch(/violates|foreign key|23503|constraint/i)
    await m.getByRole('button', { name: 'Cancel' }).click()
    expect((await env.mgr.rows(`dishes?id=eq.${dish.id}&select=id`)).length, 'dish kept').toBe(1)
  })

  test('validation: empty name, bad price, oversized photo and a non-image are refused with their messages', async ({ page }) => {
    await openDash(page, 'manager', '/menu')
    await page.getByRole('button', { name: 'Add Dish' }).click()
    const m = modalOf(page)
    await m.getByRole('button', { name: 'Add Dish' }).click()
    await expect(m.getByText('Name is required')).toBeVisible()
    await m.locator('input.input').first().fill('QA invalid')
    for (const bad of ['', '0', '-3']) {
      await m.locator('input[type=number]').first().fill(bad)
      await m.getByRole('button', { name: 'Add Dish' }).click()
      await expect(m.getByText('Valid price is required'), `price "${bad}"`).toBeVisible()
    }
    await m.locator('input[type=file]').setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 10, 1) })
    await expect(m.getByText('Photo must be under 5MB')).toBeVisible()
    await m.locator('input[type=file]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
    await expect(m.getByText('File must be an image')).toBeVisible()
    await expect(m.locator('img[alt="Preview"]')).toHaveCount(0)
    await m.getByRole('button', { name: 'Cancel' }).click()
    await expect(m).toBeHidden()
    expect((await env.mgr.rows(`dishes?restaurant_id=eq.${F.SAKURA_ID}&name=eq.QA%20invalid&select=id`)).length).toBe(0)
  })

  test('a dish added elsewhere appears without a reload; admin gets the same controls, the waiter has no Menu', async ({ page, browser }, testInfo) => {
    await openDash(page, 'manager', '/menu')
    const name = uniq()
    await makeDish(name)
    await expect(dishRow(page, name)).toBeVisible({ timeout: 20_000 })
    const a = await F.openAs(browser, testInfo, 'admin')
    try {
      await a.page.goto(url('/menu')); await a.page.locator('.dash-layout').waitFor()
      await expect(a.page.getByRole('button', { name: 'Add Dish' })).toBeVisible()
      await expect(a.page.getByText('Only managers and admins can make changes here.')).toHaveCount(0)
      await expect(dishRow(a.page, name).getByRole('button', { name: 'Edit' })).toBeVisible()
    } finally { await a.close() }
    const w = env.s.waiter1.api   // the database refuses a waiter's write even though the page is hidden from them
    const r = await w.patch(`dishes?restaurant_id=eq.${F.SAKURA_ID}&name=eq.${encodeURIComponent(name)}`, { available: false })
    expect(r.body, 'rows a waiter was able to change').toEqual([])
  })

  test('the Add Dish dialog is a proper dialog: role, labelled fields, Escape closes it', async ({ page }) => {
    await openDash(page, 'manager', '/menu')
    await page.getByRole('button', { name: 'Add Dish' }).click()
    const m = modalOf(page)
    await expect(m.getByRole('heading', { name: 'Add Dish' })).toBeVisible()
    expect.soft(await page.getByRole('dialog').count(), 'role="dialog" on the Add Dish modal').toBeGreaterThan(0)
    expect.soft(await m.getByLabel('Name', { exact: false }).count(), 'a field reachable by its "Name" label').toBeGreaterThan(0)
    expect.soft(await m.getByLabel(/^Price/).count(), 'a field reachable by its "Price" label').toBeGreaterThan(0)
    await page.keyboard.press('Escape')
    expect.soft(await m.isVisible(), 'the dialog should close on Escape').toBe(false)
  })
})

// =====================================================================================================================
// 11. Promos (manager creates / edits / activates / pauses / cancels; the consumer Home shows it; the waiter cannot)
// =====================================================================================================================
const toLocalInput = d => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
const promoCard = (page, name) => lastDiv(page).filter({ hasText: name })

test.describe('promos', { tag: ['@staff', '@resto', '@dash-ops', '@do-promos'] }, () => {
  test.describe.configure({ mode: 'default' })
  const PQA = 'QA Dashops promo'
  let api
  test.afterEach(async () => {
    // campaigns cannot be deleted (no DELETE grant, no button): whatever a failed test left over is cancelled
    if (!api) return
    await api.patch(`ad_campaigns?restaurant_id=eq.${F.SAKURA_ID}&name=like.${encodeURIComponent(PQA + '*')}&status=neq.cancelled`, { status: 'cancelled' })
  })

  test('lifecycle: create (draft) -> edit -> Activate -> shown on the consumer Home -> Pause -> hidden -> Activate -> Cancel', async ({ page, browser }, testInfo) => {
    test.setTimeout(240_000)
    api = await openDash(page, 'manager', '/promos')
    const name = `${PQA} ${Date.now().toString(36)}`
    const title = `Dashops special ${Date.now().toString(36)}`
    const dishName = (await F.sakuraDishes(api, 1))[0].name
    const anon = await browser.newContext(F.contextOptions(testInfo.project.use))
    const home = await anon.newPage()
    const onHome = async () => { await home.goto(`${CONSUMER}/`); await home.waitForLoadState('networkidle').catch(() => {}); return home.locator('article', { hasText: title }).count() }
    try {
      await test.step('create as a draft', async () => {
        await page.getByRole('button', { name: 'New Campaign' }).click()
        const m = modalOf(page)
        await expect(m.getByRole('heading', { name: 'New Campaign' })).toBeVisible()
        const inputs = m.locator('input.input')
        await inputs.nth(0).fill(name)
        await inputs.nth(1).fill(title)
        await m.locator('textarea').fill('Created by the dashboard ops test')
        await m.getByRole('button', { name: 'Discount', exact: true }).click()
        await m.locator('select').first().selectOption({ label: dishName })
        const nums = m.locator('input[type=number]')
        await nums.nth(0).fill('50')
        await nums.nth(1).fill('10')
        const dates = m.locator('input[type=datetime-local]')
        await dates.nth(0).fill(toLocalInput(new Date(Date.now() - 3_600_000)))
        await dates.nth(1).fill(toLocalInput(new Date(Date.now() + 2 * 86_400_000)))
        await expect(m.locator('select').last()).toHaveValue('draft')
        await m.getByRole('button', { name: 'Create Campaign' }).click()
        await expect(m).toBeHidden({ timeout: 15_000 })
        const card = promoCard(page, name)
        await expect(card).toBeVisible()
        await expect(card).toContainText('Draft')
        await expect(card).toContainText('Discount')
        await expect(card).toContainText(title)
        await expect(card).toContainText(dishName)
        await expect(card).toContainText('₼0.00 spent')
        await expect(card).toContainText('₼50.00 budget · ₼10.00/day')
        expect(await onHome(), 'a draft is not shown to guests').toBe(0)
      })
      const card = promoCard(page, name)
      await test.step('edit title and budget', async () => {
        await card.getByRole('button', { name: 'Edit' }).click()
        const m = modalOf(page)
        await expect(m.getByRole('heading', { name: 'Edit Campaign' })).toBeVisible()
        await expect(m.locator('input.input').nth(0)).toHaveValue(name)
        await expect(m.locator('input[type=datetime-local]').nth(1)).not.toHaveValue('')
        await m.locator('input[type=number]').nth(0).fill('75')
        await m.getByRole('button', { name: 'Save Changes' }).click()
        await expect(m).toBeHidden({ timeout: 15_000 })
        await expect(card).toContainText('₼75.00 budget')
        expect((await api.rows(`ad_campaigns?name=eq.${encodeURIComponent(name)}&select=budget,status`))[0]).toMatchObject({ budget: 75, status: 'draft' })
      })
      await test.step('Activate: Active in the dashboard, a sponsored card on the consumer Home', async () => {
        await card.getByRole('button', { name: 'Activate' }).click()
        await expect(card).toContainText('Active')
        await expect(card.getByRole('button', { name: 'Pause' })).toBeVisible()
        await expect(card.getByRole('button', { name: 'Activate' })).toHaveCount(0)
        await expect(page.getByText(/\d+ active · \d+ total/)).toBeVisible()
        expect(await onHome(), 'an active campaign inside its run window shows on the Home feed').toBeGreaterThan(0)
        await expect(home.locator('article', { hasText: title }).first()).toContainText(/Promoted|Sponsored/i)
      })
      await test.step('Pause: Paused, gone from the Home', async () => {
        await card.getByRole('button', { name: 'Pause' }).click()
        await expect(card).toContainText('Paused')
        expect(await onHome(), 'a paused campaign is hidden from guests').toBe(0)
        await card.getByRole('button', { name: 'Activate' }).click()
        await expect(card).toContainText('Active')
      })
      await test.step('Cancel (asks first; Keep leaves it alone), then no actions but Edit', async () => {
        await card.getByRole('button', { name: 'Cancel' }).click()
        const m = modalOf(page)
        await expect(m.getByRole('heading', { name: 'Cancel Campaign' })).toBeVisible()
        await expect(m).toContainText(name)
        await m.getByRole('button', { name: 'Keep' }).click()
        await expect(card).toContainText('Active')
        await card.getByRole('button', { name: 'Cancel' }).click()
        await modalOf(page).getByRole('button', { name: 'Cancel Campaign' }).click()
        await expect(card).toContainText('Cancelled')
        await expect(card.getByRole('button', { name: /Activate|Pause|^Cancel$/ })).toHaveCount(0)
        expect(await onHome(), 'a cancelled campaign is hidden from guests').toBe(0)
        expect((await api.rows(`ad_campaigns?name=eq.${encodeURIComponent(name)}&select=status`))[0].status).toBe('cancelled')
      })
    } finally { await anon.close() }
  })

  test('validation: every required field and the date order are checked with their messages', async ({ page }) => {
    api = await openDash(page, 'manager', '/promos')
    await page.getByRole('button', { name: 'New Campaign' }).click()
    const m = modalOf(page)
    const create = () => m.getByRole('button', { name: 'Create Campaign' }).click()
    await create(); await expect(m.getByText('Name is required')).toBeVisible()
    await m.locator('input.input').nth(0).fill(`${PQA} invalid`)
    await create(); await expect(m.getByText('Title is required')).toBeVisible()
    await m.locator('input.input').nth(1).fill('x')
    await create(); await expect(m.getByText('Budget must be greater than 0')).toBeVisible()
    await m.locator('input[type=number]').nth(0).fill('20')
    await create(); await expect(m.getByText('Start and end dates are required')).toBeVisible()
    const dates = m.locator('input[type=datetime-local]')
    await dates.nth(0).fill(toLocalInput(new Date(Date.now() + 86_400_000)))
    await dates.nth(1).fill(toLocalInput(new Date(Date.now() - 86_400_000)))
    await create(); await expect(m.getByText('End date must be after start date')).toBeVisible()
    await m.locator('input[type=number]').nth(1).fill('-1')
    await dates.nth(1).fill(toLocalInput(new Date(Date.now() + 2 * 86_400_000)))
    await create(); await expect(m.getByText('Daily limit must be greater than 0')).toBeVisible()
    await m.getByRole('button', { name: 'Cancel' }).click()
    expect((await api.rows(`ad_campaigns?name=like.${encodeURIComponent(PQA + ' invalid*')}&select=id`)).length).toBe(0)
  })

  test('status chips and counts agree with the database; an ended campaign is not called Active', async ({ page }) => {
    api = await openDash(page, 'manager', '/promos')
    const all = await api.rows(`ad_campaigns?restaurant_id=eq.${F.SAKURA_ID}&select=status,ends_at,name`)
    const n = s => all.filter(c => c.status === s).length
    await expect(chip(page, /^All \(/)).toHaveText(`All (${all.length})`)
    for (const [s, label] of [['draft', 'Draft'], ['active', 'Active'], ['paused', 'Paused'], ['completed', 'Completed'], ['cancelled', 'Cancelled']]) {
      await expect(chip(page, new RegExp(`^${label} \\(`))).toHaveText(`${label} (${n(s)})`)
    }
    await chip(page, /^Cancelled \(/).click()
    await expect(lastDiv(page)).toHaveCount(n('cancelled'))
    await chip(page, /^All \(/).click()
    const ended = all.filter(c => c.status === 'active' && new Date(c.ends_at) < new Date())
    expect(ended.map(c => c.name), 'campaigns shown as Active although their end date has passed (nothing ever completes them, the guests no longer see them)').toEqual([])
  })

  test('the waiter and the kitchen cannot create or change campaigns (RLS), while the page stays hidden from them', async ({ browser }, testInfo) => {
    api = null   // this test closes its own manager context (cancelling anything an insert might have left) before afterEach
    const m = await F.openAs(browser, testInfo, 'manager')
    const w = await F.openAs(browser, testInfo, 'waiter1')
    const k = await F.openAs(browser, testInfo, 'kitchen')
    try {
      const row = { restaurant_id: F.SAKURA_ID, name: `${PQA} denied`, title: 'denied', type: 'feed_placement', budget: 5, starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + 86_400_000).toISOString(), status: 'draft' }
      const [seed] = await m.api.rows(`ad_campaigns?restaurant_id=eq.${F.SAKURA_ID}&select=id,budget&order=created_at&limit=1`)
      for (const who of [w, k]) {
        const ins = await who.api.post('ad_campaigns', row)
        expect(ins.status, `insert as ${who === w ? 'waiter' : 'kitchen'}`).toBeGreaterThanOrEqual(400)
        const upd = await who.api.patch(`ad_campaigns?id=eq.${seed.id}`, { budget: 999 })
        expect(upd.body, 'rows changed by a non-manager').toEqual([])
      }
      expect((await m.api.rows(`ad_campaigns?id=eq.${seed.id}&select=budget`))[0].budget).toBe(seed.budget)
      await w.page.goto(url('/promos')); await w.page.locator('.dash-layout').waitFor()
      expect(pathOf(w.page)).toBe('/waiter')
    } finally {
      await m.api.patch(`ad_campaigns?restaurant_id=eq.${F.SAKURA_ID}&name=like.${encodeURIComponent(PQA + '*')}&status=neq.cancelled`, { status: 'cancelled' })
      await m.close(); await w.close(); await k.close()
    }
  })
})

// =====================================================================================================================
// 12. Bookings (bookings made by review4 / review5 through the booking RPCs, cancelled again at the end).
//     There is no way to delete a booking, so every booking ends as a cancelled history row: the read-only checks share
//     two far-future bookings (S1 solo, S2 group) and only the state-changing tests make their own.
// =====================================================================================================================
const bookingCard = (page, text) => lastDiv(page).filter({ hasText: text })
const dayLabel = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

test.describe('bookings', { tag: ['@staff', '@resto', '@dash-ops', '@do-bookings'] }, () => {
  test.describe.configure({ mode: 'default' })
  const env = useEnv([], [], { perTest: false })
  const made = []
  const book = async (opts = {}) => {
    const b = await F.bookSlot(env.guests[0], { note: `qa dashops ${Math.random().toString(36).slice(2, 8)}`, ...opts })
    const [row] = await env.mgr.rows(`bookings?id=eq.${b.id}&select=special_requests,tables(table_number)`)
    made.push(b.id)
    return { ...b, note: row.special_requests, table: row.tables?.table_number }
  }
  const status = async id => (await env.mgr.rows(`bookings?id=eq.${id}&select=status`))[0]?.status
  // the far-future dates keep these two on the list however many bookings exist (the page shows the 50 latest-dated ones)
  const shared = {}
  const sharedBooking = async key => shared[key] ||= await book(key === 'solo' ? { daysAhead: 52, pick: 0, party: 2, invites: false } : { daysAhead: 53, pick: 1, party: 4, invites: true })
  env.cleanups.push(async () => { for (const id of made.splice(0)) await env.guests[0].rpc('cancel_booking', { p_booking_id: id }) })

  test('a guest booking appears live as Pending; Confirm -> Mark Seated -> Complete, each saved', async ({ page, guestLock }) => {
    test.setTimeout(150_000)
    await env.clean()
    await openDash(page, 'manager', '/bookings')
    const b = await book({ daysAhead: 51, pick: 2, party: 2 })
    const mine = bookingCard(page, b.note)
    await expect(mine).toBeVisible({ timeout: 15_000 })
    await expect(mine).toContainText('Tural R.')
    await expect(mine).toContainText('Pending')
    await expect(mine).toContainText(dayLabel(b.date))
    await expect(mine).toContainText(`at ${b.time}`)
    await expect(mine).toContainText('2 guests')
    await expect(mine).toContainText(`Table ${b.table}`)
    await expect(mine.getByRole('button', { name: 'Confirm' })).toBeVisible()
    await expect(mine.getByRole('button', { name: 'Decline' })).toBeVisible()
    await mine.getByRole('button', { name: 'Confirm' }).click()
    await expect(mine).toContainText('Confirmed')
    await expect.poll(() => status(b.id)).toBe('confirmed')
    await expect(mine.getByRole('button', { name: 'Decline' })).toHaveCount(0)
    await mine.getByRole('button', { name: 'Mark Seated' }).click()
    await expect(mine).toContainText('Seated')
    await expect.poll(() => status(b.id)).toBe('seated')
    await page.reload(); await page.locator('.dash-layout').waitFor()
    await expect(bookingCard(page, b.note)).toContainText('Seated')
    await bookingCard(page, b.note).getByRole('button', { name: 'Complete' }).click()
    await expect(bookingCard(page, b.note)).toContainText('Completed')
    await expect.poll(() => status(b.id)).toBe('completed')
    await expect(bookingCard(page, b.note).locator('.btn')).toHaveCount(0)
    await F.resetTable(env.mgr, b.table, env.guests)   // Mark Seated takes the booked table to occupied
  })

  test('Decline cancels a pending booking; a guest cancelling flips a card live', async ({ page }) => {
    test.setTimeout(120_000)
    await openDash(page, 'manager', '/bookings')
    const a = await book({ daysAhead: 54, pick: 0 })
    const b = await book({ daysAhead: 55, pick: 0 })
    const ca = bookingCard(page, a.note), cb = bookingCard(page, b.note)
    await expect(ca).toBeVisible({ timeout: 15_000 })
    await expect(cb).toBeVisible()
    await ca.getByRole('button', { name: 'Decline' }).click()
    await expect(ca).toContainText('Cancelled')
    await expect.poll(() => status(a.id)).toBe('cancelled')
    await expect(ca.locator('.btn')).toHaveCount(0)
    expect((await env.guests[0].rpc('cancel_booking', { p_booking_id: b.id })).ok).toBe(true)
    await expect(cb).toContainText('Cancelled', { timeout: 15_000 })
  })

  test('status chips count and filter; No-show shows because no-show bookings exist', async ({ page }) => {
    const api = await openDash(page, 'manager', '/bookings')
    const all = await api.rows(`bookings?restaurant_id=eq.${F.SAKURA_ID}&order=reserved_from.desc&limit=50&select=status`)   // what the page asks for
    const n = s => all.filter(b => b.status === s).length
    await expect(chip(page, /^All \(/)).toHaveText(`All (${all.length})`)
    await expect(page.getByText(`${all.length} bookings`)).toBeVisible()
    for (const [s, label] of [['pending', 'Pending'], ['confirmed', 'Confirmed'], ['seated', 'Seated'], ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['no_show', 'No-show']]) {
      const c = chip(page, new RegExp(`^${label} \\(`))
      if (s === 'no_show' && n(s) === 0) { await expect(c).toHaveCount(0); continue }
      await expect(c).toHaveText(`${label} (${n(s)})`)
      await c.click()
      if (n(s) === 0) await expect(page.getByText('No bookings')).toBeVisible()
      else {
        await expect(lastDiv(page)).toHaveCount(n(s))
        for (const card of await lastDiv(page).all()) await expect(card).toContainText(new RegExp(label, 'i'))
      }
    }
  })

  test('group booking: panel shows the invite code, Copy link, members live (host, joined, left)', async ({ page }) => {
    test.setTimeout(150_000)
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(F.RESTO_URL).origin })
    await openDash(page, 'manager', '/bookings')
    const b = await sharedBooking('group')
    expect(b.code, 'invite code returned by create_group_booking').toBeTruthy()
    const card = bookingCard(page, b.note)
    await expect(card).toBeVisible({ timeout: 15_000 })
    const toggle = card.locator('.v2-group-toggle')
    await expect(toggle).toHaveText(/Group · 1 of 4 joined/)
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(card.locator('.v2-invite-label')).toHaveText('Invite code')
    await expect(card.locator('.v2-code-chip')).toHaveText(b.code)
    await card.getByRole('button', { name: 'Copy link' }).click()
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${CONSUMER}/b/${b.code}`)
    await expect(card.getByRole('button', { name: 'Copied' })).toBeVisible()
    const members = card.locator('.v2-member')
    await expect(members).toHaveCount(1)
    await expect(members.first()).toContainText('Tural R.')
    await expect(members.first()).toContainText('Host')
    await expect(members.first().locator('a[href^="tel:"]')).toHaveAttribute('href', 'tel:+994501234567')
    await expect(card.locator('.v2-group-foot')).toHaveText('Arrived 0/4')
    // a second guest joins through the invite code, then leaves
    const join = await env.guests[1].rpc('join_group_booking', { p_code: b.code, p_consent: true, p_name: null, p_phone: '+994507654321' })
    expect(join.ok, `join_group_booking: ${JSON.stringify(join.body)}`).toBe(true)
    await expect(members).toHaveCount(2, { timeout: 15_000 })
    await expect(toggle).toHaveText(/Group · 2 of 4 joined/)
    await expect(members.filter({ hasText: 'Nigar R.' })).toContainText('Joined')
    await expect(members.filter({ hasText: 'Nigar R.' })).not.toContainText('Host')
    const left = await env.guests[1].rpc('leave_group_booking', { p_booking_id: b.id })
    expect(left.ok, `leave_group_booking: ${JSON.stringify(left.body)}`).toBe(true)
    await expect(toggle).toHaveText(/Group · 1 of 4 joined/, { timeout: 15_000 })
  })

  test('a booking made for the day after tomorrow is listed, however many later bookings exist (the page keeps the 50 latest-dated)', async ({ page }) => {
    // BookingsPage loads .order('reserved_from', desc).limit(50): once more than 50 bookings exist (cancelled ones included),
    // the nearest upcoming reservations, the ones staff need first, are the ones that fall off the list.
    const api = await openDash(page, 'manager', '/bookings')
    const b = await book({ daysAhead: 2, pick: 3, party: 2 })
    const total = (await api.rows(`bookings?restaurant_id=eq.${F.SAKURA_ID}&select=id`)).length
    await page.reload(); await page.locator('.dash-layout').waitFor()
    await expect(bookingCard(page, b.note), `booking for ${b.date} among ${total} bookings of the restaurant`).toBeVisible({ timeout: 15_000 })
  })

  test('a booking whose host switched the invite link off shows no invite code or Copy link (it would be dead)', async ({ page }) => {
    // sql/50: p_invites false still creates the invite row, flagged enabled = false; the dashboard panel reads booking_invites without that flag.
    await openDash(page, 'manager', '/bookings')
    const b = await sharedBooking('solo')
    const card = bookingCard(page, b.note)
    await expect(card).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(2_500)   // the panel loads its summary a moment after the card
    const detail = await env.guests[0].rpc('group_booking_detail', { p_booking_id: b.id })
    expect(detail.body.invites_enabled, 'invites_enabled for a booking made with the switch off').toBe(false)
    expect(await card.locator('.v2-group').count(), 'group panel (invite code, Copy link) on a booking with invites off').toBe(0)
  })

  test('a booking card does not show the guest e-mail address (the dashboard is documented to never show it)', async ({ page }) => {
    await openDash(page, 'manager', '/bookings')
    const card = bookingCard(page, (await sharedBooking('solo')).note)
    await expect(card).toBeVisible({ timeout: 15_000 })
    expect(await card.innerText(), 'text of the booking card').not.toMatch(/@/)
  })

  test('booking times are shown in restaurant time (Baku), whatever the viewer\'s time zone', async ({ browser }, testInfo) => {
    const b = await sharedBooking('solo')
    const ctx = await browser.newContext({ ...F.contextOptions(testInfo.project.use), timezoneId: 'America/Los_Angeles' })
    const page = await ctx.newPage()
    try {
      await F.authenticate(page, 'manager')
      await page.goto(url('/bookings')); await page.locator('.dash-layout').waitFor()
      const card = bookingCard(page, b.note)
      await expect(card).toBeVisible({ timeout: 15_000 })
      await expect(card, `slot ${b.time} Baku time, viewed from Los Angeles`).toContainText(`at ${b.time}`)
    } finally { await ctx.close() }
  })

  test('a booking card with its group panel open fits 390px', async ({ page, watch }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openDash(page, 'manager', '/bookings')
    const b = await sharedBooking('group')
    const card = bookingCard(page, b.note)
    await expect(card).toBeVisible({ timeout: 15_000 })
    await card.locator('.v2-group-toggle').click()
    await expect(card.locator('.v2-member')).toHaveCount(1)
    await walker(page, watch, testInfo).check('bookings group panel open')
    expect.soft((await card.getByRole('button', { name: 'Confirm' }).boundingBox()).height, 'Confirm button height').toBeGreaterThanOrEqual(40)
  })
})

// =====================================================================================================================
// 13. Kitchen timer (Sakura T3)
// =====================================================================================================================
test.describe('kitchen timer', { tag: ['@staff', '@resto', '@dash-ops', '@do-kds-timer'] }, () => {
  test.describe.configure({ mode: 'default' })
  const env = useEnv(['T3'], ['kitchen'])

  test('a ticket that has just started shows 0m, never a negative time (the board clock only ticks every 10 s)', async () => {
    test.setTimeout(120_000)
    const k = env.s.kitchen
    await k.page.goto(url('/kds')); await k.page.locator('.dash-layout').waitFor()
    await env.order('T3', env.items(1))
    await expect(k.page.locator('.kds-ticket')).toHaveCount(1, { timeout: 15_000 })
    await k.page.waitForTimeout(4_000)   // the board's `now` is now a few seconds old
    await k.page.locator('.kds-advance-btn').click()                                   // Start Preparing: started_at = server time
    const prep = kdsCol(k.page, 'Preparing').locator('.kds-elapsed')
    await expect(prep).toBeVisible()
    const seen = [await prep.innerText()]
    await k.page.waitForTimeout(300)
    seen.push(await prep.innerText())
    expect(seen.filter(x => /^-/.test(x.trim())), 'negative elapsed times shown right after Start Preparing').toEqual([])
  })
})
