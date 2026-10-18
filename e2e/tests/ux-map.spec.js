// @consumer @feat @ux @map — the redesigned Map tab (docs/MAP-PLAN-2026-10-18.md, acceptance criteria section 9, items 4-12).
// Phone tests (Pixel 7 touch at 390x844, the size the plan measures at) run in the `mobile` project, desktop tests (1280x800 mouse)
// in `chromium`; both build their own contexts (support/map.js). Read only: nothing is written on the preview.
// WebGL: headless Chromium draws the map with SwiftShader (no flags needed); QA_MAP_GPU=1 uses the new headless mode on the real
// GPU. Screenshots go to e2e/artifacts/map/. The perf probe runs only with QA_MAP_PERF=1 (see the end of the file).
const { test, expect } = require('@playwright/test')
const M = require('../support/map')

const { CENTRE_CAM, state, camera, swipe } = M
const PEEK_SEED = { camera: CENTRE_CAM, snap: 0, filters: { open: false, kinds: [] } }
const HALF_SEED = { ...PEEK_SEED, snap: 1 }
const slugOf = (data, id) => data.places.find(p => p.id === id)?.slug
const idOf = (data, slug) => data.places.find(p => p.slug === slug)?.id
if (process.env.QA_MAP_GPU) test.use({ channel: 'chromium' })
test.afterEach(() => M.closeAll())

/** Safe rect of the phone screen while the carousel shows (plan 4): the visible area ends at the card's top; inset 48. */
async function safeRectWithCard(page) {
  const { card } = await state(page)
  return { left: 48, right: 390 - 48, top: 48, bottom: card.top - 48 }
}
const inside = (p, r) => !!p && p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom

