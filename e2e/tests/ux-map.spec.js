// @consumer @feat @ux @map — the Map tab (docs/MAP-PLAN-2026-10-18.md, acceptance criteria §9 items 4-12; map round 2, 7f03631:
// camera above the sheet / carousel, friends badges, short streets, 3D detail mode; round 3, f98cd32: opening fit at z >= 12.5,
// low-zoom bubbles, guest-started carousel selection, closed-pin outline, detail-mode polish, "See distances" when blocked).
// Phone tests (Pixel 7 touch at 390x844, the size the plan measures at) run in the `mobile` project, desktop tests (1280x800 mouse)
// in `chromium`; both build their own contexts (support/map.js). Read only: nothing is written on the preview.
// WebGL: headless Chromium draws the map with SwiftShader (no flags needed); QA_MAP_GPU=1 uses the new headless mode on the real
// GPU. Screenshots go to e2e/artifacts/map/ (sets for Rufat: e2e/artifacts/map-r2/, map-r3/). The perf probe runs only with
// QA_MAP_PERF=1 (end of the file).
const { test, expect } = require('@playwright/test')
const M = require('../support/map')

const { CENTRE_CAM, state, camera, swipe } = M
const PEEK_SEED = { camera: CENTRE_CAM, snap: 0, filters: { open: false, kinds: [] } }
const HALF_SEED = { ...PEEK_SEED, snap: 1 }
const slugOf = (data, id) => data.places.find(p => p.id === id)?.slug
const idOf = (data, slug) => data.places.find(p => p.slug === slug)?.id
const placeOf = (data, id) => data.places.find(p => p.id === id)
const kmBetween = (a, b) => {
  const r = Math.PI / 180
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}
const shortStreet = address => String(address || '').split(',')[0].trim()
if (process.env.QA_MAP_GPU) test.use({ channel: 'chromium' })
test.afterEach(() => M.closeAll())

/** Safe rect of the phone screen while the carousel shows (plan 4 + round 2): the visible area ends at the card's top; inset 48,
 * plus 28 px more at the top (a pill hangs above its point, the attribution chip sits there). */
async function safeRectWithCard(page) {
  const { card } = await state(page)
  return { left: 48, right: 390 - 48, top: 48 + 28, bottom: card.top - 48 }
}
const inside = (p, r) => !!p && p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom
/** The middle of the map area left visible above the carousel (round 2: a revealed place lands there). */
const centreAboveCard = async page => ({ x: 195, y: (await state(page)).card.top / 2 })

