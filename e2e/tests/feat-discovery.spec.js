// Consumer discovery features, one test per feature, desktop and the `mobile` project: Home Discover feed (reviews,
// restaurant posts, promoted campaigns + track_campaign), Explore (search, filters, dish sheet), Map (markers, chips,
// popup, geolocation), Restaurant page (hero, stats, hours, Follow, menu chips, dietary filters, dish sheet, floor
// plan), Azerbaijani copy and the signed-out gates. Expected values are read from the preview database (public REST)
// and compared with what the page shows. Findings: docs/qa/consumer-bookings.md.
// Writes (all undone in `finally`): Follow on Bella Roma and a like on a restaurant post (kitchen.sakura), and the seeded
// Bella Roma campaign's run window (QA manager) for the promo test.
const { test, expect, settle } = require('../support/fixtures')
const { CONSUMER_URL } = require('../support/env')
const F = require('../support/feat-bookings')
const { openAs } = F

const { url, BELLA, anonApi, bakuClock, hm, rawKeys } = F
const NAMES = { 'bella-roma': 'Trattoria Bella Roma', 'seda-ocagi': 'Səda Ocağı', 'sakura-house': 'Sakura House' }
const SLUGS = Object.keys(NAMES)
const money = n => `₼${Number(n).toFixed(2)}`
const heading1 = p => p.getByRole('heading', { level: 1 })

/** Is a restaurant with these operating_hours rows open now (Baku clock, same-day windows)? */
function openNow(hours) {
  const c = bakuClock()
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(c.weekday)
  const row = hours.find(h => h.day_of_week === day && !h.is_closed)
  return !!row && c.minutes >= hm(row.open_time) && c.minutes < hm(row.close_time)
}
const todayRow = hours => hours.find(h => h.day_of_week === ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(bakuClock().weekday))

const sheet = p => p.locator('.overlay .sheet').last()
const noErrors = watch => expect(watch.consoleErrors, 'console errors').toEqual([])

/* ================================================================== HOME */