/** Taps a pin and resolves { open, settled } ms from its click to the carousel opening / standing still (page clock). */
async function tapPin(page, id) {
  const timing = page.evaluate(() => new Promise(resolve => {
    let t0 = null
    let open = null
    document.addEventListener('click', e => { if (e.target.closest?.('.mp-pin')) t0 = e.timeStamp }, { capture: true, once: true })
    const start = performance.now()
    const tick = () => {
      const w = document.querySelector('.mp-car-wrap[data-open]')
      if (t0 != null && w && open == null) open = performance.now() - t0
      // at rest the carousel ends 12 px above the bottom of the screen (= the top of the bottom nav)
      const rest = document.querySelector('.mp-screen').getBoundingClientRect().bottom - 12
      if (open != null && Math.abs(w.getBoundingClientRect().bottom - rest) < 0.5 && getComputedStyle(w).opacity === '1') {
        resolve({ open: Math.round(open), settled: Math.round(performance.now() - t0) }); return
      }
      if (performance.now() - start > 3000) { resolve({ open, settled: null }); return }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }))
  await page.locator(`.mp-pin[data-id="${id}"]`).tap()
  return timing
}

async function headPoint(page) {
  const { panel } = await state(page)
  return { x: 195, y: panel.top + 12 }
}
const snapYs = page => page.evaluate(() => {
  const full = document.querySelector('.ss-panel').offsetHeight
  const H = document.querySelector('.mp-screen').clientHeight
  return [full - 116, full - Math.max(164, Math.round(H * 0.5)), 0]
})

// =====================================================================================================================
test.describe('phone (Pixel 7, 390x844, touch) @consumer @feat @ux @map', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'mobile', 'phone tests run in the mobile project') })

  test('list rows render before the map; map, pins and attribution load; initial camera is recorded', async ({ browser }, testInfo) => {
    const { page, w, close } = await M.openMap(browser, {})
    const data = await M.gotoMap(page)
    await M.mapReady(page)
    const marks = await page.evaluate(() => window.__qa.marks)
    const s = await state(page)
    expect(s.rows).toHaveLength(data.places.length)
    expect(s.count).toMatch(new RegExp(`^${data.places.length} places · \\d+ open$`))
    expect(marks.row, 'the list is on screen before the map canvas is shown').toBeLessThan(marks.ready)
    await expect(page.locator('.mp-attr a')).toHaveCount(3)
    await expect(page.locator('.mp-zoom'), 'no +/- with a coarse pointer').toBeHidden()
    // finding, not a gate: the initial camera fits all venues; Tiflis Dvor (~10 km east of the Old City) pulls it out to bubbles
    const cam = await camera(page)
    testInfo.annotations.push({ type: 'initial-camera', description: `zoom ${cam.zoom.toFixed(2)}, ${s.clusters} count bubble(s), ${s.pins.length} pins; marks ${JSON.stringify(marks)}` })
    await M.shot(page, 'phone-dark-initial-camera')
    await M.expectClean(page, w)
    await close()
  })

  test('pin tap selects (card <= 300 ms, aria-pressed, .is-selected); ?place= pushed once then replaced; map tap deselects', async ({ browser }, testInfo) => {
    const { page, w, cdp, close } = await M.openMap(browser, { seed: PEEK_SEED })
    const data = await M.gotoMap(page)
    await M.mapReady(page)
    const pins = await M.tappablePins(page)
    expect(pins.length, 'pins at peek over the Old City').toBeGreaterThanOrEqual(3)
    const s0 = await state(page)
    const cam0 = await camera(page)
    const a = pins[0]
    const t = await tapPin(page, a.id)
    testInfo.annotations.push({ type: 'select-timing', description: `click -> carousel open ${t.open} ms, settled ${t.settled} ms` })
    expect(t.open, 'pin tap -> card').toBeLessThanOrEqual(300)
    let s = await state(page)
    expect(s.url).toBe(`/map?place=${slugOf(data, a.id)}`)
    expect(s.hist, 'the first selection pushes').toBe(s0.hist + 1)
    expect(s.selectedPins).toEqual([a.id])
    expect(s.pressedPins).toEqual([a.id])
    expect(s.selectedRows).toEqual([a.id])
    expect(s.centredCard).toBe(a.id)
    // the camera moves only when the pin leaves the safe rect (the carousel now covers the bottom)
    const cam1 = await M.cameraStill(page)
    const rect = await safeRectWithCard(page)
    expect(M.centrePx(cam0, cam1) > 1, `camera moved = pin outside the safe rect (${JSON.stringify(a)})`).toBe(!inside(a, rect))

    const b = (await M.tappablePins(page, { bottom: rect.bottom + 48 })).find(p => p.id !== a.id)
    await page.locator(`.mp-pin[data-id="${b.id}"]`).tap()
    await expect.poll(async () => (await state(page)).selectedPins).toEqual([b.id])
    s = await state(page)
    expect(s.url).toBe(`/map?place=${slugOf(data, b.id)}`)
    expect(s.hist, 'later selections replace').toBe(s0.hist + 1)
    expect(s.pressedPins).toEqual([b.id])
    await expect.poll(async () => (await state(page)).centredCard).toBe(b.id)

    const empty = await M.emptyMapPoint(page, { top: 90, bottom: rect.bottom })
    expect(empty, 'a bare spot of map above the card').not.toBeNull()
    await M.tapAt(cdp, empty)
    await expect.poll(async () => (await state(page)).url).toBe('/map')
    await expect(page.locator('.mp-car-wrap')).toHaveCount(0)
    s = await state(page)
    expect(s.selectedPins).toEqual([])
    expect(s.pressedPins).toEqual([])
    await M.expectClean(page, w)
    await close()
  })

  test('APP DEFECT: on a pin tap the card carousel appears in place, it does not slide up', async ({ browser }) => {
    test.fail(true, 'plan 4 "Carousel in": translateY(calc(100% + 12px)) -> 0 in 320 ms; on a tap the first frame of .mp-car-wrap already has data-open at rest (PlaceCarousel.jsx useMountTransition), only the sheet animates')
    const { page } = await M.openMap(browser, { seed: PEEK_SEED })
    await M.gotoMap(page)
    await M.mapReady(page)
    const p = (await M.tappablePins(page))[0]
    const tops = page.evaluate(() => new Promise(resolve => {
      const out = []
      const t0 = performance.now()
      const tick = () => {
        const w = document.querySelector('.mp-car-wrap')
        if (w) out.push(Math.round(w.getBoundingClientRect().top))
        if (performance.now() - t0 < 1200) requestAnimationFrame(tick); else resolve(out)
      }
      requestAnimationFrame(tick)
    }))
    await page.locator(`.mp-pin[data-id="${p.id}"]`).tap()
    const seen = await tops
    expect(Math.max(...seen) - seen[seen.length - 1], `card top per frame: ${seen.slice(0, 12).join(', ')}`).toBeGreaterThan(50)
  })

  test('carousel swipe changes the selected pin (URL replaced); the camera moves only for pins outside the safe rect', async ({ browser }, testInfo) => {
    test.setTimeout(120_000)
    const { page, w, cdp, close } = await M.openMap(browser, { seed: PEEK_SEED })
    const data = await M.gotoMap(page)
    await M.mapReady(page)
    const first = (await M.tappablePins(page))[0]
    await tapPin(page, first.id)
    await M.carouselTo(page, (await state(page)).rows[0])   // start at the first card, then swipe through all of them
    await M.cameraStill(page)
    const hist = (await state(page)).hist
    const log = []
    for (let i = 0; i < data.places.length - 1; i += 1) {
      const s0 = await state(page)
      const cam0 = await camera(page)
      const rect = await safeRectWithCard(page)
      const where = {}
      for (const id of s0.rows) where[id] = await M.pinPoint(page, id)
      const cardY = s0.card.top + 60
      await swipe(cdp, { x: 330, y: cardY }, { x: 90, y: cardY }, { steps: 8, dt: 16 })
      await expect.poll(async () => (await state(page)).selectedPins[0], { timeout: 5_000 }).not.toBe(s0.selectedPins[0])
      const cam1 = await M.cameraStill(page)
      const s1 = await state(page)
      const id = s1.selectedPins[0]
      const moved = M.centrePx(cam0, cam1) > 1
      log.push(`${slugOf(data, id)}: inside=${inside(where[id], rect)} moved=${moved}`)
      expect(s1.centredCard, 'the centred card is the selection').toBe(id)
      expect(s1.url).toBe(`/map?place=${slugOf(data, id)}`)
      expect(s1.hist, 'swipes replace the entry').toBe(hist)
      expect.soft(moved, `camera rule for ${slugOf(data, id)} (${JSON.stringify(where[id])})`).toBe(!inside(where[id], rect))
      if (s1.rows.indexOf(id) === s1.rows.length - 1) break
    }
    testInfo.annotations.push({ type: 'carousel', description: log.join('\n') })
    await M.expectClean(page, w)
    await close()
  })

  test('deep link /map?place= : selected at z16 with no camera animation, one Back leaves', async ({ browser }, testInfo) => {
    const { page, w, close } = await M.openMap(browser, { frameLog: true })
    await page.goto(M.url('/'))
    await expect(page.locator('a[href="/map"]').first()).toBeVisible()
    const data = await M.gotoMap(page, '/map?place=meze-istanbul')
    await M.mapReady(page)
    const meze = data.places.find(p => p.slug === 'meze-istanbul')
    const s = await state(page)
    expect(s.selectedPins).toEqual([meze.id])
    expect(s.centredCard).toBe(meze.id)
    const frames = await page.evaluate(() => window.__qa.frames)
    const firstData = frames.findIndex(f => f.row)
    const inPlace = frames.findIndex(f => f.card && f.open && f.wrapTy === 0)
    testInfo.annotations.push({ type: 'deep-link-frames', description: `first frame with rows #${firstData}, card in place #${inPlace}: ${JSON.stringify(frames.slice(Math.max(0, firstData - 1), firstData + 22))}` })
    testInfo.annotations.push({ type: 'deep-link-slide-in', description: `${inPlace - firstData} frames from the first data frame to the card in place (0 wanted, see the APP DEFECT test)` })
    const cam = await camera(page)
    expect(cam.zoom).toBeCloseTo(16, 2)
    expect(M.centrePx(cam, { center: [meze.lng, meze.lat], zoom: 16 })).toBeLessThanOrEqual(1)
    expect((await M.cameraTrace(page, 800)).length, 'the camera stands still after arrival').toBe(1)
    await M.shot(page, 'phone-dark-deep-link')
    await page.goBack()
    await expect.poll(() => new URL(page.url()).pathname).toBe('/')
    await M.expectClean(page, w)
    await close()
  })

  test('APP DEFECT: a cold deep link slides the card in instead of showing it on the first frame with data', async ({ browser }) => {
    test.fail(true, 'PlaceCarousel useMountTransition starts closed when the data is not cached yet, so the card animates in (plan 9.7, 4 "Return / deep link: 0 ms")')
    const { page, close } = await M.openMap(browser, { frameLog: true })
    await M.gotoMap(page, '/map?place=meze-istanbul')
    await expect(page.locator('.mp-car-wrap[data-open]')).toBeVisible()
    await M.wait(600)
    const frames = await page.evaluate(() => window.__qa.frames)
    const firstData = frames.findIndex(f => f.row)
    const inPlace = frames.findIndex(f => f.card && f.open && f.wrapTy === 0)
    expect(inPlace - firstData, 'frames from the first data frame to the card in place').toBeLessThanOrEqual(0)
    await close()
  })

  test('APP DEFECT: the card repeats the kind in its sub line ("Café · Cafe")', async ({ browser }) => {
    test.fail(true, 'PlaceCard.jsx:40 joins the kind label and the cuisine: "Café · Cafe · ₼", "Restaurant · Italian" (plan 3: "Italian · ₼₼")')
    const { page } = await M.openMap(browser, {})
    const data = await M.gotoMap(page, '/map?place=fincan-coffee')
    const sub = await page.locator(`.mp-slide[data-id="${idOf(data, 'fincan-coffee')}"] .mp-card-sub`).textContent()
    const fold = x => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
    const parts = sub.split(' · ').map(fold)
    expect(new Set(parts).size, `sub line "${sub}"`).toBe(parts.length)
  })

  test('APP DEFECT: a direct load of /map asks map_places twice', async ({ browser }) => {
    test.fail(true, 'MapScreen.jsx:52 useMapPlaces loads first, then MapScreen.jsx:76 prefetchMap() starts prefetchPlaces() (api.js) whose answer nobody takes')
    const { page, w } = await M.openMap(browser, {})
    await M.gotoMap(page)
    await M.wait(2500)
    expect(w.requests.filter(r => /\/rpc\/map_places/.test(r.url)).length).toBe(1)
  })

  test('map_places fails -> the list says so with Try again, and Try again recovers', async ({ browser }) => {
    const { ctx, page, w } = await M.openMap(browser, { seed: HALF_SEED })
    w.allow.push(/map_places|status of 503/)
    await ctx.route(/\/rpc\/map_places/, r => r.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"qa"}' }))
    await page.goto(M.url('/map'))
    const err = page.locator('.mp-empty[role="alert"]')
    await expect(err).toContainText("Couldn't load the places.")
    await M.shot(page, 'phone-dark-places-error')
    await ctx.unroute(/\/rpc\/map_places/)
    await M.wait(10_500)   // past the 10 s reuse window of the failed prefetch (see the APP DEFECT test below)
    await err.locator('button.mp-retry').tap()
    await expect(page.locator('.mp-li').first()).toBeVisible()
    await M.expectClean(page, w)
  })

  test('APP DEFECT: Try again within 10 s of a failed load asks nothing and keeps the error', async ({ browser }) => {
    test.fail(true, 'api.js fetchMapPlaces hands back the warm prefetch answer (WARM_MS 10 s) even when that answer failed, so the Retry makes no request')
    const { ctx, page, w } = await M.openMap(browser, {})
    await ctx.route(/\/rpc\/map_places/, r => r.fulfill({ status: 503, contentType: 'application/json', body: '{}' }))
    await page.goto(M.url('/map'))
    const err = page.locator('.mp-empty[role="alert"]')
    await expect(err).toBeVisible()
    await ctx.unroute(/\/rpc\/map_places/)
    const before = w.requests.filter(r => /map_places/.test(r.url)).length
    await err.locator('button.mp-retry').tap()
    await expect(page.locator('.mp-li').first(), `map_places requests: ${before} before the tap`).toBeVisible({ timeout: 5_000 })
  })

  test('APP DEFECT: while the places failed the head reads "0 places · 0 open"', async ({ browser }) => {
    test.fail(true, 'MapScreen.jsx:262 loading is false on error, so ListHead.jsx prints 0 / 0 above "Couldn\'t load the places."')
    const { ctx, page } = await M.openMap(browser, {})
    await ctx.route(/\/rpc\/map_places/, r => r.fulfill({ status: 503, contentType: 'application/json', body: '{}' }))
    await page.goto(M.url('/map'))
    await expect(page.locator('.mp-empty[role="alert"]')).toBeVisible()
    expect((await page.locator('.mp-count').textContent()).trim()).not.toMatch(/^0 places/)
  })

  test('APP DEFECT: a long "have been here" line widens the card past its slide (Aysel)', async ({ browser }) => {
    test.fail(true, '.mp-slide (styles.css:100) is a flex item with min-width:auto, so the nowrap friends text sets its width: the card reaches both screen edges and the neighbours no longer peek')
    const aysel = M.ayselAccount()
    test.skip(!aysel, 'Aysel not available')
    const answers = []
    const { page } = await M.openMap(browser, { who: aysel, seed: PEEK_SEED })
    page.on('response', async r => { if (/\/rpc\/map_places/.test(r.url())) answers.push(await r.json().catch(() => null)) })
    await page.goto(M.url('/map'))
    await expect.poll(() => answers.some(a => a?.signed_in), { timeout: 20_000 }).toBe(true)
    const fr = answers.filter(a => a?.signed_in).pop().places.find(p => p.friends?.count > 0)
    await M.mapReady(page)
    await tapPin(page, (await M.tappablePins(page))[0].id)
    await M.carouselTo(page, fr.id)
    const box = await page.locator(`.mp-slide[data-id="${fr.id}"] .mp-card`).boundingBox()
    expect(box.width, 'card = 100vw - 48 px (plan 3)').toBeLessThanOrEqual(390 - 48 + 1)
    expect(box.x, 'the neighbours peek on both sides').toBeGreaterThanOrEqual(16)
  })

  test('in-page select: Back deselects, the next Back leaves the map', async ({ browser }) => {
    const { page, w, close } = await M.openMap(browser, { seed: PEEK_SEED })
    await page.goto(M.url('/'))
    const resp = M.placesResponse(page)
    await page.locator('a[href="/map"]').first().tap()
    const data = await (await resp).json()
    await M.mapReady(page)
    const p = (await M.tappablePins(page))[0]
    await tapPin(page, p.id)
    expect((await state(page)).url).toBe(`/map?place=${slugOf(data, p.id)}`)
    await page.goBack()
    await expect.poll(async () => (await state(page)).url).toBe('/map')
    await expect(page.locator('.mp-car-wrap')).toHaveCount(0)
    expect((await state(page)).selectedPins).toEqual([])
    await page.goBack()
    await expect.poll(() => new URL(page.url()).pathname).toBe('/')
    await M.expectClean(page, w)
    await close()
  })

  test('restaurant page -> Back restores camera (+-1 px, +-0.01 zoom), snap and selection', async ({ browser }, testInfo) => {
    const { page, w, cdp, close } = await M.openMap(browser, { seed: PEEK_SEED })
    const data = await M.gotoMap(page)
    await M.mapReady(page)
    await swipe(cdp, { x: 230, y: 330 }, { x: 170, y: 290 }, { steps: 10, dt: 24, hold: 120 })   // a camera of the guest's own
    await M.pinch(cdp, { x: 195, y: 330 }, { from: 60, to: 90, steps: 8, dt: 24 })
    await M.cameraStill(page)
    const p = (await M.tappablePins(page))[0]
    await tapPin(page, p.id)
    const cam1 = await M.cameraStill(page)
    const s1 = await state(page)
    await page.locator(`.mp-slide[data-id="${p.id}"] .mp-act--menu`).tap()
    await expect.poll(() => new URL(page.url()).pathname).toBe(`/restaurant/${slugOf(data, p.id)}`)
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
    const t0 = Date.now()
    await page.goBack()
    await expect(page.locator('.mp-canvas__map.is-ready')).toHaveCount(1, { timeout: 15_000 })
    await expect(page.locator(`.mp-pin[data-id="${p.id}"].is-selected`)).toBeAttached()
    const back = Date.now() - t0
    const cam2 = await M.cameraStill(page)
    const s2 = await state(page)
    testInfo.annotations.push({ type: 'return', description: `Back -> map ready + selected pin in ${back} ms (test clock); camera ${JSON.stringify(cam1)} -> ${JSON.stringify(cam2)}` })
    expect(s2.url).toBe(s1.url)
    expect(M.centrePx(cam1, cam2), 'same centre').toBeLessThanOrEqual(1)
    expect(Math.abs(cam1.zoom - cam2.zoom), 'same zoom').toBeLessThanOrEqual(0.01)
    expect(s2.snap, 'same snap').toBe(s1.snap)
    expect(s2.selectedPins).toEqual([p.id])
    expect(s2.centredCard).toBe(p.id)
    await M.expectClean(page, w)
    await close()
  })

  test('filters: Coffee = exactly the cafés (pins + rows) with no request, < 50 ms; Open now agrees with Search', async ({ browser }, testInfo) => {
    const { page, w, close } = await M.openMap(browser, { seed: HALF_SEED })
    const data = await M.gotoMap(page)
    await M.mapReady(page)
    const coffee = data.places.filter(p => p.kind === 'coffee').map(p => p.id).sort()
    expect(coffee.length).toBeGreaterThan(0)
    const n0 = w.requests.length
    await page.locator('.mp-chip', { hasText: 'Coffee' }).tap()
    await expect.poll(async () => (await state(page)).rows.slice().sort()).toEqual(coffee)
    await M.wait(800)   // leaving pins fade out (160 ms) and the fit (500 ms) ends
    expect((await state(page)).pins.slice().sort(), 'only café pins').toEqual(coffee)
    expect((await state(page)).count).toMatch(new RegExp(`^${coffee.length} places`))
    const after = w.requests.slice(n0)
    const data2 = after.filter(r => !M.TILE_HOST.test(r.url) && r.type !== 'image').map(r => r.url)
    expect(data2, 'a filter asks nothing of the server (row photos and map tiles aside)').toEqual([])
    // the filter in the page clock: click, then React's render (a microtask for a discrete event), rows counted
    const speed = await page.evaluate(async want => {
      const chip = [...document.querySelectorAll('.mp-chip')].find(c => /Coffee/.test(c.textContent))
      const rows = () => document.querySelectorAll('.mp-li').length
      const until = async n => {
        const t0 = performance.now()
        for (let i = 0; i < 400 && rows() !== n; i += 1) await (i < 20 ? new Promise(r => queueMicrotask(r)) : new Promise(r => requestAnimationFrame(r)))
        return Math.round((performance.now() - t0) * 10) / 10
      }
      let t = performance.now()
      chip.click()   // off: every venue again
      const off = Math.round((performance.now() - t) * 10) / 10 + await until(want.all)
      const rowsOff = rows()
      t = performance.now()
      chip.click()   // on again
      const on = Math.round((performance.now() - t) * 10) / 10 + await until(want.coffee)
      return { off, on, rowsOff, rowsOn: rows() }
    }, { all: data.places.length, coffee: coffee.length })
    testInfo.annotations.push({ type: 'filter-speed', description: JSON.stringify(speed) + `; after the tap: ${after.filter(r => M.TILE_HOST.test(r.url)).length} tile, ${after.filter(r => r.type === 'image').length} image requests` })
    expect(speed.rowsOff).toBe(data.places.length)
    expect(speed.rowsOn).toBe(coffee.length)
    expect(Math.max(speed.off, speed.on), 'filter applied in the click (ms)').toBeLessThan(50)
    await page.locator('.mp-chip', { hasText: 'Coffee' }).tap()
    await page.locator('.mp-chip', { hasText: 'Open now' }).tap()
    const openIds = data.places.filter(p => p.open_now).map(p => p.id).sort()
    await expect.poll(async () => (await state(page)).rows.slice().sort()).toEqual(openIds)
    // Search (the Discover answer of the Search zero state) must agree for every venue
    const disc = page.waitForResponse(r => /\/rpc\/discover/.test(r.url()))
    await page.goto(M.url('/explore'))
    const all = (await (await disc).json()).all_restaurants || []
    const diff = data.places.map(p => [p.slug, p.open_now, all.find(r => r.id === p.id)?.open_now]).filter(([, a, b]) => a !== b)
    expect(all.length, 'Search lists every venue').toBeGreaterThanOrEqual(data.places.length)
    expect(diff, 'open now: map vs Search [slug, map, search]').toEqual([])
    await M.expectClean(page, w)
    await close()
  })

  test('sheet: 40 % drag -> half, 0.6 px/ms flick -> one snap, settle <= 420 ms, Back at full -> half, pin tap at half', async ({ browser }, testInfo) => {
    test.setTimeout(90_000)
    const { page, w, cdp, close } = await M.openMap(browser, { seed: PEEK_SEED })
    const data = await M.gotoMap(page)
    await M.mapReady(page)
    const ys = await snapYs(page)
    const settle = {}
    const go = async (name, from, dy, opts, want) => {
      await swipe(cdp, from, { x: from.x, y: from.y + dy }, opts)
      settle[name] = await M.settleTime(page, ys[want])
      expect(await page.locator('.mp-screen').getAttribute('data-snap'), name).toBe(String(want))
      expect.soft(settle[name], `${name}: settle (ms)`).not.toBeNull()
      expect.soft(settle[name], `${name}: settle (ms)`).toBeLessThanOrEqual(420)
    }
    expect(await page.locator('.mp-screen').getAttribute('data-snap')).toBe('0')
    await go('40% drag peek->half', await headPoint(page), -0.4 * (ys[0] - ys[1]), { steps: 20, dt: 16, hold: 150 }, 1)
    await go('40% drag half->peek', await headPoint(page), 0.4 * (ys[0] - ys[1]), { steps: 20, dt: 16, hold: 150 }, 0)
    await go('0.6 px/ms flick peek->half', await headPoint(page), -57.6, { steps: 6, dt: 16 }, 1)
    await go('0.6 px/ms flick half->full', await headPoint(page), -57.6, { steps: 6, dt: 16 }, 2)
    await go('20% drag full->full', await headPoint(page), 0.2 * (ys[1] - ys[2]), { steps: 12, dt: 16, hold: 150 }, 2)
    await M.wait(400)   // the full sheet's history entry (useSheetHistory, 250 ms after mount)
    await page.evaluate(() => { window.__qa.lastUp = performance.now() })   // the settle clock starts at Back (no finger)
    await page.goBack()
    await expect(page.locator('.mp-screen')).toHaveAttribute('data-snap', '1')
    settle['Back full->half'] = await M.settleTime(page, ys[1])
    expect((await state(page)).url, 'Back at full only lowers the sheet').toBe('/map')
    testInfo.annotations.push({ type: 'settle-ms', description: JSON.stringify(settle) })
    // a pin above the half sheet still selects
    const p = (await M.tappablePins(page))[0]
    expect(p, 'a pin above the half sheet').toBeTruthy()
    await tapPin(page, p.id)
    expect((await state(page)).selectedPins).toEqual([p.id])
    await M.expectClean(page, w)
    await close()
  })

  test('ENV-SUSPECT: the first tap on the map strip after a flick to full is swallowed (headless Chromium; verify on a phone)', async ({ browser }) => {
    test.fail(true, 'Headless Chromium drops the click of the first tap after a fling (fling-cancel tap suppression), even 2.5 s later; after a slow drag or the keyboard the same tap works. Check on a real Android phone before treating it as an app defect.')
    const { page, cdp } = await M.openMap(browser, { seed: HALF_SEED })
    await M.gotoMap(page)
    await M.mapReady(page)
    const h = await headPoint(page)
    await swipe(cdp, h, { x: h.x, y: h.y - 60 }, { steps: 6, dt: 16 })
    await expect(page.locator('.mp-screen')).toHaveAttribute('data-snap', '2')
    await M.wait(1500)
    await M.tapAt(cdp, { x: 195, y: 32 })
    await expect(page.locator('.mp-screen')).toHaveAttribute('data-snap', '1', { timeout: 2_000 })
  })

  test('the page never moves: list fling, over-drag both ends, carousel over-scroll, map pan + pinch, Directions open', async ({ browser }) => {
    test.setTimeout(120_000)
    const { page, w, cdp, close } = await M.openMap(browser, { seed: HALF_SEED })
    await M.gotoMap(page)
    await M.mapReady(page)
    const ys = await snapYs(page)
    await swipe(cdp, await headPoint(page), { x: 195, y: (await headPoint(page)).y - 60 }, { steps: 6, dt: 16 })
    await expect(page.locator('.mp-screen')).toHaveAttribute('data-snap', '2')
    await M.wait(450)
    await swipe(cdp, { x: 200, y: 640 }, { x: 200, y: 260 }, { steps: 6, dt: 16 })   // fling the list up
    await M.wait(1200)
    expect(await page.evaluate(() => document.querySelector('.ss-body').scrollTop), 'the list itself scrolled').toBeGreaterThan(0)
    await M.expectPageStill(page, 'list fling up')
    await swipe(cdp, { x: 200, y: 260 }, { x: 200, y: 700 }, { steps: 6, dt: 16 })   // fling down past the top
    await M.wait(1200)
    await M.expectPageStill(page, 'list fling down past the top')
    await M.cameraStill(page)
    if ((await page.locator('.mp-screen').getAttribute('data-snap')) !== '2') await swipe(cdp, await headPoint(page), { x: 195, y: (await headPoint(page)).y - 60 }, { steps: 6, dt: 16 })
    await M.wait(500)
    let h = await headPoint(page)
    await swipe(cdp, h, { x: h.x, y: h.y - 160 }, { steps: 16, dt: 16, hold: 100 })   // over-drag above full
    await M.wait(600)
    expect(await M.panelY(page)).toBeCloseTo(ys[2], 0)
    await M.expectPageStill(page, 'over-drag above full')
    for (let i = 0; i < 2; i += 1) { h = await headPoint(page); await swipe(cdp, h, { x: h.x, y: h.y + 60 }, { steps: 6, dt: 16 }); await M.wait(500) }
    await expect(page.locator('.mp-screen')).toHaveAttribute('data-snap', '0')
    h = await headPoint(page)
    await swipe(cdp, h, { x: h.x, y: h.y + 160 }, { steps: 16, dt: 16, hold: 100 })    // over-drag below peek
    await M.wait(600)
    expect(await M.panelY(page)).toBeCloseTo(ys[0], 0)
    await M.expectPageStill(page, 'over-drag below peek')
    // carousel over-scroll at both ends
    const p = (await M.tappablePins(page))[0]
    await tapPin(page, p.id)
    const rows = (await state(page)).rows
    await M.carouselTo(page, rows[0])
    let cy = (await state(page)).card.top + 60
    await swipe(cdp, { x: 60, y: cy }, { x: 360, y: cy }, { steps: 6, dt: 16 })
    await M.wait(900)
    await M.expectPageStill(page, 'carousel over-scroll at the first card')
    expect((await state(page)).url, 'an edge over-scroll is not a Back gesture').toContain('/map?place=')
    await M.carouselTo(page, rows[rows.length - 1])
    cy = (await state(page)).card.top + 60
    await swipe(cdp, { x: 340, y: cy }, { x: 30, y: cy }, { steps: 6, dt: 16 })
    await M.wait(900)
    await M.expectPageStill(page, 'carousel over-scroll at the last card')
    // map pan + pinch
    await M.cameraStill(page)
    await swipe(cdp, { x: 240, y: 300 }, { x: 120, y: 160 }, { steps: 14, dt: 16 })
    await M.pinch(cdp, { x: 195, y: 280 }, { from: 40, to: 150 })
    await M.pinch(cdp, { x: 195, y: 280 }, { from: 150, to: 50 })
    await M.wait(900)
    await M.expectPageStill(page, 'map pan + pinch')
    // Directions sheet open (modal, normal scroll lock), with a swipe on it
    const centred = (await state(page)).centredCard
    expect(centred, 'the card is still up after the pan').toBeTruthy()
    await page.locator(`.mp-slide[data-id="${centred}"] button.mp-act`).tap()
    await expect(page.locator('.bs-root[data-state="open"]')).toBeVisible()
    await swipe(cdp, { x: 200, y: 640 }, { x: 200, y: 300 }, { steps: 6, dt: 16 })
    await M.wait(600)
    await M.expectPageStill(page, 'Directions sheet open')
    await M.expectClean(page, w)
    await close()
  })

  test('Directions: Google / Waze / Yandex hand-over links, last used first, Copy address', async ({ browser }) => {
    const { page, w, close } = await M.openMap(browser, { seed: PEEK_SEED, permissions: ['clipboard-read', 'clipboard-write'] })
    const data = await M.gotoMap(page)
    await M.mapReady(page)
    const pin = (await M.tappablePins(page))[0]
    const place = data.places.find(p => p.id === pin.id)
    await tapPin(page, pin.id)
    const ll = `${place.lat},${place.lng}`
    const sheet = page.locator('.bs-root[data-state="open"] .bs-panel')
    const open = async () => {
      await page.locator(`.mp-slide[data-id="${pin.id}"] button.mp-act`).tap()
      await expect(sheet).toBeVisible()
      await expect(sheet).toContainText('Open in')
      await expect(sheet).toContainText(place.name)
      return sheet.locator('.mp-dir-row').allInnerTexts()
    }
    let rows = await open()
    expect(rows.map(r => r.trim())).toEqual(['Google Maps', 'Waze', 'Yandex Maps', 'Copy address'])
    const opened = () => page.evaluate(() => window.__qa.opened)
    const use = async (label, want) => {
      await sheet.locator('.mp-dir-row', { hasText: label }).tap()
      // wait until the closing sheet has left the DOM: a Directions tap during its 240 ms exit is swallowed (RUN-REPORT-map)
      await expect(page.locator('.bs-root')).toHaveCount(0)
      expect((await opened()).slice(-1)[0]).toBe(want)
    }
    await use('Google Maps', `https://www.google.com/maps/dir/?api=1&destination=${ll}&travelmode=driving`)
    rows = await open()
    expect(rows[0].trim()).toBe('Google Maps')
    await use('Waze', `https://waze.com/ul?ll=${ll}&navigate=yes`)
    rows = await open()
    expect(rows[0].trim(), 'the app used last moves to the top').toBe('Waze')
    await use('Yandex Maps', `https://yandex.com/maps/?rtext=~${ll}&rtt=auto`)
    await open()
    await M.shot(page, 'phone-dark-directions')
    await sheet.locator('.mp-dir-row', { hasText: 'Copy address' }).tap()
    await expect(page.locator('.mp-notice')).toHaveText('Address copied')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(place.address)
    await expect(page.locator('.bs-root')).toHaveCount(0)   // a Directions tap during the 240 ms exit is lost (see the report)
    // Back closes the Directions sheet, the card stays
    await open()
    await page.goBack()
    await expect(page.locator('.bs-root[data-state="open"]')).toHaveCount(0)
    expect((await state(page)).selectedPins).toEqual([pin.id])
    await M.expectClean(page, w)
    await close()
  })

  test('look: dark map + RU labels (name:ru), AZ labels (name:az), glyphs load, theme switch fetches no tiles, no emoji pins', async ({ browser }, testInfo) => {
    test.setTimeout(90_000)
    const layersOf = async page => {
      const msgs = await page.evaluate(() => window.__qa.msgs)
      const sl = msgs.find(m => m.type === 'SL')
      return { sl: sl ? JSON.parse(sl.json) : null, ul: msgs.filter(m => m.type === 'UL').map(m => m.json) }
    }
    const field = (layers, id) => JSON.stringify(layers.find(l => l.id === id)?.layout?.['text-field'] ?? null)
    // RU, dark
    const ru = await M.openMap(browser, { lang: 'ru', theme: 'dark', workerLog: true, seed: HALF_SEED })
    await M.gotoMap(ru.page)
    await M.mapReady(ru.page)
    await M.wait(1500)
    const L = await layersOf(ru.page)
    expect(L.sl, 'MapLibre sent the style layers to its worker').not.toBeNull()
    expect(String(L.sl.find(l => l.id === 'background')?.paint?.['background-color']).toUpperCase()).toBe('#1E1714')
    for (const id of ['highway-name-major', 'highway-name-minor', 'label_city', 'label_other']) expect(field(L.sl, id), id).toContain('name:ru')
    await expect(ru.page.locator('.mp-screen')).toHaveAttribute('data-map-theme', 'dark')
    await expect(ru.page.locator('.mp-count')).toHaveText(/^\d+ мест.* · \d+ открыто$/)
    expect((await ru.page.locator('.mp-chip').allInnerTexts()).map(s => s.trim())).toEqual(['Открыто', 'Кофе', 'Фастфуд', 'Рестораны'])
    const glyphsRu = ru.w.requests.map(r => r.url).filter(u => /\/fonts\//.test(u)).map(u => decodeURIComponent(u.split('/fonts/')[1]))
    testInfo.annotations.push({ type: 'glyphs-ru', description: glyphsRu.join(', ') })
    expect.soft(glyphsRu.some(g => /1024-1279/.test(g)), 'Cyrillic glyph range requested (needs a Cyrillic label in view)').toBe(true)
    expect(ru.w.failed.filter(f => /\/fonts\//.test(f)), 'no glyph request failed (no boxes)').toEqual([])
    for (const txt of await ru.page.locator('.mp-pin').allInnerTexts()) expect(txt.trim(), 'pins carry an SVG icon + rating, no emoji').toMatch(/^(\d[.,]\d)?$/)
    await M.shot(ru.page, 'phone-dark-ru-half')
    const tiles0 = ru.w.requests.filter(r => M.TILE_HOST.test(r.url)).length
    await ru.page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
    await expect(ru.page.locator('.mp-canvas')).toHaveAttribute('data-map-theme', 'light')
    await M.wait(2500)
    const tiles1 = ru.w.requests.filter(r => M.TILE_HOST.test(r.url)).length
    expect(tiles1 - tiles0, 'theme switch = 0 new tile / glyph requests').toBe(0)
    await M.shot(ru.page, 'phone-ru-theme-switched-to-light')
    await M.expectClean(ru.page, ru.w, 'ru')
    await ru.close()
    // AZ, light
    const az = await M.openMap(browser, { lang: 'az', theme: 'light', workerLog: true, seed: HALF_SEED })
    await M.gotoMap(az.page)
    await M.mapReady(az.page)
    await M.wait(1500)
    const A = await layersOf(az.page)
    expect(String(A.sl.find(l => l.id === 'background')?.paint?.['background-color']).toUpperCase()).toBe('#F3EDE3')
    for (const id of ['highway-name-major', 'highway-name-minor', 'label_city']) expect(field(A.sl, id), id).toContain('name:az')
    const glyphsAz = az.w.requests.map(r => r.url).filter(u => /\/fonts\//.test(u)).map(u => decodeURIComponent(u.split('/fonts/')[1]))
    testInfo.annotations.push({ type: 'glyphs-az', description: glyphsAz.join(', ') })
    expect.soft(glyphsAz.some(g => /512-767/.test(g)), 'ə range (512-767) requested').toBe(true)
    await M.shot(az.page, 'phone-light-az-half')
    await M.expectClean(az.page, az.w, 'az')
    await az.close()
  })

  test('reduced motion: no stagger / pop, camera jumps, no transform transitions on sheet and carousel', async ({ browser }) => {
    const { page, w, close } = await M.openMap(browser, { seed: PEEK_SEED, reducedMotion: 'reduce' })
    const data = await M.gotoMap(page)
    await M.mapReady(page)
    await expect(page.locator('.mp-canvas')).toHaveAttribute('data-reduced', '1')
    const anim = await page.evaluate(() => window.__qa.anim)
    expect(anim, 'pins fade in all at once').toMatchObject({ enter: 0, stagger: 0 })
    expect(anim.fade).toBeGreaterThan(0)
    // sheet: the handle moves it with no transform transition
    await page.locator('.ss-grab').tap()
    const sheet = await page.evaluate(() => { const p = document.querySelector('.ss-panel'); return { inline: p.style.transition, computed: getComputedStyle(p).transitionProperty } })
    expect(sheet.computed).not.toMatch(/transform|all/)
    await expect(page.locator('.mp-screen')).toHaveAttribute('data-snap', '1')
    // carousel: opacity only; the camera jumps to a far place in one frame
    const p = (await M.tappablePins(page))[0]
    await page.locator(`.mp-pin[data-id="${p.id}"]`).tap()
    await expect(page.locator('.mp-car-wrap[data-open]')).toBeVisible()
    const car = await page.evaluate(() => getComputedStyle(document.querySelector('.mp-car-wrap')).transitionProperty)
    expect(car).not.toMatch(/transform|all/)
    const far = idOf(data, 'tiflis-dvor')
    const trace = M.cameraTrace(page, 900)
    await M.carouselTo(page, far)
    const seen = await trace
    expect(seen.length, `camera values while revealing a far place: ${seen.join(' | ')}`).toBeLessThanOrEqual(2)
    expect(seen.length, 'Tiflis Dvor is outside the safe rect, so the camera did move').toBe(2)
    await M.expectClean(page, w)
    await close()
  })

  test('no WebGL2 -> list mode with the notice, no map download, Directions still work', async ({ browser }) => {
    const { page, w, close } = await M.openMap(browser, { noWebGL: true })
    const data = await M.gotoMap(page)
    await expect(page.locator('.mp-screen.is-nomap .mp-panel--full')).toBeVisible()
    await expect(page.locator('.mp-panel-note')).toHaveText("The map can't be shown on this device. Here is the list.")
    await expect(page.locator('.mp-canvas')).toHaveCount(0)
    expect((await state(page)).rows).toHaveLength(data.places.length)
    await M.wait(1500)
    expect(w.requests.filter(r => /maplibre|mapController/i.test(r.url) || M.TILE_HOST.test(r.url)).map(r => r.url), 'nothing of the map is downloaded').toEqual([])
    await M.shot(page, 'phone-dark-no-webgl')
    const id = data.places[0].id
    await page.locator(`.mp-li[data-id="${id}"] button.sr-row`).tap()
    await expect(page.locator(`.mp-li--expanded[data-id="${id}"] .mp-card--inline`)).toBeVisible()
    await page.locator(`.mp-li--expanded[data-id="${id}"] button.mp-act`).tap()
    await expect(page.locator('.bs-root[data-state="open"] .mp-dir-row')).toHaveCount(4)
    await M.shot(page, 'phone-dark-no-webgl-directions')
    await M.expectPageStill(page, 'list mode')
    await M.expectClean(page, w)
    await close()
  })

  test('tiles.openfreemap.org blocked -> list + offline notice + Retry (then the map loads)', async ({ browser }) => {
    test.setTimeout(60_000)
    const { ctx, page, w, close } = await M.openMap(browser, { seed: HALF_SEED })
    w.allow.push(M.TILE_HOST)   // the blocked requests themselves are logged as failed loads
    await ctx.route(M.TILE_HOST, r => r.abort('internetdisconnected'))
    const data = await M.gotoMap(page)
    const notice = page.locator('.mp-offline[role="alert"]')
    await expect(notice).toBeVisible({ timeout: 15_000 })
    await expect(notice).toContainText("The map didn't load. Check your connection.")
    await expect(notice.locator('button.mp-retry')).toHaveText('Try again')
    expect((await state(page)).rows).toHaveLength(data.places.length)
    await M.shot(page, 'phone-dark-offline')
    await ctx.unroute(M.TILE_HOST)
    await notice.locator('button.mp-retry').tap()
    await M.mapReady(page)
    await expect(notice).toHaveCount(0)
    await M.expectClean(page, w)
    await close()
  })

  test('friends: Aysel sees "have been here" on a card, signed out sees none', async ({ browser }) => {
    test.setTimeout(90_000)
    const aysel = M.ayselAccount()
    test.skip(!aysel, 'Aysel (docs/DEMO-ACCOUNTS.md or QA_AYSEL_*) not available')
    const answers = []
    const me = await M.openMap(browser, { who: aysel, seed: PEEK_SEED })
    me.page.on('response', async r => { if (/\/rpc\/map_places/.test(r.url())) answers.push(await r.json().catch(() => null)) })
    await me.page.goto(M.url('/map'))
    await expect.poll(() => answers.some(a => a?.signed_in), { timeout: 20_000 }).toBe(true)
    const data = answers.filter(a => a?.signed_in).pop()
    const withFriends = data.places.filter(p => p.friends && p.friends.count > 0)
    expect(withFriends.length, 'venues where Aysel\'s friends reviewed or posted').toBeGreaterThan(0)
    await M.mapReady(me.page)
    await tapPin(me.page, (await M.tappablePins(me.page))[0].id)
    await M.carouselTo(me.page, withFriends[0].id)
    const line = me.page.locator(`.mp-slide[data-id="${withFriends[0].id}"] .mp-card-friends-text`)
    await expect(line).toHaveText(/ (has|have) been here$/)
    await expect(me.page.locator(`.mp-pin[data-id="${withFriends[0].id}"]`)).toHaveClass(/has-ring/)
    await M.shot(me.page, 'phone-dark-aysel-friends-card')
    await M.expectClean(me.page, me.w, 'aysel')
    await me.close()

    const anon = await M.openMap(browser, { seed: PEEK_SEED })
    const anonData = await M.gotoMap(anon.page)
    expect(anonData.signed_in).toBe(false)
    expect(anonData.places.filter(p => p.friends != null || p.followed != null), 'no social fields for a signed-out guest').toEqual([])
    await M.mapReady(anon.page)
    await tapPin(anon.page, (await M.tappablePins(anon.page))[0].id)
    await expect(anon.page.locator('.mp-card-friends-text')).toHaveCount(0)
    await expect(anon.page.locator('.mp-pin.has-ring')).toHaveCount(0)
    await M.expectClean(anon.page, anon.w, 'anon')
    await anon.close()
  })

  test('screenshots: light and dark at peek / half / full / selected / Directions', async ({ browser }) => {
    test.setTimeout(120_000)
    for (const theme of ['light', 'dark']) {
      const { page, w, cdp, close } = await M.openMap(browser, { theme, seed: PEEK_SEED })
      await M.gotoMap(page)
      await M.mapReady(page)
      await M.wait(400)
      await M.shot(page, `phone-${theme}-peek`)
      await page.locator('.ss-grab').tap()
      await M.wait(500)
      await M.shot(page, `phone-${theme}-half`)
      const h = await headPoint(page)
      await swipe(cdp, h, { x: h.x, y: h.y - 200 }, { steps: 20, dt: 16, hold: 150 })   // a drag, not a flick (see the ENV-SUSPECT test)
      await expect(page.locator('.mp-screen')).toHaveAttribute('data-snap', '2')
      await M.wait(600)
      await M.shot(page, `phone-${theme}-full`)
      await M.tapAt(cdp, { x: 195, y: 32 })   // the map strip above the full sheet (a 0 ms synthetic tap gives no click there)
      await expect(page.locator('.mp-screen')).toHaveAttribute('data-snap', '1')
      await M.wait(700)
      await M.shot(page, `phone-${theme}-half-after-strip-tap`)
      const p = (await M.tappablePins(page))[0]
      await tapPin(page, p.id)
      await M.wait(400)
      await M.shot(page, `phone-${theme}-selected`)
      await page.locator(`.mp-slide[data-id="${p.id}"] button.mp-act`).tap()
      await M.wait(500)
      await M.shot(page, `phone-${theme}-directions`)
      await M.expectClean(page, w, theme)
      await close()
    }
  })
})

// =====================================================================================================================
test.describe('desktop (1280x800, mouse) @consumer @feat @ux @map', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium', 'desktop tests run in the chromium project') })

  test('panel: row <-> pin selection (push then replace), hover sync, Esc / close / map click deselect', async ({ browser }) => {
    const { page, w, close } = await M.openMap(browser, { phone: false, seed: { camera: CENTRE_CAM } })
    const data = await M.gotoMap(page)
    await M.mapReady(page)
    const panel = await page.locator('.mp-panel').boundingBox()
    expect(panel.width).toBe(384)
    await expect(page.locator('.mp-panel-title')).toHaveText('Map of places')
    const s0 = await state(page)
    const [a, b] = await M.tappablePins(page, { top: 60, bottom: 760 })
    await page.locator(`.mp-li[data-id="${a.id}"] button.sr-row`).click()
    await expect(page.locator(`.mp-li--expanded[data-id="${a.id}"] .mp-card--inline`)).toBeVisible()
    let s = await state(page)
    expect(s.url).toBe(`/map?place=${slugOf(data, a.id)}`)
    expect(s.hist).toBe(s0.hist + 1)
    expect(s.selectedPins).toEqual([a.id])
    expect(s.pressedPins).toEqual([a.id])
    await M.shot(page, 'desktop-dark-selected')
    await M.cameraStill(page)
    await page.locator(`.mp-pin[data-id="${b.id}"]`).click()
    await expect(page.locator(`.mp-li--expanded[data-id="${b.id}"]`)).toBeVisible()
    s = await state(page)
    expect(s.url).toBe(`/map?place=${slugOf(data, b.id)}`)
    expect(s.hist, 'later selections replace').toBe(s0.hist + 1)
    expect(s.pressedPins).toEqual([b.id])
    // hover: row -> pin, pin -> row
    await M.wait(600)   // the panel brings the selected row into view
    const c = await page.evaluate(sel => {
      const box = document.querySelector('.mp-panel-scroll').getBoundingClientRect()
      const li = [...document.querySelectorAll('.mp-li:not(.mp-li--expanded)')].find(el => {
        const r = el.getBoundingClientRect()
        return el.dataset.id !== sel && r.top >= box.top && r.bottom <= box.bottom
      })
      const r = li.getBoundingClientRect()
      return { id: li.dataset.id, x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }, b.id)
    const bare = await M.emptyMapPoint(page, { top: 120, bottom: 700 })
    await page.mouse.move(bare.x, bare.y)   // from the bare map: straight from a pin is the APP DEFECT test below
    await page.mouse.move(c.x, c.y)
    await expect(page.locator(`.mp-pin[data-id="${c.id}"]`)).toHaveClass(/is-hover/)
    await M.cameraStill(page)
    const free = (await M.tappablePins(page, { top: 60, bottom: 760 })).find(p => p.id !== b.id)
    await page.mouse.move(free.cx, free.cy)
    await expect(page.locator(`.mp-li[data-id="${free.id}"]`)).toHaveClass(/is-hover/)
    // Esc deselects (and pops the pushed entry)
    await page.keyboard.press('Escape')
    await expect.poll(async () => (await state(page)).url).toBe('/map')
    await expect(page.locator('.mp-li--expanded')).toHaveCount(0)
    // the card's close button and a click on the bare map deselect too
    await page.locator(`.mp-li[data-id="${a.id}"] button.sr-row`).click()
    await page.locator('.mp-card-x').click()
    await expect.poll(async () => (await state(page)).url).toBe('/map')
    await page.locator(`.mp-li[data-id="${a.id}"] button.sr-row`).click()
    await M.cameraStill(page)
    const empty = await M.emptyMapPoint(page, { top: 120, bottom: 700 })
    await page.mouse.click(empty.x, empty.y)
    await expect.poll(async () => (await state(page)).url).toBe('/map')
    expect((await state(page)).selectedPins).toEqual([])
    await M.expectClean(page, w)
    await close()
  })

  test('APP DEFECT: moving the mouse from a pin straight onto a row does not highlight the row or its pin', async ({ browser }) => {
    test.fail(true, "pinLayer.js pointerleave -> onHover(null) runs after React's onPointerEnter of the row (React derives enter from pointerout), so the row's hover is cleared")
    const { page } = await M.openMap(browser, { phone: false, seed: { camera: CENTRE_CAM } })
    await M.gotoMap(page)
    await M.mapReady(page)
    const p = (await M.tappablePins(page, { top: 60, bottom: 760 }))[0]
    const row = await page.evaluate(() => { const li = document.querySelectorAll('.mp-li')[2]; const r = li.getBoundingClientRect(); return { id: li.dataset.id, y: (r.top + r.bottom) / 2 } })
    await page.mouse.move(p.cx, p.cy)
    await M.wait(200)
    await page.mouse.move(190, row.y)
    await expect(page.locator(`.mp-li[data-id="${row.id}"]`)).toHaveClass(/is-hover/, { timeout: 2_000 })
    await expect(page.locator(`.mp-pin[data-id="${row.id}"]`)).toHaveClass(/is-hover/, { timeout: 2_000 })
  })

  test('APP DEFECT: desktop list mode (no WebGL2) leaves two thirds of the screen empty', async ({ browser }) => {
    test.fail(true, 'MapScreen.jsx:287 passes full={!desktop}: on a desktop without WebGL2 the 384 px panel stays and the map column is blank')
    const { page } = await M.openMap(browser, { phone: false, noWebGL: true })
    await M.gotoMap(page)
    const panel = await page.locator('.mp-panel').boundingBox()
    const screen = await page.locator('.mp-screen').boundingBox()
    expect(panel.width, 'the list takes the screen when there is no map').toBeGreaterThan(screen.width * 0.6)
  })

  test('deep link opens the row as a card at z16, Directions links, one Back leaves; wheel never scrolls the page', async ({ browser }) => {
    const { page, w, close } = await M.openMap(browser, { phone: false, theme: 'light' })
    await page.goto(M.url('/'))
    const data = await M.gotoMap(page, '/map?place=fincan-coffee')
    await M.mapReady(page)
    const f = data.places.find(p => p.slug === 'fincan-coffee')
    await expect(page.locator(`.mp-li--expanded[data-id="${f.id}"] .mp-card--inline`)).toBeVisible()
    const cam = await camera(page)
    expect(cam.zoom).toBeCloseTo(16, 2)
    expect(M.centrePx(cam, { center: [f.lng, f.lat], zoom: 16 })).toBeLessThanOrEqual(1)
    await M.shot(page, 'desktop-light-deep-link')
    await page.locator(`.mp-li--expanded[data-id="${f.id}"] button.mp-act`).click()
    await expect(page.locator('.bs-root[data-state="open"] .mp-dir-row')).toHaveCount(4)
    await page.locator('.bs-root[data-state="open"] .mp-dir-row', { hasText: 'Google Maps' }).click()
    expect((await page.evaluate(() => window.__qa.opened))[0]).toBe(`https://www.google.com/maps/dir/?api=1&destination=${f.lat},${f.lng}&travelmode=driving`)
    await expect(page.locator('.bs-root[data-state="open"]')).toHaveCount(0)
    // wheel over the list and over the map
    await page.mouse.move(190, 600)
    await page.mouse.wheel(0, 900)
    await M.wait(400)
    await M.expectPageStill(page, 'wheel over the panel')
    const z0 = (await camera(page)).zoom
    await page.mouse.move(900, 400)
    await page.mouse.wheel(0, 400)
    await M.wait(800)
    expect((await camera(page)).zoom, 'the wheel zooms the map').toBeLessThan(z0)
    await M.expectPageStill(page, 'wheel over the map')
    await page.goBack()
    await expect.poll(() => new URL(page.url()).pathname).toBe('/')
    await M.expectClean(page, w)
    await close()
  })

  test('a11y: pins are named buttons, roving tabindex + arrows in list order, Enter selects, Esc deselects; hit areas; pin contrast', async ({ browser }, testInfo) => {
    const lum = c => { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100 }
    const report = []
    for (const theme of ['light', 'dark']) {
      const { page, w } = await M.openMap(browser, { phone: false, theme, seed: { camera: CENTRE_CAM } })
      const data = await M.gotoMap(page)
      await M.mapReady(page)
      const pins = await page.evaluate(() => [...document.querySelectorAll('.mp-pin:not(.is-leave), .mp-cluster:not(.is-leave)')].map(b => {
        const pill = b.querySelector('.mp-pin__pill')
        const cs = pill && getComputedStyle(pill)
        const before = getComputedStyle(b, '::before')
        const r = b.getBoundingClientRect()
        const px = v => -parseFloat(v) || 0
        return {
          tag: b.tagName, label: b.getAttribute('aria-label'), tab: b.tabIndex, id: b.dataset.id || null, dot: b.classList.contains('is-dot'),
          fg: cs?.color, bg: cs?.backgroundColor,
          hit: b.classList.contains('is-dot') ? null : { w: Math.round(r.width + px(before.left) + px(before.right)), h: Math.round(r.height + px(before.top) + px(before.bottom)) },
        }
      }))
      expect(pins.length).toBeGreaterThan(0)
      expect(pins.filter(p => p.tag !== 'BUTTON' || !p.label), 'every pin / bubble is a named button').toEqual([])
      expect(pins.filter(p => p.tab === 0), 'one tab stop on the map (roving tabindex)').toHaveLength(1)
      for (const p of pins.filter(x => x.id)) {
        const pl = data.places.find(x => x.id === p.id)
        expect(p.label).toBe(`${pl.name}, ${{ coffee: 'Café', quick: 'Quick bite', restaurant: 'Restaurant' }[pl.kind]}, rated ${Number(pl.rating).toFixed(1)}, ${pl.open_now ? 'Open' : 'Closed'}`)
        if (p.hit) { expect.soft(p.hit.w, `${pl.slug} hit width`).toBeGreaterThanOrEqual(44); expect.soft(p.hit.h, `${pl.slug} hit height`).toBeGreaterThanOrEqual(44) }
        if (!p.dot) expect.soft(ratio(p.fg, p.bg), `${theme} pin text contrast ${pl.slug} (${p.fg} on ${p.bg})`).toBeGreaterThanOrEqual(4.5)
      }
      report.push(`${theme}: ${pins.filter(p => !p.dot && p.fg).map(p => ratio(p.fg, p.bg)).join(', ')}`)
      if (theme === 'light') {
        // keyboard on the map: arrows move in list order, the map does not pan, Enter selects, Esc deselects
        const rows = (await state(page)).rows
        const cam0 = await camera(page)
        await page.locator('.mp-pin[tabindex="0"], .mp-cluster[tabindex="0"]').focus()
        const first = await page.evaluate(() => document.activeElement.dataset.id)
        await page.keyboard.press('ArrowRight')
        const next = await page.evaluate(() => document.activeElement.dataset.id)
        expect(next, 'ArrowRight = the next place in list order').toBe(rows[rows.indexOf(first) + 1])
        expect(M.centrePx(cam0, await camera(page)), 'arrow keys do not pan the map').toBeLessThanOrEqual(1)
        await page.keyboard.press('Enter')
        await expect.poll(async () => (await state(page)).selectedPins).toEqual([next])
        await page.keyboard.press('Escape')
        await expect.poll(async () => (await state(page)).url).toBe('/map')
        // keyboard in the list
        await page.locator('.mp-li button.sr-row[tabindex="0"]').focus()
        await page.keyboard.press('ArrowDown')
        const rowId = await page.evaluate(() => document.activeElement.closest('.mp-li')?.dataset.id)
        expect(rowId).toBe(rows[1])
        await page.keyboard.press('Enter')
        await expect.poll(async () => (await state(page)).selectedPins).toEqual([rows[1]])
        await page.keyboard.press('Escape')
        await expect.poll(async () => (await state(page)).selectedPins).toEqual([])
      }
      await M.expectClean(page, w, theme)
    }
    testInfo.annotations.push({ type: 'pin-contrast', description: report.join(' | ') })
  })

  test('screenshots: panel light / dark, no WebGL, offline, RU', async ({ browser }) => {
    test.setTimeout(90_000)
    for (const theme of ['light', 'dark']) {
      const { page, w, close } = await M.openMap(browser, { phone: false, theme })
      await M.gotoMap(page)
      await M.mapReady(page)
      await M.shot(page, `desktop-${theme}-panel-initial-camera`)
      await M.expectClean(page, w, theme)
      await close()
    }
    const nogl = await M.openMap(browser, { phone: false, noWebGL: true })
    await M.gotoMap(nogl.page)
    await M.shot(nogl.page, 'desktop-dark-no-webgl')
    await M.expectClean(nogl.page, nogl.w, 'no webgl')
    await nogl.close()
    const off = await M.openMap(browser, { phone: false, lang: 'ru', seed: { camera: CENTRE_CAM } })
    off.w.allow.push(M.TILE_HOST)
    await off.ctx.route(M.TILE_HOST, r => r.abort('internetdisconnected'))
    await M.gotoMap(off.page)
    await expect(off.page.locator('.mp-offline')).toBeVisible({ timeout: 15_000 })
    await M.shot(off.page, 'desktop-dark-ru-offline')
    await M.expectClean(off.page, off.w, 'offline')
    await off.close()
  })
})

// =====================================================================================================================
// Perf probe (docs/MAP-PLAN-2026-10-18.md 9.1 / 9.3): QA_MAP_PERF=1, mobile project. CPU x4 + "Baku 4G" (9 / 1.5 Mbps, 60 ms RTT)
// through CDP, median of QA_MAP_PERF_RUNS (5). Times are page-clock ms from the press on the Map tab (or the history pop) to
// the first list row in the DOM, the first pin / bubble, and the canvas shown (load + first idle). Writes artifacts/map/perf-*.json.
// SwiftShader numbers (default) are indicative only; QA_MAP_GPU=1 runs the new headless mode on the real GPU.
test.describe('perf probe @perf', () => {
  test('phone: Map tab cold / prefetched / warm / return, CPU x4 + 4G; frames of a pan and a sheet drag', async ({ browser }, testInfo) => {
    test.skip(!process.env.QA_MAP_PERF || testInfo.project.name !== 'mobile', 'set QA_MAP_PERF=1, mobile project')
    test.setTimeout(900_000)
    const runs = Number(process.env.QA_MAP_PERF_RUNS || 5)
    const throttle = async cdp => {
      await cdp.send('Network.enable')
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 60, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 })
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    }
    const marks = async page => {
      await expect(page.locator('.mp-canvas__map.is-ready')).toHaveCount(1, { timeout: 60_000 })
      await M.wait(300)
      return page.evaluate(() => { const q = window.__qa; const r = k => (q.marks[k] == null ? null : Math.round(q.marks[k] - q.t0)); return { row: r('row'), pin: r('pin'), ready: r('ready') } })
    }
    const out = { cold: [], prefetched: [], warm: [], back: [], frames: {}, cls: null, mapPlaces: null, gpu: !!process.env.QA_MAP_GPU }
    for (let i = 0; i < runs; i += 1) {
      for (const kind of ['cold', 'prefetched']) {
        const { page, cdp, close } = await M.openMap(browser, { perf: true })
        await throttle(cdp)
        await page.goto(M.url('/'))
        const tab = page.locator('a[href="/map"]').first()
        await tab.waitFor()
        if (kind === 'prefetched') await M.wait(7000)   // the idle prefetch (4 s after the app is up) has fetched the map JS
        const chunkBefore = (await page.evaluate(() => performance.getEntriesByType('resource').map(e => e.name))).some(u => /mapController|maplibre/i.test(u))
        await tab.tap()
        out[kind].push({ ...(await marks(page)), chunkBefore })
        if (kind === 'cold') {
          // warm: Home and back to the Map tab (JS cached, places in the store)
          await page.locator('a[href="/"]').first().tap()
          await expect(page.locator('.mp-screen')).toHaveCount(0)
          await M.wait(1500)
          await tab.tap()
          out.warm.push(await marks(page))
          // return from a restaurant page
          const p = (await M.tappablePins(page))[0] || null
          if (p) {
            await page.locator(`.mp-pin[data-id="${p.id}"]`).tap()
            await page.locator(`.mp-slide[data-id="${p.id}"] .mp-act--menu`).tap()
            await page.waitForURL(/\/restaurant\//)
            await M.wait(2500)
            await page.goBack()
            out.back.push(await marks(page))
          }
          if (i === 0) {
            // frame timing on the map (CPU x4): a 3 s pan + pinch, then a 600 ms sheet drag; layout shift since load
            await page.goBack()   // deselect: the sheet is back
            await M.wait(1500)
            await M.frameStart(page)
            const path = Array.from({ length: 150 }, (_, k) => [{ x: 195 + 120 * Math.sin(k / 12), y: 220 + 90 * Math.cos(k / 17) }])
            await M.touchPath(cdp, path, { dt: 16 })
            await M.pinch(cdp, { x: 195, y: 220 }, { from: 40, to: 140, steps: 30, dt: 16 })
            out.frames.panPinch = await M.frameStop(page)
            await M.wait(1000)
            const h = await page.evaluate(() => document.querySelector('.ss-panel').getBoundingClientRect().top + 12)
            await M.frameStart(page)
            await M.touchPath(cdp, [...M.line({ x: 195, y: h }, { x: 195, y: h - 250 }, 18), ...M.line({ x: 195, y: h - 250 }, { x: 195, y: h }, 18)], { dt: 16.7, hold: 100 })
            out.frames.sheetDrag = await M.frameStop(page)
            out.cls = await page.evaluate(() => Math.round(window.__qa.cls * 10000) / 10000)
          }
        }
        await close()
      }
    }
    // map_places size and time to first byte (unthrottled, from this machine, not from Baku)
    const { page, close } = await M.openMap(browser, {})
    const resp = M.placesResponse(page)
    await page.goto(M.url('/map'))
    const r = await resp
    const body = await r.body()
    const timing = r.request().timing()
    out.mapPlaces = { bytes: body.length, ttfbMs: Math.round(timing.responseStart - timing.requestStart) }
    await close()
    const med = list => { const v = list.filter(x => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null }
    out.median = Object.fromEntries(['cold', 'prefetched', 'warm', 'back'].map(k => [k, { row: med(out[k].map(x => x.row)), pin: med(out[k].map(x => x.pin)), ready: med(out[k].map(x => x.ready)) }]))
    const file = M.writeJson(`perf-${process.env.QA_MAP_GPU ? 'gpu' : 'swiftshader'}.json`, out)
    testInfo.annotations.push({ type: 'perf', description: `${file}
${JSON.stringify(out.median)}
frames ${JSON.stringify(out.frames)} cls ${out.cls} map_places ${JSON.stringify(out.mapPlaces)}` })
    console.log(JSON.stringify(out, null, 1))
  })
})
