// Consumer discovery features, one test per feature, desktop and the `mobile` project: the Discover tab (the sections of one `discover`
// call: cuisine chips, open now, trending dishes, new places, promos, top reviews, all restaurants; follow / like), Explore (search, filters, dish sheet), Map (markers, chips,
// popup, geolocation), Restaurant page (hero, stats, hours, Follow, menu chips, dietary filters, dish sheet, floor
// plan), Azerbaijani copy and the signed-out gates. Expected values are read from the preview database (public REST)
// and compared with what the page shows. Findings: docs/qa/consumer-bookings.md.
// Writes (all undone in `finally`): a follow of a rail restaurant, a like of a listed restaurant and a follow of Sakura House by the QA
// guest (kitchen.sakura). The preview also holds a simulated demo world, so no test asserts a total and no demo data is changed.
const { test, expect, settle } = require('../support/fixtures')
const { CONSUMER_URL } = require('../support/env')
const F = require('../support/feat-bookings')
const { openAs } = F
const R = require('../support/restaurant')

const { url, BELLA, SAKURA, anonApi, bakuClock, hm, rawKeys } = F
const NAMES = { 'bella-roma': 'Trattoria Bella Roma', 'seda-ocagi': 'Səda Ocağı', 'sakura-house': 'Sakura House' }
const SLUGS = Object.keys(NAMES)
const money = n => `₼${Number(n).toFixed(2)}`
const heading1 = p => p.getByRole('heading', { level: 1 })

/**
 * Home has three tabs (Home | Friends | Discover) and opens on the ranked Home tab. The remembered tab is set to Discover before the page
 * loads (so the Home tab is never mounted and its cards stay out of these locators), the first `discover` answer is awaited and the
 * helper checks Discover is the selected tab and a section is on screen. Resolves { data } = the parsed answer (docs/V2-CONTRACT.md 18.2).
 */
async function openDiscover(page) {
  await page.addInitScript(() => { try { localStorage.setItem('rufesto_home_tab', 'discover') } catch { /* storage blocked */ } })
  const answer = page.waitForResponse(r => r.request().method() === 'POST' && /\/rest\/v1\/rpc\/discover(\?|$)/.test(r.url()), { timeout: 30_000 })
  answer.catch(() => {})
  await page.goto(url('/'))
  await expect(page.getByRole('tab', { name: /^(Discover|Kəşf et)$/ })).toHaveAttribute('aria-selected', 'true')
  const data = await (await answer).json()
  await expect(page.locator('.dsc h2.dsc-h').first()).toBeVisible()
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

const sheet = p => p.locator('.overlay .sheet').last()
const noErrors = watch => expect(watch.consoleErrors, 'console errors').toEqual([])

/* ================================================================ DISCOVER */
// The Discover tab (client/src/features/discover, V2-CONTRACT 18.2 / 18.3): ONE `discover` call renders chips + Open now (near you) +
// Trending dishes + New places + Promos + Top reviews + All restaurants, each hidden when empty. The preview holds a simulated demo
// world (10 venues, @demo.rufesto.com people) that changes while it runs, so nothing here asserts a total: the page is compared with the
// `discover` answer it received, and nothing of the demo data is changed (only follows / likes the QA guest makes are written and undone).

const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '')
const followersText = n => new RegExp(`(?<!\\d)${n} follower${n === 1 ? '' : 's'}(?![a-z])`)   // the whole number ("5 followers" must not match "15 followers"); the rating "(5)" sits right before it in the text
const section = (p, title) => p.locator('section.dsc-sec').filter({ has: p.getByRole('heading', { name: title, exact: true, level: 2 }) })
const heads = p => p.locator('.dsc h2.dsc-h').evaluateAll(els => els.map(e => e.textContent.trim()))
const chipsOf = p => p.getByRole('group', { name: 'Cuisine' }).getByRole('button')
const isDiscoverReq = q => q.method() === 'POST' && /\/rest\/v1\/rpc\/discover(\?|$)/.test(q.url())
const isDiscover = r => isDiscoverReq(r.request())
const discoverBody = r => { try { return JSON.parse(r.postData() || '{}') || {} } catch { return {} } }

