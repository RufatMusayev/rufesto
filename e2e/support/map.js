// Helpers of the Map tab spec (tests/ux-map.spec.js, docs/MAP-PLAN-2026-10-18.md section 9).
//
// DOM of the map screen (client/src/features/map):
//   .mp-screen[data-snap=0|1|2][data-map-theme]            fixed between the status bar and the bottom nav
//     .mp-map > .mp-canvas[data-map-theme] > .mp-canvas__map(.is-ready) + .mp-attrib + .mp-zoom
//        pins: .mp-marker > button.mp-pin[data-id][aria-pressed](.is-selected .is-dot .is-closed .is-leave)  bubbles: button.mp-cluster
//     .ss-root[data-snap] > section.ss-panel > .ss-head (.ss-grab + .mp-head: .mp-count + .mp-chips) + .ss-body > ul.mp-list > li.mp-li[data-id] > button.sr-row
//     .mp-car-wrap[data-open] > ul.mp-car > li.mp-slide[data-id] > article.mp-card     (phone, a place is selected)
//     .mp-panel (desktop >= 1024 px, and the whole screen in list mode)  .mp-offline (map failed)  .mp-notice (toasts)
//
// Contexts are built here (not the project's page): the phone is a Pixel 7 at 390x844 with touch (plan 9), the desktop a
// 1280x800 mouse context. One init script per context records CSP violations, stubs window.open (Directions), can seed the
// map session (camera / snap / filters, sessionStorage 'rufesto_map_v1', read by features/map/store.js on load), can switch
// WebGL2 off and can log the style layers MapLibre sends to its worker (the map instance itself is not reachable).
// Sign-in is the auth-API session injection of support/guest.js: no password is ever typed or printed.
const fs = require('fs')
const path = require('path')
const { devices, expect } = require('@playwright/test')
const { CONSUMER_URL } = require('./env')
const { signInGuest } = require('./guest')

const ART = path.join(__dirname, '..', 'artifacts', 'map')
const ORIGIN = new URL(CONSUMER_URL).origin
const TILE_HOST = /tiles\.openfreemap\.org/
const SUPABASE = /supabase|\/(rest|auth|storage|realtime)\/v1\//i
const EDGE_NOISE = /static\.cloudflareinsights\.com|cloudflareinsights\.com\/cdn-cgi/i
const wait = ms => new Promise(r => setTimeout(r, ms))

const PHONE = { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } }
const DESK = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false }

/**
 * A camera over the centre at z13.5 (above the bubble zoom 12): at peek the six Old City venues (Bella Roma, Fincan, Şirvan,
 * Səda, Meze, Dönər) are pins in the visible area; Sakura, Brew & Books, Burger Qala and Tiflis Dvor are off screen.
 */
const CENTRE_CAM = { center: [49.8383, 40.37], zoom: 13.5 }

// ------------------------------------------------------------------------------------------------------------ accounts
/** Aysel Məmmədova (docs/DEMO-ACCOUNTS.md, guests): QA_AYSEL_EMAIL / _PASSWORD, or read at run time from that git-excluded doc. */
function ayselAccount() {
  if (process.env.QA_AYSEL_EMAIL && process.env.QA_AYSEL_PASSWORD) return { email: process.env.QA_AYSEL_EMAIL, password: process.env.QA_AYSEL_PASSWORD }
  let raw
  try { raw = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'DEMO-ACCOUNTS.md'), 'utf8') } catch { return null }
  for (const line of raw.split(/\r?\n/)) {
    const cells = line.split('|').map(c => c.trim().replace(/^`|`$/g, ''))
    const i = cells.findIndex(c => c === 'aysel.memmedova@demo.rufesto.com')
    if (i > 0 && cells[i + 1]) return { email: cells[i], password: cells[i + 1] }
  }
  return null
}

// ------------------------------------------------------------------------------------------------------------ contexts
/**
 * A fresh context + page on the consumer app.
 *  phone       true = Pixel 7 touch 390x844, false = desktop mouse 1280x800
 *  lang/theme  localStorage rufesto_lang / rufesto_theme
 *  seed        { camera, snap, filters } written once into sessionStorage['rufesto_map_v1'] before the app starts
 *  noWebGL     canvas.getContext('webgl2') answers null
 *  workerLog   record the 'SL' / 'UL' (set / update layers) messages MapLibre posts to its worker
 *  who         an { email, password } to sign in with (auth API), or null
 * Resolves { ctx, page, w, cdp, close }. `w` collects console errors, uncaught errors, failed requests, CSP blocks.
 */