test.describe('home discover', { tag: ['@anon', '@consumer', '@feat'] }, () => {
  test('Discover feed: stories bar, restaurant posts, review cards, no console errors', async ({ page, watch }) => {
    const api = await anonApi(page)
    const [rests, hours] = await Promise.all([
      api.get('restaurants?select=id,name,slug,seating_capacity,cuisine_type&status=eq.active&order=name'),
      api.get('operating_hours?select=restaurant_id,day_of_week,open_time,close_time,is_closed'),
    ])
    await page.goto(url('/'))
    await expect(page.getByRole('tab', { name: 'Discover' })).toHaveAttribute('aria-selected', 'true')
    const posts = page.locator('article').filter({ has: page.getByRole('link', { name: /view menu/i }) })
    await expect(posts.first()).toBeVisible()
    await settle(page)

    await test.step('stories bar links every active restaurant', async () => {
      const hrefs = await page.locator('a[href^="/restaurant/"]').evaluateAll(as => [...new Set(as.map(a => a.getAttribute('href')))])
      for (const r of rests) expect(hrefs, `story link to ${r.slug}`).toContain(`/restaurant/${r.slug}`)
    })
    await test.step('one restaurant post per active restaurant: name, seats, open state', async () => {
      await expect(posts).toHaveCount(rests.length)
      for (const r of rests) {
        const post = posts.filter({ hasText: r.name })
        await expect(post, `post of ${r.name}`).toHaveCount(1)
        await expect(post.getByText(`${r.seating_capacity} seats`)).toBeVisible()
        const open = openNow(hours.filter(h => h.restaurant_id === r.id))
        await expect(post.locator('.open-indicator'), `${r.name} open indicator (expected open=${open})`).toHaveCount(open ? 1 : 0)
      }
    })
    await test.step('review cards show author, dish and restaurant, stars and text', async () => {
      const reviews = page.locator('article').filter({ hasText: '★' }).filter({ hasNot: page.getByRole('link', { name: /view menu/i }) })
      const n = await reviews.count()
      expect(n, 'review cards in the feed').toBeGreaterThanOrEqual(1)
      expect(n).toBeLessThanOrEqual(20)
      const first = await reviews.first().innerText()
      expect(first).toMatch(/[★☆]{5}/)
      expect(first).toMatch(/·\s*(Trattoria Bella Roma|Səda Ocağı|Sakura House)/)
      expect(first).toMatch(/\d+[mhd] ago|just now/)
    })
    noErrors(watch)
  })

  test('a review card opens its dish sheet; Esc closes it', async ({ page, watch }) => {
    await page.goto(url('/'))
    const review = page.locator('article').filter({ hasText: '★' }).filter({ hasNot: page.getByRole('link', { name: /view menu/i }) }).first()
    await expect(review).toBeVisible()
    const dish = (await review.innerText()).match(/\S+\s+(.+?)\s+·\s+(?:Trattoria|Səda|Sakura)/)?.[1]
    await review.locator('p').first().click()
    await expect(page.locator('.overlay')).toBeVisible()
    if (dish) await expect(sheet(page)).toContainText(dish.split(' ')[0])
    await expect(sheet(page).getByText(/₼\d+\.\d\d/).first()).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.overlay')).toHaveCount(0)
    noErrors(watch)
  })

  test('"View menu →" and a story open the restaurant page', async ({ page }) => {
    await page.goto(url('/'))
    await page.getByRole('link', { name: /view menu/i }).first().click()
    await expect(page).toHaveURL(/\/restaurant\/[\w-]+$/)
    await expect(heading1(page)).toBeVisible()
    await page.goBack()
    await page.locator('a[href="/restaurant/sakura-house"]').first().click()
    await expect(page).toHaveURL(url('/restaurant/sakura-house'))
    await expect(heading1(page)).toHaveText('Sakura House')
  })

  // The seeded campaign of Bella Roma ended in July, so the feed shows no promo. The QA manager opens its run window for
  // the test (a write the dashboard can do) and puts the original window and status back in `finally`.
  test('promoted campaign card: impression + click go through track_campaign and the counters move', async ({ page, browser, watch }, testInfo) => {
    test.skip(!!F.missing('bellaManager'), 'manager.bella not found in docs/REVIEW-ACCOUNTS.md')
    const mgr = await openAs(browser, testInfo, F.accounts.bellaManager())
    let original = null
    try {
      const rows = (await F.req(page, mgr, 'GET', `ad_campaigns?restaurant_id=eq.${BELLA}&select=*&order=created_at`)).rows
      original = rows.find(r => r.dish_id) || rows[0]
      test.skip(!original, 'no campaign on the preview to open (create one in the dashboard Promos page)')
      const open = await F.req(page, mgr, 'PATCH', `ad_campaigns?id=eq.${original.id}`, {
        status: 'active', starts_at: new Date(Date.now() - 3_600_000).toISOString(), ends_at: new Date(Date.now() + 3_600_000).toISOString(),
      })
      expect(open.ok, `manager opens the campaign window: ${JSON.stringify(open.body).slice(0, 160)}`).toBe(true)
      const counters = async () => (await F.req(page, mgr, 'GET', `ad_campaigns?id=eq.${original.id}&select=impressions,clicks`)).rows[0]
      const before = await counters()

      const tracked = []
      page.on('request', r => { if (/rpc\/track_campaign/.test(r.url())) tracked.push(r.postDataJSON()) })
      await page.goto(url('/'))
      const promo = page.locator('article').filter({ hasText: /promoted/i })
      await expect(promo, 'a Promoted card in the feed').toHaveCount(1)
      await expect(promo).toContainText(/sponsored/i)
      await expect(promo).toContainText(original.title || original.name)
      await expect.poll(() => tracked.filter(t => t.p_event === 'impression' && t.p_campaign_id === original.id).length, 'one impression call').toBe(1)

      await promo.click()
      await expect.poll(() => tracked.filter(t => t.p_event === 'click' && t.p_campaign_id === original.id).length, 'one click call').toBe(1)
      await expect(page.locator('.overlay')).toBeVisible()   // the promoted dish sheet
      await page.keyboard.press('Escape')
      // other visitors (parallel tests) also count as impressions, so only a lower bound; the click is ours alone
      await expect.poll(async () => { const a = await counters(); return [a.impressions - before.impressions >= 1, a.clicks - before.clicks] }, 'campaign counters').toEqual([true, 1])
      noErrors(watch)
    } finally {
      if (original) {
        await F.req(page, mgr, 'PATCH', `ad_campaigns?id=eq.${original.id}`, { status: original.status, starts_at: original.starts_at, ends_at: original.ends_at })
      }
      await mgr.close()
    }
  })

  test('liking a restaurant post persists for a signed-in guest and is undone', async ({ page, browser }, testInfo) => {
    test.skip(F.missing('emptyGuest'), 'kitchen.sakura not found in docs/REVIEW-ACCOUNTS.md')
    const g = await openAs(browser, testInfo, F.accounts.emptyGuest())
    const uid = g.session.user.id
    const likes = async () => (await F.req(page, g, 'GET', `likes?user_id=eq.${uid}&target_type=eq.restaurant&select=id,target_id`)).rows
    try {
      for (const l of await likes()) await F.req(page, g, 'DELETE', `likes?id=eq.${l.id}`)
      await g.page.goto(url('/'))
      const post = g.page.locator('article').filter({ has: g.page.getByRole('link', { name: /view menu/i }) }).first()
      await expect(post).toBeVisible()
      await post.locator('button.icon-btn').nth(1).click()   // icon buttons of a post: options (header), like, save
      await expect.poll(async () => (await likes()).length, 'a restaurant like row').toBe(1)
      await g.page.reload()
      await expect(g.page.locator('article').filter({ has: g.page.getByRole('link', { name: /view menu/i }) }).first()).toBeVisible()
      await expect(g.page.getByText(/^1 like/).first(), 'the like count shows 1 after reload').toBeVisible()
    } finally {
      for (const l of await likes()) await F.req(page, g, 'DELETE', `likes?id=eq.${l.id}`)
      await g.close()
    }
  })
})

