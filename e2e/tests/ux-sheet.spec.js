// UX round: the one BottomSheet primitive (docs/UX-PLAN-2026-10-18.md 6.1, 6.2, 6.12, D3, D4), exercised on the dish sheet of
// Trattoria Bella Roma (the menu is public: nothing is written, nobody signs in) and on the Search filters sheet.
//   - the page behind an open sheet moves 0 px: touch swipes past the end of the content, on the backdrop and pulling down at the top
//     (Pixel 7, CDP touch events), and the mouse wheel over the sheet and over the backdrop (desktop, 1280x860);
//   - dragging the handle (or the content at scrollTop 0) down more than 30 % closes the sheet, 20 % snaps it back; a flick closes it;
//     at scrollTop > 0 the same gesture scrolls the content instead;
//   - history Back closes the sheet and removes ?dish= (a second Back leaves the page);
//   - Esc closes it, focus returns to the row that opened it, Tab stays inside, reduced motion drops the transform transition.
// The touch tests build their own phone context (390x844, Pixel 7) so they run the same in the desktop and the mobile project; the
// mouse / keyboard tests build a desktop context and are skipped in the mobile project.
const { test, expect } = require('../support/fixtures')
const U = require('../support/ux')

const { url } = U

test.describe('ux sheet', { tag: ['@consumer', '@feat', '@ux'] }, () => {
  test.describe.configure({ mode: 'default' })

  // ---------------------------------------------------------------------------------------------- scroll lock
  test('touch: the page behind the dish sheet moves 0 px (swipes past the end, on the backdrop, pull-down at the top)', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await U.gotoMenu(page)
      await U.scrollTo(page, 600)
      await expect.poll(() => U.probe(page).then(p => p.winY), { message: 'the menu page scrolled to 600' }).toBe(600)
      await U.openDish(page, 3, { tap: true })
      const cdp = await U.touch(t.context, page)

      const open = await U.probe(page)
      const y0 = open.winY                      // where the page is with the sheet open (opening a row may scroll it into view first)
      expect(y0, 'the page was scrolled before the sheet opened').toBeGreaterThan(0)
      expect(open.locked, 'html.is-locked while a sheet is open').toBe(true)
      expect(open.bodyMax, 'the dish sheet has something to scroll').toBeGreaterThan(40)

      // content: swipe up four times, far past the end of the content
      for (let i = 0; i < 4; i++) await U.swipe(cdp, 200, 760, 200)
      const end = await U.probe(page)
      expect(end.bodyTop, 'the sheet content scrolled to its end').toBe(end.bodyMax)
      expect(end.winY, 'page behind after swiping past the end of the content (was +1,654 px)').toBe(y0)
      expect(end.open).toBe(1)

      // the backdrop: the strip above the panel
      const strip = Math.max(20, end.panelTop - 14)
      await U.swipe(cdp, 200, strip, Math.max(4, strip - 40))
      await U.swipe(cdp, 200, strip, Math.max(4, strip - 40))
      await U.swipe(cdp, 200, 6, strip)
      const back = await U.probe(page)
      expect(back.winY, 'page behind after swiping on the backdrop (was +30 px)').toBe(y0)

      // pull down at the top of the content, a short slow pull: the sheet follows the finger, snaps back, the page does not move
      await sheetTop(page)
      await U.swipe(cdp, 200, 300, 380, { steps: 10, stepMs: 40, hold: 200 })
      await U.settled(page.locator('.bs-root.dds-root .bs-panel'), 'the sheet snapped back')
      const pulled = await U.probe(page)
      expect(pulled.winY, 'page behind after a short pull-down at the top (was -1,957 px)').toBe(y0)
      expect(pulled.open, 'a 10 % pull does not close the sheet').toBe(1)
      expect(pulled.transform, 'the inline transform is cleared after the snap-back').toBe('')
      expect(t.watch.consoleErrors, 'console errors').toEqual([])
    } finally { await t.close() }
  })

  test('wheel: the page behind the dish sheet moves 0 px (over the sheet and over the backdrop)', async ({ browser }, testInfo) => {
    test.skip(U.isMobileProject(testInfo), 'mouse wheel: desktop project')
    const t = await U.desktop(browser, testInfo)
    try {
      const { page } = t
      await U.gotoMenu(page)
      await U.scrollTo(page, 600)
      await expect.poll(() => U.probe(page).then(p => p.winY)).toBe(600)
      await U.openDish(page, 3)
      const y0 = (await U.probe(page)).winY     // (a click may scroll the row into view first)
      expect(y0).toBeGreaterThan(0)
      const panel = await U.box(page.locator('.bs-root.dds-root .bs-panel'))
      await page.mouse.move(panel.left + panel.width / 2, panel.top + panel.height / 2)
      for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 600); await U.wait(150) }
      const over = await U.probe(page)
      expect(over.winY, 'page behind after wheeling over the sheet (was +2,258 px)').toBe(y0)
      expect(over.bodyTop, 'the sheet content did scroll').toBeGreaterThan(0)
      await page.mouse.move(40, 400)
      for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 600); await U.wait(150) }
      expect((await U.probe(page)).winY, 'page behind after wheeling over the backdrop').toBe(y0)
      for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, -600); await U.wait(150) }
      expect((await U.probe(page)).winY, 'page behind after wheeling up over the backdrop').toBe(y0)
      await page.keyboard.press('Escape')
      await U.noSheet(page)
      expect((await U.probe(page)).locked, 'the lock is released when the sheet closes').toBe(false)
      expect((await U.probe(page)).winY, 'the page is where it was').toBe(y0)
    } finally { await t.close() }
  })

  test('every sheet shares the lock: the Search filters sheet (touch) leaves the page where it was', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await page.goto(url('/explore'))
      await expect(page.locator('.sr-zero .dsc-sec').first()).toBeVisible()
      await expect(page.locator('.sr-row').first()).toBeVisible()
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight), { message: 'the zero state is taller than the screen' }).toBeGreaterThan(1300)
      await U.scrollTo(page, 400)
      await expect.poll(() => U.probe(page).then(p => p.winY)).toBe(400)
      await page.getByRole('button', { name: 'Filters' }).tap()
      await expect(page.locator('.bs-panel:has(.sr-fs)')).toBeVisible()
      await U.settled(page.locator('.bs-root:has(.sr-fs) .bs-panel'))
      const cdp = await U.touch(t.context, page)
      const panel = await U.box(page.locator('.bs-root:has(.sr-fs) .bs-panel'))
      await U.swipe(cdp, 200, panel.top + 150, panel.top + 20, { steps: 8 })       // up inside a sheet that has nothing to scroll
      await U.swipe(cdp, 200, Math.max(10, panel.top - 30), 10, { steps: 6 })       // on the backdrop
      const p = await U.probe(page)
      expect(p.winY, 'page behind the filters sheet').toBe(400)
      expect(p.open).toBe(1)
      await page.keyboard.press('Escape')
      await U.noSheet(page)
      expect((await U.probe(page)).locked).toBe(false)
    } finally { await t.close() }
  })

  // ------------------------------------------------------------------------------------------------ drag to dismiss
  test('drag: the handle dragged down more than 30 % closes the sheet, 20 % snaps back', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await U.gotoMenu(page)
      await U.openDish(page, 2, { tap: true })
      const cdp = await U.touch(t.context, page)
      const grab = await U.box(page.locator('.bs-root.dds-root .bs-grab'))
      const h = (await U.probe(page)).panelH
      const x = grab.left + grab.width / 2, y = grab.top + grab.height / 2

      // 20 %: slow, the finger rests before it lifts (no flick): the sheet comes back
      await U.swipe(cdp, x, y, y + h * 0.2, { steps: 12, stepMs: 35, hold: 200, settle: 0 })
      await U.settled(page.locator('.bs-root.dds-root .bs-panel'), 'the sheet snapped back')
      const kept = await U.probe(page)
      expect(kept.open, 'a 20 % drag keeps the sheet open').toBe(1)
      expect(kept.panelTop, 'it is back where it was').toBeLessThan(h * 0.05 + 80)
      expect(page.url(), 'still on the dish').toContain('dish=')

      // 40 %: the same slow drag closes it on distance alone
      await U.swipe(cdp, x, y, y + h * 0.4, { steps: 14, stepMs: 35, hold: 200, settle: 0 })
      await U.noSheet(page, 'a 40 % drag closes the sheet')
      expect(page.url(), 'closing pops ?dish= again').not.toContain('dish=')
      expect(new URL(page.url()).pathname).toBe('/restaurant/bella-roma')
      expect((await U.probe(page)).locked, 'the lock is released').toBe(false)
    } finally { await t.close() }
  })

  test('drag: a flick (120 px at >= 0.6 px/ms) closes the sheet', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await U.gotoMenu(page)
      await U.openDish(page, 1, { tap: true })
      const cdp = await U.touch(t.context, page)
      const grab = await U.box(page.locator('.bs-root.dds-root .bs-grab'))
      const x = grab.left + grab.width / 2, y = grab.top + grab.height / 2
      // three big moves with no pause: each CDP call costs ~30 ms, so this is the fastest finger the harness can make
      const ms = await U.swipe(cdp, x, y, y + 120, { steps: 3, stepMs: 0, settle: 0 })
      expect(120 / ms, `harness flick speed ${(120 / ms).toFixed(2)} px/ms (the sheet needs > 0.5)`).toBeGreaterThanOrEqual(0.6)
      await U.noSheet(page, 'a 120 px flick closes the sheet')
    } finally { await t.close() }
  })

  test('drag: from the content the sheet follows the finger at scrollTop 0 and closes past 30 %, at scrollTop > 0 the gesture scrolls', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await U.gotoMenu(page)
      await U.openDish(page, 3, { tap: true })
      const cdp = await U.touch(t.context, page)

      // scrolled down: a downward swipe scrolls the content back up, the sheet stays put
      await page.locator('.bs-root.dds-root .bs-body').evaluate(el => { el.scrollTop = el.scrollHeight })
      const before = await U.probe(page)
      expect(before.bodyTop, 'the content is scrolled').toBeGreaterThan(20)
      await U.swipe(cdp, 200, 300, 380, { steps: 8, stepMs: 30, hold: 150 })
      const scrolled = await U.probe(page)
      expect(scrolled.bodyTop, 'the swipe scrolled the content up').toBeLessThan(before.bodyTop)
      expect(scrolled.open).toBe(1)
      expect(scrolled.panelTop, 'the sheet did not move').toBe(before.panelTop)

      // at the top: the finger drags the sheet (transform follows), and a long drag closes it
      await page.locator('.bs-root.dds-root .bs-body').evaluate(el => { el.scrollTop = 0 })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 300 }] })
      for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 300 + i * 20 }] }); await U.wait(30) }
      const mid = await U.probe(page)
      expect(mid.transform, 'the panel follows the finger').toMatch(/translate3d\(0px, 1[0-9]{2}(\.\d+)?px, 0px\)/)
      for (let i = 9; i <= 20; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 300 + i * 20 }] }); await U.wait(30) }
      await U.wait(200)                                                              // the finger rests: distance only
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await U.noSheet(page, 'a 400 px drag from the content closes the sheet')
    } finally { await t.close() }
  })

  // --------------------------------------------------------------------------------------------------------- Back
  test('Back: history Back closes the dish sheet and removes ?dish=, a second Back leaves the page', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await page.goto(url('/'))
      await U.gotoMenu(page)
      const before = page.url()
      await U.openDish(page, 2, { tap: true })
      expect(page.url(), 'opening pushes ?dish=').toMatch(/[?&]dish=[0-9a-f-]{36}/)
      await page.goBack()
      await U.noSheet(page, 'Back closed the sheet')
      expect(page.url(), 'Back returns to the menu URL').toBe(before)
      await expect(page.locator('.mn-row').first()).toBeVisible()
      expect((await U.probe(page)).locked, 'unlocked').toBe(false)
      await page.goBack()
      await expect(page).toHaveURL(url('/'))
      await expect(page).not.toHaveURL(/\/restaurant\//)
    } finally { await t.close() }
  })

  // ------------------------------------------------------------------------------------------------- Esc, focus, Tab
  test('Esc closes the top sheet, focus returns to the dish row, Tab stays inside the sheet', async ({ browser }, testInfo) => {
    test.skip(U.isMobileProject(testInfo), 'keyboard: desktop project')
    const t = await U.desktop(browser, testInfo)
    try {
      const { page } = t
      await U.gotoMenu(page)
      const rowId = await U.dishButton(page, 4).evaluate(el => el.closest('.mn-row').dataset.dishId)
      await U.openDish(page, 4)
      const inside = () => page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('.bs-panel'))
      expect(await inside(), 'focus moved into the sheet on open').toBe(true)
      for (let i = 0; i < 25; i++) {
        await page.keyboard.press('Tab')
        expect(await inside(), `Tab press ${i + 1} stays inside the sheet`).toBe(true)
      }
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press('Shift+Tab')
        expect(await inside(), `Shift+Tab press ${i + 1} stays inside the sheet`).toBe(true)
      }
      await page.keyboard.press('Escape')
      await U.noSheet(page, 'Esc closed the sheet')
      expect(page.url(), 'Esc popped ?dish=').not.toContain('dish=')
      const focused = await page.evaluate(() => document.activeElement?.closest('.mn-row')?.dataset.dishId || null)
      expect(focused, 'focus is back on the row that opened the sheet').toBe(rowId)
    } finally { await t.close() }
  })

  test('the scrim closes the sheet; the close button closes it; neither leaves the page', async ({ browser }, testInfo) => {
    test.skip(U.isMobileProject(testInfo), 'mouse: desktop project')
    const t = await U.desktop(browser, testInfo)
    try {
      const { page } = t
      await U.gotoMenu(page)
      await U.openDish(page, 5)
      await page.locator('.bs-root.dds-root .dds-x').click()
      await U.noSheet(page, 'the X closed the sheet')
      await U.openDish(page, 6)
      await page.mouse.click(30, 300)                                               // the backdrop, left of the dialog
      await U.noSheet(page, 'a click on the backdrop closed the sheet')
      expect(new URL(page.url()).pathname).toBe('/restaurant/bella-roma')
      expect(page.url()).not.toContain('dish=')
    } finally { await t.close() }
  })

  // UX plan 8.3: tap -> the sheet is fully open < 520 ms (the slide is 420 ms), measured in the page from pointerup to the panel's transform transitionend
  test('timing: from the tap to a fully open dish sheet takes under 520 ms', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo)
    try {
      const { page } = t
      await U.gotoMenu(page)
      const samples = []
      for (let i = 0; i < 3; i++) {
        await page.evaluate(() => {
          window.__qa = { up: 0, end: 0 }
          document.addEventListener('pointerup', () => { if (!window.__qa.up) window.__qa.up = performance.now() }, { capture: true, once: true })
          document.addEventListener('transitionend', e => {
            if (e.target.classList && e.target.classList.contains('bs-panel') && e.propertyName === 'transform' && !window.__qa.end) window.__qa.end = performance.now()
          }, { capture: true })
        })
        await U.dishButton(page, 2 + i).scrollIntoViewIfNeeded()
        await U.dishButton(page, 2 + i).tap()
        await expect.poll(() => page.evaluate(() => window.__qa.end), { message: 'the slide-in ended' }).toBeGreaterThan(0)
        samples.push(await page.evaluate(() => Math.round(window.__qa.end - window.__qa.up)))
        await page.keyboard.press('Escape')
        await U.noSheet(page)
      }
      testInfo.annotations.push({ type: 'timing', description: `tap to fully open (ms): ${samples.join(', ')} (target < 520)` })
      samples.sort((a, b) => a - b)
      expect(samples[1], `median of ${samples.join(', ')} ms`).toBeLessThan(520)
    } finally { await t.close() }
  })

  test('reduced motion: the sheet does not slide (no transform transition), it fades', async ({ browser }, testInfo) => {
    const t = await U.phone(browser, testInfo, null, { reducedMotion: 'reduce' })
    try {
      const { page } = t
      await U.gotoMenu(page)
      await U.openDish(page, 2, { tap: true })
      const css = await page.locator('.bs-root.dds-root .bs-panel').evaluate(el => {
        const c = getComputedStyle(el)
        return { property: c.transitionProperty, transform: c.transform }
      })
      expect(css.property, 'only the opacity transitions').toBe('opacity')
      expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(css.transform)
      await page.keyboard.press('Escape')
      await U.noSheet(page)
    } finally { await t.close() }
  })
})

/** Put the open sheet's content back to its top. */
async function sheetTop(page) {
  await page.locator('.bs-root[data-state="open"] .bs-body').last().evaluate(el => { el.scrollTop = 0 })
}