async function openMap(browser, o = {}) {
  const {
    phone = true, lang = 'en', theme = 'dark', seed = null, noWebGL = false, workerLog = false, who = null,
    colorScheme = theme, reducedMotion, permissions = [], frameLog = false, perf = false,
  } = o
  const local = [{ name: 'rufesto_lang', value: lang }]
  if (theme) local.push({ name: 'rufesto_theme', value: theme })
  const ctx = await browser.newContext({
    ...(phone ? PHONE : DESK),
    locale: lang === 'ru' ? 'ru-RU' : lang === 'az' ? 'az-AZ' : 'en-US',
    colorScheme: colorScheme || 'dark',
    ...(reducedMotion ? { reducedMotion } : {}),
    permissions,
    storageState: { cookies: [], origins: [{ origin: ORIGIN, localStorage: local }] },
  })
  await ctx.addInitScript(opts => {
    const qa = (window.__qa = { csp: [], opened: [], msgs: [], marks: {} })
    document.addEventListener('securitypolicyviolation', e => qa.csp.push(`${e.violatedDirective} ${e.blockedURI}`))
    // Directions: record the hand-over instead of opening a tab
    window.open = url => { qa.opened.push(String(url)); return null }
    if (opts.seed) {
      try {
        if (!sessionStorage.getItem('__qa_map_seeded')) {
          sessionStorage.setItem('__qa_map_seeded', '1')
          sessionStorage.setItem('rufesto_map_v1', JSON.stringify({ v: 1, at: Date.now(), uid: null, places: null, fetchedAt: 0, selectedSlug: null, ...opts.seed }))
        }
      } catch { /* storage blocked */ }
    }
    if (opts.noWebGL) {
      const get = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return /^webgl2$/i.test(type) ? null : get.call(this, type, ...rest) }
    }
    if (opts.workerLog && typeof Worker === 'function') {
      const post = Worker.prototype.postMessage
      Worker.prototype.postMessage = function (m, ...rest) {
        try { if (m && (m.type === 'SL' || m.type === 'UL')) qa.msgs.push({ type: m.type, at: performance.now(), json: JSON.stringify(m.data) }) } catch { /* not serialisable */ }
        return post.call(this, m, ...rest)
      }
    }
    // perf probe: a press on the Map tab or a history pop starts a new measurement (marks below are relative to qa.t0)
    if (opts.perf) {
      const reset = t => { qa.marks = {}; qa.t0 = t }
      document.addEventListener('pointerdown', e => { if (e.target.closest?.('a[href="/map"]')) reset(e.timeStamp) }, true)
      window.addEventListener('popstate', () => reset(performance.now()), true)
      qa.cls = 0
      try {
        new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) qa.cls += e.value })
          .observe({ type: 'layout-shift', buffered: true })
      } catch { /* not supported */ }
    }
    // the last finger / button release (page clock): settle times are measured from it
    for (const t of ['pointerup', 'touchend']) document.addEventListener(t, e => { qa.lastUp = e.timeStamp }, true)
    // pin entry motion seen on the buttons: 'is-enter' (spring pop), '--mp-d' (stagger delay), 'is-enter-fade' (reduced motion)
    qa.anim = { enter: 0, stagger: 0, fade: 0 }
    // first time each part of the screen is in the DOM (performance.now(), page clock)
    const mark = k => { if (qa.marks[k] == null) qa.marks[k] = performance.now() }
    const check = records => {
      for (const r of records || []) {
        const b = r.target
        if (r.type !== 'attributes' || !b.classList || !b.classList.contains('mp-pin')) continue
        if (b.classList.contains('is-enter')) qa.anim.enter += 1
        if (b.classList.contains('is-enter-fade')) qa.anim.fade += 1
        if (b.style.getPropertyValue('--mp-d')) qa.anim.stagger += 1
      }
      if (document.querySelector('.mp-screen')) mark('screen')
      if (document.querySelector('.mp-li')) mark('row')
      if (document.querySelector('.mp-pin, .mp-cluster')) mark('pin')
      if (document.querySelector('.mp-canvas__map.is-ready')) mark('ready')
      if (document.querySelector('.mp-card')) mark('card')
    }
    const mo = new MutationObserver(check)
    const start = () => mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })
    if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start)
    // frame log: from the first frame of the map screen, what each of the next 90 frames shows
    if (opts.frameLog) {
      qa.frames = []
      const tick = () => {
        const screen = document.querySelector('.mp-screen')
        if (screen) {
          const wrap = document.querySelector('.mp-car-wrap')
          const m = wrap && getComputedStyle(wrap).transform
          qa.frames.push({
            t: Math.round(performance.now()), row: !!document.querySelector('.mp-li'), card: !!document.querySelector('.mp-card'),
            open: !!document.querySelector('.mp-car-wrap[data-open]'), wrapTy: m && m !== 'none' ? Math.round(new DOMMatrixReadOnly(m).m42) : 0,
            sheetHidden: document.querySelector('.ss-root')?.hasAttribute('data-hidden') ?? null,
          })
        }
        if (qa.frames.length < 90) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }
  }, { seed, noWebGL, workerLog, frameLog, perf })

  open.add(ctx)
  const page = await ctx.newPage()
  const w = watch(page)
  if (who) await signInGuest(page, who)
  const cdp = await ctx.newCDPSession(page)
  return { ctx, page, w, cdp, close: () => { open.delete(ctx); return ctx.close().catch(() => {}) } }
}
const open = new Set()
/** Closes every context a test opened (afterEach): a failed test must not leave its page behind in the worker. */
async function closeAll() {
  const list = [...open]
  open.clear()
  await Promise.all(list.map(c => c.close().catch(() => {})))
}

