// Helpers of the UX round specs (docs/UX-PLAN-2026-10-18.md 8.4): ux-shell, ux-sheet, ux-search, ux-reviews, ux-notifications,
// ux-home-popular, ux-dish-sheet. Also the selectors of the new sheet primitive that older specs use for what used to be
// `.overlay` / `.sheet` / `.overlay.center` (client/src/components/ui/BottomSheet.jsx).
//
// BottomSheet DOM: portal(body) > .bs-root[role-less, data-state=open|closed] > .bs-scrim + .bs-panel[role=dialog] > .bs-head (.bs-grab + title row)
// + .bs-body[data-bs-scroll] + .bs-foot. A sheet that is closing stays in the DOM for ~240 ms with data-state="closed".
//
// Contexts: the touch tests need a phone, whatever project they run in. `phone(browser, testInfo)` builds a Pixel 7 context at 390x844
// (the width the plan measures at) in the desktop project and reuses the project's own device in the mobile project. `desktop()` is a mouse
// context at 1280x860. Sign-in is the usual auth-API session injection (support/feat-social.js), never a password field.
const { devices } = require('@playwright/test')
const { expect } = require('./fixtures')
const S = require('./feat-social')
const { CONSUMER_URL } = require('./env')

const url = S.url
const wait = ms => new Promise(r => setTimeout(r, ms))

// ---------------------------------------------------------------------------------------------------- sheet selectors
/** Every sheet still in the DOM (also one that is animating out). */
const anySheet = page => page.locator('.bs-root')
/** The sheets that are open (data-state="open"); a closing sheet is not counted. */
const openSheets = page => page.locator('.bs-root[data-state="open"]')
/** The panel (role=dialog) of the top open sheet: what the old specs called `.overlay .sheet`. */
const sheet = page => page.locator('.bs-root[data-state="open"] .bs-panel').last()
/** The scroller of the top open sheet. */
const sheetBody = page => page.locator('.bs-root[data-state="open"] .bs-body').last()
/** The open sign-in sheet (AuthModal): what the old specs called `.overlay.center`. A sheet that is still animating out is not counted. */
const authSheet = page => page.locator('.bs-root[data-state="open"]:has(.au-body)')
/** Wait until no sheet is left in the DOM (the exit animation has finished and the sheet unmounted). */
const noSheet = async (page, message = 'no sheet is open', timeout = 5_000) => expect(page.locator('.bs-root'), message).toHaveCount(0, { timeout })

// ------------------------------------------------------------------------------------------------------------ contexts
const PHONE = { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } }

const english = use => use.storageState || { cookies: [], origins: [{ origin: new URL(CONSUMER_URL).origin, localStorage: [{ name: 'rufesto_lang', value: 'en' }] }] }

/** True when the project already is the phone one. */
const isMobileProject = testInfo => !!testInfo.project.use.isMobile

/** Options of a phone context (touch, Pixel 7 UA, 390x844) in English, dark scheme. `extra` overrides (colorScheme, reducedMotion ...). */
function phoneOptions(testInfo, extra = {}) {
  const use = testInfo.project.use
  return { ...PHONE, locale: 'en-US', colorScheme: use.colorScheme || 'dark', storageState: english(use), ...extra }
}
/** Options of a desktop mouse context (1280x860). */
function desktopOptions(testInfo, extra = {}) {
  const use = testInfo.project.use
  return {
    viewport: { width: 1280, height: 860 }, locale: 'en-US', colorScheme: use.colorScheme || 'dark', storageState: english(use),
    deviceScaleFactor: 1, isMobile: false, hasTouch: false, ...extra,
  }
}

/**
 * A fresh context + page, signed in as `who` (a review account number, 'manager.bella' ..., or null for signed out).
 * Resolves { context, page, watch, api, auth, close } (api / auth only when signed in).
 */
async function open(browser, testInfo, options, who = null) {
  const context = await browser.newContext(options)
  const page = await context.newPage()
  const watch = S.watchPage(page)
  const user = who == null ? {} : await S.asUser(page, who)
  return { context, page, watch, api: user.api, auth: user.auth, close: () => context.close().catch(() => {}) }
}
const phone = (browser, testInfo, who = null, extra = {}) => open(browser, testInfo, phoneOptions(testInfo, extra), who)
const desktop = (browser, testInfo, who = null, extra = {}) => open(browser, testInfo, desktopOptions(testInfo, extra), who)