/* ================================================================ EXPLORE */

test.describe('explore', { tag: ['@anon', '@consumer', '@feat'] }, () => {
  const DISH_SELECT = 'dishes?select=id,name,price,available,is_vegan,is_vegetarian,is_gluten_free,is_spicy,review_count,restaurants!inner(name,slug)&order=review_count.desc&limit=100'
  const cards = p => p.locator('.stagger-item')
  const pill = (p, name) => p.getByRole('button', { name, exact: true })

  test('the dish grid lists the public dishes with name, restaurant and price', async ({ page, watch }) => {
    const dishes = await (await anonApi(page)).get(DISH_SELECT)
    expect(dishes.length, 'dishes on the preview').toBeGreaterThan(10)
    await page.goto(url('/explore'))
    await expect(cards(page).first()).toBeVisible()
    await settle(page)
    await expect(cards(page)).toHaveCount(dishes.length)
    const sample = dishes[0]
    const card = cards(page).filter({ hasText: sample.name }).first()
    await expect(card).toContainText(sample.restaurants.name)
    await expect(card).toContainText(money(sample.price))
    noErrors(watch)
  })

  test('search matches dish names and restaurant names, ignores case, and explains an empty result', async ({ page }) => {
    const dishes = await (await anonApi(page)).get(DISH_SELECT)
    await page.goto(url('/explore'))
    const search = page.getByPlaceholder('Dishes, restaurants…')
    await expect(cards(page).first()).toBeVisible()
    const byDish = dishes.filter(d => d.name.toLowerCase().includes('carbonara')).length
    await search.fill('CARBONARA')
    await expect(cards(page)).toHaveCount(byDish)
    await search.fill('sakura')
    await expect(cards(page)).toHaveCount(dishes.filter(d => d.restaurants.name.toLowerCase().includes('sakura')).length)
    for (const c of await cards(page).all()) await expect(c).toContainText('Sakura House')
    await search.fill('zzzzqq')
    await expect(page.getByText('Nothing found')).toBeVisible()
    await expect(page.getByText('Try a different search or filter')).toBeVisible()
    await search.fill('')
    await expect(cards(page)).toHaveCount(dishes.length)
  })

  test('every filter chip filters like the data says (All, Available, Vegan, Veggie, Gluten-free, Spicy)', async ({ page }) => {
    const dishes = await (await anonApi(page)).get(DISH_SELECT)
    await page.goto(url('/explore'))
    await expect(cards(page).first()).toBeVisible()
    const expected = {
      All: dishes.length,
      Available: dishes.filter(d => d.available).length,
      Vegan: dishes.filter(d => d.is_vegan).length,
      Veggie: dishes.filter(d => d.is_vegetarian).length,
      'Gluten-free': dishes.filter(d => d.is_gluten_free).length,
      Spicy: dishes.filter(d => d.is_spicy).length,
    }
    for (const [name, count] of Object.entries(expected)) {
      await pill(page, name).click()
      await expect(pill(page, name)).toHaveAttribute('aria-pressed', 'true')
      if (count === 0) await expect(page.getByText('Nothing found'), `${name}: no dish, so the empty state`).toBeVisible()
      else await expect(cards(page), `cards for the ${name} chip`).toHaveCount(count)
      for (const other of Object.keys(expected).filter(n => n !== name)) await expect(pill(page, other)).toHaveAttribute('aria-pressed', 'false')
    }
    await pill(page, 'Available').click()
    await expect(cards(page).filter({ hasText: /sold out/i }), 'sold-out dishes under the Available chip').toHaveCount(0)
    await page.getByPlaceholder('Dishes, restaurants…').fill('zzzzqq')   // a filter chip keeps working with a search on
    await expect(page.getByText('Nothing found')).toBeVisible()
    await page.getByPlaceholder('Dishes, restaurants…').fill('')
    await pill(page, 'All').click()
    await expect(cards(page)).toHaveCount(dishes.length)
  })

  test('there is no sort control on Explore (documented): dishes come ordered by review count', async ({ page }) => {
    const dishes = await (await anonApi(page)).get(DISH_SELECT)
    await page.goto(url('/explore'))
    await expect(cards(page).first()).toBeVisible()
    await expect(page.getByRole('combobox')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /sort/i })).toHaveCount(0)
    await expect(cards(page).first()).toContainText(dishes[0].name)
  })

  test('dish sheet opens from a card and closes with the X, with Esc and by tapping the backdrop', async ({ page, watch }) => {
    await page.goto(url('/explore'))
    await expect(cards(page).first()).toBeVisible()
    const first = cards(page).first()
    const name = (await first.locator('div').filter({ hasText: /^[^\n]+$/ }).first().innerText()).split('\n')[0]
    for (const how of ['X button', 'Esc', 'backdrop']) {
      await first.click()
      await expect(page.locator('.overlay')).toBeVisible()
      await expect(sheet(page).getByText(/₼\d+\.\d\d/).first()).toBeVisible()
      if (how === 'X button') await sheet(page).getByRole('button', { name: 'Close' }).click()
      else if (how === 'Esc') await page.keyboard.press('Escape')
      else await page.locator('.overlay').click({ position: { x: 4, y: 4 } })
      await expect(page.locator('.overlay'), `dish sheet closed by ${how}`).toHaveCount(0)
    }
    expect(name.length).toBeGreaterThan(0)
    noErrors(watch)
  })

  // The Explore dish sheet only names the restaurant; neither the card nor the sheet leads to its menu.
  test('a dish opened from Explore leads to its restaurant ("View menu")', async ({ page }) => {
    await page.goto(url('/explore'))
    await expect(cards(page).first()).toBeVisible()
    await cards(page).first().click()
    await expect(page.locator('.overlay')).toBeVisible()
    const link = page.locator('.overlay, .stagger-item').getByRole('link', { name: /view menu|restaurant|visit/i })
    await expect(link, 'a link to the restaurant in the dish sheet').not.toHaveCount(0)
  })
})