/** Console errors (same noise rules as support/fixtures.js), uncaught errors, failed requests and CSP-blocked requests. */
function watch(page, { allow = [] } = {}) {
  const w = { errors: [], failed: [], cspBlocked: [], requests: [], allow }
  page.on('console', msg => {
    if (msg.type() !== 'error') return
    const url = msg.location()?.url || ''
    const text = msg.text()
    if (EDGE_NOISE.test(text) || EDGE_NOISE.test(url)) return
    if (/status of 401/.test(text) && SUPABASE.test(url)) return
    if (w.allow.some(re => re.test(text) || re.test(url))) return
    w.errors.push(`${text} [${url}]`)
  })
  page.on('pageerror', err => w.errors.push(`uncaught: ${err.message}`))
  page.on('request', req => w.requests.push({ url: req.url(), at: Date.now(), type: req.resourceType() }))
  page.on('requestfailed', req => {
    const why = req.failure()?.errorText || 'failed'
    if (/csp/i.test(why)) w.cspBlocked.push(`${why} ${req.url()}`)
    else if (!/ERR_ABORTED/.test(why)) w.failed.push(`${why} ${req.method()} ${req.url()}`)
  })
  page.on('response', res => { if (res.status() >= 400) w.failed.push(`${res.status()} ${res.request().method()} ${res.url()}`) })
  return w
}

/** 0 console errors, 0 CSP violations (document event + requests blocked by CSP, worker requests included). */
async function expectClean(page, w, label = '') {
  const csp = await page.evaluate(() => window.__qa?.csp || []).catch(() => [])
  expect.soft(w.errors, `${label} console errors`).toEqual([])
  expect.soft([...csp, ...w.cspBlocked], `${label} CSP violations`).toEqual([])
}

// ------------------------------------------------------------------------------------------------------------ screen
const url = p => `${CONSUMER_URL}${p}`

/** The map_places answer of this page (the next one, or the one already seen when `already` is given). */
const placesResponse = page => page.waitForResponse(r => /\/rpc\/map_places/.test(r.url()) && r.request().method() === 'POST', { timeout: 20_000 })

/** Opens /map (or `path`) and waits for the list; resolves the map_places places (normalised fields as the RPC sends them). */
async function gotoMap(page, pathname = '/map') {
  const resp = placesResponse(page)
  await page.goto(url(pathname))
  const r = await resp
  const text = await r.text().catch(() => '')
  if (!r.ok()) throw new Error(`map_places answered HTTP ${r.status()}: ${text.slice(0, 300)}`)
  const body = JSON.parse(text)
  await expect(page.locator('.mp-li').first(), `the list (map_places gave ${body?.places?.length} places)`).toBeVisible({ timeout: 20_000 })
  return body
}

/** The canvas is shown (load + first idle) and pins / bubbles are on it; then the camera has stopped moving. */
async function mapReady(page, timeout = 25_000) {
  await expect(page.locator('.mp-canvas__map.is-ready')).toHaveCount(1, { timeout })
  await expect(page.locator('.mp-pin, .mp-cluster').first()).toBeAttached({ timeout })
  await cameraStill(page)
}

