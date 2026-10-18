// Consumer discovery features, one test per feature, desktop and the `mobile` project: the Search tab's zero state (the former Discover tab: the sections of
// one `discover` call: Popular, Cuisines, Open now, Trending dishes, Top reviews, All places), Search (typing, diet filters, dish sheet), Map (markers,
// chips, popup, geolocation, the "Open now" chip), Restaurant page (hero, stats, hours, Follow, menu chips, dietary filters, dish sheet, floor
// plan), Azerbaijani copy and the signed-out gates. Expected values are read from the preview database (public REST)
// and compared with what the page shows. Findings: docs/qa/consumer-bookings.md. UX round 2026-10-18: Discover moved into /explore (Home has two tabs),
// the restaurant like and the stat "dishes" are gone, sheets are BottomSheets (support/ux.js).
// Writes (all undone in `finally`): a follow of Sakura House by the QA guest (kitchen.sakura). The preview also holds a simulated demo world, so no
// test asserts a total and no demo data is changed.
const { test, expect, settle } = require('../support/fixtures')
const { CONSUMER_URL } = require('../support/env')
const F = require('../support/feat-bookings')
const U = require('../support/ux')
const { openAs } = F
const R = require('../support/restaurant')

const { url, BELLA, SAKURA, anonApi, bakuClock, hm, rawKeys } = F
const NAMES = { 'bella-roma': 'Trattoria Bella Roma', 'seda-ocagi': 'Səda Ocağı', 'sakura-house': 'Sakura House' }
const SLUGS = Object.keys(NAMES)
const money = n => `₼${Number(n).toFixed(2)}`
const heading1 = p => p.getByRole('heading', { level: 1 })

/**
 * Search (/explore) with nothing typed is the Discover content. The first `discover` answer is awaited and the helper checks a section is on
 * screen. Resolves { data } = the parsed answer (docs/V2-CONTRACT.md 18.2).
 */
async function openDiscover(page) {
  const answer = page.waitForResponse(r => r.request().method() === 'POST' && /\/rest\/v1\/rpc\/discover(\?|$)/.test(r.url()), { timeout: 30_000 })
  answer.catch(() => {})
  await page.goto(url('/explore'))
  const data = await (await answer).json()
  await expect(page.locator('.sr-zero h2.dsc-h').first()).toBeVisible()
  return { data }
}

/** Is a restaurant with these operating_hours rows open now (Baku clock, same-day windows)? */
function openNow(hours) {
  const c = bakuClock()
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(c.weekday)
  const row = hours.find(h => h.day_of_week === day && !h.is_closed)
  return !!row && c.minutes >= hm(row.open_time) && c.minutes < hm(row.close_time)
}
const todayRow = hours => hours.find(h => h.day_of_week === ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(bakuClock().weekday))

const sheet = p => U.sheet(p)
const noErrors = watch => expect(watch.consoleErrors, 'console errors').toEqual([])

/* ================================================================ SEARCH ZERO STATE */
// The Search tab with nothing typed (client/src/features/search/ZeroState.jsx, V2-CONTRACT 18.2 / 18.3 / 23): ONE `discover` call renders Popular chips +
// Cuisines + Open now (near you; "New places" is merged into it as a tag) + Trending dishes (5 rows) + Top reviews (3 compact rows) + All places (12, then
// Show more), each hidden when empty. Promos and the restaurant like / Follow buttons are gone from here. The preview holds a simulated demo
// world (10 venues, @demo.rufesto.com people) that changes while it runs, so nothing here asserts a total: the page is compared with the
// `discover` answer it received, and nothing of the demo data is changed.

const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '')
const section = (p, title) => p.locator('.sr-zero section.dsc-sec').filter({ has: p.getByRole('heading', { name: title, exact: true, level: 2 }) })
const heads = p => p.locator('.sr-zero h2.dsc-h').evaluateAll(els => els.map(e => e.textContent.trim()))
const chipsOf = p => p.getByRole('group', { name: 'Cuisines' }).getByRole('button')
/** The restaurants of the "Open now" rail: the open ones, then the new places that are open (merged, UX plan 3.2). */
const openRail = data => {
  const ids = new Set(data.open_now.map(r => r.id))
  return [...data.open_now, ...data.new_places.filter(r => r.open_now && !ids.has(r.id))]
}