// ------------------------------------------------------------------------------------------------------- touch gestures
/** A CDP session for touch input on `page` (works in any Chromium context with hasTouch). */
const touch = (context, page) => context.newCDPSession(page)

/**
 * One finger from (x, y0) to (x, y1) in `steps` moves, `stepMs` apart, then lift. Resolves the elapsed ms of the moves (for velocity checks).
 * `hold` rests the finger that long before it lifts (the sheet reads the speed of the last 100 ms only, so a held finger has none).
 * `settle` waits for the sheet's snap-back / dismiss animation and momentum to end.
 */
async function swipe(cdp, x, y0, y1, { steps = 12, stepMs = 16, settle = 700, hold = 0 } = {}) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] })
  const t0 = Date.now()
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / steps }] })
    if (stepMs) await wait(stepMs)
  }
  const moved = Date.now() - t0
  if (hold) await wait(hold)   // the finger rests before it lifts: no flick velocity, only the distance counts
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  if (settle) await wait(settle)
  return moved
}

// ---------------------------------------------------------------------------------------------------------- page state
/** What the sheet probes of the plan measure: the page scroll position and the state of the top sheet. */
const probe = page => page.evaluate(() => {
  const root = [...document.querySelectorAll('.bs-root')].pop()
  const panel = root && root.querySelector('.bs-panel')
  const body = root && root.querySelector('.bs-body')
  return {
    winY: Math.round(window.scrollY),
    locked: document.documentElement.classList.contains('is-locked'),
    open: document.querySelectorAll('.bs-root[data-state="open"]').length,
    inDom: document.querySelectorAll('.bs-root').length,
    bodyTop: body ? Math.round(body.scrollTop) : -1,
    bodyMax: body ? Math.round(body.scrollHeight - body.clientHeight) : -1,
    panelH: panel ? Math.round(panel.getBoundingClientRect().height) : 0,
    panelTop: panel ? Math.round(panel.getBoundingClientRect().top) : 0,
    transform: panel ? panel.style.transform : '',
    active: document.activeElement ? `${document.activeElement.tagName.toLowerCase()}${document.activeElement.className ? '.' + String(document.activeElement.className).split(' ')[0] : ''}` : '',
  }
})

/** The viewport rectangle of a locator's first match, rounded: { top, left, width, height, bottom }. */
const box = async loc => loc.first().evaluate(el => {
  const r = el.getBoundingClientRect()
  return { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height), bottom: Math.round(r.bottom) }
})

/** Scroll the page instantly (the app sets scroll-behavior: smooth). */
const scrollTo = (page, y) => page.evaluate(top => window.scrollTo({ top, behavior: 'instant' }), y)

// ------------------------------------------------------------------------------------------------------------- restaurant
/** Open the Menu tab of a restaurant and wait for the printed menu. */
async function gotoMenu(page, slug = 'bella-roma', extra = '') {
  await page.goto(url(`/restaurant/${slug}?tab=menu${extra}`))
  await expect(page.locator('.mn-row').first()).toBeVisible()
}
/** The open-sheet button of the n-th dish row. */
const dishButton = (page, n = 3) => page.locator('.mn-row-btn').nth(n)
/** Open the dish sheet of the n-th dish by a tap (touch) or a click (mouse) and wait until it is open. */
async function openDish(page, n = 3, { tap = false } = {}) {
  const btn = dishButton(page, n)
  await btn.scrollIntoViewIfNeeded()
  if (tap) await btn.tap(); else await btn.click()
  await expect(page.locator('.bs-root.dds-root[data-state="open"]')).toBeVisible()
  await settled(page.locator('.bs-root.dds-root .bs-panel'), 'the dish sheet finished sliding in')
}

/** Wait until an element stopped moving (two reads 150 ms apart agree): a sheet that is still sliding in or snapping back. */
async function settled(loc, message = 'the element stopped moving') {
  let prev = null
  await expect.poll(async () => {
    const b = await box(loc)
    const k = `${b.top}|${b.height}`
    const same = k === prev
    prev = k
    return same
  }, { message, intervals: [150], timeout: 5_000 }).toBe(true)
}

module.exports = {
  url, wait, anySheet, openSheets, sheet, sheetBody, authSheet, noSheet,
  PHONE, isMobileProject, phoneOptions, desktopOptions, open, phone, desktop,
  touch, swipe, probe, box, scrollTo, gotoMenu, dishButton, openDish, settled,
}