/** { center:[lng,lat], zoom } from the map's own handle (MapCanvas ref, reached through React's fiber of .mp-canvas). */
function camera(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.mp-canvas')
    if (!el) return null
    const key = Object.keys(el).find(k => k.startsWith('__reactFiber$'))
    let f = key ? el[key] : null
    while (f && !(f.ref && f.ref.current && typeof f.ref.current.getCamera === 'function')) f = f.return
    return f ? f.ref.current.getCamera() : null
  })
}

/** Waits until two camera reads 200 ms apart agree (no animation running). */
async function cameraStill(page, timeout = 6_000) {
  const end = Date.now() + timeout
  let a = await camera(page)
  while (Date.now() < end) {
    await wait(200)
    const b = await camera(page)
    if (a && b && sameCam(a, b, 1e-9, 1e-6)) return b
    a = b
  }
  return a
}
const sameCam = (a, b, dDeg, dZoom) => Math.abs(a.center[0] - b.center[0]) <= dDeg && Math.abs(a.center[1] - b.center[1]) <= dDeg && Math.abs(a.zoom - b.zoom) <= dZoom

/** Distance in CSS px between two cameras' centres at zoom `z` (Web Mercator, 512 px tiles). */
function centrePx(a, b, z = a.zoom) {
  const ws = 512 * 2 ** z
  const x = lng => ((lng + 180) / 360) * ws
  const y = lat => { const s = Math.sin((lat * Math.PI) / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * ws }
  return Math.hypot(x(a.center[0]) - x(b.center[0]), y(a.center[1]) - y(b.center[1]))
}

/** The state of the screen in one read. */
function state(page) {
  return page.evaluate(() => {
    const sel = [...document.querySelectorAll('.mp-pin')].filter(b => !b.classList.contains('is-leave'))
    const r = el => (el ? el.getBoundingClientRect().toJSON() : null)
    return {
      url: location.pathname + location.search,
      hist: history.length,
      snap: document.querySelector('.mp-screen')?.dataset.snap ?? null,
      pins: sel.map(b => b.dataset.id),
      selectedPins: sel.filter(b => b.classList.contains('is-selected')).map(b => b.dataset.id),
      pressedPins: sel.filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.id),
      clusters: document.querySelectorAll('.mp-cluster:not(.is-leave)').length,
      rows: [...document.querySelectorAll('.mp-li')].map(li => li.dataset.id),
      selectedRows: [...document.querySelectorAll('.mp-li .sr-row.is-selected, .mp-li.mp-li--expanded')].map(b => b.closest('.mp-li').dataset.id),
      carouselOpen: !!document.querySelector('.mp-car-wrap[data-open]'),
      centredCard: (() => {
        const sc = document.querySelector('.mp-car')
        if (!sc) return null
        const mid = sc.scrollLeft + sc.clientWidth / 2
        let best = null; let d = Infinity
        for (const el of sc.children) { const dd = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid); if (dd < d) { d = dd; best = el } }
        return best?.dataset.id ?? null
      })(),
      count: document.querySelector('.mp-count')?.textContent ?? null,
      scroll: { y: window.scrollY, x: window.scrollX, top: document.scrollingElement.scrollTop, left: document.scrollingElement.scrollLeft, scale: window.visualViewport?.scale ?? 1, vvTop: window.visualViewport?.offsetTop ?? 0 },
      panel: r(document.querySelector('.ss-panel')),
      card: r(document.querySelector('.mp-car-wrap')),
    }
  })
}

/** The page itself has not moved: scrollY, scrollingElement.scrollTop (and X, pinch scale) are 0 / 1. */
async function expectPageStill(page, label) {
  const s = (await state(page)).scroll
  expect.soft(s, `${label}: the page behind the map must not move`).toEqual({ y: 0, x: 0, top: 0, left: 0, scale: 1, vvTop: 0 })
  return s
}

/** The bottom-centre (tail tip = venue point) of a pin, in viewport px; null when it is not rendered. */
async function pinPoint(page, id) {
  const box = await page.locator(`.mp-pin[data-id="${id}"]`).boundingBox()
  return box ? { x: box.x + box.width / 2, y: box.y + box.height } : null
}