test.describe('search zero state', { tag: ['@anon', '@consumer', '@feat'] }, () => {
  test.describe.configure({ mode: 'default' })

  test('signed out: the sections are the ones the answer fills, in order, with its names, status and Show more', async ({ page, watch }) => {
    const { data } = await openDiscover(page)
    const near = data.location?.radius_km != null
    const rail = openRail(data)
    const popular = data.trending_dishes.length + Math.min(2, data.cuisines.length) > 0
    const expected = [
      [popular, 'Popular'], [data.cuisines.length, 'Cuisines'], [rail.length, near ? 'Open now near you' : 'Open now'],
      [data.trending_dishes.length, 'Trending dishes'], [data.top_reviews.length, 'Top reviews'], [data.all_restaurants.length, 'All places'],
    ].filter(([n]) => n).map(([, h]) => h)
    expect(expected, 'the preview has restaurants to discover').toContain('All places')
    expect(await heads(page), 'section headings, in order, only the non-empty ones').toEqual(expected)

    await expect(chipsOf(page), 'cuisine chips: the cuisines of the answer, no "All" chip').toHaveText(data.cuisines.map(c => cap(c.key)))
    for (const c of await chipsOf(page).all()) await expect(c).toHaveAttribute('aria-pressed', 'false')
    const popularChips = await page.locator('.sr-zero .sr-pop-chip').allInnerTexts()
    expect(popularChips.length, 'popular chips: up to 6 dishes + 2 cuisines').toBeLessThanOrEqual(8)
    if (data.trending_dishes.length) expect(popularChips[0].trim(), 'the first popular chip is the first trending dish').toBe(data.trending_dishes[0].name)
    const names = rows => rows.map(r => r.name)
    if (rail.length) await expect(section(page, near ? 'Open now near you' : 'Open now').locator('.dsc-pc-name')).toHaveText(names(rail))
    if (data.trending_dishes.length) {
      const dishes = data.trending_dishes.slice(0, 5)
      const trending = section(page, 'Trending dishes')
      await expect(trending.locator('.sr-row-btn .sr-name')).toHaveText(names(dishes))
      for (const [i, d] of dishes.entries()) {
        const row = trending.locator('.sr-row-btn').nth(i)
        await expect(row.locator('.sr-price'), `${d.name}: price`).toHaveText(money(d.price))
        await expect(row.locator('.sr-meta'), `${d.name}: restaurant`).toContainText(d.restaurant.name)
        await expect(row.locator('.sr-sold'), `${d.name}: Sold out`).toHaveCount(d.available ? 0 : 1)
      }
    }
    if (data.top_reviews.length) await expect(section(page, 'Top reviews').locator('article.rv')).toHaveCount(Math.min(3, data.top_reviews.length))

    await test.step('All places: the first 12 rows, name, link and status match the answer; Show more adds the rest', async () => {
      const all = section(page, 'All places')
      const rows = all.locator('a.sr-row')
      await expect(all.locator('a.sr-row .sr-name')).toHaveText(names(data.all_restaurants.slice(0, 12)))
      for (const [i, r] of data.all_restaurants.slice(0, 3).entries()) {
        await expect(rows.nth(i), `${r.name}: link`).toHaveAttribute('href', `/restaurant/${r.slug}`)
        const meta = rows.nth(i).locator('.sr-meta')
        if (r.open_now && r.closes_at) await expect(meta, `${r.name}: open until`).toContainText(`Open until ${r.closes_at}`)
        else if (!r.open_now && r.opens_at) await expect(meta, `${r.name}: closed, opens`).toContainText(`Closed · opens ${r.opens_at}`)
        else if (!r.open_now) await expect(rows.nth(i).locator('.sr-end'), `${r.name}: Closed on the right`).toHaveText('Closed')
      }
      if (data.all_restaurants.length > 12) {
        await all.getByRole('button', { name: 'Show more' }).click()
        await expect(all.locator('a.sr-row .sr-name')).toHaveText(names(data.all_restaurants.slice(0, 24)))
      } else {
        await expect(all.getByRole('button', { name: 'Show more' })).toHaveCount(0)
      }
    })
    await expect(page.locator('.sr-state'), 'no error state').toHaveCount(0)
    await settle(page)
    noErrors(watch)
  })

  test('cuisine chips: a pick turns on the Cuisine filter (URL, chip under the field) and lists that cuisine\'s places; the chip\'s x brings the zero state back', async ({ page }) => {
    const { data } = await openDiscover(page)
    test.skip(data.cuisines.length === 0, 'no cuisines in the answer')
    const pick = data.cuisines.find(c => c.count < data.all_restaurants.length) || data.cuisines[0]
    const asked = page.waitForResponse(r => r.request().method() === 'POST' && /\/rest\/v1\/rpc\/search(\?|$)/.test(r.url()) && (r.request().postDataJSON()?.p_cuisine || '').toLowerCase() === pick.key.toLowerCase())
    await chipsOf(page).filter({ hasText: new RegExp(`^${cap(pick.key)}$`) }).click()
    const answer = await (await asked).json()
    await expect.poll(() => (new URL(page.url()).searchParams.get('cuisine') || '').toLowerCase(), { message: 'the filter is in the URL' }).toBe(pick.key.toLowerCase())
    await expect(page.locator('.sr-active .sr-achip')).toContainText(cap(pick.key))
    await page.getByRole('tab', { name: 'Places', exact: true }).click()
    const rows = page.locator('.sr-results a.sr-row')
    await expect(rows).toHaveCount(Math.min(40, answer.restaurants.length))
    expect(answer.restaurants.length, 'chip count = restaurants of that cuisine').toBe(pick.count)
    for (const meta of await rows.locator('.sr-meta').allInnerTexts()) expect(meta.toLowerCase().startsWith(pick.key.toLowerCase()), `row meta "${meta}" starts with the cuisine`).toBe(true)
    await page.getByRole('button', { name: `Remove filter ${cap(pick.key)}` }).click()
    await expect(page.locator('.sr-active .sr-achip')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'All places', level: 2 })).toBeVisible()
    expect(new URL(page.url()).searchParams.get('cuisine')).toBeNull()
  })

  test('signed out: top review authors show real names (not "Anonymous") and link to their profile', async ({ page }) => {
    const { data } = await openDiscover(page)
    test.skip(data.top_reviews.length === 0, 'no verified review in the last 14 days on this database')
    const cards = section(page, 'Top reviews').locator('article.rv')
    for (const [i, r] of data.top_reviews.slice(0, 3).entries()) {
      expect(r.user?.name, `review ${r.id}: reviewer name in the answer`).toBeTruthy()
      expect(r.user.name).not.toMatch(/^anonymous$/i)
      // round 4: the name is plain text; the avatar beside it is the (44 px) link to the profile, labelled with the author's name
      const name = cards.nth(i).locator('.rv-name')
      await expect(name).not.toHaveText(/anonymous|Rufesto guest/i)
      await expect(name).toContainText(r.user.name.split(' ')[0])
      const profile = cards.nth(i).locator(`a.rv-av[href="/u/${r.user.id}"]`)
      await expect(profile, 'the avatar links to the profile').toHaveCount(1)
      await expect(profile).toHaveAttribute('aria-label', /\S/)
    }
  })

  test('signed out: a trending dish row opens the dish sheet over Search; a place row opens the restaurant page', async ({ page }) => {
    const { data } = await openDiscover(page)
    if (data.trending_dishes.length) {
      const d = data.trending_dishes[0]
      await section(page, 'Trending dishes').locator(`.sr-row-btn[data-dish-id="${d.id}"]`).click()
      await expect(page).toHaveURL(new RegExp(`/explore\\?.*dish=${d.id}`))
      await expect(sheet(page)).toContainText(d.name)
      await expect(sheet(page).locator('.dds-venue-link'), 'the venue links to its menu').toHaveAttribute('href', `/restaurant/${d.restaurant.slug}?tab=menu`)
      await page.keyboard.press('Escape')
      await U.noSheet(page)
      await expect(page).toHaveURL(url('/explore'))
      await expect(page.getByRole('heading', { name: 'All places', level: 2 }), 'still on Search, answer kept').toBeVisible()
    }
    const first = data.all_restaurants[0]
    await section(page, 'All places').locator('a.sr-row').first().click()
    await expect(page).toHaveURL(url(`/restaurant/${first.slug}`))
    await expect(heading1(page)).toHaveText(first.name)
  })

  test('signed out: no Follow, like, options menu, Sponsored card or Promos / New places rail on Search (Follow lives on the restaurant page)', async ({ page }) => {
    await openDiscover(page)
    const zero = page.locator('.sr-zero')
    await expect(zero.getByRole('button', { name: /^(Follow|Unfollow|Like|Remove your like) \S/ })).toHaveCount(0)
    await expect(zero.getByRole('button', { name: 'Post options' })).toHaveCount(0)
    await expect(zero.getByText('Sponsored', { exact: true })).toHaveCount(0)
    for (const h of ['Promos', 'New places']) await expect(zero.getByRole('heading', { name: h, exact: true })).toHaveCount(0)
    await expect(zero.getByRole('link', { name: /view menu/i }), 'no "View menu" link on a place row').toHaveCount(0)
    await expect(zero.getByText(/\bfollowers?\b/), 'no follower count on a place row').toHaveCount(0)
  })

  test('discover() through the public API: sections, caps, ids of the active restaurants, names of reviewers, GPS and cuisine filters, errors', async ({ page }) => {
    const api = await anonApi(page)
    const call = async args => (await api.rpc('discover', args))
    const plain = await call({})
    expect(plain.ok, `discover HTTP ${plain.status}`).toBe(true)
    const d = plain.body
    for (const k of ['open_now', 'trending_dishes', 'new_places', 'top_reviews', 'promos', 'all_restaurants', 'cuisines']) expect(Array.isArray(d[k]), `${k} is a list`).toBe(true)
    expect(d.location.radius_km, 'no GPS, no radius').toBeNull()
    expect(d.open_now.length).toBeLessThanOrEqual(12)
    expect(d.trending_dishes.length).toBeLessThanOrEqual(12)
    expect(d.new_places.length).toBeLessThanOrEqual(8)
    expect(d.top_reviews.length).toBeLessThanOrEqual(10)
    expect(d.promos.length).toBeLessThanOrEqual(6)
    const active = (await api.get('restaurants?status=eq.active&select=id')).map(r => r.id)
    expect(d.all_restaurants.map(r => r.id).sort(), 'all_restaurants = every active restaurant').toEqual([...active].sort())
    for (const r of d.all_restaurants) expect(r, r.name).toMatchObject({ slug: expect.any(String), open_now: expect.any(Boolean), follower_count: expect.any(Number), km: null })
    for (const r of d.open_now) expect(r.open_now, `${r.name} in open_now`).toBe(true)
    for (const x of d.trending_dishes) expect(x, x.name).toMatchObject({ available: expect.any(Boolean), restaurant: { slug: expect.any(String) } })
    for (const r of d.top_reviews) {
      expect(r.user.name, 'reviewer name is filled for anon too').toBeTruthy()
      expect(r.user.name).not.toMatch(/^anonymous$/i)
    }
    for (const c of d.cuisines) expect(c).toMatchObject({ key: expect.any(String), count: expect.any(Number) })

    const gps = (await call({ p_lat: 40.4093, p_lng: 49.8671 })).body
    expect([3, 6, 12, 50]).toContain(Number(gps.location.radius_km))
    for (const r of gps.all_restaurants.filter(x => x.latitude != null)) expect(typeof r.km, `${r.name}: km with GPS`).toBe('number')

    if (d.cuisines.length) {
      const key = d.cuisines[0].key
      const upper = (await call({ p_cuisine: key.toUpperCase() })).body
      expect(upper.all_restaurants.length, 'p_cuisine is case-insensitive').toBe(d.cuisines[0].count)
      for (const r of upper.all_restaurants) expect(r.cuisine_type.toLowerCase()).toBe(key.toLowerCase())
    }
    expect((await call({ p_cuisine: 'zz-no-such-cuisine' })).body.all_restaurants, 'an unknown cuisine').toEqual([])
    const bad = await call({ p_lat: 40.4 })
    expect(bad.status).toBe(400)
    expect(bad.body.message).toBe('invalid_location')
  })
})

