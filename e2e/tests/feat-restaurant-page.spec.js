// Restaurant page: Posts tab first, designed Menu second (docs/V2-CONTRACT.md 19, client/src/features/restaurant/README.int.md).
// Posts: chips "From <venue>" / "Guests", a grid of `.rst-tile` squares (caption-only posts are text tiles). Menu (`?tab=menu`): a printed menu
// of `.mn-row[data-dish-id]` rows in `.mn-sec` sections inside `.mn-wrap[data-menu="classic|bistro|modern|cafe"]`, with a section navigator,
// a search box and dietary tags. The preview holds a simulated demo world (10 venues): every expectation is read from the same public RPCs
// the page uses (`restaurant_menu`, `restaurant_posts`, `restaurant_guest_posts`), never a fixed count, and nothing is written.
// Runs in the desktop and the mobile project (CONSUMER_SPECS in playwright.config.js).
const { test, expect, settle } = require('../support/fixtures')
const F = require('../support/feat-bookings')
const R = require('../support/restaurant')
const { walker } = require('../support/mobile')
const U = require('../support/ux')

const { url, anonApi } = F
// the display font the section titles of each theme use (client/src/features/restaurant/menu/themes/*.css); which venue has which theme is
// whatever its manager saved in the dashboard (seeded: Bella classic, Burger Qala bistro, Sakura modern, Fincan cafe), so it is read from the answer
const THEME_FONT = { classic: /Playfair/i, bistro: /Barlow/i, modern: /DM Sans/i, cafe: /Nunito/i }
const THEME_SLUGS = ['bella-roma', 'burger-qala', 'sakura-house', 'fincan-coffee']
const noErrors = watch => expect(watch.consoleErrors, 'console errors').toEqual([])
const menuOf = async (api, slug) => (await api.rpc('restaurant_menu', { p_slug: slug })).body
const dishesOf = menu => menu.sections.flatMap(s => s.dishes)
const restaurant = async (api, slug) => (await api.get(`restaurants?slug=eq.${slug}&select=id,name,slug&status=eq.active`))[0]
const hrefs = loc => loc.evaluateAll(as => as.map(a => a.getAttribute('href')))
const fold = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[ıə]/g, c => (c === 'ı' ? 'i' : 'e'))