/** A point on the bare map (canvas under the finger, no pin / bubble / control within 56 px), inside [top, bottom). */
function emptyMapPoint(page, { top = 90, bottom } = {}) {
  return page.evaluate(({ top, bottom }) => {
    const H = bottom ?? innerHeight * 0.4
    const pins = [...document.querySelectorAll('.mp-pin, .mp-cluster')].map(b => b.getBoundingClientRect())
    for (let y = top; y < H; y += 20) {
      for (let x = 40; x < innerWidth - 40; x += 20) {
        const el = document.elementFromPoint(x, y)
        if (!el || !el.classList.contains('maplibregl-canvas')) continue
        if (pins.every(r => x < r.left - 56 || x > r.right + 56 || y < r.top - 56 || y > r.bottom + 56)) return { x, y }
      }
    }
    return null
  }, { top, bottom })
}

/**
 * Pills (not dots, not leaving) that can be tapped: the whole pill on screen between `top` and `bottom` and the pill's own
 * button under its centre (nothing covers it). Resolves [{ id, x, y, cx, cy }] (x, y = tail tip; cx, cy = pill centre).
 */
function tappablePins(page, { top = 56, bottom } = {}) {
  return page.evaluate(({ top, bottom }) => {
    const B = bottom ?? (document.querySelector('.ss-panel')?.getBoundingClientRect().top ?? innerHeight) - 8
    return [...document.querySelectorAll('.mp-pin:not(.is-dot):not(.is-leave)')].map(b => {
      const r = b.getBoundingClientRect()
      return { id: b.dataset.id, x: r.left + r.width / 2, y: r.bottom, cx: r.left + r.width / 2, cy: r.top + 14, r }
    }).filter(p => p.r.top >= top && p.r.bottom <= B && p.r.left >= 8 && p.r.right <= innerWidth - 8
      && document.elementFromPoint(p.cx, p.cy)?.closest('.mp-pin')?.dataset.id === p.id)
      .map(({ r, ...p }) => p)
  }, { top, bottom })
}

/** Scrolls the carousel to a place's card at once (as a finger would end) and waits for the selection to follow. */
async function carouselTo(page, id) {
  await page.evaluate(id => {
    const sc = document.querySelector('.mp-car')
    const el = sc.querySelector(`[data-id="${CSS.escape(id)}"]`)
    sc.scrollTo({ left: el.offsetLeft - (sc.clientWidth - el.offsetWidth) / 2, behavior: 'auto' })
  }, id)
  await expect.poll(async () => (await state(page)).url, { timeout: 4_000 }).toContain('?place=')
  await expect.poll(async () => (await state(page)).selectedPins, { timeout: 4_000 }).toEqual([id])
}

/** Every distinct camera seen frame by frame for `ms` (page clock). */
const cameraTrace = (page, ms) => page.evaluate(ms => new Promise(resolve => {
  const el = document.querySelector('.mp-canvas')
  const key = Object.keys(el).find(k => k.startsWith('__reactFiber$'))
  let f = el[key]
  while (f && !(f.ref && f.ref.current && typeof f.ref.current.getCamera === 'function')) f = f.return
  const h = f.ref.current
  const seen = []
  const t0 = performance.now()
  const tick = () => {
    const c = h.getCamera()
    const k = `${c.center[0].toFixed(7)},${c.center[1].toFixed(7)},${c.zoom.toFixed(4)}`
    if (seen[seen.length - 1] !== k) seen.push(k)
    if (performance.now() - t0 < ms) requestAnimationFrame(tick); else resolve(seen)
  }
  requestAnimationFrame(tick)
}), ms)

/** Starts recording rAF frame times; `frameStop` resolves { frames, median, p95, max, over50, over100 } (ms). */
const frameStart = page => page.evaluate(() => {
  const q = (window.__qaFrames = { t: [], on: true })
  const tick = t => { q.t.push(t); if (q.on) requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
})
const frameStop = page => page.evaluate(() => {
  const q = window.__qaFrames
  q.on = false
  const d = q.t.slice(1).map((t, i) => t - q.t[i]).sort((a, b) => a - b)
  const at = p => (d.length ? d[Math.min(d.length - 1, Math.floor(p * d.length))] : null)
  const r = x => (x == null ? null : Math.round(x * 10) / 10)
  return { frames: d.length, median: r(at(0.5)), p95: r(at(0.95)), max: r(d[d.length - 1]), over50: d.filter(x => x > 50).length, over100: d.filter(x => x > 100).length }
})

// ------------------------------------------------------------------------------------------------------------ input
/**
 * A touch gesture through CDP. `frames` is a list of touch-point lists ([{x,y}] one finger, [{x,y},{x,y}] two); the first
 * is the touchStart, the last move is followed by touchEnd. Events carry explicit timestamps `dt` ms apart (the page's
 * e.timeStamp follows them, so velocities are exact) and the real clock is kept in step. `hold` rests before lifting.
 */
async function touchPath(cdp, frames, { dt = 16, hold = 0 } = {}) {
  const t0 = Date.now()
  const at = i => (t0 + i * dt) / 1000
  const pts = f => f.map((p, id) => ({ x: Math.round(p.x), y: Math.round(p.y), id, radiusX: 4, radiusY: 4, force: 1 }))
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(frames[0]), timestamp: at(0) })
  let i = 0
  for (i = 1; i < frames.length; i += 1) {
    const lag = t0 + i * dt - Date.now()
    if (lag > 0) await wait(lag)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(frames[i]), timestamp: at(i) })
  }
  let end = t0 + (i - 1) * dt
  if (hold) {
    // a resting finger: one more move at the same place `hold` ms later, so the last 100 ms carry no speed
    end += hold
    const lag = end - Date.now()
    if (lag > 0) await wait(lag)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(frames[frames.length - 1]), timestamp: end / 1000 })
  }
  end += dt
  const lag = end - Date.now()
  if (lag > 0) await wait(lag)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: end / 1000 })
}

