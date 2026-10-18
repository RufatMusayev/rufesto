// UX round: the stripped-down shell (docs/UX-PLAN-2026-10-18.md 1.1, 2.8, D10, acceptance 2.10 #9; client/src/components/layout/*).
//   - from 1024 px the left rail (Home, Explore, Map, Notifications, Table, Profile) replaces the bottom nav; below it (phones and 769-1023 px tablets,
//     touch or mouse) the bottom nav shows and the rail does not; nothing sticks out of the rail (the old 92 px EN | AZ group did);
//   - no EN | AZ, no theme toggle, no dead "More" button in the rail or the top bar; the top bar exists on Home only (wordmark, "+", bell);
//     the gold floating "+" is gone; the bell sits in the Home bar on phones and in the rail on desktop;
//   - language and theme live in Profile > Settings (signed in or out), the theme label is fixed ("Dark mode") and the choices persist;
//   - a signed-out guest reaches Settings on the guest Profile page (round 4: the Profile tab opens it, no sign-in sheet): Language, Dark mode, Send feedback inline;
//   - the QR sheet's manual field asks for "Table code, e.g. FINCAN-4821" (not a UUID); sheets have no blurred scrim.
// Read only (Settings toggles are local to the browser context).
const { test, expect } = require('../support/fixtures')
const S = require('../support/feat-social')
const U = require('../support/ux')

const { url } = U
const WIDTHS = [
  { name: '390 phone, touch', width: 390, height: 844, touch: true, rail: false },
  { name: '820 tablet, touch', width: 820, height: 1180, touch: true, rail: false },
  { name: '1023 laptop, mouse', width: 1023, height: 800, touch: false, rail: false },
  { name: '1024 laptop, mouse', width: 1024, height: 800, touch: false, rail: true },
  { name: '1440 desktop, mouse', width: 1440, height: 900, touch: false, rail: true },
]
const english = { cookies: [], origins: [{ origin: new URL(url('/')).origin, localStorage: [{ name: 'rufesto_lang', value: 'en' }] }] }
const at = (testInfo, w, extra = {}) => ({
  viewport: { width: w.width, height: w.height }, locale: 'en-US', colorScheme: 'dark', storageState: english,
  isMobile: w.touch && w.width < 800, hasTouch: w.touch, deviceScaleFactor: 1, ...extra,
})