test.describe('restaurant page', { tag: ['@anon', '@consumer', '@feat'] }, () => {
  test.describe.configure({ mode: 'default' })

  test('it opens on Posts: the chips, the tile grid matches the venue posts newest first, a tile opens its post and back returns', async ({ page, watch }) => {
    const api = await anonApi(page)
    const rest = await restaurant(api, 'bella-roma')
    const venue = (await api.rpc('restaurant_posts', { p_restaurant_id: rest.id, p_limit: 21 })).body.items
    await page.goto(url('/restaurant/bella-roma'))
    await expect(R.tabBtn(page, 'Posts')).toHaveAttribute('aria-selected', 'true')
    await expect(R.tabBtn(page, 'Menu')).toHaveAttribute('aria-selected', 'false')
    await expect(page.locator('#rst-panel-menu'), 'the Menu panel is not mounted or shown yet').toBeHidden()
    const from = page.getByRole('button', { name: `From ${rest.name}`, exact: true })
    const guests = page.getByRole('button', { name: 'Guests', exact: true })
    await expect(from).toHaveAttribute('aria-pressed', 'true')
    await expect(guests).toHaveAttribute('aria-pressed', 'false')

    const tiles = page.locator('a.rst-tile')
    if (venue.length === 0) {
      await expect(page.getByText('No posts yet')).toBeVisible()
    } else {
      await expect(tiles.first()).toBeVisible()
      await expect.poll(async () => (await hrefs(tiles)).slice(0, venue.length), { message: 'tiles = the venue posts, newest first', timeout: 15_000 }).toEqual(venue.map(p => `/post/${p.id}`))
      for (const [i, p] of venue.entries()) {
        const cls = tiles.nth(i)
        if (p.photo_url) await expect(cls, `tile ${i + 1} is a photo`).not.toHaveClass(/rst-tile--text/)
        else await expect(cls, `tile ${i + 1} is a text tile`).toHaveClass(/rst-tile--text/)
      }
      await tiles.first().click()
      await expect(page).toHaveURL(url(`/post/${venue[0].id}`))
      await page.goBack()
      await expect(R.tabBtn(page, 'Posts')).toHaveAttribute('aria-selected', 'true')
    }

    const guestPosts = (await api.rpc('restaurant_guest_posts', { p_restaurant_id: rest.id, p_limit: 21 })).body.items
    await guests.click()
    await expect(guests).toHaveAttribute('aria-pressed', 'true')
    if (guestPosts.length === 0) await expect(page.getByText('No guest posts yet')).toBeVisible()
    else {
      await expect(tiles.first()).toBeVisible()
      // the grid swaps from the venue's posts to the guests' (a fetch, then a render): poll, a phone is slower than a desktop
      await expect.poll(async () => (await hrefs(tiles)).slice(0, guestPosts.length), { message: 'tiles = the guests\' posts, newest first', timeout: 15_000 }).toEqual(guestPosts.map(p => `/post/${p.id}`))
    }
    await settle(page)
    noErrors(watch)
  })

  test('the tab is in the URL: Menu and Posts switch with a click or the arrow keys, ?tab=menu opens Menu, both tabs stay mounted', async ({ page }) => {
    await page.goto(url('/restaurant/bella-roma'))
    await expect(R.tabBtn(page, 'Posts')).toHaveAttribute('aria-selected', 'true')
    await R.tabBtn(page, 'Menu').click()
    await expect(page).toHaveURL(/[?&]tab=menu/)
    await expect(R.rows(page).first()).toBeVisible()
    await R.tabBtn(page, 'Posts').click()
    await expect(page).toHaveURL(/[?&]tab=posts/)
    await expect(page.locator('#rst-panel-menu')).toBeHidden()
    await expect(page.locator('#rst-panel-posts')).toBeVisible()
    await R.tabBtn(page, 'Posts').focus()
    await page.keyboard.press('ArrowRight')
    await expect(R.tabBtn(page, 'Menu')).toHaveAttribute('aria-selected', 'true')
    await expect(R.tabBtn(page, 'Menu')).toBeFocused()
    expect(await R.rows(page).count(), 'the menu stays mounted when its tab is left').toBeGreaterThan(0)
    await page.goto(url('/restaurant/bella-roma?tab=menu'))
    await expect(R.tabBtn(page, 'Menu')).toHaveAttribute('aria-selected', 'true')
    await expect(R.rows(page).first()).toBeVisible()
  })

  test('?dish=<id> lands on the Menu with that dish\'s sheet; an unknown id lands on the Menu and opens nothing', async ({ page }) => {
    const api = await anonApi(page)
    const dish = dishesOf(await menuOf(api, 'bella-roma')).find(d => d.available)
    test.skip(!dish, 'Bella Roma has no available dish right now')
    await page.goto(url(`/restaurant/bella-roma?dish=${dish.id}`))
    await expect(R.tabBtn(page, 'Menu')).toHaveAttribute('aria-selected', 'true')
    await expect(U.sheet(page).locator('.dds-name'), 'the shared link opens that dish\'s sheet (UX round: .dds-* markup)').toHaveText(dish.name)
    await page.keyboard.press('Escape')
    await U.noSheet(page)
    expect(page.url(), 'closing popped ?dish= from the URL').not.toContain('dish=')
    await page.goto(url('/restaurant/bella-roma?dish=00000000-0000-4000-8000-000000000000'))
    await expect(R.tabBtn(page, 'Menu')).toHaveAttribute('aria-selected', 'true')
    await expect(R.rows(page).first()).toBeVisible()
    await U.noSheet(page)
  })

  test('the header is trimmed (UX plan 1.6): cuisine alone, followers + reviews (+ free seats while open) and no dishes stat, no like button, one Reserve link, "Tables" with a word', async ({ page }) => {
    const api = await anonApi(page)
    const rest = (await api.get('restaurants?slug=eq.bella-roma&select=id,cuisine_type,name'))[0]
    await page.goto(url('/restaurant/bella-roma'))
    await expect(page.locator('h1.rst-name')).toHaveText(rest.name)
    await expect(page.locator('.rst-cuisine'), 'the cuisine label alone ("Italian"), not "Italian Restaurant"').toHaveText(rest.cuisine_type)
    const labels = await page.locator('.rst-stat-l').allInnerTexts()
    expect(labels, 'stats: followers and reviews, free seats only while open, never dishes').toEqual(expect.arrayContaining(['followers', 'reviews']))
    expect(labels).not.toContain('dishes')
    await expect(page.locator('.rst-stat--tap'), 'the reviews stat is the one that taps (it opens the reviews sheet)').toHaveCount(1)
    await expect(page.locator('.rst-stat--tap')).toContainText('reviews')
    await expect(page.getByRole('button', { name: /^(Like|Remove your like)/ }), 'no restaurant like on the page (Follow stays)').toHaveCount(0)
    await expect(page.locator('.rst-follow')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Reserve a table' })).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Floor plan' }), 'the floor plan button has a word next to its icon').toContainText('Tables')
  })

  test('the Reviews stat opens the restaurant reviews sheet: a large sheet with Top | Newest, rows that name the dish', async ({ page }) => {
    await page.goto(url('/restaurant/bella-roma'))
    await page.locator('.rst-stat--tap').click()
    const panel = U.sheet(page)
    await expect(panel.getByRole('heading', { name: /^Reviews of / })).toBeVisible()
    await expect(panel.locator('article.rv').first()).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Top', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(panel.locator('.rv-where-dish').first()).toBeVisible()
    await page.keyboard.press('Escape')
    await U.noSheet(page)
  })

  test('menu themes: each venue prints its own theme (classic / bistro / modern / cafe) with its title, note, photos and fonts', async ({ page, watch }) => {
    const api = await anonApi(page)
    const seen = {}
    for (const slug of THEME_SLUGS) {
      const rest = await restaurant(api, slug)
      if (!rest) continue
      const menu = await menuOf(api, slug)
      const theme = menu.design.theme
      expect(Object.keys(THEME_FONT), `${slug}: a known theme`).toContain(theme)
      const font = THEME_FONT[theme]
      await R.gotoMenu(page, slug)
      const wrap = page.locator('.mn-wrap')
      await expect(wrap, `${slug}: theme class`).toHaveAttribute('data-menu', theme)
      expect(await wrap.getAttribute('style'), `${slug}: the accent is set as a custom property`).toMatch(/--mn-accent/)
      await expect(page.locator('h2.mn-title')).toHaveText(rest.name)
      await expect(page.locator('.mn-kicker')).toHaveText('Menu')
      if (menu.design.note) await expect(page.locator('.mn-note'), `${slug}: the menu note`).toHaveText(menu.design.note)
      else await expect(page.locator('.mn-note')).toHaveCount(0)
      const dishes = dishesOf(menu)
      await expect(R.rows(page), `${slug}: a row per dish`).toHaveCount(dishes.length)
      await expect(page.locator('.mn-thumb'), `${slug}: small photos only when the venue turned them on`).toHaveCount(menu.design.show_photos ? dishes.filter(d => d.photo).length : 0)
      expect(await page.locator('.mn-sec-title').first().evaluate(el => getComputedStyle(el).fontFamily), `${slug}: section title font`).toMatch(font)
      // cafe prints a small icon per section, the others none
      await expect(page.locator('.mn-sec-icon')).toHaveCount(theme === 'cafe' ? menu.sections.filter(s => s.dishes.length).length : 0)
      seen[theme] = await page.locator('.mn').evaluate(el => ({ bg: getComputedStyle(el).backgroundColor, radius: getComputedStyle(el).borderRadius }))
    }
    expect(Object.keys(seen).length, 'at least two different themes among the four venues').toBeGreaterThan(1)
    expect(new Set(Object.values(seen).map(x => `${x.bg}|${x.radius}`)).size, 'the themes do not all look the same').toBeGreaterThan(1)
    noErrors(watch)
  })

  test('menu search folds case and accents, filters the rows and sections, says when nothing matches and clears', async ({ page }) => {
    const api = await anonApi(page)
    const menu = await menuOf(api, 'sakura-house')
    const dishes = dishesOf(menu)
    await R.gotoMenu(page, 'sakura-house')
    const search = page.getByRole('searchbox', { name: 'Search the menu' })
    const pick = dishes[Math.floor(dishes.length / 2)]
    await search.fill(pick.name.toUpperCase())
    await expect(R.byId(page, pick.id), 'the dish is found whatever the case').toBeVisible()
    const shown = await R.rows(page).count()
    expect(shown, 'fewer rows than the whole menu (unless every dish matches)').toBeLessThanOrEqual(dishes.length)
    expect(shown).toBeGreaterThan(0)
    for (const section of await page.locator('.mn-sec').all()) expect(await section.locator('.mn-row').count(), 'a section without a match is dropped').toBeGreaterThan(0)

    const accented = dishes.find(d => fold(d.name) !== d.name.toLowerCase())
    if (accented) {
      await search.fill(fold(accented.name))
      await expect(R.byId(page, accented.id), `"${fold(accented.name)}" finds "${accented.name}"`).toBeVisible()
    }
    await search.fill('zzzzqq')
    await expect(page.getByText('Nothing matches “zzzzqq”')).toBeVisible()
    await expect(R.rows(page)).toHaveCount(0)
    await page.getByRole('button', { name: 'Clear search and filters' }).click()
    await expect(R.rows(page)).toHaveCount(dishes.length)
    await expect(search).toHaveValue('')
  })

  test('a sold-out dish is struck through, tagged "Sold out", and its row still opens the details (no order button)', async ({ page }) => {
    const api = await anonApi(page)
    const [gone] = await api.get('dishes?available=eq.false&select=id,name,restaurants!inner(slug,status)&restaurants.status=eq.active&limit=1')
    test.skip(!gone, 'no sold-out dish on this database right now (demo data is never changed to make one)')
    await R.gotoMenu(page, gone.restaurants.slug)
    const row = R.byId(page, gone.id)
    await expect(row).toHaveClass(/is-sold/)
    await expect(row.locator('.mn-tag--sold')).toHaveText('Sold out')
    expect(await row.locator('.mn-name').evaluate(el => getComputedStyle(el).textDecorationLine), 'the name is struck through').toContain('line-through')
    await expect(row.locator('.mn-add'), 'no inline "+" on a sold-out dish').toHaveCount(0)
    await R.rowOpen(row).click()
    await expect(U.sheet(page).locator('.dds-name')).toHaveText(gone.name)
    await expect(U.sheet(page).locator('.dds-soldtag'), 'a Sold out tag on the photo').toHaveText(/sold out/i)
    await expect(U.sheet(page).locator('.dds-soldnote'), 'the footer says so instead of offering the dish').toHaveText('Sold out today')
    await expect(page.getByRole('button', { name: /^Add to Order/ })).toHaveCount(0)
  })

  test('both tabs fit the screen for a themed venue: no horizontal overflow, no cut-off text, no console errors', async ({ page, watch }, testInfo) => {
    test.setTimeout(90_000)
    const w = walker(page, watch, testInfo)
    for (const slug of ['fincan-coffee', 'burger-qala']) {
      const rest = await restaurant(await anonApi(page), slug)
      if (!rest) continue
      await page.goto(url(`/restaurant/${slug}`))
      await expect(R.tabBtn(page, 'Posts')).toBeVisible()
      await settle(page, 4_000)
      await w.check(`${slug}, posts`)
      await w.scrollThrough(`${slug}, posts`)
      await R.tabBtn(page, 'Menu').click()
      await expect(R.rows(page).first()).toBeVisible()
      await w.check(`${slug}, menu`)
      await w.scrollThrough(`${slug}, menu`)
    }
  })
})