/** One finger in a straight line, `steps` moves. */
const line = (from, to, steps) => Array.from({ length: steps + 1 }, (_, i) => [{ x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps }])
/** A one-finger swipe from `from` to `to` in `steps` moves `dt` ms apart (speed = distance / (steps * dt)). */
const swipe = (cdp, from, to, { steps = 12, dt = 16, hold = 0 } = {}) => touchPath(cdp, line(from, to, steps), { dt, hold })
/** A tap that MapLibre / the DOM sees as a touch tap. */
const tapAt = (cdp, p) => touchPath(cdp, [[p]], { dt: 40 })
/** Two fingers moving apart (spread > 0) or together around `c`. */
function pinch(cdp, c, { from = 40, to = 140, steps = 12, dt = 16 } = {}) {
  const frames = Array.from({ length: steps + 1 }, (_, i) => { const r = from + ((to - from) * i) / steps; return [{ x: c.x - r, y: c.y }, { x: c.x + r, y: c.y }] })
  return touchPath(cdp, frames, { dt })
}

/** translateY of the sheet panel right now. */
const panelY = page => page.evaluate(() => {
  const p = document.querySelector('.ss-panel')
  const m = p && getComputedStyle(p).transform
  return m && m !== 'none' ? new DOMMatrixReadOnly(m).m42 : 0
})

/** ms (page clock) until the panel rests at translateY `y` (± 0.5) for 3 frames; null after `timeout`. */
const settleTime = (page, y, timeout = 1500) => page.evaluate(({ y, timeout }) => new Promise(resolve => {
  const t0 = window.__qa?.lastUp ?? performance.now()
  let still = 0
  let first = 0
  const tick = () => {
    const p = document.querySelector('.ss-panel')
    const m = p && getComputedStyle(p).transform
    const cur = m && m !== 'none' ? new DOMMatrixReadOnly(m).m42 : 0
    still = Math.abs(cur - y) <= 0.5 ? still + 1 : 0
    if (still === 1) first = performance.now()
    if (still >= 3) { resolve(Math.round(first - t0)); return }
    if (performance.now() - t0 > timeout) { resolve(null); return }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}), { y, timeout })

// ------------------------------------------------------------------------------------------------------------ files
async function shot(page, name, opts = {}) {
  fs.mkdirSync(ART, { recursive: true })
  // photos on screen have loaded (or failed): a blank thumbnail in a screenshot is then a real finding, not timing
  await page.waitForFunction(() => [...document.images].filter(i => { const r = i.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0 }).every(i => i.complete), null, { timeout: 4_000 }).catch(() => {})
  const file = path.join(ART, `${name}.png`)
  await page.screenshot({ path: file, ...opts })
  return file
}
function writeJson(name, data) {
  fs.mkdirSync(ART, { recursive: true })
  const file = path.join(ART, name)
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
  return file
}

module.exports = {
  ART, PHONE, DESK, CENTRE_CAM, TILE_HOST, wait, url,
  ayselAccount, openMap, closeAll, watch, expectClean,
  gotoMap, placesResponse, mapReady, camera, cameraStill, sameCam, centrePx, state, expectPageStill, pinPoint, emptyMapPoint,
  tappablePins, carouselTo, cameraTrace, frameStart, frameStop, touchPath, line, swipe, tapAt, pinch, panelY, settleTime, shot, writeJson,
}