/** Taps a pin and resolves { open, settled, tops } (ms from its click; card top per frame) (page clock). */
async function tapPin(page, id) {
  const timing = page.evaluate(() => new Promise(resolve => {
    let t0 = null
    let open = null
    const tops = []
    document.addEventListener('click', e => { if (e.target.closest?.('.mp-pin')) t0 = e.timeStamp }, { capture: true, once: true })
    const start = performance.now()
    const tick = () => {
      const w = document.querySelector('.mp-car-wrap[data-open]')
      if (w) tops.push(Math.round(w.getBoundingClientRect().top))
      if (t0 != null && w && open == null) open = performance.now() - t0
      // at rest the carousel ends 12 px above the bottom of the screen (= the top of the bottom nav)
      const rest = document.querySelector('.mp-screen').getBoundingClientRect().bottom - 12
      if (open != null && Math.abs(w.getBoundingClientRect().bottom - rest) < 0.5 && getComputedStyle(w).opacity === '1') {
        resolve({ open: Math.round(open), settled: Math.round(performance.now() - t0), tops }); return
      }
      if (performance.now() - start > 3000) { resolve({ open, settled: null, tops }); return }
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
  return [full - 116, full - Math.max(164, Math.round(H * 0.44)), 0]   // round 3: the half sheet is 0.44 H
})
/** The highlight GeoJSON the map sent to its worker since message `from` (source 'sel-building'): 'building' | 'circle' | 'empty'. */
const highlights = (page, from = 0) => page.evaluate(n => window.__qa.msgs.slice(n).filter(m => m.type === 'LD' && m.json.includes('"sel-building"'))
  .map(m => (m.json.includes('\\"kind\\":\\"building\\"') || m.json.includes('"kind":"building"') ? 'building'
    : m.json.includes('\\"kind\\":\\"circle\\"') || m.json.includes('"kind":"circle"') ? 'circle' : 'empty')), from)
const msgCount = page => page.evaluate(() => window.__qa.msgs.length)
/** Home, then the Map tab (the way most guests arrive). Resolves the map_places answer. A direct load of /map with a remembered
 * session camera (a reload) is covered by its own APP DEFECT test: closing a card there re-opens it. */
async function enterViaTab(page) {
  await page.goto(M.url('/'))
  const resp = M.placesResponse(page)
  await page.locator('a[href="/map"]').first().tap()
  const data = await (await resp).json()
  await expect(page.locator('.mp-li').first()).toBeVisible({ timeout: 20_000 })
  return data
}
const pitchIs = (page, want, timeout = 3_000) => expect.poll(async () => Math.round((await camera(page)).pitch), { timeout }).toBe(want)

// =====================================================================================================================
test.describe('phone (Pixel 7, 390x844, touch) @consumer @feat @ux @map', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'mobile', 'phone tests run in the mobile project') })

  test('opening view without a location: a fit at z >= 12.5, 0 bubbles, no pill cut, pins above the 0.44 H half sheet, Tiflis Dvor off screen, Old City first, streets, closed pins outlined', async ({ browser }, testInfo) => {
    const { page, w } = await M.openMap(browser, {})
    const data = await M.gotoMap(page)
    await M.mapReady(page)
    const marks = await page.evaluate(() => window.__qa.marks)
    const s = await state(page)
    const cam = await camera(page)
    const tif = data.places.find(p => p.slug === 'tiflis-dvor')
    const bella = data.places.find(p => p.slug === 'bella-roma')
    const first = placeOf(data, s.rows[0])
    const tifPt = await M.pinPoint(page, tif.id)
    const view = await page.evaluate(() => {
      const top = document.querySelector('.ss-panel').getBoundingClientRect().top
      const pills = [...document.querySelectorAll('.mp-pin:not(.is-dot):not(.is-leave) .mp-pin__pill')].map(el => {
        const r = el.getBoundingClientRect()
        return { id: el.closest('.mp-pin').dataset.id, l: Math.round(r.left), r: Math.round(r.right), t: Math.round(r.top), b: Math.round(r.bottom) }
      })
      return {
        top: Math.round(top),
        cut: pills.filter(x => x.r > 0 && x.l < innerWidth && x.b > 0 && x.t < top && (x.l < 0 || x.r > innerWidth)),
        above: pills.filter(x => x.l >= 0 && x.r <= innerWidth && x.t >= 0 && x.b <= top).length,
      }
    })
    testInfo.annotations.push({ type: 'opening-view', description: `zoom ${cam.zoom.toFixed(2)}, ${s.clusters} bubbles, ${view.above} whole pills above the sheet (top ${view.top}); Tiflis Dvor pin at ${JSON.stringify(tifPt)}; rows ${s.rows.map(id => slugOf(data, id)).join(', ')}; marks ${JSON.stringify(marks)}` })
    expect(cam.zoom).toBeGreaterThanOrEqual(12.5 - 0.01)
    expect(cam.zoom).toBeLessThanOrEqual(15 + 0.01)
    expect(cam.pitch, 'flat').toBe(0)
    expect(s.clusters, 'no count bubbles').toBe(0)
    expect(view.top, 'the half sheet is 0.44 of the screen (780 px): its top at 780 - 343').toBe(780 - Math.round(780 * 0.44))
    expect(view.cut, 'no pill cut by the screen edge').toEqual([])
    expect(view.above, 'pins above the half sheet').toBeGreaterThanOrEqual(4)
    expect(tifPt.x < 0 || tifPt.x > 390 || tifPt.y < 0 || tifPt.y > view.top, 'Tiflis Dvor is outside the opening view').toBe(true)
    expect(kmBetween(first, bella), `first row ${first.slug} is in the Old City (within 1.5 km of Bella Roma)`).toBeLessThan(1.5)
    expect(slugOf(data, s.rows[s.rows.length - 1]), 'the outlier is last').toBe('tiflis-dvor')
    expect(s.rows).toHaveLength(data.places.length)
    expect(s.count).toMatch(new RegExp(`^${data.places.length} places · \\d+ open$`))
    expect(marks.row, 'the list is on screen before the map canvas is shown').toBeLessThan(marks.ready)
    await expect(page.locator('.mp-attr a')).toHaveCount(3)
    await expect(page.locator('.mp-zoom'), 'no +/- with a coarse pointer').toBeHidden()
    await expect(page.locator('.mp-tilt'), 'no 2D / 3D toggle below z15').toHaveCount(0)
    await expect(page.locator('.mp-head button.mp-link'), 'without a location the list offers "See distances"').toHaveText('See distances')
    for (const id of s.rows.slice(0, 4)) {
      const line = await page.locator(`.mp-li[data-id="${id}"] .mp-st-line`).innerText()
      expect(line, `${slugOf(data, id)} row`).toContain(shortStreet(placeOf(data, id).address))
    }
    // closed venues: an outlined pill (round 3, --mp-closed-ring) and a muted row
    const closed = data.places.filter(p => !p.open_now).map(p => p.id)
    testInfo.annotations.push({ type: 'closed-now', description: closed.map(id => slugOf(data, id)).join(', ') || 'none' })
    for (const id of closed) {
      const pin = page.locator(`.mp-pin[data-id="${id}"]`)
      await expect(pin).toHaveClass(/is-closed/)
      if (!(await pin.getAttribute('class')).includes('is-dot')) {
        expect(await pin.locator('.mp-pin__pill').evaluate(el => getComputedStyle(el).boxShadow), `${slugOf(data, id)}: closed pill outline`).toMatch(/inset/)
      }
      await expect(page.locator(`.mp-li[data-id="${id}"]`)).toHaveClass(/is-closed/)
    }
    await M.shot(page, 'phone-dark-opening-view')
    await M.expectClean(page, w)
  })

  test('opening view with a location: the guest and the 3 nearest venues at z <= 15, the dot above the pins; a filter fit keeps the guest within 4 km', async ({ browser }, testInfo) => {
    const me = { latitude: 40.3725, longitude: 49.8372 }   // next to Fincan Coffee
    const { ctx, page, w } = await M.openMap(browser, { permissions: ['geolocation'], geoOk: true })   // a returning guest who allowed it
    await ctx.setGeolocation(me)
    const data = await M.gotoMap(page)
    await M.mapReady(page)
    await expect(page.locator('.mp-me')).toHaveCount(1, { timeout: 10_000 })
    const cam = await camera(page)
    const s = await state(page)
    const near = data.places.map(p => ({ p, km: kmBetween({ lat: me.latitude, lng: me.longitude }, p) })).sort((a, b) => a.km - b.km).slice(0, 3)
    const dot = await page.locator('.mp-me .mp-me__dot').boundingBox()
    const inView = pt => pt && pt.x >= 0 && pt.x <= 390 && pt.y >= 0 && pt.y <= s.panel.top
    testInfo.annotations.push({ type: 'with-location', description: `zoom ${cam.zoom.toFixed(2)}; nearest ${near.map(n => `${n.p.slug} ${n.km.toFixed(2)} km`).join(', ')}; dot ${JSON.stringify(dot)}` })
    expect(cam.zoom).toBeGreaterThanOrEqual(12.5 - 0.01)
    expect(cam.zoom).toBeLessThanOrEqual(15 + 0.01)
    expect(inView({ x: dot.x + dot.width / 2, y: dot.y + dot.height / 2 }), 'the guest is in the opening view').toBe(true)
    for (const n of near) expect(inView(await M.pinPoint(page, n.p.id)), `${n.p.slug} (one of the 3 nearest) is in the opening view`).toBe(true)
    // 4da787f (D-R3-1): the dot sits above the normal pins, dots and bubbles (40-400) and under the hovered (900) / selected (1000) pin
    const layers = () => page.evaluate(() => {
      const z = el => { let n = el; while (n && !n.style.zIndex) n = n.parentElement; return n ? Number(n.style.zIndex) : null }
      return {
        me: Number(getComputedStyle(document.querySelector('.mp-me')).zIndex),
        pins: [...document.querySelectorAll('.mp-pin[data-id]')].map(p => ({ id: p.dataset.id, sel: p.classList.contains('is-selected'), z: z(p) })),
      }
    })
    const z0 = await layers()
    expect(z0.me, 'the me dot z-index').toBe(800)
    for (const p of z0.pins) expect(p.z, `${slugOf(data, p.id)} (not selected) is under the me dot`).toBeLessThan(z0.me)
    expect(s.rows[0], 'the nearest place heads the list').toBe(near[0].p.id)
    // Coffee: Brew & Books (~2.5 km) is outside the view, so the fit runs and keeps the guest's dot (within 4 km)
    await page.locator('.mp-chip', { hasText: 'Coffee' }).tap()
    await M.wait(900)
    await M.cameraStill(page)
    const s2 = await state(page)
    const dot2 = await page.locator('.mp-me .mp-me__dot').boundingBox()
    expect({ x: dot2.x + dot2.width / 2, y: dot2.y + dot2.height / 2 }.y <= s2.panel.top && dot2.x >= 0 && dot2.x <= 390, 'the guest stays in the filtered view').toBe(true)
    for (const id of s2.pins) expect(inView(await M.pinPoint(page, id)) || (await M.pinPoint(page, id)).y <= s2.panel.top, `${slugOf(data, id)} in the fit`).toBe(true)
    await M.shot(page, 'phone-dark-opening-with-location')
    // the guest stands at Fincan: once selected, its pill is drawn above the me dot
    await tapPin(page, near[0].p.id)
    const z1 = await layers()
    const sel = z1.pins.find(p => p.id === near[0].p.id)
    expect(sel.sel, `${near[0].p.slug} is selected`).toBe(true)
    expect(sel.z, 'the selected pin is above the me dot').toBeGreaterThan(z1.me)
    await M.expectClean(page, w)
  })

  test('supercluster bubbles from 30 venues up', async () => {
    test.skip(true, 'preview has 10 venues: the supercluster path (CLUSTER_MIN_PLACES 30) cannot be reached here; the low-zoom grouping below is tested instead')
  })

  test('below z12.5 overlapping pins are count bubbles (10 venues); one tap on a bubble lands at z13+ on pins', async ({ browser }, testInfo) => {
    const { page, w, cdp } = await M.openMap(browser, { seed: { camera: { center: [49.85, 40.375], zoom: 11.5 }, snap: 0 } })
    const data = await M.gotoMap(page)
    await M.mapReady(page)
    const bubbles = await page.evaluate(() => [...document.querySelectorAll('.mp-cluster:not(.is-leave)')].map(b => { const r = b.getBoundingClientRect(); return { n: Number(b.textContent), label: b.getAttribute('aria-label'), x: r.left + r.width / 2, y: r.top + r.height / 2 } }))
    testInfo.annotations.push({ type: 'bubbles', description: JSON.stringify(bubbles) })
    expect(bubbles.length, 'bubbles at z11.5').toBeGreaterThan(0)
    expect(bubbles.every(b => b.label === `${b.n} places, zoom in`), 'a bubble is a named button').toBe(true)
    const pinsBefore = (await state(page)).pins.length
    expect(pinsBefore + bubbles.reduce((n, b) => n + b.n, 0), 'every venue is a pin or in a bubble').toBe(data.places.length)
    const sheetTop = (await state(page)).panel.top
    const big = bubbles.filter(b => b.y < sheetTop - 20).sort((a, b) => b.n - a.n)[0]
    await M.tapAt(cdp, { x: big.x, y: big.y })
    await M.wait(900)
    const cam = await M.cameraStill(page)
    expect(cam.zoom, 'one tap lands at z13 or more').toBeGreaterThanOrEqual(13 - 0.01)
    expect((await state(page)).clusters, 'and on pins').toBe(0)
    await M.expectClean(page, w)
  })

  test('pin tap selects (card <= 300 ms and slides up, aria-pressed, .is-selected); ?place= pushed once then replaced; map tap deselects', async ({ browser }, testInfo) => {
    const { page, w, cdp } = await M.openMap(browser, { seed: PEEK_SEED })
    const data = await enterViaTab(page)
    await M.mapReady(page)
    const pins = await M.tappablePins(page)
    expect(pins.length, 'pins at peek over the Old City').toBeGreaterThanOrEqual(3)
    const s0 = await state(page)
    const cam0 = await camera(page)
    const a = pins[0]
    const t = await tapPin(page, a.id)
    testInfo.annotations.push({ type: 'select-timing', description: `click -> carousel open ${t.open} ms, at rest ${t.settled} ms; card top per frame ${t.tops.slice(0, 14).join(', ')}` })
    expect(t.open, 'pin tap -> card').toBeLessThanOrEqual(300)
    const slid = Math.max(...t.tops) - t.tops[t.tops.length - 1]
    if (process.env.QA_MAP_GPU) expect(slid, 'the card slides up from below (plan 4 "Carousel in")').toBeGreaterThan(50)
    else testInfo.annotations.push({ type: 'ENV', description: `slide-up not asserted on SwiftShader (the two-rAF entry races with React on the software renderer and the card appears in place; it slides on the GPU run): slid ${slid} px` })
    let s = await state(page)
    expect(s.url).toBe(`/map?place=${slugOf(data, a.id)}`)
    expect(s.hist, 'the first selection pushes').toBe(s0.hist + 1)
    expect(s.selectedPins).toEqual([a.id])
    expect(s.pressedPins).toEqual([a.id])
    expect(s.selectedRows).toEqual([a.id])
    expect(s.centredCard).toBe(a.id)
    // the camera moves only when the pin leaves the safe rect; when it moves, the place lands in the middle above the card
    const cam1 = await M.cameraStill(page)
    const rect = await safeRectWithCard(page)
    const moved = M.centrePx(cam0, cam1) > 1
    expect(moved, `camera moved = pin outside the safe rect (${JSON.stringify(a)})`).toBe(!inside(a, rect))
    if (moved) {
      const at = await M.pinPoint(page, a.id)
      const want = await centreAboveCard(page)
      expect(Math.hypot(at.x - want.x, at.y - want.y), 'the place lands in the middle of the area above the card').toBeLessThanOrEqual(3)
    }

    // a map tap closes the card (after a single selection; after switching cards see the APP DEFECT test)
    await M.cameraStill(page)
    const empty = await M.emptyMapPoint(page, { top: 90, bottom: (await state(page)).card.top - 10 })
    expect(empty, 'a bare spot of map above the card').not.toBeNull()
    await M.tapAt(cdp, empty)
    await expect.poll(async () => (await state(page)).url).toBe('/map')
    await expect(page.locator('.mp-car-wrap')).toHaveCount(0)
    s = await state(page)
    expect(s.selectedPins).toEqual([])
    expect(s.pressedPins).toEqual([])
    expect(s.hist, 'closing pops the entry it pushed').toBe(s0.hist + 1)
    // select again (push), then another place (replace)
    await M.cameraStill(page)
    const again = (await M.tappablePins(page))[0]
    await tapPin(page, again.id)
    const h1 = (await state(page)).hist
    await M.cameraStill(page)
    const b = (await M.tappablePins(page, { bottom: (await state(page)).card.top - 10 })).find(p => p.id !== again.id)
    await page.locator(`.mp-pin[data-id="${b.id}"]`).tap()
    await expect.poll(async () => (await state(page)).selectedPins).toEqual([b.id])
    s = await state(page)
    expect(s.url).toBe(`/map?place=${slugOf(data, b.id)}`)
    expect(s.hist, 'later selections replace').toBe(h1)
    expect(s.pressedPins).toEqual([b.id])
    await expect.poll(async () => (await state(page)).centredCard).toBe(b.id)
    await M.expectClean(page, w)
  })

  test('carousel swipe changes the selected pin (URL replaced); the camera moves only for pins outside the safe rect, to the middle above the card', async ({ browser }, testInfo) => {
    test.setTimeout(150_000)
    const { page, w, cdp } = await M.openMap(browser, { seed: PEEK_SEED })
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
      const cam1 = await M.cameraStill(page)   // a far select flies up to ~1.2 s: waits until two reads 200 ms apart agree
      const s1 = await state(page)
      const id = s1.selectedPins[0]
      const moved = M.centrePx(cam0, cam1) > 1
      let landed = ''
      if (moved) {
        const at = await M.pinPoint(page, id)
        const want = await centreAboveCard(page)
        landed = ` landed ${Math.round(Math.hypot(at.x - want.x, at.y - want.y))} px from the middle above the card`
        expect.soft(Math.hypot(at.x - want.x, at.y - want.y), `${slugOf(data, id)} lands in the middle above the card`).toBeLessThanOrEqual(3)
      }
      log.push(`${slugOf(data, id)}: inside=${inside(where[id], rect)} moved=${moved}${landed}`)
      expect(s1.centredCard, 'the centred card is the selection').toBe(id)
      expect(s1.url).toBe(`/map?place=${slugOf(data, id)}`)
      expect(s1.hist, 'swipes replace the entry').toBe(hist)
      expect.soft(moved, `camera rule for ${slugOf(data, id)} (${JSON.stringify(where[id])})`).toBe(!inside(where[id], rect))
      if (s1.rows.indexOf(id) === s1.rows.length - 1) break
    }
    testInfo.annotations.push({ type: 'carousel', description: log.join('\n') })
    await M.expectClean(page, w)
  })

  test('deep link /map?place= : z16, the place in the middle above the card, card on the first frame with data, no camera animation, one Back leaves', async ({ browser }, testInfo) => {
    const { page, w } = await M.openMap(browser, { frameLog: true })
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
    testInfo.annotations.push({ type: 'deep-link-frames', description: `first frame with rows #${firstData}, card in place #${inPlace}` })
    expect(inPlace - firstData, 'card in place on the first frame that has data (no slide-in)').toBeLessThanOrEqual(0)
    const cam = await camera(page)
    expect(cam.zoom).toBeCloseTo(16, 2)
    const at = await M.pinPoint(page, meze.id)
    const want = await centreAboveCard(page)
    expect(Math.hypot(at.x - want.x, at.y - want.y), `the place sits in the middle above the card (${JSON.stringify(at)} vs ${JSON.stringify(want)})`).toBeLessThanOrEqual(3)
    expect((await M.cameraTrace(page, 800)).length, 'the camera stands still after arrival').toBe(1)
    await M.shot(page, 'phone-dark-deep-link')
    await page.goBack()
    await expect.poll(() => new URL(page.url()).pathname).toBe('/')
    await M.expectClean(page, w)
  })

  test('B-R2-2: after switching to another card (pin tap, carousel swipe), a map tap and Back close the card for good', async ({ browser }, testInfo) => {
    const { page, cdp } = await M.openMap(browser, { seed: PEEK_SEED })
    await enterViaTab(page)
    await M.mapReady(page)
    const a = (await M.tappablePins(page))[0]
    await M.tapAt(cdp, { x: a.cx, y: a.cy })
    await M.wait(1000)
    await M.cameraStill(page)
    const b = (await M.tappablePins(page, { bottom: (await state(page)).card.top - 10 })).find(x => x.id !== a.id)
    await M.tapAt(cdp, { x: b.cx, y: b.cy })
    await expect.poll(async () => (await state(page)).selectedPins).toEqual([b.id])
    await M.wait(800)
    await M.cameraStill(page)
    const trace = page.evaluate(() => new Promise(res => {
      const h = []
      const t0 = performance.now()
      const rec = k => h.push(`${Math.round(performance.now() - t0)}ms ${k}`)
      const sc = document.querySelector('.mp-car')
      sc.addEventListener('scroll', () => rec(`carousel scroll ${Math.round(sc.scrollLeft)}`))
      window.addEventListener('popstate', () => rec('popstate'))
      const push = history.pushState.bind(history)
      history.pushState = (...x) => { rec(`pushState ${x[2]}`); return push(...x) }
      setTimeout(() => res(h), 1200)
    }))
    await M.tapAt(cdp, await M.emptyMapPoint(page, { top: 120, bottom: (await state(page)).card.top - 10 }))
    testInfo.annotations.push({ type: 'trace', description: (await trace).join(' | ') })
    await expect.poll(async () => (await state(page)).url, { timeout: 3_000 }).toBe('/map')
    await expect(page.locator('.mp-car-wrap')).toHaveCount(0, { timeout: 3_000 })
    await M.wait(800)
    expect((await state(page)).url, 'and stays closed').toBe('/map')
    // a swipe to the next card, then Back: closed, and the next Back leaves
    await M.cameraStill(page)
    const c = (await M.tappablePins(page))[0]
    await M.tapAt(cdp, { x: c.cx, y: c.cy })
    await expect(page.locator('.mp-car-wrap[data-open]')).toBeVisible()
    await M.wait(600)
    const cy = (await state(page)).card.top + 60
    await swipe(cdp, { x: 330, y: cy }, { x: 90, y: cy }, { steps: 8, dt: 16 })
    await expect.poll(async () => (await state(page)).selectedPins[0], { timeout: 5_000 }).not.toBe(c.id)
    await M.wait(800)
    await page.goBack()
    await expect.poll(async () => (await state(page)).url, { timeout: 3_000 }).toBe('/map')
    await expect(page.locator('.mp-car-wrap')).toHaveCount(0, { timeout: 3_000 })
    await M.wait(800)
    expect((await state(page)).url, 'Back closed it for good').toBe('/map')
  })

  test('B-R2-2: after a reload of /map, a map tap and a swipe down close a card that is not the first one', async ({ browser }, testInfo) => {
    const { page, cdp } = await M.openMap(browser, {})
    await enterViaTab(page)
    await M.mapReady(page)
    await M.wait(800)   // the camera is in the session store
    await page.reload()
    await M.mapReady(page)
    const rows = (await state(page)).rows
    const p = (await M.tappablePins(page)).find(x => rows.indexOf(x.id) > 0)
    await M.tapAt(cdp, { x: p.cx, y: p.cy })
    await M.wait(1200)
    await M.cameraStill(page)
    const trace = page.evaluate(() => new Promise(res => {
      const h = []
      const t0 = performance.now()
      const rec = k => h.push(`${Math.round(performance.now() - t0)}ms ${k}`)
      const sc = document.querySelector('.mp-car')
      sc.addEventListener('scroll', () => rec(`carousel scroll ${Math.round(sc.scrollLeft)}`))
      window.addEventListener('popstate', () => rec('popstate'))
      const push = history.pushState.bind(history)
      history.pushState = (...a) => { rec(`pushState ${a[2]}`); return push(...a) }
      setTimeout(() => res(h), 1200)
    }))
    await M.tapAt(cdp, await M.emptyMapPoint(page, { top: 120, bottom: (await state(page)).card.top - 10 }))
    testInfo.annotations.push({ type: 'trace', description: (await trace).join(' | ') })
    await expect.poll(async () => (await state(page)).url, { timeout: 3_000 }).toBe('/map')
    await expect(page.locator('.mp-car-wrap')).toHaveCount(0, { timeout: 3_000 })
    await M.wait(800)
    expect((await state(page)).url, 'and stays closed').toBe('/map')
    // the same card again, closed with a swipe down
    await M.cameraStill(page)
    const again = (await M.tappablePins(page)).find(x => rows.indexOf(x.id) > 0)
    await M.tapAt(cdp, { x: again.cx, y: again.cy })
    await expect(page.locator('.mp-car-wrap[data-open]')).toBeVisible()
    await M.wait(600)
    const card = (await state(page)).card
    await swipe(cdp, { x: 195, y: card.top + 40 }, { x: 195, y: card.top + 170 }, { steps: 8, dt: 16 })
    await expect.poll(async () => (await state(page)).url, { timeout: 3_000 }).toBe('/map')
    await expect(page.locator('.mp-car-wrap')).toHaveCount(0, { timeout: 3_000 })
    await M.wait(800)
    expect((await state(page)).url, 'the swipe closed it for good').toBe('/map')
  })

  test('a pasted /map?place= link wins over the saved view (z16 on the place); a reload restores the view', async ({ browser }) => {
    const { page, w } = await M.openMap(browser, {})
    await M.gotoMap(page)
    await M.mapReady(page)
    await M.wait(800)   // the opening view is in the session store
    const data = await M.gotoMap(page, '/map?place=meze-istanbul')
    await M.mapReady(page)
    const meze = data.places.find(p => p.slug === 'meze-istanbul')
    const cam = await M.cameraStill(page)
    expect(cam.zoom).toBeCloseTo(16, 2)
    const at = await M.pinPoint(page, meze.id)
    const want = await centreAboveCard(page)
    expect(Math.hypot(at.x - want.x, at.y - want.y), 'the pasted place sits in the middle above the card').toBeLessThanOrEqual(3)
    await M.wait(800)
    await page.reload()
    await M.mapReady(page)
    const back = await M.cameraStill(page)
    expect(M.centrePx(cam, back), 'a reload restores the view').toBeLessThanOrEqual(1)
    expect(Math.abs(cam.zoom - back.zoom)).toBeLessThanOrEqual(0.01)
    await M.expectClean(page, w)
  })

  test('in-page select: Back deselects, the next Back leaves the map', async ({ browser }) => {
    const { page, w } = await M.openMap(browser, { seed: PEEK_SEED })
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
  })

  test('restaurant page -> Back restores camera (+-1 px, +-0.01 zoom), snap and selection', async ({ browser }, testInfo) => {
    const { page, w, cdp } = await M.openMap(browser, { seed: PEEK_SEED })
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
  })

  test('filters: Coffee = exactly the cafés (pins + rows), no request, < 50 ms; clearing never moves the camera; Open now agrees with Search; closed rows muted', async ({ browser }, testInfo) => {
    const { page, w } = await M.openMap(browser, { seed: HALF_SEED })
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
    expect(after.filter(r => !M.TILE_HOST.test(r.url) && r.type !== 'image').map(r => r.url), 'a filter asks nothing of the server (row photos and map tiles aside)').toEqual([])
    // clearing the chip widens the set: the guest's view stays where it is
    const camOn = await M.cameraStill(page)
    await page.locator('.mp-chip', { hasText: 'Coffee' }).tap()
    await expect.poll(async () => (await state(page)).rows.length).toBe(data.places.length)
    await M.wait(800)
    expect(M.centrePx(camOn, await camera(page)), 'clearing a chip does not move the camera').toBeLessThanOrEqual(1)
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
      chip.click()   // on
      const on = Math.round((performance.now() - t) * 10) / 10 + await until(want.coffee)
      t = performance.now()
      chip.click()   // off
      const off = Math.round((performance.now() - t) * 10) / 10 + await until(want.all)
      return { on, off }
    }, { all: data.places.length, coffee: coffee.length })
    testInfo.annotations.push({ type: 'filter-speed', description: JSON.stringify(speed) })
    expect(Math.max(speed.off, speed.on), 'filter applied in the click (ms)').toBeLessThan(50)
    // closed venues: muted rows (round 2)
    const closed = data.places.filter(p => !p.open_now).map(p => p.id)
    testInfo.annotations.push({ type: 'closed-now', description: closed.map(id => slugOf(data, id)).join(', ') || 'none (every venue open at run time)' })
    for (const id of closed) {
      await expect(page.locator(`.mp-li[data-id="${id}"]`)).toHaveClass(/is-closed/)
      expect(await page.locator(`.mp-li[data-id="${id}"] .sr-thumb`).evaluate(el => getComputedStyle(el).opacity)).toBe('0.55')
    }
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
  })

  test('sheet: 40 % drag -> half, 0.6 px/ms flick -> one snap, settle <= 420 ms, Back at full -> half, pin tap at half', async ({ browser }, testInfo) => {
    test.setTimeout(90_000)
    const { page, w, cdp } = await M.openMap(browser, { seed: PEEK_SEED })
    await M.gotoMap(page)
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
    const p = (await M.tappablePins(page))[0]
    expect(p, 'a pin above the half sheet').toBeTruthy()
    await tapPin(page, p.id)
    expect((await state(page)).selectedPins).toEqual([p.id])
    await M.expectClean(page, w)
  })

  test('MAP-01: after a flick to full, the first tap on the map strip brings the sheet to half (real CDP touch)', async ({ browser }) => {
    const { page, w, cdp } = await M.openMap(browser, { seed: HALF_SEED })
    await M.gotoMap(page)
    await M.mapReady(page)
    for (const pause of [300, 1500]) {
      const h = await headPoint(page)
      await swipe(cdp, h, { x: h.x, y: h.y - 60 }, { steps: 6, dt: 16 })   // a 0.6 px/ms flick
      await expect(page.locator('.mp-screen')).toHaveAttribute('data-snap', '2')
      await M.wait(pause)
      await M.tapAt(cdp, { x: 195, y: 32 })   // one 40 ms touch tap
      await expect(page.locator('.mp-screen'), `the first tap ${pause} ms after the flick`).toHaveAttribute('data-snap', '1', { timeout: 2_000 })
      await M.wait(500)
    }
    await M.expectClean(page, w)
  })

  test('the page never moves: list fling, over-drag both ends, carousel over-scroll, map pan + pinch, Directions open', async ({ browser }) => {
    test.setTimeout(120_000)
    const { page, w, cdp } = await M.openMap(browser, { seed: HALF_SEED })
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
    const p = (await M.tappablePins(page))[0]
    await tapPin(page, p.id)
    const rows = (await state(page)).rows
    await M.carouselTo(page, rows[0])
    let cy = (await state(page)).card.top + 60
    await swipe(cdp, { x: 60, y: cy }, { x: 360, y: cy }, { steps: 6, dt: 16 })
    await M.wait(900)
    await M.expectPageStill(page, 'carousel over-scroll at the first card')   // (whether it is a Back gesture: the ENV-SUSPECT test below)
    if (!(await state(page)).carouselOpen) await tapPin(page, (await M.tappablePins(page))[0].id)
    await M.carouselTo(page, rows[rows.length - 1])
    await M.cameraStill(page)
    cy = (await state(page)).card.top + 60
    await swipe(cdp, { x: 340, y: cy }, { x: 30, y: cy }, { steps: 6, dt: 16 })
    await M.wait(900)
    await M.expectPageStill(page, 'carousel over-scroll at the last card')
    await M.cameraStill(page)
    await swipe(cdp, { x: 240, y: 300 }, { x: 120, y: 160 }, { steps: 14, dt: 16 })
    await M.pinch(cdp, { x: 195, y: 280 }, { from: 40, to: 150 })
    await M.pinch(cdp, { x: 195, y: 280 }, { from: 150, to: 50 })
    await M.wait(900)
    await M.expectPageStill(page, 'map pan + pinch')
    const centred = (await state(page)).centredCard
    expect(centred, 'the card is still up after the pan').toBeTruthy()
    await page.locator(`.mp-slide[data-id="${centred}"] button.mp-act`).tap()
    await expect(page.locator('.bs-root[data-state="open"]')).toBeVisible()
    await swipe(cdp, { x: 200, y: 640 }, { x: 200, y: 300 }, { steps: 6, dt: 16 })
    await M.wait(600)
    await M.expectPageStill(page, 'Directions sheet open')
    await M.expectClean(page, w)
  })

  test('ENV-SUSPECT (GPU run): a hard right swipe on the first card is not a Back gesture, the card stays', async ({ browser }) => {
    test.fail(!!process.env.QA_MAP_GPU, 'Chrome in the new headless mode (QA_MAP_GPU) performs its overscroll history navigation on this swipe (a user-initiated "traverse", no app call) although html, .mp-car and .mp-car-wrap have overscroll-behavior-x: none (4da787f); a non-passive touchmove preventDefault at the left edge stops it (probe). The SwiftShader headless shell does not navigate. Check on an Android phone.')
    const { page, cdp } = await M.openMap(browser, { seed: PEEK_SEED })
    await M.gotoMap(page)
    await M.mapReady(page)
    await tapPin(page, (await M.tappablePins(page))[0].id)
    await M.carouselTo(page, (await state(page)).rows[0])
    await M.cameraStill(page)
    const cy = (await state(page)).card.top + 60
    await swipe(cdp, { x: 60, y: cy }, { x: 360, y: cy }, { steps: 6, dt: 16 })
    await M.wait(1000)
    expect((await state(page)).url, 'an edge over-scroll is not a Back gesture').toContain('/map?place=')
  })

  test('Directions without a location: no travel mode in the links, last used first, Copy address, a quick re-open works, Back closes', async ({ browser }) => {
    const { page, w } = await M.openMap(browser, { seed: PEEK_SEED, permissions: ['clipboard-read', 'clipboard-write'] })
    const data = await M.gotoMap(page)
    await M.mapReady(page)
    const pin = (await M.tappablePins(page))[0]
    const place = placeOf(data, pin.id)
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
      await expect(page.locator('.bs-root[data-state="open"]')).toHaveCount(0)
      expect((await opened()).slice(-1)[0]).toBe(want)
    }
    await use('Google Maps', `https://www.google.com/maps/dir/?api=1&destination=${ll}`)
    rows = await open()   // straight away, while the previous sheet may still be leaving (m9)
    expect(rows[0].trim()).toBe('Google Maps')
    await use('Waze', `https://waze.com/ul?ll=${ll}&navigate=yes`)
    rows = await open()
    expect(rows[0].trim(), 'the app used last moves to the top').toBe('Waze')
    await use('Yandex Maps', `https://yandex.com/maps/?rtext=~${ll}`)
    await open()
    await M.shot(page, 'phone-dark-directions')
    await sheet.locator('.mp-dir-row', { hasText: 'Copy address' }).tap()
    await expect(page.locator('.mp-notice')).toHaveText('Address copied')
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(place.address)
    await open()
    await page.goBack()
    await expect(page.locator('.bs-root[data-state="open"]')).toHaveCount(0)
    expect((await state(page)).selectedPins).toEqual([pin.id])
    await M.expectClean(page, w)
  })

  test('See distances: the location is asked on the tap, the map stays, rows and card get distances, Directions get walk / drive', async ({ browser }) => {
    const me = { latitude: 40.3725, longitude: 49.8372 }   // next to Fincan Coffee in the Old City
    const { ctx, page, w } = await M.openMap(browser, { seed: PEEK_SEED })
    await ctx.setGeolocation(me)
    const data = await M.gotoMap(page)
    await M.mapReady(page)
    const see = page.locator('.mp-head button.mp-link')
    await expect(see).toHaveText('See distances')
    const cam0 = await M.cameraStill(page)
    await ctx.grantPermissions(['geolocation'], { origin: new URL(M.url('/')).origin })
    await see.tap()
    await expect(see, 'the action goes once the distances are known').toHaveCount(0, { timeout: 10_000 })
    await M.wait(800)
    expect(M.centrePx(cam0, await camera(page)), '"See distances" does not move the map').toBeLessThanOrEqual(1)
    const fincan = data.places.find(p => p.slug === 'fincan-coffee')
    const tif = data.places.find(p => p.slug === 'tiflis-dvor')
    await expect(page.locator(`.mp-li[data-id="${fincan.id}"] .mp-st-line`)).toContainText(/\d+ m\b/)
    await expect(page.locator(`.mp-li[data-id="${tif.id}"] .mp-st-line`)).toContainText(/\d+([.,]\d)? km\b/)
    expect((await state(page)).rows[0], 'the nearest place heads the list').toBe(fincan.id)
    await page.locator(`.mp-li[data-id="${fincan.id}"] button.sr-row`).evaluate(b => b.click())   // the peeking sheet clips the row
    await expect(page.locator(`.mp-slide[data-id="${fincan.id}"] .mp-card-stats`)).toContainText(/\d+ m · \d+ min walk/)
    await page.locator(`.mp-slide[data-id="${fincan.id}"] button.mp-act`).tap()
    await page.locator('.bs-root[data-state="open"] .mp-dir-row', { hasText: 'Google Maps' }).tap()
    expect((await page.evaluate(() => window.__qa.opened))[0]).toBe(`https://www.google.com/maps/dir/?api=1&destination=${fincan.lat},${fincan.lng}&travelmode=walking`)
    await expect(page.locator('.bs-root')).toHaveCount(0)
    await M.carouselTo(page, tif.id)
    await page.locator(`.mp-slide[data-id="${tif.id}"] button.mp-act`).tap()
    await page.locator('.bs-root[data-state="open"] .mp-dir-row', { hasText: 'Google Maps' }).tap()
    expect((await page.evaluate(() => window.__qa.opened))[1]).toBe(`https://www.google.com/maps/dir/?api=1&destination=${tif.lat},${tif.lng}&travelmode=driving`)
    await M.expectClean(page, w)
  })

  test('"See distances" while the browser blocks location: it stays and says why (locateDenied)', async ({ browser }) => {
    const { page, w } = await M.openMap(browser, { seed: PEEK_SEED })   // no geolocation permission: headless answers PERMISSION_DENIED
    await M.gotoMap(page)
    await M.mapReady(page)
    const see = page.locator('.mp-head button.mp-link')
    await see.tap()
    await expect(page.locator('.mp-notice')).toHaveText('Location is turned off for this site. Allow it in your browser settings to see where you are.')
    await expect(see, 'the action stays').toHaveText('See distances')
    await M.wait(6500)   // the notice goes
    await see.tap()
    await expect(page.locator('.mp-notice'), 'and says it again').toBeVisible()
    await M.expectClean(page, w)
  })

  test('the list ends above the QR button: at full, scrolled to the end, the last row is clear of it', async ({ browser }) => {
    const { page, w, cdp } = await M.openMap(browser, { seed: HALF_SEED })
    await M.gotoMap(page)
    await M.mapReady(page)
    const h = await headPoint(page)
    await swipe(cdp, h, { x: h.x, y: h.y - 60 }, { steps: 6, dt: 16 })
    await expect(page.locator('.mp-screen')).toHaveAttribute('data-snap', '2')
    await page.evaluate(() => { const b = document.querySelector('.ss-body'); b.scrollTop = b.scrollHeight })
    await M.wait(400)
    const r = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.mp-li')]
      const last = rows[rows.length - 1].querySelector('.sr-main').getBoundingClientRect()
      const fab = document.querySelector('.bottom-nav-qr').getBoundingClientRect()
      const bar = getComputedStyle(document.querySelector('.mp-screen'), '::after')
      return { lastBottom: Math.round(last.bottom), fabTop: Math.round(fab.top), bar: bar.height }
    })
    expect(r.lastBottom, `the last row's text ends above the QR button (${JSON.stringify(r)})`).toBeLessThanOrEqual(r.fabTop)
    expect(r.bar, 'the list ends in a 56 px bar').toBe('56px')
    await M.expectClean(page, w)
  })

  test('look: dark map + RU labels (name:ru), AZ labels (name:az), glyphs load, theme switch fetches no tiles, no emoji pins', async ({ browser }, testInfo) => {
    test.setTimeout(90_000)
    const layersOf = async page => {
      const msgs = await page.evaluate(() => window.__qa.msgs)
      const sl = msgs.find(m => m.type === 'SL')
      return { sl: sl ? JSON.parse(sl.json) : null }
    }
    const field = (layers, id) => JSON.stringify(layers.find(l => l.id === id)?.layout?.['text-field'] ?? null)
    const ru = await M.openMap(browser, { lang: 'ru', theme: 'dark', workerLog: true, seed: HALF_SEED })
    await M.gotoMap(ru.page)
    await M.mapReady(ru.page)
    await M.wait(1500)
    const L = await layersOf(ru.page)
    expect(L.sl, 'MapLibre sent the style layers to its worker').not.toBeNull()
    expect(String(L.sl.find(l => l.id === 'background')?.paint?.['background-color']).toUpperCase()).toBe('#2F2723')   // c3fa868: the Ember palette lifted (was #1E1714)
    for (const id of ['highway-name-major', 'highway-name-minor', 'label_city', 'label_other']) expect(field(L.sl, id), id).toContain('name:ru')
    await expect(ru.page.locator('.mp-screen')).toHaveAttribute('data-map-theme', 'dark')
    await expect(ru.page.locator('.mp-count')).toHaveText(/^\d+ мест.* · открыто \d+$/)
    expect((await ru.page.locator('.mp-chip').allInnerTexts()).map(s => s.trim())).toEqual(['Открыто сейчас', 'Кофе', 'Фастфуд', 'Рестораны'])
    for (const txt of await ru.page.locator('.mp-li .sr-meta').filter({ hasText: '★' }).allInnerTexts()) expect(txt, 'RU rating with a comma').toMatch(/★\d,\d/)
    const glyphsRu = ru.w.requests.map(r => r.url).filter(u => /\/fonts\//.test(u)).map(u => decodeURIComponent(u.split('/fonts/')[1]))
    testInfo.annotations.push({ type: 'glyphs-ru', description: glyphsRu.join(', ') })
    expect.soft(glyphsRu.some(g => /1024-1279/.test(g)), 'Cyrillic glyph range requested (needs a Cyrillic label in view)').toBe(true)
    expect(ru.w.failed.filter(f => /\/fonts\//.test(f)), 'no glyph request failed (no boxes)').toEqual([])
    // the pill text is the rating (the friends badge, signed in only, carries a letter of its own)
    for (const txt of await ru.page.locator('.mp-pin .mp-pin__rating').allInnerTexts()) expect(txt.trim(), 'pins carry an SVG icon + rating, no emoji').toMatch(/^\d[.,]\d$/)
    await M.shot(ru.page, 'phone-dark-ru-half')
    const tiles0 = ru.w.requests.filter(r => M.TILE_HOST.test(r.url)).length
    await ru.page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
    await expect(ru.page.locator('.mp-canvas')).toHaveAttribute('data-map-theme', 'light')
    await M.wait(2500)
    const tiles1 = ru.w.requests.filter(r => M.TILE_HOST.test(r.url)).length
    expect(tiles1 - tiles0, 'theme switch = 0 new tile / glyph requests').toBe(0)
    await M.expectClean(ru.page, ru.w, 'ru')
    await ru.close()
    const az = await M.openMap(browser, { lang: 'az', theme: 'light', workerLog: true, seed: HALF_SEED })
    await M.gotoMap(az.page)
    await M.mapReady(az.page)
    await M.wait(1500)
    const A = await layersOf(az.page)
    expect(String(A.sl.find(l => l.id === 'background')?.paint?.['background-color']).toUpperCase()).toBe('#F3EDE3')
    for (const id of ['highway-name-major', 'highway-name-minor', 'label_city']) expect(field(A.sl, id), id).toContain('name:az')
    expect(String(A.sl.find(l => l.id === 'sel-building-3d').paint['fill-extrusion-color']).toUpperCase(), 'light highlight').toBe('#B5586D')
    for (const txt of await az.page.locator('.mp-li .sr-meta').filter({ hasText: '★' }).allInnerTexts()) expect(txt, 'AZ rating with a comma').toMatch(/★\d,\d/)
    for (const txt of await az.page.locator('.mp-pin .mp-pin__rating').allInnerTexts()) expect(txt.trim(), 'AZ pin rating with a comma').toMatch(/^\d,\d$/)
    const glyphsAz = az.w.requests.map(r => r.url).filter(u => /\/fonts\//.test(u)).map(u => decodeURIComponent(u.split('/fonts/')[1]))
    testInfo.annotations.push({ type: 'glyphs-az', description: glyphsAz.join(', ') })
    expect.soft(glyphsAz.some(g => /512-767/.test(g)), 'ə range (512-767) requested').toBe(true)
    await M.shot(az.page, 'phone-light-az-half')
    await M.expectClean(az.page, az.w, 'az')
    await az.close()
  })

  test('reduced motion: no stagger / pop, camera jumps (select and 3D detail), no transform transitions on sheet and carousel', async ({ browser }) => {
    const { page, w } = await M.openMap(browser, { seed: PEEK_SEED, reducedMotion: 'reduce' })
    const data = await M.gotoMap(page)
    await M.mapReady(page)
    await expect(page.locator('.mp-canvas')).toHaveAttribute('data-reduced', '1')
    const anim = await page.evaluate(() => window.__qa.anim)
    expect(anim, 'pins fade in all at once').toMatchObject({ enter: 0, stagger: 0 })
    expect(anim.fade).toBeGreaterThan(0)
    await page.locator('.ss-grab').tap()
    const sheet = await page.evaluate(() => getComputedStyle(document.querySelector('.ss-panel')).transitionProperty)
    expect(sheet).not.toMatch(/transform|all/)
    await expect(page.locator('.mp-screen')).toHaveAttribute('data-snap', '1')
    const p = (await M.tappablePins(page))[0]
    await page.locator(`.mp-pin[data-id="${p.id}"]`).tap()
    await expect(page.locator('.mp-car-wrap[data-open]')).toBeVisible()
    const car = await page.evaluate(() => getComputedStyle(document.querySelector('.mp-car-wrap')).transitionProperty)
    expect(car).not.toMatch(/transform|all/)
    const far = idOf(data, 'tiflis-dvor')
    const key = c => `${c.center[0].toFixed(7)},${c.center[1].toFixed(7)},${c.zoom.toFixed(4)}`
    const values = (c0, seen) => [...new Set([key(c0), ...seen])]
    let c0 = await M.cameraStill(page)
    let trace = M.cameraTrace(page, 900)
    await M.carouselTo(page, far)
    let seen = values(c0, await trace)
    expect(seen.length, `camera values while revealing a far place (one jump): ${seen.join(' | ')}`).toBe(2)
    // 3D detail jumps too
    c0 = await M.cameraStill(page)
    trace = M.cameraTrace(page, 900)
    await page.locator(`.mp-slide[data-id="${far}"] .mp-card-cover--btn`).tap()
    seen = values(c0, await trace)
    expect(seen.length, `camera values while "Show on map" (one jump): ${seen.join(' | ')}`).toBe(2)
    const cam = await camera(page)
    expect(cam.zoom).toBeCloseTo(17.5, 1)
    expect(Math.round(cam.pitch)).toBe(55)
    await M.expectClean(page, w)
  })

  test('3D detail: the 2D / 3D toggle exists only from z15, sits above Locate, tilts to 55 degrees and back', async ({ browser }) => {
    const { page, w } = await M.openMap(browser, {})
    await page.goto(M.url('/'))
    await M.gotoMap(page)
    await M.mapReady(page)
    await expect(page.locator('.mp-tilt'), 'opening view (z13): no toggle').toHaveCount(0)
    const two = await M.openMap(browser, {})   // a fresh tab: the same tab would restore the z13 view above (session camera)
    await M.gotoMap(two.page, '/map?place=fincan-coffee')   // z16
    await M.mapReady(two.page)
    await tiltChecks(two.page, two.w)
    await M.expectClean(page, w)
  })

  test('D-R2-2: arriving at z16 (deep link) shows the 2D / 3D toggle at once', async ({ browser }) => {
    const { page } = await M.openMap(browser, {})
    await M.gotoMap(page, '/map?place=fincan-coffee')
    await M.mapReady(page)
    await expect(page.locator('.mp-tilt')).toBeVisible({ timeout: 4_000 })
  })

  async function tiltChecks(page, w) {
    const tilt = page.locator('.mp-tilt')
    await expect(tilt).toBeVisible()
    await expect(tilt).toHaveAttribute('aria-label', '3D view')
    const tb = await tilt.boundingBox()
    const lb = await page.locator('.mp-locate:visible').first().boundingBox()
    expect(tb.y + tb.height, 'the toggle sits above Locate').toBeLessThanOrEqual(lb.y)
    expect(Math.abs((tb.x + tb.width / 2) - (lb.x + lb.width / 2)), 'and on the same axis').toBeLessThanOrEqual(2)
    await tilt.tap()
    await pitchIs(page, 55)
    await expect(tilt).toHaveClass(/is-on/)
    await expect(tilt).toHaveAttribute('aria-label', '2D view')
    await M.shot(page, 'phone-dark-tilted-deep-link')
    await tilt.tap()
    await pitchIs(page, 0)
    await expect(tilt).toHaveAttribute('aria-label', '3D view')
    await M.expectClean(page, w)
  }

  test('3D detail: the card cover shows the place at z17.5 / 55 degrees above the card with its building highlighted; deselect flattens', async ({ browser }, testInfo) => {
    const { page, w, cdp } = await M.openMap(browser, { seed: PEEK_SEED, workerLog: true })
    const data = await enterViaTab(page)
    await M.mapReady(page)
    const p = (await M.tappablePins(page))[0]
    await tapPin(page, p.id)
    await M.cameraStill(page)
    const cover = page.locator(`.mp-slide[data-id="${p.id}"] .mp-card-cover--btn`)
    await expect(cover).toHaveAttribute('aria-label', 'Show on map')
    const n0 = await msgCount(page)
    await cover.tap()
    await expect.poll(async () => { const c = await camera(page); return [Math.round(c.zoom * 10) / 10, Math.round(c.pitch)] }, { timeout: 4_000 }).toEqual([17.5, 55])
    await M.cameraStill(page)
    const at = await M.pinPoint(page, p.id)
    const want = await centreAboveCard(page)
    expect(Math.hypot(at.x - want.x, at.y - want.y), 'the place sits in the middle above the card').toBeLessThanOrEqual(3)
    await expect(page.locator('.mp-tilt')).toHaveClass(/is-on/)
    // round 3 polish: detail flag on the canvas, a white ring on the selected pill, the edge layer and the lighter highlight
    await expect(page.locator('.mp-canvas')).toHaveAttribute('data-detail', '')
    expect(await page.locator(`.mp-pin[data-id="${p.id}"] .mp-pin__pill`).evaluate(el => getComputedStyle(el).boxShadow), 'white ring on the selected pill').toMatch(/rgb\(255, 255, 255\) 0px 0px 0px 2px/)
    const sl = JSON.parse((await page.evaluate(() => window.__qa.msgs.find(m => m.type === 'SL').json)))
    expect(sl.some(l => l.id === 'sel-building-edge'), 'sel-building-edge layer').toBe(true)
    expect(String(sl.find(l => l.id === 'sel-building-3d').paint['fill-extrusion-color']).toUpperCase(), 'dark highlight').toBe('#C25A73')
    expect(JSON.stringify(sl.find(l => l.id === 'housenumber').paint['text-opacity']), 'house numbers fade in at z17.3-17.5').toBe(JSON.stringify(['interpolate', ['linear'], ['zoom'], 17.3, 0, 17.5, 1]))
    // 4da787f (D-R3-2): while tilted, house numbers only within 180 m of the focus (a Polygon "within"), text-padding 16 (8 when flat)
    const houseNumbers = () => page.evaluate(() => {
      const ls = window.__qa.msgs.filter(m => m.type === 'UL').flatMap(m => { try { return JSON.parse(m.json).layers || [] } catch { return [] } }).filter(l => l.id === 'housenumber')
      const l = ls[ls.length - 1]
      return l ? { pad: l.layout ? l.layout['text-padding'] : null, focus: JSON.stringify(l.filter || null).includes('"Polygon"') } : null
    })
    await expect.poll(houseNumbers, { timeout: 4_000, message: 'tilted: house numbers near the focus only, padding 16' }).toEqual({ pad: 16, focus: true })
    await expect.poll(async () => (await highlights(page, n0)).filter(k => k !== 'empty').length, { timeout: 5_000 }).toBeGreaterThan(0)
    const kinds = await highlights(page, n0)
    testInfo.annotations.push({ type: 'highlight', description: `${slugOf(data, p.id)}: ${kinds.join(' -> ')}` })
    expect.soft(kinds[kinds.length - 1], `${slugOf(data, p.id)}: an OSM building polygon was found for the venue (else a footprint circle)`).toBe('building')
    await M.shot(page, 'phone-dark-3d-detail')
    // deselect: tap the bare map -> flat again, the highlight goes
    const n1 = await msgCount(page)
    const empty = await M.emptyMapPoint(page, { top: 90, bottom: (await state(page)).card.top - 10 })
    await M.tapAt(cdp, empty)
    await expect.poll(async () => (await state(page)).url).toBe('/map')
    await pitchIs(page, 0, 4_000)
    await expect.poll(async () => (await highlights(page, n1)).includes('empty'), { timeout: 4_000 }).toBe(true)
    await expect(page.locator('.mp-canvas'), 'still z17.5: detail flag stays').toHaveAttribute('data-detail', '')
    await expect.poll(houseNumbers, { timeout: 4_000, message: 'flat again: no focus circle, padding 8' }).toEqual({ pad: 8, focus: false })
    await M.expectClean(page, w)
  })

  test('no WebGL2 -> list mode with the notice, no map download, Directions still work', async ({ browser }) => {
    const { page, w } = await M.openMap(browser, { noWebGL: true })
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
    await expect(page.locator(`.mp-li--expanded[data-id="${id}"] .mp-card-cover--btn`), 'no "Show on map" without a map').toHaveCount(0)
    await page.locator(`.mp-li--expanded[data-id="${id}"] button.mp-act`).tap()
    await expect(page.locator('.bs-root[data-state="open"] .mp-dir-row')).toHaveCount(4)
    await M.expectPageStill(page, 'list mode')
    await M.expectClean(page, w)
  })

  test('tiles.openfreemap.org blocked -> list + offline notice + Retry (then the map loads)', async ({ browser }) => {
    test.setTimeout(60_000)
    const { ctx, page, w } = await M.openMap(browser, { seed: HALF_SEED })
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
  })

  test('map_places fails -> "Couldn\'t load the places." with no count above it; Try again asks at once and recovers', async ({ browser }) => {
    const { ctx, page, w } = await M.openMap(browser, {})
    w.allow.push(/map_places|status of 503/)
    await ctx.route(/\/rpc\/map_places/, r => r.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"qa"}' }))
    await page.goto(M.url('/map'))
    const err = page.locator('.mp-empty[role="alert"]')
    await expect(err).toContainText("Couldn't load the places.")
    expect((await page.locator('.mp-count').textContent()).trim(), 'no "0 places · 0 open" over the error').toBe('')
    await M.shot(page, 'phone-dark-places-error')
    await ctx.unroute(/\/rpc\/map_places/)
    const before = w.requests.filter(r => /map_places/.test(r.url)).length
    await err.locator('button.mp-retry').tap()
    await expect(page.locator('.mp-li').first(), 'Try again right away').toBeVisible({ timeout: 5_000 })
    expect(w.requests.filter(r => /map_places/.test(r.url)).length, 'the retry asked the server').toBe(before + 1)
    await M.expectClean(page, w)
  })

  test('map_places is asked once: on a direct load and on entering from the tab', async ({ browser }) => {
    const { page, w } = await M.openMap(browser, {})
    await M.gotoMap(page)
    await M.wait(2500)
    expect(w.requests.filter(r => /\/rpc\/map_places/.test(r.url)).length, 'direct load of /map').toBe(1)
    const two = await M.openMap(browser, {})
    await two.page.goto(M.url('/'))
    await two.page.locator('a[href="/map"]').first().tap()
    await expect(two.page.locator('.mp-li').first()).toBeVisible({ timeout: 20_000 })
    await M.wait(2500)
    expect(two.w.requests.filter(r => /\/rpc\/map_places/.test(r.url)).length, 'Home -> Map tab').toBe(1)
    await M.expectClean(page, w)
  })

  test('entering from the Map tab under CPU x4 + 4G shifts nothing (CLS 0)', async ({ browser }, testInfo) => {
    const { page, w, cdp } = await M.openMap(browser, { perf: true })
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 60, downloadThroughput: 9e6 / 8, uploadThroughput: 1.5e6 / 8 })
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await page.goto(M.url('/'))
    await page.locator('a[href="/map"]').first().waitFor()
    await M.wait(1000)
    await page.locator('a[href="/map"]').first().tap()
    await M.mapReady(page, 40_000)
    await M.wait(1500)
    const r = await page.evaluate(() => {
      const q = window.__qa
      const after = q.shifts.filter(s => s.t >= q.t0)
      return { cls: after.filter(s => !s.input).reduce((n, s) => n + s.v, 0), all: after.map(s => `${Math.round(s.t - q.t0)}ms ${s.v.toFixed(4)}${s.input ? ' (input)' : ''}`), row: Math.round(q.marks.row - q.t0) }
    })
    testInfo.annotations.push({ type: 'cls', description: `CLS ${r.cls.toFixed(4)} after the tap (first row at ${r.row} ms); shifts: ${r.all.join(', ') || 'none'}` })
    expect(r.cls).toBeLessThan(0.001)
    await M.expectClean(page, w)
  })

  test('friends: Aysel sees badges, row lines and an ellipsised card line (slide keeps its width); signed out sees none', async ({ browser }, testInfo) => {
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
    const fr = withFriends[0]
    // the pin: an avatar badge instead of the old ring, and nothing for the others
    const pin = me.page.locator(`.mp-pin[data-id="${fr.id}"]`)
    await expect(pin).toHaveClass(/has-friends/)
    await expect(pin.locator('.mp-pin__fr')).toHaveCount(1)
    await expect(me.page.locator('.mp-pin.has-friends')).toHaveCount(withFriends.length)
    await expect(pin.locator('.mp-pin__rating')).toHaveText(/^\d\.\d$/)
    // the row: a small avatar stack and "<first name> (+n) ha(s|ve) been here"
    const row = me.page.locator(`.mp-li[data-id="${fr.id}"]`)
    await expect(row.locator('.mp-row-av > *')).toHaveCount(Math.min(3, fr.friends.top.length))
    await expect(row.locator('.mp-row-frt')).toHaveText(/ (has|have) been here$/)
    // the card: the long line is ellipsised and the slide keeps its width (neighbours peek)
    await tapPin(me.page, (await M.tappablePins(me.page))[0].id)
    await M.carouselTo(me.page, fr.id)
    const line = me.page.locator(`.mp-slide[data-id="${fr.id}"] .mp-card-friends-text`)
    const firstName = String(fr.friends.top[0].name).trim().split(/\s+/)[0]
    await expect(line, 'the card says it like the row').toHaveText(fr.friends.count > 1 ? `${firstName} +${fr.friends.count - 1} have been here` : `${firstName} has been here`)
    const plain = data.places.find(p => !(p.friends?.count > 0))
    await expect(me.page.locator(`.mp-slide[data-id="${plain.id}"] .mp-card-street`), 'a no-friends card in a friends set shows its street').toHaveText(shortStreet(plain.address))
    for (const h of await me.page.locator(`.mp-slide[data-id="${fr.id}"] .mp-act`).evaluateAll(els => els.map(e => e.getBoundingClientRect().height))) expect(h, 'card buttons are 44 px').toBe(44)
    const box = await me.page.locator(`.mp-slide[data-id="${fr.id}"] .mp-card`).boundingBox()
    const clip = await line.evaluate(el => ({ sw: el.scrollWidth, cw: el.clientWidth, to: getComputedStyle(el).textOverflow }))
    testInfo.annotations.push({ type: 'friends', description: `${fr.slug}: card ${Math.round(box.width)} px at x ${Math.round(box.x)}; line ${clip.sw}/${clip.cw} px, ${clip.to}; row "${await row.locator('.mp-row-frt').innerText()}"` })
    expect(box.width, 'card = 100vw - 48 px (plan 3)').toBeLessThanOrEqual(390 - 48 + 1)
    expect(box.x, 'the neighbours peek on both sides').toBeGreaterThanOrEqual(16)
    if (clip.sw > clip.cw) expect(clip.to).toBe('ellipsis')
    await M.shot(me.page, 'phone-dark-aysel-friends-card')
    await M.expectClean(me.page, me.w, 'aysel')
    await me.close()

    const anon = await M.openMap(browser, { seed: PEEK_SEED })
    const anonData = await M.gotoMap(anon.page)
    expect(anonData.signed_in).toBe(false)
    expect(anonData.places.filter(p => p.friends != null || p.followed != null), 'no social fields for a signed-out guest').toEqual([])
    await M.mapReady(anon.page)
    await expect(anon.page.locator('.mp-pin.has-friends')).toHaveCount(0)
    await expect(anon.page.locator('.mp-pin__fr')).toHaveCount(0)
    await expect(anon.page.locator('.mp-row-fr')).toHaveCount(0)
    await tapPin(anon.page, (await M.tappablePins(anon.page))[0].id)
    await expect(anon.page.locator('.mp-card-friends-text')).toHaveCount(0)
    await M.expectClean(anon.page, anon.w, 'anon')
  })

  test('cards never repeat the kind in their sub line', async ({ browser }) => {
    const { page, w } = await M.openMap(browser, {})
    const data = await M.gotoMap(page, '/map?place=fincan-coffee')
    await expect(page.locator('.mp-car-wrap[data-open]')).toBeVisible()
    const fold = x => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
    for (const p of data.places) {
      const sub = await page.locator(`.mp-slide[data-id="${p.id}"] .mp-card-sub`).textContent()
      const parts = sub.split(' · ').map(fold)
      expect(new Set(parts).size, `${p.slug}: "${sub}"`).toBe(parts.length)
    }
    await M.expectClean(page, w)
  })

  test('round 3 screenshots (phone): light opening / list half / selected / 3D detail; dark opening / 3D detail', async ({ browser }) => {
    test.setTimeout(150_000)
    const aysel = M.ayselAccount()
    for (const theme of ['light', 'dark']) {
      const { ctx, page, w, cdp } = await M.openMap(browser, { theme, workerLog: true, who: theme === 'light' ? aysel : null })
      await ctx.setGeolocation({ latitude: 40.3725, longitude: 49.8372 })
      await M.gotoMap(page)
      await M.mapReady(page)
      await M.wait(600)
      await M.shot(page, `phone-${theme}-opening-view`, { dir: M.ART_R3 })
      if (theme === 'light') {
        // the list at half once "See distances" was tapped (next to Fincan Coffee in the Old City)
        await ctx.grantPermissions(['geolocation'], { origin: new URL(M.url('/')).origin })
        await page.locator('.mp-head button.mp-link').tap()
        await expect(page.locator('.mp-head button.mp-link')).toHaveCount(0, { timeout: 10_000 })
        await M.wait(800)
        await M.shot(page, 'phone-light-list-half', { dir: M.ART_R3 })
        // the first row whose pin can be tapped, preferring a place with friends (signed in as Aysel)
        const pins = await M.tappablePins(page)
        const fr = await page.evaluate(ids => ids.find(id => document.querySelector(`.mp-pin[data-id="${id}"].has-friends`)), pins.map(p => p.id))
        await tapPin(page, fr || pins[0].id)
        await M.cameraStill(page)
        await M.wait(300)
        await M.shot(page, 'phone-light-selected-card', { dir: M.ART_R3 })
      } else {
        await tapPin(page, (await M.tappablePins(page))[0].id)
        await M.cameraStill(page)
      }
      const sel = (await state(page)).selectedPins[0]
      const n0 = await msgCount(page)
      await page.locator(`.mp-slide[data-id="${sel}"] .mp-card-cover--btn`).tap()
      await expect.poll(async () => Math.round((await camera(page)).pitch), { timeout: 4_000 }).toBe(55)
      await M.cameraStill(page)
      await expect.poll(async () => (await highlights(page, n0)).filter(k => k !== 'empty').length, { timeout: 5_000 }).toBeGreaterThan(0)
      await M.wait(1200)   // the extrusions rise between z15.5 and z16.5 and the tiles settle
      await M.shot(page, `phone-${theme}-3d-detail`, { dir: M.ART_R3 })
      await M.expectClean(page, w, theme)
      void cdp
      await ctx.close()
    }
  })
})

