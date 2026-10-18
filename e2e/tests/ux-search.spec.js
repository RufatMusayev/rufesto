// UX round: the new Search page (docs/UX-PLAN-2026-10-18.md section 3, D1, D8; client/src/features/search/*) at /explore.
//   - the zero state is the former Discover content (Popular, Cuisines, Trending dishes, Top reviews, All places; "Open now" only while a
//     place is open), there is no Discover tab on Home any more: /?tab=discover and a remembered Discover tab land on /explore;
//   - typing gives Places / Dishes (and People for a signed-in guest) in 64 px rows, the query is in the URL, matches fold case and accents;
//   - the Filters sheet narrows the results (Cuisine, Price, Open now), the active filters are chips under the field, a chip removes its filter;
//     Distance is disabled without a location;
//   - recent searches persist on this device, can be removed and cleared;
//   - Back from a restaurant restores the query / the scroll position;
//   - People: signed out there is no People tab, signed in it needs 3 letters.
// Read only: nothing is written on the preview (recent searches live in the browser). Phone context 390x844 in both projects.
const { test, expect } = require('../support/fixtures')
const U = require('../support/ux')

const { url } = U
const field = page => page.getByRole('searchbox', { name: 'Search dishes, places and people' })
const placeRows = page => page.locator('.sr-results a.sr-row')
const dishRows = page => page.locator('.sr-results .sr-row-btn')
const tab = (page, name) => page.getByRole('tab', { name, exact: true })
const filtersBtn = page => page.getByRole('button', { name: /^Filters/ })
const filtersSheet = page => page.locator('.bs-root:has(.sr-fs)[data-state="open"] .bs-panel')
const settle = page => expect(page.locator('.sr-list')).not.toHaveAttribute('aria-busy', 'true')

/** Open /explore and wait until the zero state is on screen. */
async function openZero(page) {
  await page.goto(url('/explore'))
  await expect(page.locator('.sr-zero h2.dsc-h').first()).toBeVisible({ timeout: 25_000 })
  await expect(page.locator('.sr-zero a.sr-row').first()).toBeVisible()
}

/** Type into the field (like a guest does) and wait for the answer. */
async function type(page, q) {
  await field(page).fill(q)
  await expect(page.locator('.sr-results')).toBeVisible()
  await expect.poll(() => page.locator('.sr-list').getAttribute('aria-busy'), { message: `the answer for "${q}"` }).not.toBe('true')
}