test.describe('discover tab', { tag: ['@anon', '@consumer', '@feat'] }, () => {
  test.describe.configure({ mode: 'default' })

  test('signed out: the sections are the ones the answer fills, in contract order, with its names, status pills and follower counts', async ({ page, watch }) => {
    const { data } = await openDiscover(page)
    const near = data.location?.radius_km != null
    const expected = [
      [data.open_now, near ? 'Open now near you' : 'Open now'], [data.trending_dishes, 'Trending dishes'], [data.new_places, 'New places'],
      [data.promos, 'Promos'], [data.top_reviews, 'Top reviews'], [data.all_restaurants, 'All restaurants'],
    ].filter(([rows]) => rows.length).map(([, h]) => h)
    expect(expected, 'the preview has restaurants to discover').toContain('All restaurants')
    expect(await heads(page), 'section headings, in order, only the non-empty ones').toEqual(expected)

    await expect(chipsOf(page), 'chips: All + the cuisines of the answer').toHaveText(['All', ...data.cuisines.map(c => cap(c.key))])
    await expect(chipsOf(page).first()).toHaveAttribute('aria-pressed', 'true')
    const names = rows => rows.map(r => r.name)
    if (data.open_now.length) await expect(section(page, near ? 'Open now near you' : 'Open now').locator('.dsc-rc-name')).toHaveText(names(data.open_now))
    if (data.new_places.length) await expect(section(page, 'New places').locator('.dsc-rc-name')).toHaveText(names(data.new_places))
    if (data.trending_dishes.length) await expect(section(page, 'Trending dishes').locator('.dsc-dc-name')).toHaveText(names(data.trending_dishes))
    if (data.top_reviews.length) await expect(section(page, 'Top reviews').locator('article.soc-review')).toHaveCount(data.top_reviews.length)

    await test.step('All restaurants: the first 12 cards, status pill and followers match the answer; Show more adds the rest', async () => {
      const all = section(page, 'All restaurants')
      const cards = all.locator('article.dsc-rc')
      await expect(all.locator('.dsc-rc-name')).toHaveText(names(data.all_restaurants.slice(0, 12)))
      for (const [i, r] of data.all_restaurants.slice(0, 3).entries()) {
        const pill = r.open_now ? (r.closes_at ? `Open · closes ${r.closes_at}` : 'Open now') : 'Closed'
        await expect(cards.nth(i).locator('.dsc-pill').first(), `${r.name}: status pill`).toHaveText(pill)
        await expect(cards.nth(i).locator('.dsc-rc-stats'), `${r.name}: followers`).toContainText(followersText(r.follower_count))
        await expect(cards.nth(i).getByRole('link', { name: /view menu/i })).toHaveAttribute('href', `/restaurant/${r.slug}`)
      }
      if (data.all_restaurants.length > 12) {
        await all.getByRole('button', { name: 'Show more' }).click()
        await expect(all.locator('.dsc-rc-name')).toHaveText(names(data.all_restaurants.slice(0, 24)))
      } else {
        await expect(all.getByRole('button', { name: 'Show more' })).toHaveCount(0)
      }
    })
    await expect(page.getByText('Nothing to discover yet')).toHaveCount(0)
    await settle(page)
    noErrors(watch)
  })

  test('cuisine chips: a pick asks the server with p_cuisine and filters the lists; All and a repeated pick make no new request', async ({ page }) => {
    const { data } = await openDiscover(page)
    test.skip(data.cuisines.length === 0, 'no cuisines in the answer')
    const pick = data.cuisines.find(c => c.count < data.all_restaurants.length) || data.cuisines[0]
    const requests = []
    page.on('request', q => { if (isDiscoverReq(q)) requests.push(discoverBody(q)) })
    const chip = chipsOf(page).filter({ hasText: new RegExp(`^${cap(pick.key)}$`) })
    const asked = page.waitForResponse(r => isDiscover(r) && discoverBody(r.request()).p_cuisine === pick.key)
    await chip.click()
    const filtered = await (await asked).json()
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await expect(chipsOf(page).first()).toHaveAttribute('aria-pressed', 'false')
    for (const k of ['open_now', 'all_restaurants']) {
      for (const r of filtered[k]) expect(r.cuisine_type.toLowerCase(), `${k}: ${r.name}`).toBe(pick.key.toLowerCase())
    }
    expect(filtered.all_restaurants.length, 'chip count = restaurants of that cuisine').toBe(pick.count)
    await expect(section(page, 'All restaurants').locator('.dsc-rc-name')).toHaveText(filtered.all_restaurants.slice(0, 12).map(r => r.name))
    for (const meta of await section(page, 'All restaurants').locator('.dsc-rc-meta:first-of-type').allInnerTexts()) {
      expect(meta.toLowerCase().startsWith(pick.key.toLowerCase()), `card meta "${meta}" starts with the cuisine`).toBe(true)
    }
    await expect(chipsOf(page), 'the chip row stays the unfiltered one').toHaveText(['All', ...data.cuisines.map(c => cap(c.key))])

    const before = requests.length
    await chipsOf(page).first().click()   // All: cached
    await expect(chipsOf(page).first()).toHaveAttribute('aria-pressed', 'true')
    await expect(section(page, 'All restaurants').locator('.dsc-rc-name')).toHaveText(data.all_restaurants.slice(0, 12).map(r => r.name))
    await chip.click()                     // the same pick again: cached
    await expect(chip).toHaveAttribute('aria-pressed', 'true')
    await page.waitForTimeout(800)
    expect(requests.length, 'discover requests after All and a repeated pick').toBe(before)
  })

  test('signed out: top review authors show real names (not "Anonymous") and link to their profile', async ({ page }) => {
    const { data } = await openDiscover(page)
    test.skip(data.top_reviews.length === 0, 'no verified review in the last 14 days on this database')
    const cards = section(page, 'Top reviews').locator('article.soc-review')
    for (const [i, r] of data.top_reviews.slice(0, 6).entries()) {
      expect(r.user?.name, `review ${r.id}: reviewer name in the answer`).toBeTruthy()
      expect(r.user.name).not.toMatch(/^anonymous$/i)
      const name = cards.nth(i).locator('.soc-post-name')
      await expect(name).not.toHaveText(/anonymous/i)
      await expect(name).toContainText(r.user.name.split(' ')[0])
      await expect(name).toHaveAttribute('href', `/u/${r.user.id}`)
    }
  })

  test('signed out: a trending dish card opens its restaurant with the dish sheet; a restaurant card opens the restaurant page', async ({ page }) => {
    const { data } = await openDiscover(page)
    if (data.trending_dishes.length) {
      const d = data.trending_dishes[0]
      const card = section(page, 'Trending dishes').locator('article.dsc-dc').first()
      await expect(card.getByRole('link')).toHaveAttribute('href', `/restaurant/${d.restaurant.slug}?dish=${d.id}`)
      await expect(card.locator('.dsc-pill')).toHaveText(d.available ? 'Available' : 'Sold out')
      await card.getByRole('link').click()
      await expect(page).toHaveURL(new RegExp(`/restaurant/${d.restaurant.slug}\\?dish=${d.id}`))
      await expect(sheet(page)).toContainText(d.name)
      await page.keyboard.press('Escape')
      await expect(page.locator('.overlay')).toHaveCount(0)
      await page.goBack()
      await expect(page.getByRole('heading', { name: 'All restaurants', level: 2 }), 'back on Discover, answer kept').toBeVisible()
    }
    const first = data.all_restaurants[0]
    await section(page, 'All restaurants').locator('article.dsc-rc').first().getByRole('link', { name: /view menu/i }).click()
    await expect(page).toHaveURL(url(`/restaurant/${first.slug}`))
    await expect(heading1(page)).toHaveText(first.name)
  })

  test('signed out: rails offer no Follow; Follow, like and the options menu of an "All restaurants" card ask to sign in or open a menu', async ({ page }) => {
    const { data } = await openDiscover(page)
    await expect(page.locator('.dsc-rail').getByRole('button', { name: /^(Follow|Unfollow) / }), 'no Follow on a rail card for a signed-out guest').toHaveCount(0)
    const r = data.all_restaurants[0]
    const card = section(page, 'All restaurants').locator('article.dsc-rc').first()
    await card.getByRole('button', { name: `Follow ${r.name}`, exact: true }).click()
    await expect(page.getByRole('button', { name: /continue with email/i }).first()).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('button', { name: /continue with email/i })).toHaveCount(0)
    await card.getByRole('button', { name: `Like ${r.name}`, exact: true }).click()
    await expect(page.getByRole('button', { name: /continue with email/i }).first()).toBeVisible()
    await page.keyboard.press('Escape')
    await card.getByRole('button', { name: 'Post options' }).click()
    await expect(page.getByRole('menu')).toBeVisible()
    await expect(page.getByRole('menuitem', { name: /copy link/i })).toBeVisible()
  })

  test('promos: every promo of the answer is a Promoted card in the rail and its impression is tracked (no tap, so no click is counted)', async ({ page }) => {
    const tracked = []
    page.on('request', r => { if (/rpc\/track_campaign/.test(r.url())) { try { tracked.push(r.postDataJSON()) } catch { /* not JSON */ } } })
    const { data } = await openDiscover(page)
    test.skip(data.promos.length === 0, 'no active promo in the discover answer')
    const rail = section(page, 'Promos')
    await expect(rail.getByText('Promoted', { exact: true })).toHaveCount(data.promos.length)
    await rail.scrollIntoViewIfNeeded()
    await expect.poll(() => tracked.some(t => t.p_event === 'impression' && data.promos.some(p => p.id === t.p_campaign_id)), { message: 'an impression of a shown promo (50 % visible for 1 s)', timeout: 15_000 }).toBe(true)
  })

  test('signed in: Follow on a rail card writes user_follows, every card of that restaurant agrees, and it is undone', async ({ page, browser }, testInfo) => {
    test.skip(F.missing('emptyGuest'), 'kitchen.sakura not found in docs/REVIEW-ACCOUNTS.md')
    const g = await openAs(browser, testInfo, F.accounts.emptyGuest())
    const uid = g.session.user.id
    const rows = async id => (await F.req(page, g, 'GET', `user_follows?user_id=eq.${uid}&restaurant_id=eq.${id}&select=id`)).rows
    let target = null
    try {
      const { data } = await openDiscover(g.page)
      // Bella Roma is Rufat's own venue, the rest are demo venues: only a follow of the QA guest is written, and removed again
      const pool = [...data.open_now, ...data.new_places].filter(r => !r.is_followed && r.slug !== 'bella-roma')
      test.skip(pool.length === 0, 'every rail restaurant is followed already (or the rails are empty)')
      target = pool.find(r => r.slug === 'sakura-house') || pool[0]
      expect(await rows(target.id), 'the guest does not follow it yet').toHaveLength(0)
      const p = g.page
      const rail = () => p.locator('.dsc-rail article.dsc-rc').filter({ has: p.getByRole('heading', { name: target.name, exact: true }) }).first()
      await rail().getByRole('button', { name: `Follow ${target.name}`, exact: true }).click()
      await expect(rail().getByRole('button', { name: `Unfollow ${target.name}`, exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect(rail().locator('.dsc-rc-stats')).toContainText(followersText(target.follower_count + 1))
      await expect.poll(async () => (await rows(target.id)).length, { message: 'the follow row is saved' }).toBe(1)
      const listCard = p.locator('.dsc-sec-all article.dsc-rc').filter({ has: p.getByRole('heading', { name: target.name, exact: true }) })
      if (await listCard.count()) await expect(listCard.getByRole('button', { name: `Unfollow ${target.name}`, exact: true }), 'the "All restaurants" card agrees').toBeVisible()

      await p.reload()
      await expect(p.locator('.dsc h2.dsc-h').first()).toBeVisible()
      await expect(rail().getByRole('button', { name: `Unfollow ${target.name}`, exact: true }), 'the follow survives a reload').toBeVisible()
      await rail().getByRole('button', { name: `Unfollow ${target.name}`, exact: true }).click()
      await expect(rail().getByRole('button', { name: `Follow ${target.name}`, exact: true })).toBeVisible()
      await expect(rail().locator('.dsc-rc-stats')).toContainText(followersText(target.follower_count))
      await expect.poll(async () => (await rows(target.id)).length, { message: 'the follow row is removed' }).toBe(0)
    } finally {
      if (target) for (const r of await rows(target.id)) await F.req(page, g, 'DELETE', `user_follows?id=eq.${r.id}`)
      await g.close()
    }
  })

  test('signed in: like on an "All restaurants" card writes a restaurant like, survives a reload and is undone', async ({ page, browser }, testInfo) => {
    test.skip(F.missing('emptyGuest'), 'kitchen.sakura not found in docs/REVIEW-ACCOUNTS.md')
    const g = await openAs(browser, testInfo, F.accounts.emptyGuest())
    const uid = g.session.user.id
    const likes = async id => (await F.req(page, g, 'GET', `likes?user_id=eq.${uid}&target_type=eq.restaurant&target_id=eq.${id}&select=id`)).rows
    let target = null
    try {
      const { data } = await openDiscover(g.page)
      target = data.all_restaurants.slice(0, 12).find(r => r.slug !== 'bella-roma')
      test.skip(!target, 'no restaurant in the first 12 cards')
      for (const l of await likes(target.id)) await F.req(page, g, 'DELETE', `likes?id=eq.${l.id}`)
      const p = g.page
      const card = () => p.locator('.dsc-sec-all article.dsc-rc').filter({ has: p.getByRole('heading', { name: target.name, exact: true }) })
      await card().getByRole('button', { name: `Like ${target.name}`, exact: true }).click()
      await expect(card().getByRole('button', { name: `Remove your like from ${target.name}`, exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect.poll(async () => (await likes(target.id)).length, { message: 'a restaurant like row' }).toBe(1)
      await p.reload()
      await expect(card().getByRole('button', { name: `Remove your like from ${target.name}`, exact: true }), 'the like survives a reload').toBeVisible()
      await card().getByRole('button', { name: `Remove your like from ${target.name}`, exact: true }).click()
      await expect.poll(async () => (await likes(target.id)).length, { message: 'the like row is removed' }).toBe(0)
    } finally {
      if (target) for (const l of await likes(target.id)) await F.req(page, g, 'DELETE', `likes?id=eq.${l.id}`)
      await g.close()
    }
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
    // several dishes may share the top review count (the demo world adds many): the first card is any of them
    const top = dishes.filter(d => d.review_count === dishes[0].review_count).map(d => d.name)
    const firstText = await cards(page).first().innerText()
    expect(top.some(n => firstText.includes(n)), `the first card is one of the most reviewed dishes (${top.slice(0, 3).join(', ')}...)`).toBe(true)
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
  const chip = (p, name) => p.getByRole('button', { name })
  // the map draws every active restaurant that has coordinates (the demo world holds about ten, so never a fixed number)
  const mapped = async page => (await (await anonApi(page)).get('restaurants?status=eq.active&select=id,name,slug,cuisine_type,latitude,longitude')).filter(r => r.latitude != null && r.longitude != null)

  test('the map shows a marker and a chip for each active restaurant with coordinates', async ({ page, watch }) => {
    const rests = await mapped(page)
    expect(rests.length, 'mapped restaurants on the preview').toBeGreaterThanOrEqual(3)
    await page.goto(url('/map'))
    await expect(page.locator('.leaflet-container')).toBeVisible()
    await expect(markers(page)).toHaveCount(rests.length)
    for (const n of Object.values(NAMES)) await expect(chip(page, n).first()).toBeVisible()
    for (const r of rests) await expect(chip(page, r.name).first(), `chip of ${r.name}`).toBeAttached()
    const subs = await page.locator('.map-chip-sub').allInnerTexts()
    expect(subs.map(x => x.trim()).sort(), 'one cuisine line per chip').toEqual(rests.map(r => r.cuisine_type || 'Restaurant').sort())
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Zoom out' })).toBeVisible()
    await expect.poll(() => page.locator('.leaflet-tile-loaded').count(), 'map tiles loaded').toBeGreaterThan(0)
    noErrors(watch)
  })

  for (const slug of SLUGS) {
    test(`chip ${NAMES[slug]} opens its popup, the popup opens the restaurant`, async ({ page, watch }) => {
      const rests = await mapped(page)
      await page.goto(url('/map'))
      await expect(markers(page)).toHaveCount(rests.length)
      await chip(page, NAMES[slug]).first().click()
      const popup = page.locator('.leaflet-popup')
      await expect(popup).toBeVisible()
      await expect(popup).toContainText(NAMES[slug])
      await expect(chip(page, NAMES[slug]).first()).toHaveClass(/is-selected/)
      await popup.getByRole('link', { name: /view menu/i }).click()
      await expect(page).toHaveURL(url(`/restaurant/${slug}`))
      await expect(heading1(page)).toHaveText(NAMES[slug])
      noErrors(watch)
    })
  }

  test('tapping a marker opens the popup of that restaurant', async ({ page }) => {
    const rests = await mapped(page)
    await page.goto(url('/map'))
    await expect(markers(page)).toHaveCount(rests.length)
    await chip(page, 'Sakura House').first().click()   // centres the map on a restaurant so its marker is on screen
    await page.locator('.leaflet-popup-close-button').click()
    await expect(page.locator('.leaflet-popup')).toHaveCount(0)
    // several markers may be drawn (and only some are inside the map box): tap one that is on screen
    const onScreen = await markers(page).evaluateAll(els => {
      const c = document.querySelector('.leaflet-container').getBoundingClientRect()
      return els.findIndex(e => { const r = e.getBoundingClientRect(); return r.left >= c.left && r.right <= c.right && r.top >= c.top && r.bottom <= c.bottom })
    })
    expect(onScreen, 'a marker inside the map box after centring on Sakura House').toBeGreaterThanOrEqual(0)
    await markers(page).nth(onScreen).click()
    await expect(page.locator('.leaflet-popup')).toBeVisible()
  })

  test('geolocation denied: the map still works and a "my location" button explains it', async ({ page, context, watch }) => {
    await context.clearPermissions()
    const rests = await mapped(page)
    await page.goto(url('/map'))
    await expect(markers(page)).toHaveCount(rests.length)
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
  const tiles = p => R.rows(p)   // the printed menu's dish rows (the old .menu-card grid is gone, docs/V2-CONTRACT.md 19.2)
  const stat = (p, label) => p.getByText(label, { exact: true }).locator('xpath=preceding-sibling::span[1]')
  // The follower count is public: the page reads it through the count-only RPC (sql/55b; anon no longer has SELECT on user_follows, and a
  // signed-in guest only sees their own follow rows), so the test reads the same RPC as anon.
  const followerCount = async (api, id) => Number((await api.rpc('restaurant_follower_count', { p_restaurant_id: id })).body)
  const dishRows = (api, id) => api.get(`dishes?restaurant_id=eq.${id}&select=id,name,price,available,is_vegan,is_vegetarian,is_gluten_free,is_spicy,review_count,menu_section_id&order=sort_order`)

  for (const slug of SLUGS) {
    test(`hero and stats of ${NAMES[slug]} match the data (dishes, followers, reviews, seats)`, async ({ page, watch }) => {
      const api = await anonApi(page)
      const [rest] = await api.get(`restaurants?slug=eq.${slug}&select=id,name,cuisine_type,address,description`)
      const [dishes, followers, tables] = await Promise.all([
        dishRows(api, rest.id), followerCount(api, rest.id), api.get(`tables?restaurant_id=eq.${rest.id}&select=state,capacity`),
      ])
      await page.goto(url(`/restaurant/${slug}`))
      await expect(heading1(page)).toHaveText(rest.name)
      await expect(page.getByText(`${rest.cuisine_type} Restaurant`)).toBeVisible()
      await expect(page.getByText(rest.address, { exact: false }).first()).toBeVisible()
      if (rest.description) await expect(page.getByText(rest.description.slice(0, 40)).first()).toBeVisible()
      await expect(page.locator('img[alt]').or(page.getByText(/[🍝🫕🍣]/)).first()).toBeVisible()   // cover photo or the cuisine emoji
      await expect(stat(page, 'dishes')).toHaveText(String(dishes.length))
      await expect(stat(page, 'followers'), 'signed out, the count comes from restaurant_follower_count').toHaveText(String(followers))
      await expect(stat(page, 'reviews')).toHaveText(String(dishes.reduce((s, d) => s + (d.review_count || 0), 0)))
      // tables change state while other QA runs use them: compare with a fresh read each time instead of the first one
      await expect.poll(async () => {
        const now = await api.get(`tables?restaurant_id=eq.${rest.id}&select=state,capacity`)
        const free = now.filter(t => t.state === 'free').reduce((n, t) => n + t.capacity, 0)
        return (await stat(page, 'seats').innerText()) === `${free}/${now.reduce((n, t) => n + t.capacity, 0)}`
      }, 'free seats / total seats on the page equal the tables').toBe(true)
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

  test('dish sheet for a guest: price, description, ingredients, allergens request, reviews list', async ({ page, watch }) => {
    const api = await anonApi(page)
    const dishes = await dishRows(api, BELLA)
    const ing = await api.get(`dish_ingredients?select=dish_id,ingredients(name)&dish_id=in.(${dishes.map(d => d.id).join(',')})`)
    const withIng = dishes.find(d => d.available && ing.some(i => i.dish_id === d.id))
    const withReviews = [...dishes].sort((a, b) => b.review_count - a.review_count)[0]
    const soldOut = dishes.find(d => !d.available)
    const allergenCalls = []
    page.on('response', r => { if (/\/rest\/v1\/dish_allergens/.test(r.url())) allergenCalls.push(r.status()) })
    await R.gotoMenu(page, 'bella-roma')
    const open = async d => { await R.rowOpen(R.byId(page, d.id)).click(); await expect(page.locator('.overlay')).toBeVisible() }
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
    await openDiscover(page)
    await expectAz(page, [['social', 'home.tab_home'], ['social', 'home.tab_friends'], ['social', 'home.tab_discover'], ['social', 'discover.allRestaurants'], ['social', 'discover.viewMenu'], ['social', 'discover.follow']], 'Home / Discover')
    await expect(page.getByRole('group', { name: /Mətbəx|Cuisine/ }).or(page.locator('.dsc-chips')).first(), 'the cuisine chip row').toBeVisible()
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
    await expect(R.tabBtn(page, 'Posts').or(R.tabBtn(page, 'Paylaşımlar'))).toBeVisible()
    await expectAz(page, [['restaurant', 'statDishes'], ['restaurant', 'statFollowers'], ['restaurant', 'statReviews'], ['restaurant', 'statSeats'], ['restaurant', 'follow'], ['bookings', 'reserve'], ['restaurant', 'tabs.posts'], ['restaurant', 'tabs.menu']], 'Restaurant')
    await expect(page.getByText(/Açıqdır|Bağlıdır/).first(), 'open / closed state').toBeVisible()
    // the order prompt only shows for an available dish, and the first card may be sold out right now: open an available one
    const [open] = await (await anonApi(page)).get(`dishes?restaurant_id=eq.${BELLA}&available=eq.true&select=id,name&order=name.asc&limit=1`)
    test.skip(!open, 'Trattoria Bella Roma has no available dish right now')
    await R.tabBtn(page, 'Menyu').click()
    await expect(R.rows(page).first()).toBeVisible()
    await R.rowOpen(R.byId(page, open.id)).click()
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

  test('liking a listed restaurant while signed out asks to sign in instead of showing a like that vanishes', async ({ page }) => {
    const { data } = await openDiscover(page)
    const r = data.all_restaurants[0]
    const card = page.locator('.dsc-sec-all article.dsc-rc').first()
    const like = card.getByRole('button', { name: `Like ${r.name}`, exact: true })
    await like.click()
    await expect(page.getByRole('button', { name: /continue with email/i }).first(), 'a signed-out like opens the sign-in sheet').toBeVisible()
    await expect(like, 'and no like is shown').toHaveAttribute('aria-pressed', 'false')
  })

  test('the options button on a listed restaurant opens a menu with Copy link', async ({ page }) => {
    await openDiscover(page)
    await page.locator('.dsc-sec-all article.dsc-rc').first().getByRole('button', { name: 'Post options' }).click()
    await expect(page.getByRole('menu'), 'a menu after tapping the three dots').toBeVisible()
    await expect(page.getByRole('menuitem', { name: /copy link/i })).toBeVisible()
  })
})