// =====================================================================================================================
test.describe('desktop (1280x800, mouse) @consumer @feat @ux @map', () => {
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name !== 'chromium', 'desktop tests run in the chromium project') })

  test('panel: row <-> pin selection (push then replace), hover sync both ways, Esc / close / map click deselect', async ({ browser }) => {
    const { page, w } = await M.openMap(browser, { phone: false, seed: { camera: CENTRE_CAM } })
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
    await M.cameraStill(page)
    await page.locator(`.mp-pin[data-id="${b.id}"]`).click()
    await expect(page.locator(`.mp-li--expanded[data-id="${b.id}"]`)).toBeVisible()
    s = await state(page)
    expect(s.url).toBe(`/map?place=${slugOf(data, b.id)}`)
    expect(s.hist, 'later selections replace').toBe(s0.hist + 1)
    expect(s.pressedPins).toEqual([b.id])
    await M.wait(600)   // the panel brings the selected row into view
    await M.cameraStill(page)
    // a pin lifts its row; a row (reached from the bare map) lifts its pin
    const free = (await M.tappablePins(page, { top: 60, bottom: 760 })).find(p => p.id !== b.id)
    await page.mouse.move(free.cx, free.cy)
    await expect(page.locator(`.mp-li[data-id="${free.id}"]`)).toHaveClass(/is-hover/)
    const c = await page.evaluate(skip => {
      const box = document.querySelector('.mp-panel-scroll').getBoundingClientRect()
      const li = [...document.querySelectorAll('.mp-li:not(.mp-li--expanded)')].find(el => {
        const r = el.getBoundingClientRect()
        return !skip.includes(el.dataset.id) && r.top >= box.top && r.bottom <= box.bottom
      })
      const r = li.getBoundingClientRect()
      return { id: li.dataset.id, x: r.left + r.width / 2, y: r.top + r.height / 2 }
    }, [b.id, free.id])
    await page.mouse.move(c.x, c.y)   // straight from the pin (round 3: m4 fixed)
    await expect(page.locator(`.mp-li[data-id="${c.id}"]`)).toHaveClass(/is-hover/)
    await expect(page.locator(`.mp-pin[data-id="${c.id}"]`)).toHaveClass(/is-hover/)
    await page.keyboard.press('Escape')
    await expect.poll(async () => (await state(page)).url).toBe('/map')
    await expect(page.locator('.mp-li--expanded')).toHaveCount(0)
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
  })

  test('m4: moving the mouse from a pin straight onto a list row lights the row and its pin', async ({ browser }) => {
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

  test('deep link opens the row as a card at z16, Directions links (no travel mode), one Back leaves; wheel never scrolls the page', async ({ browser }) => {
    const { page, w } = await M.openMap(browser, { phone: false, theme: 'light' })
    await page.goto(M.url('/'))
    const data = await M.gotoMap(page, '/map?place=fincan-coffee')
    await M.mapReady(page)
    const f = data.places.find(p => p.slug === 'fincan-coffee')
    await expect(page.locator(`.mp-li--expanded[data-id="${f.id}"] .mp-card--inline`)).toBeVisible()
    const cam = await camera(page)
    expect(cam.zoom).toBeCloseTo(16, 2)
    expect(M.centrePx(cam, { center: [f.lng, f.lat], zoom: 16 }), 'nothing covers the desktop map: the place is its centre').toBeLessThanOrEqual(1)
    await page.locator(`.mp-li--expanded[data-id="${f.id}"] button.mp-act`).click()
    await expect(page.locator('.bs-root[data-state="open"] .mp-dir-row')).toHaveCount(4)
    await page.locator('.bs-root[data-state="open"] .mp-dir-row', { hasText: 'Google Maps' }).click()
    expect((await page.evaluate(() => window.__qa.opened))[0]).toBe(`https://www.google.com/maps/dir/?api=1&destination=${f.lat},${f.lng}`)
    await expect(page.locator('.bs-root[data-state="open"]')).toHaveCount(0)
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
  })

  test('3D detail on desktop: toggle above Locate from z15, cover "Show on map" tilts, zooming out below 15 flattens and hides the toggle', async ({ browser }) => {
    const { page, w } = await M.openMap(browser, { phone: false, theme: 'light' })
    const data = await M.gotoMap(page, '/map?place=fincan-coffee')
    await M.mapReady(page)
    const f = data.places.find(p => p.slug === 'fincan-coffee')
    await page.mouse.move(900, 400); await page.mouse.down(); await page.mouse.move(860, 380, { steps: 6 }); await page.mouse.up()   // see the arrival APP DEFECT
    await M.cameraStill(page)
    const tilt = page.locator('.mp-locate-desk .mp-tilt')
    await expect(tilt).toBeVisible()
    const tb = await tilt.boundingBox()
    const lb = await page.locator('.mp-locate-desk .mp-locate').boundingBox()
    expect(tb.y + tb.height, 'the toggle sits above Locate').toBeLessThanOrEqual(lb.y)
    await page.locator(`.mp-li--expanded[data-id="${f.id}"] .mp-card-cover--btn`).click()
    await expect.poll(async () => { const c = await camera(page); return [Math.round(c.zoom * 10) / 10, Math.round(c.pitch)] }, { timeout: 4_000 }).toEqual([17.5, 55])
    await M.cameraStill(page)
    await M.shot(page, 'desktop-light-3d-detail')
    const out = page.locator('.mp-zoom button[aria-label="Zoom out"]')
    for (let i = 0; i < 3; i += 1) { await out.click(); await M.wait(400) }
    await M.cameraStill(page)
    expect((await camera(page)).zoom).toBeLessThan(15)
    await pitchIs(page, 0, 4_000)
    await expect(page.locator('.mp-tilt'), 'no toggle below z15').toHaveCount(0)
    await M.expectClean(page, w)
  })

  test('desktop: zooming out below z12.5 groups overlapping pins into bubbles; a bubble click lands on pins', async ({ browser }) => {
    const { page, w } = await M.openMap(browser, { phone: false, seed: { camera: CENTRE_CAM } })
    await M.gotoMap(page)
    await M.mapReady(page)
    const out = page.locator('.mp-zoom button[aria-label="Zoom out"]')
    for (let i = 0; i < 2; i += 1) { await out.click(); await M.wait(500) }
    await M.cameraStill(page)
    expect((await camera(page)).zoom).toBeLessThan(12.5)
    await expect(page.locator('.mp-cluster:not(.is-leave)').first()).toBeVisible()
    await page.locator('.mp-cluster:not(.is-leave)').first().click()
    await M.wait(900)
    const cam = await M.cameraStill(page)
    expect(cam.zoom).toBeGreaterThanOrEqual(13 - 0.01)
    expect((await state(page)).clusters).toBe(0)
    await M.expectClean(page, w)
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
          closed: b.classList.contains('is-closed'), fg: cs?.color, bg: cs?.backgroundColor,
          hit: b.classList.contains('is-dot') ? null : { w: Math.round(r.width + px(before.left) + px(before.right)), h: Math.round(r.height + px(before.top) + px(before.bottom)) },
        }
      }))
      expect(pins.length).toBeGreaterThan(0)
      expect(pins.filter(p => p.tag !== 'BUTTON' || !p.label), 'every pin / bubble is a named button').toEqual([])
      expect(pins.filter(p => p.tab === 0), 'one tab stop on the map (roving tabindex)').toHaveLength(1)
      for (const p of pins.filter(x => x.id)) {
        const pl = placeOf(data, p.id)
        expect(p.label).toBe(`${pl.name}, ${{ coffee: 'Café', quick: 'Quick bite', restaurant: 'Restaurant' }[pl.kind]}, rated ${Number(pl.rating).toFixed(1)}, ${pl.open_now ? 'Open' : 'Closed'}`)
        if (p.hit) { expect.soft(p.hit.w, `${pl.slug} hit width`).toBeGreaterThanOrEqual(44); expect.soft(p.hit.h, `${pl.slug} hit height`).toBeGreaterThanOrEqual(44) }
        if (!p.dot) expect.soft(ratio(p.fg, p.bg), `${theme} pin text contrast ${pl.slug} (${p.fg} on ${p.bg})`).toBeGreaterThanOrEqual(4.5)
      }
      report.push(`${theme}: open ${pins.filter(p => !p.dot && p.fg && !p.closed).map(p => ratio(p.fg, p.bg)).join(', ')}; closed ${pins.filter(p => !p.dot && p.fg && p.closed).map(p => ratio(p.fg, p.bg)).join(', ') || '-'}`)
      if (theme === 'light') {
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

  test('no WebGL2 on a desktop: the list takes the screen', async ({ browser }) => {
    const { page, w } = await M.openMap(browser, { phone: false, noWebGL: true })
    await M.gotoMap(page)
    const panel = await page.locator('.mp-panel').boundingBox()
    const screen = await page.locator('.mp-screen').boundingBox()
    expect(panel.width, 'the list takes the screen when there is no map').toBeGreaterThan(screen.width * 0.6)
    await M.shot(page, 'desktop-dark-no-webgl')
    await M.expectClean(page, w)
  })

  test('screenshots: desktop light with a selected place (round 3), panels, offline RU', async ({ browser }) => {
    test.setTimeout(90_000)
    const light = await M.openMap(browser, { phone: false, theme: 'light' })
    const data = await M.gotoMap(light.page)
    await M.mapReady(light.page)
    await M.shot(light.page, 'desktop-light-panel-opening-view')
    await light.page.locator(`.mp-li[data-id="${idOf(data, 'bella-roma')}"] button.sr-row`).click()
    await M.cameraStill(light.page)
    await M.wait(500)
    await M.shot(light.page, 'desktop-light-selected', { dir: M.ART_R3 })
    await M.expectClean(light.page, light.w, 'light')
    await light.close()
    const dark = await M.openMap(browser, { phone: false, theme: 'dark' })
    await M.gotoMap(dark.page)
    await M.mapReady(dark.page)
    await M.shot(dark.page, 'desktop-dark-panel-opening-view')
    await M.expectClean(dark.page, dark.w, 'dark')
    await dark.close()
    const off = await M.openMap(browser, { phone: false, lang: 'ru', seed: { camera: CENTRE_CAM } })
    off.w.allow.push(M.TILE_HOST)
    await off.ctx.route(M.TILE_HOST, r => r.abort('internetdisconnected'))
    await M.gotoMap(off.page)
    await expect(off.page.locator('.mp-offline')).toBeVisible({ timeout: 15_000 })
    await M.shot(off.page, 'desktop-dark-ru-offline')
    await M.expectClean(off.page, off.w, 'offline')
  })
})