/* ==================================================================== MAP */

test.describe('map', { tag: ['@anon', '@consumer', '@feat'] }, () => {
  const markers = p => p.locator('.leaflet-marker-icon')
  const chip = (p, name) => p.getByRole('button', { name: new RegExp(name) })

  test('the map shows a marker and a chip for each of the three restaurants', async ({ page, watch }) => {
    await page.goto(url('/map'))
    await expect(page.locator('.leaflet-container')).toBeVisible()
    await expect(markers(page)).toHaveCount(3)
    for (const n of Object.values(NAMES)) await expect(chip(page, n)).toBeVisible()
    await expect(page.locator('.map-chip-sub')).toHaveText(['Italian', 'Azerbaijani', 'Japanese'])
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Zoom out' })).toBeVisible()
    await expect.poll(() => page.locator('.leaflet-tile-loaded').count(), 'map tiles loaded').toBeGreaterThan(0)
    noErrors(watch)
  })

  for (const slug of SLUGS) {
    test(`chip ${NAMES[slug]} opens its popup, the popup opens the restaurant`, async ({ page, watch }) => {
      await page.goto(url('/map'))
      await expect(markers(page)).toHaveCount(3)
      await chip(page, NAMES[slug]).click()
      const popup = page.locator('.leaflet-popup')
      await expect(popup).toBeVisible()
      await expect(popup).toContainText(NAMES[slug])
      await expect(chip(page, NAMES[slug])).toHaveClass(/is-selected/)
      await popup.getByRole('link', { name: /view menu/i }).click()
      await expect(page).toHaveURL(url(`/restaurant/${slug}`))
      await expect(heading1(page)).toHaveText(NAMES[slug])
      noErrors(watch)
    })
  }

  test('tapping a marker opens the popup of that restaurant', async ({ page }) => {
    await page.goto(url('/map'))
    await expect(markers(page)).toHaveCount(3)
    await chip(page, 'Sakura House').click()   // centres the map on a restaurant so its marker is on screen
    await page.locator('.leaflet-popup-close-button').click()
    await expect(page.locator('.leaflet-popup')).toHaveCount(0)
    await markers(page).and(page.locator(':has(.map-pin--japanese)')).click()
    await expect(page.locator('.leaflet-popup')).toBeVisible()
  })

  test('geolocation denied: the map still works and a "my location" button explains it', async ({ page, context, watch }) => {
    await context.clearPermissions()
    await page.goto(url('/map'))
    await expect(markers(page)).toHaveCount(3)
    const locate = page.getByRole('button', { name: /my location|locate|near me|geolocat|current location/i })
    expect(await locate.count(), 'a button to centre the map on the guest ("near me")').toBeGreaterThan(0)
    await locate.first().click()
    await expect(page.locator('.leaflet-container')).toBeVisible()
    await expect(page.getByRole('alert').or(page.getByRole('status')), 'a message when location is denied').not.toHaveCount(0)
    noErrors(watch)
  })

  test('the search bar on the map takes input', async ({ page }) => {
    await page.goto(url('/map'))
    await expect(page.locator('.map-search')).toBeVisible()
    await page.locator('.map-search').click()
    await page.keyboard.type('sakura')
    await expect(page.locator('.map-search input, input[placeholder*="near"]'), 'the "Restaurants near you…" bar is a real field').toHaveCount(1)
  })
})