test.describe('ux shell', { tag: ['@consumer', '@feat', '@ux'] }, () => {
  test.describe.configure({ mode: 'default' })
  // these build their own viewports: the phone project adds nothing
  test.beforeEach(({}, testInfo) => { test.skip(testInfo.project.name === 'mobile', 'builds its own viewports: desktop project only') })

  for (const w of WIDTHS) {
    test(`${w.name}: ${w.rail ? 'rail, no bottom nav' : 'bottom nav, no rail'}; nothing sticks out of the rail; no language, theme or More control`, async ({ browser }, testInfo) => {
      const t = await U.open(browser, testInfo, at(testInfo, w))
      try {
        const { page } = t
        await page.goto(url('/'))
        await expect(page.getByRole('tab', { name: 'For you', exact: true })).toBeVisible()
        const bottom = page.locator('nav.bottom-nav'), rail = page.locator('aside.rail')
        if (w.rail) {
          await expect(rail).toBeVisible()
          await expect(bottom).toHaveCount(0)
          await expect(rail.getByRole('link')).toHaveCount(6)
          for (const name of ['Home', 'Search', 'Map', 'Notifications', 'Enter table code', 'Profile']) await expect(rail.getByRole('link', { name }), `rail item ${name}`).toBeVisible()
          const r = await U.box(rail)
          expect(r.width, 'the rail is 72 px').toBeLessThanOrEqual(80)
          const out = await rail.evaluate(el => {
            const right = el.getBoundingClientRect().right, left = el.getBoundingClientRect().left
            return [...el.querySelectorAll('*')].filter(c => { const b = c.getBoundingClientRect(); return b.width > 0 && (b.right > right + 0.5 || b.left < left - 0.5) }).map(c => c.tagName + '.' + c.className).slice(0, 5)
          })
          expect(out, 'elements outside the rail').toEqual([])
          expect(await rail.evaluate(el => el.scrollWidth <= el.clientWidth), 'the rail does not scroll sideways').toBe(true)
          // the rail carries the bell: the Home bar does not
          await expect(page.locator('.app-bar-bell')).toBeHidden()
        } else {
          await expect(bottom).toBeVisible()
          await expect(rail).toHaveCount(0)
          const b = await U.box(bottom)
          expect(b.height, 'bottom nav is 64 px (+ the safe area)').toBe(64)
          expect(b.bottom).toBe(w.height)
          await expect(bottom.getByRole('link')).toHaveCount(4)                      // Home, Explore, Map, Profile; the QR button sits between
          await expect(bottom.getByRole('button', { name: 'Scan QR' })).toBeVisible()
          await expect(page.locator('.app-bar .app-bar-bell')).toBeVisible()
          // no horizontal scroll or cut-off content at this width
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        }
        // none of the old shell controls
        await expect(page.getByRole('button', { name: /toggle theme/i })).toHaveCount(0)
        await expect(page.locator('.lang-switcher'), 'no EN | AZ outside Settings').toHaveCount(0)
        await expect(page.getByRole('button', { name: /^More$/ })).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'EN', exact: true })).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'AZ', exact: true })).toHaveCount(0)
        expect(t.watch.consoleErrors, 'console errors').toEqual([])
      } finally { await t.close() }
    })
  }

  test('the top bar is on Home only: wordmark, "+" and the bell; no floating gold "+" on Home, none on the other pages', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo, 1)
    try {
      const { page } = t
      await page.goto(url('/'))
      const bar = page.locator('header.app-bar')
      await expect(bar).toBeVisible()
      await expect(bar.locator('.app-bar-logo')).toHaveText('Rufesto')
      expect(await bar.getByRole('button').count(), 'the bar has "+" and the bell, nothing else').toBe(2)
      await expect(bar.getByRole('button', { name: 'New post' })).toBeVisible()
      await expect(bar.getByRole('button', { name: 'Notifications' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'New post' }), 'the one "+" is in the bar (the gold floating one is gone)').toHaveCount(1)
      const fixed = await page.evaluate(() => [...document.querySelectorAll('button, a')].filter(e => {
        const cs = getComputedStyle(e)
        return cs.position === 'fixed' && !e.closest('nav, header, aside, .bs-root') && e.getBoundingClientRect().width > 0
      }).map(e => e.getAttribute('aria-label') || e.textContent.trim().slice(0, 20)))
      expect(fixed, 'no floating action button over the feed').toEqual([])
      for (const path of ['/explore', '/map', '/profile', '/notifications', '/table', '/friends']) {
        await page.goto(url(path))
        await expect(page.locator('main, .main-content').first()).toBeVisible()
        await expect(page.locator('header.app-bar'), `no global top bar on ${path}`).toHaveCount(0)
      }
      // "+" opens the composer (signed in); signed out it asks to sign in
      await page.goto(url('/'))
      await bar.getByRole('button', { name: 'New post' }).tap()
      await expect(page).toHaveURL(url('/post/new'))
    } finally { await t.close() }
    const anon = await U.phone(browser, testInfo)
    try {
      await anon.page.goto(url('/'))
      await anon.page.locator('header.app-bar').getByRole('button', { name: 'New post' }).tap()
      await expect(U.authSheet(anon.page)).toBeVisible()
    } finally { await anon.close() }
  })

  test('guest Profile (signed out): the tab opens it without a sign-in sheet, Settings are inline (Language, Dark mode, Send feedback), no gear; the choices persist', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await page.goto(url('/'))
      await page.getByRole('navigation').getByRole('link', { name: 'Profile', exact: true }).tap()
      await expect(page).toHaveURL(url('/profile'))
      await expect(U.authSheet(page), 'the Profile tab no longer opens the sign-in sheet').toHaveCount(0)
      await expect(page.getByRole('heading', { name: 'Welcome to Rufesto' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Settings', exact: true }), 'no gear: the settings are on the page').toHaveCount(0)
      const settings = page.locator('.pf-guest-settings')
      await expect(settings.getByRole('heading', { name: 'Settings' })).toBeVisible()
      await expect(settings.getByRole('button', { name: 'Send feedback' })).toBeVisible()
      // Language: EN | AZ (| RU): found by lang attribute, so a third language does not matter
      expect(await settings.getByRole('group', { name: 'Language' }).getByRole('button').count(), 'a switch with at least EN and AZ').toBeGreaterThanOrEqual(2)
      await expect(settings.locator('button[lang="en"]')).toHaveAttribute('aria-pressed', 'true')
      const dark = settings.getByRole('switch', { name: 'Dark mode' })
      await expect(dark).toBeVisible()
      const html = page.locator('html')
      const theme = () => html.getAttribute('data-theme')
      const start = await theme()
      expect(await dark.getAttribute('aria-checked'), 'the switch says what the theme is').toBe(String(start === 'dark'))
      await dark.tap()
      await expect.poll(theme).not.toBe(start)
      await expect(settings.getByText('Dark mode', { exact: true }), 'the label does not flip with the state').toBeVisible()
      await expect(settings.getByText('Light mode', { exact: true })).toHaveCount(0)
      expect(await dark.getAttribute('aria-checked')).toBe(String(start !== 'dark'))
      const flipped = await theme()
      expect(await page.evaluate(() => localStorage.getItem('rufesto_theme'))).toBe(flipped)
      await page.reload()
      expect(await theme(), 'the theme survives a reload').toBe(flipped)
      // language: AZ switches the page itself, EN switches back, both stick
      await page.locator('.pf-guest-settings button[lang="az"]').tap()
      await expect.poll(() => page.evaluate(() => localStorage.getItem('rufesto_lang'))).toBe('az')
      await expect(page.locator('.pf-guest-settings').getByRole('heading', { name: 'Ayarlar' })).toBeVisible()
      await page.reload()
      expect(await page.evaluate(() => localStorage.getItem('rufesto_lang'))).toBe('az')
      await expect(page.locator('.pf-guest-settings').getByRole('heading', { name: 'Ayarlar' })).toBeVisible()
      await page.locator('.pf-guest-settings button[lang="en"]').tap()
      await expect.poll(() => page.evaluate(() => localStorage.getItem('rufesto_lang'))).toBe('en')
      await expect(page.locator('.pf-guest-settings').getByRole('heading', { name: 'Settings' })).toBeVisible()
      // Send feedback opens the feedback sheet over the page; a sheet has no blurred scrim
      await page.locator('.pf-guest-settings').getByRole('button', { name: 'Send feedback' }).tap()
      await expect(U.sheet(page).getByRole('heading', { name: 'Share feedback' })).toBeVisible()
      const blur = await page.locator('.bs-root[data-state="open"] .bs-scrim').evaluate(el => getComputedStyle(el).backdropFilter)
      expect(['none', ''], 'no backdrop blur behind a sheet (it janks on Android)').toContain(blur)
      await page.keyboard.press('Escape')
      await U.noSheet(page)
      expect(t.watch.consoleErrors, 'console errors').toEqual([])
    } finally { await t.close() }
  })

  test('Settings (signed in): one "Notifications" row to the settings page, no Delete account row, Send feedback, Sign out', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo, 1)
    try {
      const { page } = t
      await page.goto(url('/profile'))
      await page.getByRole('button', { name: 'Settings' }).tap()
      const sheet = U.sheet(page)
      await expect(sheet.getByRole('heading', { name: 'Settings' })).toBeVisible()
      await expect(sheet.getByRole('link', { name: 'Notifications' }), 'one row, opens the settings page').toHaveCount(1)
      await expect(sheet.getByText('Notification settings')).toHaveCount(0)
      await expect(sheet.getByText('Delete account'), 'the destructive row moved to Edit profile').toHaveCount(0)
      await expect(sheet.getByRole('button', { name: 'Send feedback' })).toBeVisible()
      await expect(sheet.getByRole('button', { name: 'Sign out' })).toBeVisible()
      await sheet.getByRole('link', { name: 'Notifications' }).tap()
      await expect(page).toHaveURL(url('/settings/notifications'))
      await expect(page.getByRole('heading', { name: 'Notification settings' })).toBeVisible()
      // Back from the new page returns to Profile, not to a closed sheet
      await page.goBack()
      await expect(page).toHaveURL(url('/profile'))
      await U.noSheet(page)
    } finally { await t.close() }
  })

  test('the QR sheet asks for a table code like "FINCAN-4821", not a UUID', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo, 1)
    try {
      const { page } = t
      await page.goto(url('/'))
      test.skip(await page.getByRole('button', { name: 'Active table' }).count() > 0, 'review1 is seated at a table')
      await page.getByRole('button', { name: 'Scan QR' }).tap()
      await expect(page.getByRole('heading', { name: 'Scan Table QR' })).toBeVisible()
      await page.getByRole('button', { name: 'Enter code manually' }).tap()
      await expect(page.getByPlaceholder('Table code, e.g. FINCAN-4821')).toBeVisible()
      await expect(page.getByPlaceholder('Paste table token (UUID)')).toHaveCount(0)
      await page.getByRole('button', { name: 'Cancel' }).tap()
      await U.noSheet(page)
    } finally { await t.close() }
  })

  test('Azerbaijani: the manual field says "Masa kodu, məs. FINCAN-4821"', async ({ browser }, testInfo) => {
    const az = { ...at(testInfo, WIDTHS[0]), storageState: { cookies: [], origins: [{ origin: new URL(url('/')).origin, localStorage: [{ name: 'rufesto_lang', value: 'az' }] }] } }
    const t = await U.open(browser, testInfo, az, 1)
    try {
      const { page } = t
      await page.goto(url('/'))
      test.skip(await page.locator('.bottom-nav-qr.is-seated').count() > 0, 'review1 is seated at a table')
      await page.locator('.bottom-nav-qr').tap()
      await page.getByRole('button', { name: 'Kodu əl ilə daxil et' }).tap()
      await expect(page.getByPlaceholder('Masa kodu, məs. FINCAN-4821')).toBeVisible()
    } finally { await t.close() }
  })
})