// =====================================================================================================================
// Perf probe (docs/MAP-PLAN-2026-10-18.md 9.1 / 9.3): QA_MAP_PERF=1, mobile project. CPU x4 + "Baku 4G" (9 / 1.5 Mbps, 60 ms RTT)
// through CDP, median of QA_MAP_PERF_RUNS (5). Times are page-clock ms from the press on the Map tab (or the history pop) to
// the first list row in the DOM, the first pin, and the canvas shown (load + first idle). Writes artifacts/map/perf-*.json.
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
      return page.evaluate(() => {
        const q = window.__qa
        const r = k => (q.marks[k] == null ? null : Math.round(q.marks[k] - q.t0))
        const cls = q.shifts.filter(s => s.t >= q.t0 && !s.input).reduce((n, s) => n + s.v, 0)
        return { row: r('row'), pin: r('pin'), ready: r('ready'), cls: Math.round(cls * 10000) / 10000 }
      })
    }
    const out = { cold: [], prefetched: [], warm: [], back: [], frames: {}, mapPlaces: null, gpu: !!process.env.QA_MAP_GPU }
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
          await page.locator('a[href="/"]').first().tap()
          await expect(page.locator('.mp-screen')).toHaveCount(0)
          await M.wait(1500)
          await tab.tap()
          out.warm.push(await marks(page))
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
          }
        }
        await close()
      }
    }
    const { page, close } = await M.openMap(browser, {})
    const resp = M.placesResponse(page)
    await page.goto(M.url('/map'))
    const r = await resp
    const body = await r.body()
    const timing = r.request().timing()
    out.mapPlaces = { bytes: body.length, ttfbMs: Math.round(timing.responseStart - timing.requestStart) }
    await close()
    const med = list => { const v = list.filter(x => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null }
    out.median = Object.fromEntries(['cold', 'prefetched', 'warm', 'back'].map(k => [k, { row: med(out[k].map(x => x.row)), pin: med(out[k].map(x => x.pin)), ready: med(out[k].map(x => x.ready)), clsMax: Math.max(...out[k].map(x => x.cls)) }]))
    const file = M.writeJson(`perf-r3-${process.env.QA_MAP_GPU ? 'gpu' : 'swiftshader'}.json`, out)
    testInfo.annotations.push({ type: 'perf', description: `${file} ${JSON.stringify(out.median)} frames ${JSON.stringify(out.frames)} map_places ${JSON.stringify(out.mapPlaces)}` })
    console.log(JSON.stringify(out, null, 1))
  })
})