/* ============================================================ RESTAURANT */

test.describe('restaurant page', { tag: ['@anon', '@consumer', '@feat'] }, () => {
  const tiles = p => p.locator('.menu-card')
  const stat = (p, label) => p.getByText(label, { exact: true }).locator('xpath=preceding-sibling::span[1]')
  const dishRows = (api, id) => api.get(`dishes?restaurant_id=eq.${id}&select=id,name,price,available,is_vegan,is_vegetarian,is_gluten_free,is_spicy,review_count,menu_section_id&order=sort_order`)

  for (const slug of SLUGS) {
    test(`hero and stats of ${NAMES[slug]} match the data (dishes, followers, reviews, seats)`, async ({ page, watch }) => {
      const api = await anonApi(page)
      const [rest] = await api.get(`restaurants?slug=eq.${slug}&select=id,name,cuisine_type,address,description`)
      const [dishes, follows, tables] = await Promise.all([
        dishRows(api, rest.id), api.get(`user_follows?restaurant_id=eq.${rest.id}&select=id`), api.get(`tables?restaurant_id=eq.${rest.id}&select=state,capacity`),
      ])
      await page.goto(url(`/restaurant/${slug}`))
      await expect(heading1(page)).toHaveText(rest.name)
      await expect(page.getByText(`${rest.cuisine_type} Restaurant`)).toBeVisible()
      await expect(page.getByText(rest.address, { exact: false }).first()).toBeVisible()
      if (rest.description) await expect(page.getByText(rest.description.slice(0, 40)).first()).toBeVisible()
      await expect(page.locator('img[alt]').or(page.getByText(/[🍝🫕🍣]/)).first()).toBeVisible()   // cover photo or the cuisine emoji
      await expect(stat(page, 'dishes')).toHaveText(String(dishes.length))
      await expect(stat(page, 'followers')).toHaveText(String(follows.length))
      await expect(stat(page, 'reviews')).toHaveText(String(dishes.reduce((s, d) => s + (d.review_count || 0), 0)))
      // tables change state while other QA runs use them: compare with a fresh read each time instead of the first one
      await expect.poll(async () => {
        const now = await api.get(`tables?restaurant_id=eq.${rest.id}&select=state,capacity`)
        const free = now.filter(t => t.state === 'free').reduce((n, t) => n + t.capacity, 0)
        return (await stat(page, 'seats').innerText()) === `${free}/${now.reduce((n, t) => n + t.capacity, 0)}`
      }, 'free seats / total seats on the page equal the tables').toBe(true)
      await expect(tiles(page)).toHaveCount(dishes.length)
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
    const rows = async () => (await F.req(page, g, 'GET', `user_follows?user_id=eq.${uid}&restaurant_id=eq.${BELLA}&select=id`)).rows
    const count = async () => (await F.req(page, g, 'GET', `user_follows?restaurant_id=eq.${BELLA}&select=id`)).rows.length
    const p = g.page
    try {
      for (const r of await rows()) await F.req(page, g, 'DELETE', `user_follows?id=eq.${r.id}`)
      const c0 = await count()
      await p.goto(url('/restaurant/bella-roma'))
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

  test('menu category chips filter the dishes and scroll sideways when they do not fit', async ({ page, isMobile }) => {
    const api = await anonApi(page)
    const dishes = await dishRows(api, BELLA)
    const sections = await api.get(`menu_sections?select=id,name,sort_order,menus!inner(restaurant_id,is_active)&menus.restaurant_id=eq.${BELLA}&menus.is_active=eq.true&order=sort_order`)
    await page.goto(url('/restaurant/bella-roma'))
    await expect(tiles(page)).toHaveCount(dishes.length)
    const strip = page.locator('div.no-scrollbar').filter({ hasText: sections[0].name }).first()
    await expect(strip.getByRole('button')).toHaveCount(sections.length + 1)
    for (const s of sections) {
      const chipBtn = strip.locator('button').filter({ hasText: s.name })
      await chipBtn.scrollIntoViewIfNeeded()
      await chipBtn.click()
      await expect(tiles(page), `dishes under the ${s.name} chip`).toHaveCount(dishes.filter(d => d.menu_section_id === s.id).length)
    }
    if (isMobile) {
      const dims = await strip.evaluate(el => ({ sw: el.scrollWidth, cw: el.clientWidth, left: el.scrollLeft }))
      expect(dims.sw, 'the chip strip scrolls sideways on a phone').toBeGreaterThan(dims.cw)
      expect(dims.left, 'the strip scrolled to reveal the last chip').toBeGreaterThan(0)
    }
    await strip.locator('button').filter({ hasText: 'All' }).click()
    await expect(tiles(page)).toHaveCount(dishes.length)
  })

  test('dietary chips show their counts, combine, and Clear resets', async ({ page }) => {
    const dishes = await dishRows(await anonApi(page), BELLA)
    await page.goto(url('/restaurant/bella-roma'))
    await expect(tiles(page)).toHaveCount(dishes.length)
    const vegan = dishes.filter(d => d.is_vegan).length
    const veg = dishes.filter(d => d.is_vegetarian).length
    await expect(page.getByRole('button', { name: new RegExp(`Vegan\\s*${vegan}$`) })).toBeVisible()
    await expect(page.getByRole('button', { name: new RegExp(`Vegetarian\\s*${veg}$`) })).toBeVisible()
    await page.getByRole('button', { name: /Vegetarian/ }).click()
    await expect(tiles(page)).toHaveCount(veg)
    await page.getByRole('button', { name: /Vegan/ }).click()
    await expect(tiles(page), 'Vegan + Vegetarian together').toHaveCount(dishes.filter(d => d.is_vegan && d.is_vegetarian).length)
    await page.getByRole('button', { name: 'Clear', exact: true }).click()
    await expect(tiles(page)).toHaveCount(dishes.length)
  })

  test('grid and list view show the same dishes; the list adds prices and availability', async ({ page }) => {
    const dishes = await dishRows(await anonApi(page), BELLA)
    await page.goto(url('/restaurant/bella-roma'))
    await expect(tiles(page)).toHaveCount(dishes.length)
    const toggles = page.locator('button.tap-h').filter({ has: page.locator('svg rect, svg line') })
    await toggles.nth(1).click()
    await expect(tiles(page)).toHaveCount(dishes.length)
    const row = tiles(page).filter({ hasText: dishes[0].name }).first()
    await expect(row).toContainText(money(dishes[0].price))
    await expect(row).toContainText(dishes[0].available ? 'Available' : /sold out/i)
  })

  test('dish sheet for a guest: price, description, ingredients, allergens request, reviews list', async ({ page, watch }) => {
    const api = await anonApi(page)
    const dishes = await dishRows(api, BELLA)
    const ing = await api.get(`dish_ingredients?select=dish_id,ingredients(name)&dish_id=in.(${dishes.map(d => d.id).join(',')})`)
    const withIng = dishes.find(d => d.available && ing.some(i => i.dish_id === d.id))
    const withReviews = [...dishes].sort((a, b) => b.review_count - a.review_count)[0]
    const soldOut = dishes.find(d => !d.available)
    const allergenCalls = []
    page.on('response', r => { if (/\/rest\/v1\/dish_allergens/.test(r.url())) allergenCalls.push(r.status()) })
    await page.goto(url('/restaurant/bella-roma'))
    await expect(tiles(page).first()).toBeVisible()
    const open = async d => { await tiles(page).filter({ hasText: d.name }).first().click(); await expect(page.locator('.overlay')).toBeVisible() }
    const close = async () => { await page.keyboard.press('Escape'); await expect(page.locator('.overlay')).toHaveCount(0) }

    await test.step('ingredients (visible to guests), price, table prompt', async () => {
      expect(withIng, 'a dish with ingredients').toBeTruthy()
      await open(withIng)
      await expect(sheet(page)).toContainText(withIng.name)
      await expect(sheet(page)).toContainText(money(withIng.price))
      await expect(sheet(page)).toContainText('Enter a table code on the Table tab to order')   // a guest who is not seated cannot order
      const names = ing.filter(i => i.dish_id === withIng.id).map(i => i.ingredients.name)
      await sheet(page).getByRole('button', { name: new RegExp(`Ingredients \\(${names.length}\\)`) }).click()
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
        await expect(sheet(page).getByText('Allergens')).toBeVisible()
        for (const r of rows) await expect(sheet(page)).toContainText(new RegExp(r.allergen, 'i'))
        await close()
      }
    })
    await test.step('reviews list: count, first three, "View all"', async () => {
      expect(withReviews.review_count, 'a dish with reviews').toBeGreaterThan(0)
      const reviews = await api.get(`reviews?dish_id=eq.${withReviews.id}&is_flagged=eq.false&select=id`)
      await open(withReviews)
      await expect(sheet(page).getByText(`Reviews · ${reviews.length}`)).toBeVisible()
      await expect(sheet(page).getByText(/^[★☆]{5}$/)).toHaveCount(Math.min(3, reviews.length))
      expect(withReviews.review_count, 'dishes.review_count matches the review rows').toBe(reviews.length)
      if (reviews.length > 3) {
        await sheet(page).getByRole('button', { name: new RegExp(`View all ${reviews.length} reviews`) }).click()
        await expect(sheet(page).getByText(/^[★☆]{5}$/)).toHaveCount(Math.min(20, reviews.length))
      } else {
        await expect(sheet(page).getByRole('button', { name: /View all/ })).toHaveCount(0)
        test.info().annotations.push({ type: 'note', description: `the busiest dish has only ${reviews.length} reviews: "View all" cannot be exercised` })
      }
      await close()
    })
    await test.step('a sold-out dish says so and offers no order button', async () => {
      if (!soldOut) return test.info().annotations.push({ type: 'note', description: 'no sold-out dish on Bella Roma right now' })
      await open(soldOut)
      await expect(sheet(page)).toContainText(/sold out/i)
      await expect(sheet(page).getByText('Enter a table code on the Table tab to order')).toHaveCount(0)
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
      await expect(page).toHaveURL(url('/book/bella-roma'))
    }
  })

  test('"Reserve this table" carries the chosen table into the booking flow', async ({ page }) => {
    const tables = await (await anonApi(page)).get(`tables?restaurant_id=eq.${BELLA}&select=table_number,state&order=table_number`)
    const free = tables.find(t => t.state === 'free')
    await openFloor(page)
    await tableBtn(page, free.table_number).click()
    await floor(page).getByRole('button', { name: 'Reserve this table' }).click()
    await expect(page).toHaveURL(url('/book/bella-roma'))
    await expect(page.getByText(new RegExp(`\\b${free.table_number}\\b`)).first(), `the wizard mentions table ${free.table_number} that the guest picked on the floor plan`).toBeVisible()
  })

  test('the sheet closes with the X, Esc and the backdrop', async ({ page }) => {
    for (const how of ['X', 'Esc', 'backdrop']) {
      await openFloor(page)
      if (how === 'X') await floor(page).getByRole('button', { name: 'Close', exact: true }).click()
      else if (how === 'Esc') await page.keyboard.press('Escape')
      else await page.locator('.overlay').click({ position: { x: 4, y: 4 } })
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

  test('Home, Explore and Map in Azerbaijani', async ({ page, watch }) => {
    await page.goto(url('/'))
    await expect(page.getByRole('tab', { name: 'Kəşf et' })).toBeVisible()
    await expectAz(page, [['social', 'home.tab_discover'], ['social', 'home.tab_feed'], ['feed', 'viewMenuArrow']], 'Home')
    await expect(page.getByText(/\d+ yer/).first(), 'seat counts use "yer"').toBeVisible()
    await expect(page.getByText(/(saat|gün|dəq) əvvəl|indicə/).first(), 'time-ago in Azerbaijani').toBeVisible()
    await page.goto(url('/explore'))
    await expectAz(page, [['menu', 'exploreSearchPlaceholder'], ['menu', 'exploreFilterAll'], ['menu', 'exploreFilterAvailable'], ['menu', 'exploreFilterGlutenFree'], ['menu', 'exploreFilterSpicy'], ['common', 'available']], 'Explore')
    await page.locator('input.input').fill('zzzzqq')
    await expectAz(page, [['menu', 'nothingFound'], ['menu', 'tryDifferentSearch']], 'Explore, empty search')
    await page.goto(url('/map'))
    await expect(page.locator('.leaflet-container')).toBeVisible()
    await expectAz(page, [['map', 'searchPlaceholder']], 'Map')
    await page.getByRole('button', { name: /Sakura House/ }).click()
    await expectAz(page, [['map', 'viewMenu']], 'Map popup')
    noErrors(watch)
  })

  test('Restaurant page, dish sheet and floor plan in Azerbaijani', async ({ page, watch }) => {
    await page.goto(url('/restaurant/bella-roma'))
    await expect(page.locator('.menu-card').first()).toBeVisible()
    await expectAz(page, [['restaurant', 'statDishes'], ['restaurant', 'statFollowers'], ['restaurant', 'statReviews'], ['restaurant', 'statSeats'], ['restaurant', 'follow'], ['bookings', 'reserve'], ['restaurant', 'all']], 'Restaurant')
    await expect(page.getByText(/Açıqdır|Bağlıdır/).first(), 'open / closed state').toBeVisible()
    await page.locator('.menu-card').first().click()
    await expectAz(page, [['menu', 'enterTablePrompt']], 'Dish sheet')
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

  test('liking a post while signed out asks to sign in instead of showing a like that vanishes', async ({ page }) => {
    await page.goto(url('/'))
    const post = page.locator('article').filter({ has: page.getByRole('link', { name: /view menu/i }) }).first()
    await expect(post).toBeVisible()
    const likesBefore = await post.getByText(/^\d+ likes?$/).count()
    await post.locator('button.icon-btn').nth(1).click()
    const prompt = await page.getByRole('button', { name: /continue with email/i }).count()
    const fakeLike = (await post.getByText(/^\d+ likes?$/).count()) > likesBefore
    expect(prompt > 0 || !fakeLike, 'a signed-out like must open the sign-in sheet or do nothing, not count a like that is gone after a reload').toBe(true)
  })

  test('the options button on a restaurant post does something', async ({ page }) => {
    await page.goto(url('/'))
    const post = page.locator('article').filter({ has: page.getByRole('link', { name: /view menu/i }) }).first()
    await expect(post).toBeVisible()
    await post.locator('button.icon-btn').first().click()
    await expect(page.getByRole('menu').or(page.getByRole('dialog')).or(page.locator('.overlay')), 'a menu or sheet after tapping the three dots').not.toHaveCount(0)
  })
})