test.describe('ux search', { tag: ['@consumer', '@feat', '@ux'] }, () => {
  test.describe.configure({ mode: 'default' })

  // ------------------------------------------------------------------------------------------------ zero state
  test('zero state: field, Filters button, Popular, Cuisines, Trending dishes, Top reviews, All places; no Discover anywhere', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await openZero(page)
      await expect(field(page)).toHaveAttribute('placeholder', 'Dishes, places, people')
      await expect(filtersBtn(page)).toBeVisible()
      const heads = await page.locator('.sr-zero h2.dsc-h').allInnerTexts()
      for (const h of ['Popular', 'Cuisines', 'Trending dishes', 'Top reviews', 'All places']) expect(heads.map(x => x.toLowerCase()), `section "${h}"`).toContain(h.toLowerCase())
      // "Open now" is only there while a place is open (Baku night: none), and then it is the rail's title
      for (const h of heads) expect(h, 'no section is called Discover / Promos / New places').not.toMatch(/discover|promos?|new places/i)
      await expect(page.locator('.sr-zero .sr-recent'), 'a fresh browser has no recent searches').toHaveCount(0)
      expect(await page.locator('.sr-zero .sr-pop-chip').count(), 'popular chips').toBeGreaterThanOrEqual(3)
      expect(await page.locator('.sr-zero .rv').count(), 'top reviews are compact review rows').toBeGreaterThanOrEqual(1)
      expect(await page.locator('.sr-zero a.sr-row').count(), 'place rows').toBeGreaterThanOrEqual(8)
      await expect(page.getByRole('tab', { name: 'Discover' }), 'no Discover tab').toHaveCount(0)
      await expect(page.locator('.sr-zero').getByText('Promos', { exact: true })).toHaveCount(0)
      expect(t.watch.consoleErrors, 'console errors').toEqual([])
    } finally { await t.close() }
  })

  test('Home has no Discover tab: /?tab=discover and a remembered Discover tab land on /explore, the bottom nav goes to Search', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await page.goto(url('/?tab=discover'))
      await expect(page).toHaveURL(url('/explore'))
      await expect(page.locator('.sr-field')).toBeVisible()
      await page.evaluate(() => localStorage.setItem('rufesto_home_tab', 'discover'))
      await page.goto(url('/'))
      await expect(page).toHaveURL(url('/explore'))
      await page.goto(url('/'))
      await expect(page.getByRole('tab', { name: 'For you', exact: true })).toBeVisible()
      await expect(page.getByRole('tab', { name: 'Friends', exact: true })).toBeVisible()
      await expect(page.getByRole('tab', { name: 'Discover' }), 'Home has two tabs').toHaveCount(0)
      expect(await page.getByRole('tablist', { name: 'Home view' }).getByRole('tab').count(), 'exactly two Home tabs').toBe(2)
      await page.getByRole('navigation').getByRole('link', { name: 'Search', exact: true }).tap()
      await expect(page).toHaveURL(url('/explore'))
      await expect(page.locator('.sr-zero h2.dsc-h').first()).toBeVisible()
    } finally { await t.close() }
  })

  // --------------------------------------------------------------------------------------------------- typing
  test('typing "doner": Places and Dishes groups in 64 px rows, All / Places / Dishes tabs (no People signed out), q in the URL, match highlighted', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await openZero(page)
      const t0 = Date.now()
      await field(page).fill('doner')
      await expect(page.locator('.sr-results .sr-row').first()).toBeVisible()
      testInfo.annotations.push({ type: 'timing', description: `keystrokes to the first row: ${Date.now() - t0} ms (target: local < 50 ms, server < 400 ms p75)` })
      await settle(page)
      await expect(page.locator('.sr-zero'), 'the zero state is replaced by the results').toHaveCount(0)
      expect((await page.locator('.sr-tab').allInnerTexts()).map(s => s.trim()), 'tabs signed out').toEqual(['All', 'Places', 'Dishes'])
      expect((await page.locator('.sr-results h2.sr-sec-title').allInnerTexts()).map(s => s.toLowerCase())).toEqual(['places', 'dishes'])
      await expect(page.locator('.sr-results a.sr-row').filter({ hasText: 'Dönər Bakı Express' }).first()).toBeVisible()
      await expect(page.locator('.sr-results .sr-row-btn').filter({ hasText: 'Döner in Bread' })).toBeVisible()
      await expect.poll(() => new URL(page.url()).searchParams.get('q'), { message: 'the query is kept in the URL' }).toBe('doner')
      const heights = await page.locator('.sr-results .sr-row').evaluateAll(rows => rows.map(r => Math.round(r.getBoundingClientRect().height)))
      expect(heights.length).toBeGreaterThanOrEqual(3)
      for (const h of heights) expect(h, 'a place / dish row is 64 px').toBe(64)
      expect(await page.locator('.sr-results .sr-name b.sr-hit').count(), 'the match is marked in the name').toBeGreaterThan(0)
      // the Dishes tab lists dishes only, the clear button empties the field and brings the zero state back
      await tab(page, 'Dishes').tap()
      await expect(tab(page, 'Dishes')).toHaveAttribute('aria-selected', 'true')
      await expect(placeRows(page)).toHaveCount(0)
      await expect(dishRows(page).first()).toBeVisible()
      expect(await page.evaluate(() => new URL(location.href).searchParams.get('tab'))).toBe('dishes')
      await page.getByRole('button', { name: 'Clear search' }).tap()
      await expect(page.locator('.sr-zero h2.dsc-h').first()).toBeVisible()
      expect(await field(page).inputValue()).toBe('')
      expect(t.watch.consoleErrors, 'console errors').toEqual([])
    } finally { await t.close() }
  })

  test('at least 9 dish rows fit on one phone screen (Dishes tab)', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await openZero(page)
      await type(page, 'pa')
      await tab(page, 'Dishes').tap()
      await expect(dishRows(page).nth(10)).toBeVisible()
      const inView = await dishRows(page).evaluateAll(rows => rows.filter(r => { const b = r.getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight }).length)
      expect(inView, 'dish rows fully visible on a 390x844 screen (was 4 in the old grid)').toBeGreaterThanOrEqual(9)
    } finally { await t.close() }
  })

  for (const [q, expected, what] of [
    ['doner', /Döner/, 'a dish with an accent'],
    ['tiramisu', /Tiramisù/, 'a dish with a grave accent'],
    ['plov', /Plov/, 'a dish'],
    ['seda ocagi', /Səda Ocağı/, 'a venue whose name has ə and ğ'],
    ['BELLA', /Trattoria Bella Roma/, 'upper case'],
  ]) {
    test(`folding: "${q}" finds ${what}`, async ({ browser }, testInfo) => {
      const t = await U.phone(browser, testInfo)
      try {
        const { page } = t
        await openZero(page)
        await type(page, q)
        await expect(page.locator('.sr-results .sr-row').filter({ hasText: expected }).first(), `"${q}" finds ${expected}`).toBeVisible()
      } finally { await t.close() }
    })
  }

  // The plan (3.9 #3) names "sada ocagi" next to "doner", "tiramisu", "plov". The venue is "Səda Ocağı"; the folding maps ə to e, so "sada"
  // does not match while "seda" does (V2-CONTRACT 23 / sql/66 fold). Kept red on purpose: see docs/qa/RUN-REPORT-ux.md.
  test('folding: "sada ocagi" finds Səda Ocağı (ə typed as a)', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await openZero(page)
      await type(page, 'sada ocagi')
      await expect(page.locator('.sr-results .sr-row').filter({ hasText: /Səda Ocağı/ }).first()).toBeVisible({ timeout: 4_000 })
    } finally { await t.close() }
  })

  test('no results: the message names the query, with the Popular chips again; a chip searches it', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await openZero(page)
      await type(page, 'zzqxj')
      await expect(page.locator('.sr-empty')).toBeVisible()
      await expect(page.locator('.sr-empty-title')).toHaveText('No results for “zzqxj”')
      await expect(page.locator('.sr-empty-hint')).toHaveText('Check the spelling or try a dish or cuisine.')
      const chip = page.locator('.sr-empty .sr-pop-chip').first()
      const label = (await chip.innerText()).trim()
      expect(await page.locator('.sr-empty .sr-pop-chip').count(), 'Popular chips under the message').toBeGreaterThan(1)
      await chip.tap()
      if (await page.locator('.sr-results').count()) await expect(page.locator('.sr-empty')).toHaveCount(0)
      testInfo.annotations.push({ type: 'note', description: `tapped the popular chip "${label}"` })
    } finally { await t.close() }
  })

  // --------------------------------------------------------------------------------------------------- filters
  test('Filters sheet: Cuisine narrows the places, the active chip sits under the field, its x removes the filter', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await openZero(page)
      const all = await page.locator('.sr-zero .dsc-sec').filter({ has: page.getByRole('heading', { name: 'All places' }) }).locator('a.sr-row').count()
      await filtersBtn(page).tap()
      await expect(filtersSheet(page)).toBeVisible()
      await expect(filtersSheet(page).getByRole('heading', { name: 'Filters', level: 2 })).toBeVisible()
      for (const label of ['Open now', 'Cuisine', 'Price', 'Distance', 'Diet (dishes)']) {
        await expect(filtersSheet(page).getByText(label, { exact: true }).first(), `filter "${label}"`).toBeVisible()
      }
      await expect(filtersSheet(page).getByRole('switch', { name: 'Open now' })).toHaveAttribute('aria-checked', 'false')
      // Distance needs the location: disabled with a "Use my location" link
      for (const b of await filtersSheet(page).getByRole('radiogroup', { name: 'Distance' }).getByRole('radio').all()) await expect(b).toBeDisabled()
      await expect(filtersSheet(page).getByRole('button', { name: 'Use my location' })).toBeVisible()
      await filtersSheet(page).getByRole('radio', { name: 'Italian', exact: true }).tap()
      await expect(filtersSheet(page).getByRole('radio', { name: 'Italian', exact: true })).toHaveAttribute('aria-checked', 'true')
      await filtersSheet(page).getByRole('button', { name: 'Show results' }).tap()
      await U.noSheet(page)
      await expect.poll(() => (new URL(page.url()).searchParams.get('cuisine') || '').toLowerCase(), { message: 'the filter is in the URL' }).toBe('italian')
      await expect(page.locator('.sr-active .sr-achip')).toHaveCount(1)
      await expect(page.locator('.sr-active .sr-achip')).toContainText('Italian')
      await expect(page.locator('.sr-filter-dot'), 'the Filters button shows a dot').toBeVisible()
      await expect(page.locator('.sr-results')).toBeVisible()
      await settle(page)
      await tab(page, 'Places').tap()
      await expect(placeRows(page).first()).toBeVisible()
      const metas = await placeRows(page).locator('.sr-meta').allInnerTexts()
      expect(metas.length, 'places found with Italian').toBeGreaterThanOrEqual(1)
      expect(metas.length, 'fewer than all places').toBeLessThan(all)
      for (const m of metas) expect(m, 'every place row is Italian').toMatch(/Italian/)
      await expect(page.locator('.sr-results a.sr-row').filter({ hasText: 'Trattoria Bella Roma' })).toBeVisible()
      // the dishes of those places
      await tab(page, 'Dishes').tap()
      await expect(dishRows(page).first()).toBeVisible()
      for (const m of await dishRows(page).locator('.sr-meta').allInnerTexts()) expect(m, 'every dish row belongs to an Italian place').toMatch(/Trattoria Bella Roma/)
      // x on the chip removes the filter, the zero state is back
      await page.getByRole('button', { name: 'Remove filter Italian' }).tap()
      await expect(page.locator('.sr-active .sr-achip')).toHaveCount(0)
      await expect(page.locator('.sr-zero h2.dsc-h').first()).toBeVisible()
      expect(new URL(page.url()).searchParams.get('cuisine')).toBeNull()
    } finally { await t.close() }
  })

  test('Filters sheet: Open now and Price (browse mode without a query); Reset clears the draft; the URL keeps them', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await openZero(page)
      await filtersBtn(page).tap()
      await expect(filtersSheet(page)).toBeVisible()
      await filtersSheet(page).getByRole('switch', { name: 'Open now' }).tap()
      await filtersSheet(page).getByRole('radio', { name: '₼₼', exact: true }).tap()
      await expect(filtersSheet(page).getByRole('radio', { name: '₼₼', exact: true })).toHaveAttribute('aria-checked', 'true')
      await filtersSheet(page).getByRole('button', { name: 'Reset' }).tap()
      await expect(filtersSheet(page).getByRole('switch', { name: 'Open now' })).toHaveAttribute('aria-checked', 'false')
      await expect(filtersSheet(page).getByRole('radio', { name: '₼₼', exact: true })).toHaveAttribute('aria-checked', 'false')
      await filtersSheet(page).getByRole('switch', { name: 'Open now' }).tap()
      await filtersSheet(page).getByRole('button', { name: 'Show results' }).tap()
      await U.noSheet(page)
      await expect.poll(() => new URL(page.url()).searchParams.get('open')).toBe('1')
      await expect(page.locator('.sr-active .sr-achip')).toContainText('Open now')
      await expect(page.locator('.sr-results')).toBeVisible()
      await settle(page)
      // either no place is open at this hour (the empty state says so) or every row that is listed is not marked Closed
      const rows = await page.locator('.sr-results .sr-row').count()
      if (rows === 0) {
        await expect(page.locator('.sr-empty-title')).toHaveText('Nothing matches these filters')
      } else {
        await tab(page, 'Places').tap()
        for (const r of await placeRows(page).all()) await expect(r, 'an open place is not marked Closed').not.toContainText(/Closed/)
      }
      await page.reload()                                                      // the URL is the state
      await expect(page.locator('.sr-active .sr-achip')).toContainText('Open now')
      await page.getByRole('button', { name: 'Remove filter Open now' }).tap()
      await expect(page.locator('.sr-active .sr-achip')).toHaveCount(0)
    } finally { await t.close() }
  })

  // ----------------------------------------------------------------------------------------------------- recent
  test('recent searches: saved on Enter, kept after a reload, one can be removed, Clear empties the list; they never leave the browser', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      const rpcBodies = []
      page.on('request', r => { if (/\/rpc\/search(\?|$)/.test(r.url())) rpcBodies.push(r.postData() || '') })
      await openZero(page)
      for (const q of ['pasta', 'tiramisu']) {
        await type(page, q)
        await field(page).press('Enter')
        await page.getByRole('button', { name: 'Clear search' }).tap()
        await expect(page.locator('.sr-zero h2.dsc-h').first()).toBeVisible()
      }
      await expect(page.locator('.sr-recent .sr-recent-row')).toHaveText(['tiramisu', 'pasta'])    // newest first
      await expect.poll(() => new URL(page.url()).searchParams.get('q'), { message: 'the query left the URL (debounced)' }).toBeNull()
      await page.reload()
      await expect(page.locator('.sr-recent .sr-recent-row'), 'recent searches survive a reload').toHaveText(['tiramisu', 'pasta'])
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rufesto_recent_searches'))), 'stored on this device').toEqual(['tiramisu', 'pasta'])
      // tapping one searches it
      await page.locator('.sr-recent-main', { hasText: 'pasta' }).tap()
      await expect(field(page)).toHaveValue('pasta')
      await expect(page.locator('.sr-results')).toBeVisible()
      await page.getByRole('button', { name: 'Clear search' }).tap()
      // remove one
      await page.getByRole('button', { name: 'Remove “tiramisu” from recent searches' }).tap()
      await expect(page.locator('.sr-recent .sr-recent-row')).toHaveText(['pasta'])
      await page.getByRole('button', { name: 'Clear', exact: true }).tap()
      await expect(page.locator('.sr-recent')).toHaveCount(0)
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('rufesto_recent_searches')))).toEqual([])
      expect(rpcBodies.every(b => !/recent/i.test(b)), 'the recent list is never sent to the server').toBe(true)
    } finally { await t.close() }
  })

  // ------------------------------------------------------------------------------------------------------- back
  test('Back from a restaurant restores the scroll position of the zero state', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await openZero(page)
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(1500)
      await U.scrollTo(page, 800)
      await expect.poll(() => U.probe(page).then(p => p.winY)).toBe(800)
      const row = page.locator('.sr-zero a.sr-row').filter({ has: page.locator('.sr-name') }).last()
      const href = await row.getAttribute('href')
      await row.scrollIntoViewIfNeeded()
      const y = (await U.probe(page)).winY
      await row.tap()
      await expect(page).toHaveURL(url(href))
      await page.goBack()
      await expect(page).toHaveURL(url('/explore'))
      await expect(page.locator('.sr-zero a.sr-row').first()).toBeAttached()
      await expect.poll(() => U.probe(page).then(p => Math.abs(p.winY - y)), { message: `scroll restored near ${y}`, timeout: 6_000 }).toBeLessThanOrEqual(60)
    } finally { await t.close() }
  })

  test('Back from a restaurant restores the query and the tab', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await openZero(page)
      await type(page, 'be')
      await tab(page, 'Places').tap()
      await expect(placeRows(page).filter({ hasText: 'Trattoria Bella Roma' })).toBeVisible()
      await expect.poll(() => new URL(page.url()).searchParams.get('tab')).toBe('places')
      await placeRows(page).filter({ hasText: 'Trattoria Bella Roma' }).tap()
      await expect(page).toHaveURL(url('/restaurant/bella-roma'))
      await page.goBack()
      await expect(page).toHaveURL(/\/explore\?(?=.*q=be)(?=.*tab=places)/)
      await expect(field(page)).toHaveValue('be')
      await expect(tab(page, 'Places')).toHaveAttribute('aria-selected', 'true')
      await expect(placeRows(page).filter({ hasText: 'Trattoria Bella Roma' })).toBeVisible()
    } finally { await t.close() }
  })

  test('a dish row opens the dish sheet over the page (?dish= pushed), Back returns to the same results', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await openZero(page)
      await type(page, 'doner')
      await dishRows(page).filter({ hasText: 'Döner in Bread' }).tap()
      await expect(page.locator('.bs-root.dds-root[data-state="open"]')).toBeVisible()
      await expect(page.locator('.dds-name')).toHaveText('Döner in Bread')
      expect(page.url()).toMatch(/q=doner/)
      expect(page.url()).toMatch(/dish=/)
      await page.goBack()
      await U.noSheet(page)
      expect(page.url()).not.toContain('dish=')
      await expect(field(page)).toHaveValue('doner')
      await expect(dishRows(page).filter({ hasText: 'Döner in Bread' })).toBeVisible()
    } finally { await t.close() }
  })

  // ---------------------------------------------------------------------------------------------------- people
  test('People: signed out there is no People tab; signed in it needs 3 letters and then lists people with an Add friend button', async ({ browser }, testInfo) => {
    const anon = await U.phone(browser, testInfo)
    try {
      await openZero(anon.page)
      await type(anon.page, 'nigar')
      await expect(tab(anon.page, 'People'), 'a signed-out guest never sees People').toHaveCount(0)
      await expect(anon.page.locator('.sr-row-person')).toHaveCount(0)
    } finally { await anon.close() }

    const t = await U.phone(browser, testInfo, 1)
    try {
      const { page } = t
      await openZero(page)
      await type(page, 'ni')
      await tab(page, 'People').tap()
      await expect(page.locator('.sr-hint')).toHaveText('Type 3 letters to find people')
      await type(page, 'nigar')
      await expect(page.locator('.sr-row-person').first()).toBeVisible()
      await tab(page, 'All').tap()
      await expect(page.locator('.sr-results h2.sr-sec-title').filter({ hasText: /people/i })).toBeVisible()
      const row = page.locator('.sr-row-person').filter({ hasText: 'Nigar' }).first()
      await expect(row).toBeVisible()
      expect((await U.box(row)).height, 'a person row is compact (plan: 56 px)').toBeLessThanOrEqual(80)
      const labels = await page.locator('.sr-row-person .sr-btn').allInnerTexts()
      expect(labels.length).toBeGreaterThan(0)
      for (const l of labels) expect(l.trim(), 'the action of a person row').toMatch(/^(Add friend|Accept|Requested|Friends)$/)
      expect(t.watch.consoleErrors, 'console errors').toEqual([])
    } finally { await t.close() }
  })

  // ------------------------------------------------------------------------------------------ round 4 (QA round 3, A2 / A3)
  test('no stale rows: while a new query is in flight the rows of the previous query are gone and a progress bar runs; a slow answer that lands late never overwrites a newer one', async ({ browser }, testInfo) => {
    test.setTimeout(60_000)
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      const delays = {}
      await page.route('**/rest/v1/rpc/search*', async route => {
        let q = ''
        try { q = (route.request().postDataJSON() || {}).p_q || '' } catch { /* not JSON */ }
        if (delays[q]) await new Promise(r => setTimeout(r, delays[q]))
        await route.continue().catch(() => {})            // a request the page aborted meanwhile is gone: nothing to continue
      })
      await openZero(page)
      const names = () => page.locator('.sr-results .sr-row .sr-name').allInnerTexts()
      const doner = /d[öo]n[eə]r/i
      // 1. "doner" answered, then "pizza" typed while its answer takes 2.5 s: no Döner row is shown meanwhile
      await type(page, 'doner')
      expect((await names()).some(n => doner.test(n)), 'the doner answer is on screen').toBe(true)
      delays.pizza = 2_500
      await field(page).fill('pizza')
      await expect(page.locator('.sr-list')).toHaveAttribute('aria-busy', 'true')
      await expect(page.locator('.sr-progress'), 'a slim progress bar runs while the answer is on its way').toBeVisible()
      for (const n of await names()) expect(n, 'a row of the previous query while the new answer is loading').not.toMatch(doner)
      await expect.poll(() => page.locator('.sr-list').getAttribute('aria-busy'), { timeout: 8_000 }).not.toBe('true')
      expect((await names()).join(' | '), 'the pizza answer').toMatch(/pizza/i)
      await expect(page.locator('.sr-progress')).toHaveCount(0)
      // 2. out of order: "doner" is slow (3.5 s), "pizza" typed right after is fast: the late doner answer must not replace the pizza rows
      delays.pizza = 0
      delays.doner = 3_500
      await field(page).fill('')
      await field(page).fill('doner')
      await page.waitForTimeout(500)                      // past the debounce: the doner request is in flight
      await field(page).fill('pizza')
      await expect.poll(() => page.locator('.sr-list').getAttribute('aria-busy'), { timeout: 8_000 }).not.toBe('true')
      expect((await names()).join(' | ')).toMatch(/pizza/i)
      await page.waitForTimeout(4_000)                    // the slow doner answer lands now
      expect(await field(page).inputValue()).toBe('pizza')
      for (const n of await names()) expect(n, 'a late answer of an older query replaced the rows').not.toMatch(doner)
      expect((await names()).join(' | ')).toMatch(/pizza/i)
      expect(t.watch.consoleErrors, 'console errors').toEqual([])
    } finally { await t.close() }
  })

  test('small thumbnails: a 48 px row asks for a small rendition (Unsplash photos come as w=96), not the 800 px original', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      const photos = []
      page.on('request', r => { if (r.resourceType() === 'image' && /images\.unsplash\.com/.test(r.url())) photos.push(r.url()) })
      await openZero(page)
      await expect.poll(() => page.locator('.sr-zero .sr-thumb img').count(), { message: 'thumbnails in the zero state' }).toBeGreaterThan(3)
      await page.waitForTimeout(1_500)
      const srcs = await page.locator('.sr-zero .sr-row .sr-thumb img').evaluateAll(els => els.map(e => e.currentSrc || e.src))
      const unsplash = srcs.filter(s => /images\.unsplash\.com/.test(s))
      test.skip(unsplash.length === 0, 'no Unsplash demo photo among the rows')
      for (const s of unsplash) {
        const w = Number(new URL(s).searchParams.get('w'))
        expect(w, `row thumbnail ${s.slice(0, 90)} asks for a width`).toBeGreaterThan(0)
        expect(w, `row thumbnail width (48 px box, retina: 96)`).toBeLessThanOrEqual(192)
      }
      expect(photos.filter(u => Number(new URL(u).searchParams.get('w')) >= 700).length, 'originals of 700+ px loaded for the thumbnails').toBe(0)
    } finally { await t.close() }
  })

  test('the active filter chip is a 44 px target (round 4: it was 36 px)', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await page.goto(url('/explore?cuisine=Italian'))
      await expect(page.locator('.sr-active .sr-achip')).toBeVisible()
      expect((await U.box(page.locator('.sr-active .sr-achip'))).height, 'chip height').toBeGreaterThanOrEqual(44)
      await expect(filtersBtn(page)).toBeVisible()
      expect((await U.box(filtersBtn(page))).height, 'Filters button height').toBeGreaterThanOrEqual(44)
    } finally { await t.close() }
  })
})