/* ================================================================ SEARCH */
// The typed Search page (client/src/features/search): results come from the `search` RPC (Places / Dishes in 64 px rows, the match in bold), the diet
// filters are in the Filters sheet and the URL (?diet=vegan,spicy), a dish row opens the dish sheet over the page. The full behaviour (zero state, filters,
// recent searches, Back, People) is in tests/ux-search.spec.js; this block keeps the data checks of the old Explore tests.

test.describe('search page', { tag: ['@anon', '@consumer', '@feat'] }, () => {
  const field = p => p.getByRole('searchbox', { name: 'Search dishes, places and people' })
  const dishRows = p => p.locator('.sr-results .sr-row-btn')
  const tabBtn = (p, name) => p.getByRole('tab', { name, exact: true })
  const search = async (page, q) => {
    await field(page).fill(q)
    await expect(page.locator('.sr-results, .sr-empty').first()).toBeVisible()
    await expect.poll(() => page.locator('.sr-list').getAttribute('aria-busy'), { message: `the answer for "${q}"` }).not.toBe('true')
  }

  test('typing lists the dishes the search answer holds, with name, restaurant and price; a restaurant name finds the restaurant', async ({ page, watch }) => {
    const api = await anonApi(page)
    const answer = (await api.rpc('search', { p_q: 'pa', p_limit: 40 })).body
    expect(answer.dishes.length, 'dishes for "pa"').toBeGreaterThan(5)
    await page.goto(url('/explore'))
    await search(page, 'pa')
    await tabBtn(page, 'Dishes').click()
    await expect(dishRows(page).first()).toBeVisible()
    await expect(dishRows(page)).toHaveCount(Math.min(40, answer.dishes.length))
    const sample = answer.dishes[0]
    const row = dishRows(page).filter({ hasText: sample.name }).first()
    await expect(row).toContainText(sample.restaurant.name)
    await expect(row.locator('.sr-price')).toHaveText(money(sample.price))
    const names = await dishRows(page).locator('.sr-name').allInnerTexts()
    expect(new Set(names), 'the rows are the dishes of the answer').toEqual(new Set(answer.dishes.slice(0, 40).map(d => d.name)))
    await field(page).fill('')
    await search(page, 'sakura')
    await tabBtn(page, 'All').click()
    await expect(page.locator('.sr-results a.sr-row').filter({ hasText: 'Sakura House' })).toBeVisible()
    noErrors(watch)
  })

  test('search matches dish names and restaurant names, ignores case and accents, and explains an empty result', async ({ page }) => {
    const api = await anonApi(page)
    const expected = (await api.rpc('search', { p_q: 'CARBONARA', p_limit: 40 })).body.dishes
    expect(expected.length, 'a carbonara on the menu').toBeGreaterThan(0)
    await page.goto(url('/explore'))
    await search(page, 'CARBONARA')
    await tabBtn(page, 'Dishes').click()
    await expect(dishRows(page)).toHaveCount(expected.length)
    for (const n of await dishRows(page).locator('.sr-name').allInnerTexts()) expect(n.toLowerCase(), 'the dish name matches').toContain('carbonara')
    await search(page, 'zzzzqq')
    await expect(page.locator('.sr-empty-title')).toHaveText('No results for “zzzzqq”')
    await expect(page.locator('.sr-empty-hint')).toHaveText('Check the spelling or try a dish or cuisine.')
    await field(page).fill('')
    await expect(page.locator('.sr-zero h2.dsc-h').first()).toBeVisible()
  })

  test('the diet filters (Vegan, Vegetarian, Gluten-free, Spicy) narrow the dishes like the data says; the sheet sets them, the URL keeps them', async ({ page }) => {
    const api = await anonApi(page)
    const flagged = async col => new Set((await api.get(`dishes?${col}=eq.true&select=name&limit=1000`)).map(d => d.name))
    await page.goto(url('/explore'))
    await expect(page.locator('.sr-zero h2.dsc-h').first()).toBeVisible()
    // the sheet: Vegan
    await page.getByRole('button', { name: /^Filters/ }).click()
    const fs = page.locator('.bs-root:has(.sr-fs)[data-state="open"] .bs-panel')
    await expect(fs).toBeVisible()
    await fs.getByRole('button', { name: 'Vegan', exact: true }).click()
    await expect(fs.getByRole('button', { name: 'Vegan', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await fs.getByRole('button', { name: 'Show results' }).click()
    await U.noSheet(page)
    await expect.poll(() => new URL(page.url()).searchParams.get('diet')).toBe('vegan')
    await expect(page.locator('.sr-active .sr-achip')).toContainText('Vegan')
    for (const [diet, label, col] of [['vegan', 'Vegan', 'is_vegan'], ['vegetarian', 'Vegetarian', 'is_vegetarian'], ['gluten_free', 'Gluten-free', 'is_gluten_free'], ['spicy', 'Spicy', 'is_spicy']]) {
      await page.goto(url(`/explore?diet=${diet}`))
      await expect(page.locator('.sr-active .sr-achip')).toContainText(label)
      await expect(page.locator('.sr-results')).toBeVisible()
      await expect.poll(() => page.locator('.sr-list').getAttribute('aria-busy')).not.toBe('true')
      await tabBtn(page, 'Dishes').click()
      const want = await flagged(col)
      if (want.size === 0) { await expect(page.locator('.sr-empty-title')).toHaveText('Nothing matches these filters'); continue }
      await expect(dishRows(page).first(), `${label}: dishes`).toBeVisible()
      const names = await dishRows(page).locator('.sr-name').allInnerTexts()
      expect(names.length, `${label}: at most one page of results`).toBeLessThanOrEqual(40)
      for (const n of names) expect(want.has(n.trim()), `${label}: "${n}" is flagged ${col} in the data`).toBe(true)
    }
  })

  test('there is no sort control on Search (documented): dishes come in the order of the server', async ({ page }) => {
    await page.goto(url('/explore'))
    await search(page, 'pa')
    await expect(page.getByRole('combobox')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /sort/i })).toHaveCount(0)
  })

  test('dish sheet opens from a row and closes with the X, with Esc and by tapping the backdrop', async ({ page, watch }) => {
    await page.goto(url('/explore'))
    await search(page, 'pizza')
    await expect(dishRows(page).first()).toBeVisible()
    for (const how of ['X button', 'Esc', 'backdrop']) {
      await dishRows(page).first().click()
      await expect(sheet(page)).toBeVisible()
      await expect(sheet(page).getByText(/₼\d+\.\d\d/).first()).toBeVisible()
      await U.settled(page.locator('.bs-root[data-state="open"] .bs-panel'))
      if (how === 'X button') await sheet(page).getByRole('button', { name: 'Close' }).click()
      else if (how === 'Esc') await page.keyboard.press('Escape')
      else await page.locator('.bs-root[data-state="open"] .bs-scrim').click({ position: { x: 4, y: 4 } })
      await U.noSheet(page, `dish sheet closed by ${how}`)
      await expect(page).toHaveURL(/\/explore\?q=pizza/)
    }
    noErrors(watch)
  })

  test('a dish opened from Search leads to its restaurant (the venue in the sheet links to its menu)', async ({ page }) => {
    await page.goto(url('/explore'))
    await search(page, 'pizza')
    await dishRows(page).first().click()
    await expect(sheet(page)).toBeVisible()
    const link = sheet(page).locator('a.dds-venue-link')
    await expect(link, 'a link to the restaurant in the dish sheet').toHaveCount(1)
    await expect(link).toHaveAttribute('href', /^\/restaurant\/[\w-]+\?tab=menu$/)
  })
})

/* ==================================================================== MAP */

// The Map tab is a MapLibre vector map (features/map/, fb305b0): a full-bleed map with pill pins (button.mp-pin, aria-label "<name>, <kind>, rated <n>, <status>"),
// a snap sheet with the list (li.mp-li, the Search place rows) on a phone, a side panel on a desktop, a card for the selected place (.mp-card: Menu / Book / Directions)
// and ?place=<slug> deep links. Light checks here (loads, list rows, a pin selects, deep link, filters); the full map spec is ux-map.spec.js.
test.describe('map', { tag: ['@anon', '@consumer', '@feat'] }, () => {
  const screen = p => p.locator('.mp-screen')
  const rows = p => p.locator('li.mp-li')
  const rowOf = (p, name) => rows(p).filter({ hasText: name }).first()
  const pin = (p, name) => p.locator('button.mp-pin[aria-label^="' + name + ',"]')
  const card = (p, name) => p.locator('.mp-card').filter({ hasText: name }).first()
  // the map draws every active restaurant that has coordinates (the demo world holds about ten, so never a fixed number)
  const mapped = async page => (await (await anonApi(page)).get('restaurants?status=eq.active&select=id,name,slug,cuisine_type,latitude,longitude')).filter(r => r.latitude != null && r.longitude != null)
  // no WebGL2 (a very old browser): the screen is the list alone (.is-nomap): the pin checks are skipped then
  const hasMap = async page => (await page.locator('.mp-screen.is-nomap').count()) === 0
  // a row is a selector: tap it with the DOM (on a phone the list sits in a sheet that peeks over the map and may clip the row)
  const selectRow = (p, name) => rowOf(p, name).locator('button.sr-row').evaluate(b => b.click())

  test('the map screen loads: a list row for each restaurant with coordinates and pins on the MapLibre map; no search field of its own', async ({ page, watch }) => {
    const rests = await mapped(page)
    expect(rests.length, 'mapped restaurants on the preview').toBeGreaterThanOrEqual(3)
    await page.goto(url('/map'))
    await expect(screen(page)).toBeVisible()
    await expect(rows(page).first()).toBeAttached({ timeout: 25_000 })
    for (const n of Object.values(NAMES)) await expect(rowOf(page, n), `row of ${n}`).toBeAttached()
    expect(await rows(page).count(), 'a row per mapped restaurant').toBeGreaterThanOrEqual(3)
    await expect(page.getByRole('searchbox'), 'no search field on the map (search lives on the Search tab)').toHaveCount(0)
    await expect(page.getByPlaceholder(/near you|Search restaurants/i)).toHaveCount(0)
    if (await hasMap(page)) {
      await expect(page.locator('canvas.maplibregl-canvas'), 'the MapLibre canvas').toBeVisible({ timeout: 25_000 })
      await expect(page.locator('button.mp-pin, .mp-cluster').first(), 'pins (or clusters) on the map').toBeAttached({ timeout: 25_000 })
    }
    noErrors(watch)
  })

  for (const slug of SLUGS) {
    test(`deep link ?place=${slug}: the card of ${NAMES[slug]} opens, its Menu link opens the restaurant`, async ({ page, watch }) => {
      await page.goto(url(`/map?place=${slug}`))
      await expect(screen(page)).toBeVisible()
      const c = card(page, NAMES[slug])
      await expect(c).toBeVisible({ timeout: 25_000 })
      await expect(c.locator('.mp-act--menu')).toHaveAttribute('href', `/restaurant/${slug}`)
      await expect(c.locator('.mp-act').filter({ hasText: /^Book$/ })).toHaveAttribute('href', `/book/${slug}`)
      await expect(c.getByRole('button', { name: 'Directions' })).toBeVisible()
      await c.locator('.mp-act--menu').click()
      await expect(page).toHaveURL(url(`/restaurant/${slug}`))
      await expect(heading1(page)).toHaveText(NAMES[slug])
      noErrors(watch)
    })
  }

  test('a list row selects its place (the address gets ?place=<slug>), the card closes again, an unknown ?place= falls back to the plain map', async ({ page }) => {
    await page.goto(url('/map'))
    await expect(rowOf(page, 'Sakura House')).toBeAttached({ timeout: 25_000 })
    await selectRow(page, 'Sakura House')
    await expect(page).toHaveURL(/\/map\?place=sakura-house$/)
    await expect(card(page, 'Sakura House')).toBeVisible()
    await page.keyboard.press('Escape')   // closes the card on both layouts (the phone carousel has no close button; a tap on the map or Escape dismisses it)
    await expect(page.locator('.mp-card')).toHaveCount(0)
    await expect(page).toHaveURL(url('/map'))
    await page.goto(url('/map?place=no-such-place-qa'))
    await expect(screen(page)).toBeVisible()
    await expect(rows(page).first()).toBeAttached({ timeout: 25_000 })
    await expect(page.locator('.mp-card'), 'no card for a place that does not exist').toHaveCount(0)
  })

  test('tapping a pin selects its place (it is centred when the page is opened on it)', async ({ page }) => {
    await page.goto(url('/map?place=sakura-house'))
    await expect(screen(page)).toBeVisible()
    test.skip(!(await hasMap(page)), 'no WebGL2 here: the map is the list alone')
    const p = pin(page, 'Sakura House')
    await expect(p).toBeAttached({ timeout: 25_000 })
    await expect(p, 'the selected pin is pressed').toHaveAttribute('aria-pressed', 'true')
    await page.keyboard.press('Escape')   // closes the card on both layouts (the phone carousel has no close button; a tap on the map or Escape dismisses it)
    await expect(page.locator('.mp-card')).toHaveCount(0)
    await expect(p).toHaveAttribute('aria-pressed', 'false')
    await p.click()
    await expect(card(page, 'Sakura House')).toBeVisible()
    await expect(p).toHaveAttribute('aria-pressed', 'true')
  })

  test('geolocation denied: the map still works and the "My location" button explains it', async ({ page, context, watch }) => {
    await context.clearPermissions()
    await page.goto(url('/map'))
    await expect(screen(page)).toBeVisible()
    await expect(rows(page).first()).toBeAttached({ timeout: 25_000 })
    const locate = page.locator('button.mp-locate:visible').first()
    await expect(locate, 'a button to centre the map on the guest ("near me")').toBeVisible()
    await locate.click()
    await expect(screen(page)).toBeVisible()
    await expect(page.locator('.mp-notice'), 'a message when location is denied').toBeVisible({ timeout: 10_000 })
    await expect(rows(page).first()).toBeAttached()
    noErrors(watch)
  })

  test('one "Open now" chip (and the kind chips) filter the list; it never adds a place, and clearing it restores the list', async ({ page }) => {
    await page.goto(url('/map'))
    await expect(rows(page).first()).toBeAttached({ timeout: 25_000 })
    const open = page.locator('.mp-chip').filter({ hasText: 'Open now' })
    await expect(open).toHaveAttribute('aria-pressed', 'false')
    const all = await rows(page).count()
    expect(all, 'a row per restaurant').toBeGreaterThan(0)
    await open.click()
    await expect(open).toHaveAttribute('aria-pressed', 'true')
    const some = await rows(page).count()
    expect(some, 'Open now never adds restaurants').toBeLessThanOrEqual(all)
    if (some === 0) await expect(page.locator('.mp-empty'), 'the empty state says nothing matches').toBeVisible()
    await open.click()
    await expect(open).toHaveAttribute('aria-pressed', 'false')
    await expect(rows(page)).toHaveCount(all)
  })
})

/* ============================================================ RESTAURANT */

test.describe('restaurant page', { tag: ['@anon', '@consumer', '@feat'] }, () => {
  const tiles = p => R.rows(p)   // the printed menu's dish rows (the old .menu-card grid is gone, docs/V2-CONTRACT.md 19.2)
  const stat = (p, label) => p.locator('.rst-stat').filter({ has: p.locator('.rst-stat-l', { hasText: new RegExp(`^${label}$`) }) }).locator('.rst-stat-n')
  // The follower count is public: the page reads it through the count-only RPC (sql/55b; anon no longer has SELECT on user_follows, and a
  // signed-in guest only sees their own follow rows), so the test reads the same RPC as anon.
  const followerCount = async (api, id) => Number((await api.rpc('restaurant_follower_count', { p_restaurant_id: id })).body)
  const dishRows = (api, id) => api.get(`dishes?restaurant_id=eq.${id}&select=id,name,price,available,is_vegan,is_vegetarian,is_gluten_free,is_spicy,review_count,menu_section_id&order=sort_order`)

  for (const slug of SLUGS) {
    test(`hero and stats of ${NAMES[slug]} match the data (followers, reviews, free seats while open)`, async ({ page, watch }) => {
      const api = await anonApi(page)
      const [rest] = await api.get(`restaurants?slug=eq.${slug}&select=id,name,cuisine_type,address,description`)
      const [dishes, followers, tables, hours] = await Promise.all([
        dishRows(api, rest.id), followerCount(api, rest.id), api.get(`tables?restaurant_id=eq.${rest.id}&select=state,capacity`),
        api.get(`operating_hours?restaurant_id=eq.${rest.id}&select=day_of_week,open_time,close_time,is_closed`),
      ])
      await page.goto(url(`/restaurant/${slug}`))
      await expect(heading1(page)).toHaveText(rest.name)
      await expect(page.locator('.rst-cuisine'), 'the cuisine alone, no "Restaurant" suffix').toHaveText(rest.cuisine_type)
      await expect(page.getByText(rest.address, { exact: false }).first()).toBeVisible()
      if (rest.description) await expect(page.getByText(rest.description.slice(0, 40)).first()).toBeVisible()
      await expect(page.locator('img[alt]').or(page.getByText(/[🍝🫕🍣]/)).first()).toBeVisible()   // cover photo or the cuisine emoji
      const labels = await page.locator('.rst-stat-l').allInnerTexts()
      expect(labels, 'no "dishes" stat any more').not.toContain('dishes')
      expect(labels).toEqual(expect.arrayContaining(['followers', 'reviews']))
      await expect(stat(page, 'followers'), 'signed out, the count comes from restaurant_follower_count').toHaveText(String(followers))
      await expect(stat(page, 'reviews')).toHaveText(String(dishes.reduce((s, d) => s + (d.review_count || 0), 0)))
      // free seats only show while the place is open (tables change state while other QA runs use them: compare with a fresh read each time)
      if (openNow(hours) && tables.length) {
        await expect.poll(async () => {
          const now = await api.get(`tables?restaurant_id=eq.${rest.id}&select=state,capacity`)
          const free = now.filter(t => t.state === 'free').reduce((n, t) => n + t.capacity, 0)
          return (await stat(page, 'free').innerText().catch(() => '')) === String(free)
        }, 'free seats on the page equal the free tables\' capacity').toBe(true)
      } else if (!openNow(hours)) {
        await expect(stat(page, 'free'), 'closed: no free-seats stat').toHaveCount(0)
      }
      await R.showMenu(page)
      await expect(tiles(page), 'one row per dish of the menu').toHaveCount(dishes.length)
      noErrors(watch)
    })
  }

  test('open state and today\'s hours follow operating_hours on the Baku clock', async ({ page }) => {
    const api = await anonApi(page)
    for (const slug of SLUGS) {
      const [rest] = await api.get(`restaurants?slug=eq.${slug}&select=id`)
      const hours = await api.get(`operating_hours?restaurant_id=eq.${rest.id}&select=day_of_week,open_time,close_time,is_closed`)
      const open = openNow(hours)
      const row = todayRow(hours)
      await page.goto(url(`/restaurant/${slug}`))
      await expect(heading1(page)).toBeVisible()
      const line = page.getByText(open ? /^Open/ : /^Closed/).first()
      await expect(line, `${slug}: ${open ? 'Open' : 'Closed'} now`).toBeVisible()
      if (row && !row.is_closed) {
        const t = open ? row.close_time.slice(0, 5) : row.open_time.slice(0, 5)
        await expect(page.getByText(new RegExp(`${open ? 'until' : 'opens'}\\s*${t}`, 'i')).first(), `${slug}: today's ${open ? 'closing' : 'opening'} time`).toBeVisible()
      }
    }
  })

  test('a signed-out guest who taps Follow gets the sign-in sheet and nothing changes', async ({ page }) => {
    await page.goto(url('/restaurant/bella-roma'))
    const followers = stat(page, 'followers')
    await expect(followers).toBeVisible()
    const before = await followers.innerText()
    await page.getByRole('button', { name: 'Follow', exact: true }).click()
    await expect(page.getByRole('button', { name: /continue with email/i }).first()).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: /continue with email/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Follow', exact: true })).toBeVisible()
    await expect(followers).toHaveText(before)
  })

  test('Follow / Unfollow changes the follower count and persists across a reload', async ({ page, browser }, testInfo) => {
    test.skip(F.missing('emptyGuest'), 'kitchen.sakura not found in docs/REVIEW-ACCOUNTS.md')
    const g = await openAs(browser, testInfo, F.accounts.emptyGuest())
    const uid = g.session.user.id
    const rows = async () => (await F.req(page, g, 'GET', `user_follows?user_id=eq.${uid}&restaurant_id=eq.${SAKURA}&select=id`)).rows
    const count = async () => followerCount(await anonApi(page), SAKURA)   // public count (RPC), not the guest's own rows
    const p = g.page
    try {
      for (const r of await rows()) await F.req(page, g, 'DELETE', `user_follows?id=eq.${r.id}`)
      const c0 = await count()
      await p.goto(url('/restaurant/sakura-house'))
      await expect(stat(p, 'followers')).toHaveText(String(c0))
      await p.getByRole('button', { name: 'Follow', exact: true }).click()
      await expect(p.getByRole('button', { name: /Following/ })).toBeVisible()
      await expect(stat(p, 'followers')).toHaveText(String(c0 + 1))
      await expect.poll(async () => (await rows()).length, 'the follow row is saved').toBe(1)
      await p.reload()
      await expect(p.getByRole('button', { name: /Following/ })).toBeVisible()
      await expect(stat(p, 'followers')).toHaveText(String(c0 + 1))

      await p.getByRole('button', { name: /Following/ }).click()
      await expect(p.getByRole('button', { name: 'Follow', exact: true })).toBeVisible()
      await expect(stat(p, 'followers')).toHaveText(String(c0))
      await expect.poll(async () => (await rows()).length, 'the follow row is removed').toBe(0)
      await p.reload()
      await expect(p.getByRole('button', { name: 'Follow', exact: true })).toBeVisible()
      await expect(stat(p, 'followers')).toHaveText(String(c0))
    } finally {
      for (const r of await rows()) await F.req(page, g, 'DELETE', `user_follows?id=eq.${r.id}`)
      await g.close()
    }
  })

  test('menu sections: chips and headings follow the menu, a chip jumps to its section, the chip row scrolls sideways on a phone', async ({ page, isMobile }) => {
    const api = await anonApi(page)
    const menu = (await api.rpc('restaurant_menu', { p_slug: 'bella-roma' })).body
    const sections = menu.sections.filter(s => s.dishes.length)
    expect(sections.length, 'Bella Roma has several sections').toBeGreaterThan(1)
    await R.gotoMenu(page, 'bella-roma')
    const chips = page.locator('.mn-chip')
    await expect(chips, 'one chip per printed section, in order').toHaveText(sections.map(s => s.name))
    await expect(page.locator('.mn-sec-title')).toHaveText(sections.map(s => s.name))
    for (const [i, s] of sections.entries()) await expect(page.locator('.mn-sec').nth(i).locator('.mn-row'), `dishes under ${s.name}`).toHaveCount(s.dishes.length)
    const last = chips.last()
    await last.scrollIntoViewIfNeeded()
    await last.click()
    await expect(page.locator('.mn-sec-title').last(), 'the last section is on screen after its chip is tapped').toBeInViewport()
    if (isMobile) {
      const strip = page.locator('.mn-chips')
      const dims = await strip.evaluate(el => ({ sw: el.scrollWidth, cw: el.clientWidth, left: el.scrollLeft }))
      expect(dims.sw, 'the chip row scrolls sideways on a phone').toBeGreaterThan(dims.cw)
      await expect.poll(() => strip.evaluate(el => el.scrollLeft), 'the row followed the jump to the last chip').toBeGreaterThan(0)
    }
  })

  test('menu search and dietary tags: they show their counts, combine, and Clear resets', async ({ page }) => {
    const dishes = await dishRows(await anonApi(page), BELLA)
    await R.gotoMenu(page, 'bella-roma')
    await expect(tiles(page)).toHaveCount(dishes.length)
    const diets = page.getByRole('group', { name: 'Dietary filters' })
    const vegan = dishes.filter(d => d.is_vegan).length
    const veg = dishes.filter(d => d.is_vegetarian).length
    await expect(diets.getByRole('button', { name: new RegExp(`Vegan\\s*${vegan}$`) })).toBeVisible()
    await expect(diets.getByRole('button', { name: new RegExp(`Vegetarian\\s*${veg}$`) })).toBeVisible()
    await diets.getByRole('button', { name: /Vegetarian/ }).click()
    await expect(tiles(page)).toHaveCount(veg)
    await diets.getByRole('button', { name: /Vegan/ }).click()
    await expect(tiles(page), 'Vegan + Vegetarian together').toHaveCount(dishes.filter(d => d.is_vegan && d.is_vegetarian).length)
    await diets.getByRole('button', { name: 'Clear', exact: true }).click()
    await expect(tiles(page)).toHaveCount(dishes.length)
    const search = page.getByRole('searchbox', { name: 'Search the menu' })
    await search.fill('zzzzqq')
    await expect(page.getByText('Nothing matches')).toBeVisible()
    await expect(tiles(page)).toHaveCount(0)
    await search.fill('')
    await expect(tiles(page)).toHaveCount(dishes.length)
  })

  test('the menu is a printed list, not a photo grid: a row per dish with its price, sold-out dishes tagged, no grid / list toggle', async ({ page }) => {
    const dishes = await dishRows(await anonApi(page), BELLA)
    await R.gotoMenu(page, 'bella-roma')
    await expect(tiles(page)).toHaveCount(dishes.length)
    await expect(page.locator('.menu-card'), 'the old dish grid is gone').toHaveCount(0)
    await expect(page.getByRole('button', { name: /^(grid|list)( view)?$/i }), 'no grid / list toggle').toHaveCount(0)
    for (const d of dishes.slice(0, 6)) {
      const row = R.byId(page, d.id)
      await expect(row.locator('.mn-price'), `${d.name}: price`).toHaveText(money(d.price))
      await expect(row.locator('.mn-tag--sold'), `${d.name}: Sold out tag`).toHaveCount(d.available ? 0 : 1)
    }
  })

  test('dish sheet for a guest: price, description, ingredients, allergens request, reviews list, footer', async ({ page, watch }) => {
    const api = await anonApi(page)
    const dishes = await dishRows(api, BELLA)
    const ing = await api.get(`dish_ingredients?select=dish_id,ingredients(name)&dish_id=in.(${dishes.map(d => d.id).join(',')})`)
    const withIng = dishes.find(d => d.available && ing.some(i => i.dish_id === d.id))
    const withReviews = [...dishes].sort((a, b) => b.review_count - a.review_count)[0]
    const soldOut = dishes.find(d => !d.available)
    const allergenCalls = []
    page.on('response', r => { if (/\/rest\/v1\/dish_allergens/.test(r.url())) allergenCalls.push(r.status()) })
    await R.gotoMenu(page, 'bella-roma')
    const open = async d => { await R.rowOpen(R.byId(page, d.id)).click(); await expect(sheet(page)).toBeVisible(); await expect(sheet(page).locator('.dds-name')).toHaveText(d.name) }
    const close = async () => { await page.keyboard.press('Escape'); await U.noSheet(page) }

    await test.step('ingredients (visible to guests), price, the not-seated footer', async () => {
      expect(withIng, 'a dish with ingredients').toBeTruthy()
      await open(withIng)
      await expect(sheet(page)).toContainText(withIng.name)
      await expect(sheet(page).locator('.dds-price')).toHaveText(money(withIng.price))
      await expect(sheet(page).getByRole('button', { name: 'Scan QR to order' }), 'a guest who is not seated cannot order: the footer asks for the table QR').toBeVisible()
      const names = ing.filter(i => i.dish_id === withIng.id).map(i => i.ingredients.name)
      await sheet(page).getByRole('button', { name: /Ingredients & allergens/ }).click()
      for (const n of names) await expect(sheet(page)).toContainText(n)
      await close()
    })
    await test.step('allergens are readable by an anonymous guest (dish_allergens answers 200)', async () => {
      expect(allergenCalls.length, 'the sheet asked for dish_allergens').toBeGreaterThan(0)
      expect(allergenCalls.every(s => s === 200), `dish_allergens statuses ${allergenCalls}`).toBe(true)
      const rows = await api.get(`dish_allergens?dish_id=eq.${withIng.id}&select=allergen`)
      test.info().annotations.push({ type: 'allergens', description: `${rows.length} allergen row(s) for ${withIng.name}; dish_allergens on the preview has ${(await api.get('dish_allergens?select=dish_id&limit=5')).length >= 1 ? 'data' : 'no rows at all'}` })
      if (rows.length) {
        await open(withIng)
        await sheet(page).getByRole('button', { name: /Ingredients & allergens/ }).click()
        await expect(sheet(page).getByText('Allergens')).toBeVisible()
        for (const r of rows) await expect(sheet(page)).toContainText(new RegExp(r.allergen, 'i'))
        await close()
      }
    })
    await test.step('reviews: header with the average and the count, the first three rows, "See all N reviews"', async () => {
      expect(withReviews.review_count, 'a dish with reviews').toBeGreaterThan(0)
      const reviews = await api.get(`reviews?dish_id=eq.${withReviews.id}&is_flagged=eq.false&select=id`)
      expect(withReviews.review_count, 'dishes.review_count matches the review rows').toBe(reviews.length)
      await open(withReviews)
      await expect(sheet(page).locator('.rv-sec-title')).toContainText(`· ${reviews.length}`)
      await expect(sheet(page).locator('article.rv')).toHaveCount(Math.min(3, reviews.length))
      for (const n of await sheet(page).locator('article.rv .rv-name').allInnerTexts()) expect(n.trim(), 'a real author name, never Anonymous').not.toMatch(/^(Anonymous|Rufesto guest)$/)
      if (reviews.length > 3) {
        await sheet(page).getByRole('button', { name: new RegExp(`See all ${reviews.length} reviews`) }).click()
        const all = page.locator('.bs-root[data-state="open"] .bs-panel').filter({ has: page.locator('.rv-list') })
        await expect(all.locator('article.rv').nth(Math.min(30, reviews.length) - 1)).toBeVisible()
        await expect(all.locator('article.rv')).toHaveCount(Math.min(30, reviews.length))
        await page.keyboard.press('Escape')
        // wait until the closed sheet has left the DOM (its history entry is popped by then): a second Escape pressed in the middle of that is lost
        await expect.poll(() => U.anySheet(page).count(), 'the reviews sheet is gone, the dish sheet stays').toBe(1)
        await expect(U.openSheets(page)).toHaveCount(1)
      } else {
        await expect(sheet(page).getByRole('button', { name: /See all/ })).toHaveCount(0)
        test.info().annotations.push({ type: 'note', description: `the busiest dish has only ${reviews.length} reviews: "See all" cannot be exercised` })
      }
      await close()
    })
    await test.step('a sold-out dish says so and offers no order button', async () => {
      if (!soldOut) return test.info().annotations.push({ type: 'note', description: 'no sold-out dish on Bella Roma right now' })
      await open(soldOut)
      await expect(sheet(page)).toContainText(/sold out/i)
      await expect(sheet(page).getByRole('button', { name: 'Scan QR to order' })).toHaveCount(0)
      await expect(sheet(page).locator('.dds-soldnote')).toHaveText('Sold out today')
      await close()
    })
    noErrors(watch)
  })
})

/* ============================================================ FLOOR PLAN */

test.describe('floor plan sheet', { tag: ['@anon', '@consumer', '@feat'] }, () => {
  const floor = p => p.getByRole('dialog', { name: 'Floor plan' })
  const tableBtn = (p, n) => floor(p).getByRole('button', { name: new RegExp(`^Table ${n},`) })
  const openFloor = async p => {
    await p.goto(url('/restaurant/bella-roma'))
    await p.getByRole('button', { name: 'Floor plan' }).click()
    await expect(floor(p)).toBeVisible()
    await expect(floor(p).getByRole('group', { name: /Pixel floor plan/ })).toBeVisible()
  }

  test('opens with the title, the LIVE badge, sections, legend and every table of the restaurant', async ({ page, watch }) => {
    const api = await anonApi(page)
    const tables = await api.get(`tables?restaurant_id=eq.${BELLA}&select=table_number,capacity,state,is_active`)
    await openFloor(page)
    await expect(floor(page).getByRole('heading', { name: 'Floor plan' })).toBeVisible()
    await expect(floor(page).getByText('Trattoria Bella Roma · live seats')).toBeVisible()
    await expect(floor(page).getByText('Live', { exact: true }), 'LIVE badge once the realtime channel is up').toBeVisible({ timeout: 15_000 })
    await expect(floor(page).getByRole('button', { name: /^Table T\d/ })).toHaveCount(tables.filter(t => t.is_active).length)
    for (const t of tables.filter(t => t.is_active)) await expect(tableBtn(page, t.table_number)).toBeVisible()
    const legend = floor(page).getByRole('list', { name: 'Legend' })
    await expect(legend).toContainText('Free seat')
    await expect(legend).toContainText('Taken seat')
    if (tables.some(t => t.state === 'free')) await expect(legend).toContainText('Free')
    await expect(floor(page).getByText('Tap a table to see its seats')).toBeVisible()
    noErrors(watch)
  })

  test('section chips filter the tables', async ({ page }) => {
    const api = await anonApi(page)
    const [sections, tables] = await Promise.all([
      api.get(`sections?restaurant_id=eq.${BELLA}&select=id,name`),
      api.get(`tables?restaurant_id=eq.${BELLA}&select=table_number,section_id,is_active`),
    ])
    await openFloor(page)
    const group = floor(page).getByRole('group', { name: 'Sections' })
    await expect(group.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true')
    expect(sections.length, 'sections of Bella Roma').toBeGreaterThan(1)
    for (const s of sections) {
      await group.getByRole('button', { name: s.name }).click()
      await expect(group.getByRole('button', { name: s.name })).toHaveAttribute('aria-pressed', 'true')
      await expect(floor(page).getByRole('button', { name: /^Table T\d/ }), `tables in ${s.name}`).toHaveCount(tables.filter(t => t.section_id === s.id && t.is_active).length)
    }
    await group.getByRole('button', { name: 'All' }).click()
    await expect(floor(page).getByRole('button', { name: /^Table T\d/ })).toHaveCount(tables.filter(t => t.is_active).length)
  })

  test('tapping a table opens its seats sheet; a free table offers "Reserve this table"', async ({ page }) => {
    const tables = await (await anonApi(page)).get(`tables?restaurant_id=eq.${BELLA}&select=table_number,capacity,state&order=table_number`)
    const free = tables.find(t => t.state === 'free')
    const other = tables.find(t => t.state !== 'free')
    await openFloor(page)
    // other QA runs change table states while this runs, so the expectations follow the state the sheet itself reports
    const stateOf = async n => {
      await tableBtn(page, n).click()
      const d = floor(page).getByRole('region', { name: `Table ${n}` })
      await expect(d).toBeVisible()
      return { d, pill: (await d.locator('.fl-pill').innerText()).trim() }
    }
    const f = await stateOf(free.table_number)
    await expect(f.d.getByRole('list', { name: 'Seats' }).getByRole('listitem')).toHaveCount(free.capacity)
    if (f.pill === 'Free') {
      await expect(f.d).toContainText(`${free.capacity} of ${free.capacity} seats free`)
      await expect(f.d).toContainText('Scan the QR on your chair to sit here')   // guests sit by scanning a chair QR, not from here
      await expect(floor(page).getByRole('button', { name: 'Reserve this table' })).toBeVisible()
    } else test.info().annotations.push({ type: 'note', description: `${free.table_number} changed to ${f.pill} while the test ran` })
    if (other) {
      const o = await stateOf(other.table_number)
      await expect.poll(async () => {
        const pill = (await o.d.locator('.fl-pill').innerText()).trim()
        const reserve = await floor(page).getByRole('button', { name: 'Reserve this table' }).count()
        return pill === 'Free' ? reserve === 1 : reserve === 0
      }, 'the Reserve button belongs to free tables only').toBe(true)
    }
    await floor(page).getByRole('button', { name: 'Close table details' }).click()
    await expect(floor(page).getByText('Tap a table to see its seats')).toBeVisible()
    if (f.pill === 'Free') {
      await tableBtn(page, free.table_number).click()
      await floor(page).getByRole('button', { name: 'Reserve this table' }).click()
      await expect(page, 'the picked table travels as ?table=<id>').toHaveURL(u => u.pathname === '/book/bella-roma' && /^[0-9a-f-]{36}$/.test(u.searchParams.get('table') || ''))
    }
  })

  test('"Reserve this table" carries the chosen table into the booking flow', async ({ page }) => {
    const tables = await (await anonApi(page)).get(`tables?restaurant_id=eq.${BELLA}&select=id,table_number,state&order=table_number`)
    const free = tables.find(t => t.state === 'free')
    await openFloor(page)
    await tableBtn(page, free.table_number).click()
    await floor(page).getByRole('button', { name: 'Reserve this table' }).click()
    await expect(page, 'the picked table travels as ?table=<id>').toHaveURL(url(`/book/bella-roma?table=${free.id}`))
    await expect(page.getByRole('note').filter({ hasText: 'You picked table' }), `the wizard mentions table ${free.table_number} that the guest picked on the floor plan`).toContainText(`You picked table ${free.table_number}.`)
  })

  test('the sheet closes with the X, Esc and the backdrop', async ({ page }) => {
    for (const how of ['X', 'Esc', 'backdrop']) {
      await openFloor(page)
      if (how === 'X') await floor(page).getByRole('button', { name: 'Close', exact: true }).click()
      else if (how === 'Esc') await page.keyboard.press('Escape')
      else await page.locator('.bs-root[data-state="open"] .bs-scrim').click({ position: { x: 4, y: 4 } })
      await expect(floor(page), `closed by ${how}`).toHaveCount(0)
    }
  })
})

/* ============================================================== AZERBAIJANI */

const AZ = { cookies: [], origins: [{ origin: CONSUMER_URL, localStorage: [{ name: 'rufesto_lang', value: 'az' }] }] }

test.describe('azerbaijani copy', { tag: ['@anon', '@consumer', '@feat'] }, () => {
  test.use({ storageState: AZ })
  const en = (ns, key) => F.locale('en', ns, key)

  /**
   * The page shows each Azerbaijani string and none of the English ones (when they differ), and no raw i18n key.
   * A string counts only when the deployed bundle has it (the preview can lag behind the locale files in the repo).
   */
  async function expectAz(page, strings, label) {
    for (const [ns, key] of strings) {
      const a = await F.azStr(page, ns, key)
      if (!a) { test.info().annotations.push({ type: 'note', description: `${label}: ${ns}:${key} is not in the deployed bundle, skipped` }); continue }
      await expect(page.getByText(a, { exact: false }).or(page.getByPlaceholder(a)).first(), `${label}: "${a}" (${ns}:${key})`).toBeVisible()
      const e = en(ns, key)
      if (e && e !== a && !/[{]/.test(e)) await expect(page.getByText(e, { exact: true }), `${label}: English "${e}" still shown`).toHaveCount(0)
    }
    expect(await rawKeys(page), `${label}: raw i18n keys on the page`).toEqual([])
  }

  test('Home, Search and Map in Azerbaijani', async ({ page, watch }) => {
    await page.goto(url('/'))
    await expectAz(page, [['social', 'home.tab_home'], ['social', 'home.tab_friends']], 'Home')
    await expect(page.getByRole('tab', { name: 'Discover' }).or(page.getByRole('tab', { name: 'Kəşf et' })), 'no Discover tab, in either language').toHaveCount(0)
    await openDiscover(page)
    await expectAz(page, [['search', 'placeholder'], ['search', 'popular'], ['search', 'cuisines'], ['search', 'trending'], ['search', 'topReviews'], ['search', 'allPlaces']], 'Search')
    await expect(page.getByRole('group', { name: /Mətbəx/ }).first(), 'the cuisine chip row').toBeVisible()
    await page.getByRole('searchbox').fill('zzzzqq')
    await expectAz(page, [['search', 'noResultsHint']], 'Search, empty result')
    await page.goto(url('/map'))
    await expect(page.locator('.mp-screen')).toBeVisible()
    await expect(page.locator('li.mp-li').first()).toBeAttached({ timeout: 25_000 })
    await expectAz(page, [['map', 'chipOpen']], 'Map')
    await page.goto(url('/map?place=sakura-house'))
    await expect(page.locator('.mp-card').first()).toBeVisible({ timeout: 25_000 })
    await expectAz(page, [['map', 'menu']], 'Map card')
    noErrors(watch)
  })

  test('Restaurant page, dish sheet and floor plan in Azerbaijani', async ({ page, watch }) => {
    await page.goto(url('/restaurant/bella-roma'))
    await expect(R.tabBtn(page, 'Posts').or(R.tabBtn(page, 'Paylaşımlar'))).toBeVisible()
    await expectAz(page, [['restaurant', 'statFollowers'], ['restaurant', 'statReviews'], ['restaurant', 'follow'], ['bookings', 'reserve'], ['restaurant', 'tabs.posts'], ['restaurant', 'tabs.menu']], 'Restaurant')
    await expect(page.getByText(/Açıqdır|Bağlıdır/).first(), 'open / closed state').toBeVisible()
    // the order prompt only shows for an available dish, and the first card may be sold out right now: open an available one
    const [open] = await (await anonApi(page)).get(`dishes?restaurant_id=eq.${BELLA}&available=eq.true&select=id,name&order=name.asc&limit=1`)
    test.skip(!open, 'Trattoria Bella Roma has no available dish right now')
    await R.tabBtn(page, 'Menyu').click()
    await expect(R.rows(page).first()).toBeVisible()
    await R.rowOpen(R.byId(page, open.id)).click()
    await expectAz(page, [['restaurant', 'dish.scanToOrder'], ['menu', 'dish.reserve'], ['menu', 'dish.share']], 'Dish sheet')
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Zal planı' }).click()
    await expect(page.getByRole('dialog', { name: 'Zal planı' })).toBeVisible()
    await expectAz(page, [['floor', 'hint'], ['floor', 'sectionAll'], ['floor', 'seatFree']], 'Floor plan')
    await expect(page.getByText(/Canlı/).first(), 'LIVE badge in Azerbaijani').toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: /^Masa T\d/ }).first().click()
    await expect(page.getByText(/boş|yer/).first()).toBeVisible()
    expect(await rawKeys(page), 'Floor plan table detail: raw keys').toEqual([])
    noErrors(watch)
  })

  test('booking wizard in Azerbaijani: labels, day chips and slot hints', async ({ page, watch }) => {
    await page.goto(url('/book/bella-roma'))
    await expect(page.locator('.bk-day').first()).toBeVisible()
    await expectAz(page, [['bookings', 'wizard.title'], ['bookings', 'wizard.pickDate'], ['bookings', 'wizard.partySize'], ['bookings', 'wizard.pickTime'], ['bookings', 'wizard.today']], 'Wizard')
    const labels = await page.locator('.bk-day').evaluateAll(els => els.map(e => e.getAttribute('aria-label')))
    expect(labels.length, 'day chips').toBe(30)
    for (const l of labels) {
      expect(l, 'Azerbaijani day chip label').toMatch(/(bazar|çərşənbə|cümə|şənbə)/)
      expect(l, 'no English month / "M10"-style garbage').not.toMatch(/\b(January|February|March|April|May|June|July|August|September|October|November|December|M\d+)\b/)
    }
    await page.locator('.bk-day').nth(3).click()
    await page.locator('.slot-btn, .bk-slot-empty').first().waitFor()
    expect(await rawKeys(page), 'Wizard: raw keys').toEqual([])
    noErrors(watch)
  })

  test('signed-out Profile, Notifications, Table and Friends in Azerbaijani', async ({ page, watch }) => {
    for (const route of ['/profile', '/notifications', '/table', '/friends']) {
      await page.goto(url(route))
      await expect(page.getByRole('button').first()).toBeVisible()
      await page.waitForTimeout(500)
      await expectAz(page, [['auth', 'signIn']].filter(() => route !== '/table'), route)
      await expect(page.getByRole('button', { name: 'Sign in', exact: true }), `${route}: English "Sign in"`).toHaveCount(0)
      expect(await rawKeys(page), `${route}: raw keys`).toEqual([])
    }
    noErrors(watch)
  })

  // Static: every English string that the deployed app ships has an Azerbaijani one with the same {{placeholders}}.
  test('locale files: every deployed English key exists in Azerbaijani with the same placeholders', async ({ page }) => {
    const missingKeys = []
    const badPlaceholders = []
    const untranslated = []
    const base = k => k.replace(/_(one|other|zero|few|many)$/, '')
    for (const ns of F.localeNamespaces()) {
      const e = Object.fromEntries(F.flatten(F.readLocale('en', ns)))
      let a = {}
      try { a = Object.fromEntries(F.flatten(F.readLocale('az', ns))) } catch { missingKeys.push(`${ns}.json (whole file)`); continue }
      for (const [k, v] of Object.entries(e)) {
        if (!(await F.deployed(page, v))) continue   // not shipped yet
        const sameKey = k in a ? k : Object.keys(a).find(x => base(x) === base(k))
        if (!sameKey) { missingKeys.push(`${ns}:${k}`); continue }
        const av = a[sameKey]
        const ph = s => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(m => m[1]).sort().join(',')
        if (ph(v) !== ph(av)) badPlaceholders.push(`${ns}:${k} en{${ph(v)}} az{${ph(av)}}`)
        if (v === av && /[a-z]{4,}\s+[a-z]{3,}/.test(v)) untranslated.push(`${ns}:${k} = "${v}"`)   // lower-case words: skips "DEMO CARD •••• 4242"-style literals
      }
    }
    test.info().annotations.push({ type: 'untranslated', description: `${untranslated.length} English-looking strings identical in az: ${untranslated.slice(0, 12).join(' | ')}` })
    expect(missingKeys, 'keys missing in az').toEqual([])
    expect(badPlaceholders, 'placeholder mismatch').toEqual([])
    expect(untranslated, 'sentences left in English in the az files').toEqual([])
  })
})

/* ============================================================ SIGNED-OUT GATES */

test.describe('signed-out gates', { tag: ['@anon', '@consumer', '@feat'] }, () => {
  const ROUTES = [
    ['/profile', /sign in/i], ['/notifications', /sign in/i], ['/friends', /sign in/i], ['/post/new', /sign in/i],
    ['/bookings/00000000-0000-4000-8000-000000000000', /sign in to see this booking/i], ['/bill', /sign in/i],
  ]
  for (const [route, text] of ROUTES) {
    test(`${route} asks a signed-out visitor to sign in (no blank page, no errors)`, async ({ page, watch }) => {
      await page.goto(url(route))
      await expect(page.getByText(text).first(), `${route}: a sign-in prompt`).toBeVisible()
      await expect(page.getByRole('button', { name: /sign in|continue with email/i }).first()).toBeVisible()
      expect(await rawKeys(page), 'raw keys').toEqual([])
      noErrors(watch)
    })
  }

  // No catch-all <Route>: a mistyped or truncated link leaves #root empty.
  test('an unknown URL or a truncated invite link shows a page, not a blank screen', async ({ page }) => {
    const blank = []
    for (const route of ['/definitely-not-a-page', '/b/', '/book/', '/bookings/']) {
      await page.goto(url(route))
      await page.waitForTimeout(800)
      if (!((await page.locator('#root').innerText()).trim().length)) blank.push(route)
    }
    expect(blank, 'routes that render a blank page').toEqual([])
  })

  test('/table: entering a code while signed out opens the sign-in sheet', async ({ page }) => {
    await page.goto(url('/table'))
    const field = page.getByPlaceholder(/BELLA-T2/)
    await field.fill('BELLA-XXXXXX')
    await field.press('Enter')
    await expect(page.getByRole('button', { name: /continue with email/i }).first()).toBeVisible()
  })

  test('Reserve: the wizard needs a session only at the confirm step, and a bad invite code is explained signed out', async ({ page }) => {
    await page.goto(url('/restaurant/bella-roma'))
    await page.getByRole('link', { name: 'Reserve a table' }).click()
    await expect(page).toHaveURL(url('/book/bella-roma'))
    expect(await F.wizardPick(page, { party: 1, fromDay: 1 }), 'a bookable slot in the next days').toBeTruthy()
    await expect(page.getByRole('button', { name: 'Sign in to continue' })).toBeEnabled()
    await page.getByRole('button', { name: 'Sign in to continue' }).click()
    await expect(page.getByRole('button', { name: /continue with email/i }).first()).toBeVisible()
    await page.goto(url('/b/NOSUCHCODE'))
    await expect(page.getByText("This invite isn't valid anymore")).toBeVisible()
  })
})
