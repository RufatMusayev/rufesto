// Round 3, part 2: the dish sheet as a phone user feels it: open timing, first review visible, scroll lock (page behind must not move),
// drag thresholds (handle / header / content), flick, Back, Esc, focus, reduced motion, drag smoothness at CPU x4.
const L = require('./aysel-r3-lib')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const URL_MENU = L.CONSUMER + '/restaurant/bella-roma?tab=menu'

async function setup(b, { throttle = false, reduced = false } = {}) {
  const A = await L.phone(b, 'Aysel Məmmədova')
  if (reduced) await A.page.emulateMedia({ reducedMotion: 'reduce' })
  const cdp = await A.ctx.newCDPSession(A.page)
  if (throttle) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
  const swipe = async (x, y0, y1, { ms = 200, steps = 10 } = {}) => {
    await touch('touchStart', [{ x, y: y0 }])
    for (let i = 1; i <= steps; i++) { await touch('touchMove', [{ x, y: y0 + ((y1 - y0) * i) / steps }]); await sleep(ms / steps) }
    await touch('touchEnd', [])
  }
  return { A, cdp, touch, swipe }
}
const state = page => page.evaluate(() => {
  const p = document.querySelector('.bs-panel'); const r = p && p.getBoundingClientRect()
  return { open: !!p, top: r ? Math.round(r.top) : null, h: r ? Math.round(r.height) : null, scrollY: Math.round(window.scrollY), url: location.pathname + location.search, locked: document.documentElement.classList.contains('is-locked'), scrim: document.querySelector('.bs-scrim') ? +getComputedStyle(document.querySelector('.bs-scrim')).opacity : null }
})
async function ensureClosed(page) { for (let i = 0; i < 3 && (await page.locator('.bs-panel').count()); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(700) } }
async function openSheet(page, n = 5, { scroll = true } = {}) {
  await ensureClosed(page)
  if (scroll) await page.locator('.mn-row-btn').nth(n).scrollIntoViewIfNeeded()
  const y = await page.evaluate(() => scrollY)
  await page.locator('.mn-row-btn').nth(n).click()
  await page.waitForSelector('.bs-panel'); await page.waitForTimeout(900)
  return y
}

;(async () => {
  const b = await L.launch()
  const { A, cdp, touch, swipe } = await setup(b)
  const page = A.page
  await page.goto(URL_MENU); await page.waitForSelector('.mn-row'); await page.waitForTimeout(1500)

  await L.step('scroll lock: the page behind must not move', async () => {
    await page.evaluate(() => window.scrollTo(0, 700)); await page.waitForTimeout(400)
    const y0 = await openSheet(page, 8)
    const s0 = await state(page)
    L.log('open: scrollY just before the tap / right after the sheet opened (must be equal)', y0, s0.scrollY, '| html.is-locked', s0.locked, '| panel top/height', s0.top, s0.h, '| #root inert', await page.evaluate(() => document.getElementById('root').hasAttribute('inert')))
    const res = {}
    // (a) swipe up on the sheet content (content shorter than the viewport = "past the end")
    await swipe(206, 600, 250, { ms: 200 }); await sleep(300); res.contentSwipeUp = (await state(page)).scrollY
    // (b) swipe up / down on the scrim (backdrop)
    if (s0.top > 60) { await swipe(206, 40, 10, { ms: 150, steps: 6 }); await sleep(250); res.backdropUp = (await state(page)).scrollY; }
    // (c) wheel over content and over the scrim
    await page.mouse.move(206, 500); await page.mouse.wheel(0, 1500); await sleep(300); res.wheelContent = (await state(page)).scrollY
    await page.mouse.move(206, 30); await page.mouse.wheel(0, 1500); await sleep(300); res.wheelScrim = (await state(page)).scrollY
    // (d) pull down at the top by 60 px and release: drags the sheet, then snaps back
    const sBefore = await state(page)
    await swipe(206, 500, 560, { ms: 200, steps: 6 }); await sleep(600)
    const sAfter = await state(page)
    L.log('scrollY after gestures (expected', y0, '):', JSON.stringify(res), '| after small pull-down: sheet open', sAfter.open, 'top', sBefore.top, '->', sAfter.top, 'scrollY', sAfter.scrollY)
    await L.shot(page, '03-sheet-after-gestures')
  })

  await L.step('drag thresholds', async () => {
    const st = await state(page)
    if (!st.open) await openSheet(page, 8)
    const s = await state(page)
    const hh = s.h
    L.log('panel height', hh, 'top', s.top)
    // handle drag 20 % slowly: must snap back
    const handleY = s.top + 14
    await swipe(206, handleY, handleY + hh * 0.2, { ms: 700, steps: 14 }); await sleep(700)
    L.log('handle drag 20 % (slow):', JSON.stringify(await state(page)))
    // handle drag 40 % slowly: must close
    const s2 = await state(page)
    if (s2.open) { await swipe(206, s2.top + 14, s2.top + 14 + hh * 0.4, { ms: 800, steps: 16 }); await sleep(900) }
    L.log('handle drag 40 % (slow):', JSON.stringify(await state(page)))
    // reopen, drag the header zone (photo area at scrollTop 0) 40 %
    await openSheet(page, 8)
    const s3 = await state(page)
    await swipe(206, s3.top + 120, s3.top + 120 + hh * 0.4, { ms: 800, steps: 16 }); await sleep(900)
    L.log('content drag (from photo at scrollTop 0) 40 %:', JSON.stringify(await state(page)))
    // flick: 120 px in 150 ms (0.8 px/ms) from the content
    await openSheet(page, 8)
    const s4 = await state(page)
    const tF = Date.now(); await swipe(206, s4.top + 300, s4.top + 420, { ms: 40, steps: 3 }); const dtF = Date.now() - tF; await sleep(900)
    L.log('flick 120 px in', dtF, 'ms (', (120 / dtF).toFixed(2), 'px/ms incl. CDP overhead):', JSON.stringify(await state(page)))
    await ensureClosed(page)
    // scrim tap
    await openSheet(page, 8)
    const s5 = await state(page)
    if (s5.top > 40) { await page.touchscreen.tap(206, Math.round(s5.top / 2)); await sleep(800); L.log('scrim tap closes:', JSON.stringify(await state(page))) } else L.log('no visible scrim area to tap (sheet top', s5.top, ')')
  })

  await L.step('Back / Esc / URL', async () => {
    await openSheet(page, 8)
    const u1 = (await state(page)).url
    await page.goBack(); await sleep(800)
    const s = await state(page)
    L.log('Back: sheet open', s.open, '| url before', u1, '| after', s.url, '| locked', s.locked)
    await openSheet(page, 8)
    await page.keyboard.press('Escape'); await sleep(800)
    L.log('Esc: sheet open', (await state(page)).open, '| url', (await state(page)).url)
    // direct URL
    await page.goto(URL_MENU + '&dish=80000001-0000-0000-0000-000000000009'); await page.waitForSelector('.bs-panel', { timeout: 15000 }).catch(() => {}); await sleep(900)
    L.log('direct ?dish= URL shows the sheet:', (await state(page)).open)
    // the X button
    await page.locator('.dds-x').click(); await sleep(800)
    L.log('X closes, url', (await state(page)).url)
  })

  await L.step('focus trap + restore', async () => {
    await page.goto(URL_MENU); await page.waitForSelector('.mn-row'); await sleep(1200)
    const opener = page.locator('.mn-row-btn').nth(3)
    await opener.scrollIntoViewIfNeeded(); await opener.click(); await page.waitForSelector('.bs-panel'); await sleep(900)
    const seq = []
    for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); seq.push(await page.evaluate(() => { const a = document.activeElement; return (a.closest('.bs-panel') ? 'in:' : 'OUT:') + (a.getAttribute('aria-label') || a.innerText || a.tagName).trim().replace(/\n+/g, ' ').slice(0, 18) })) }
    L.log('Tab order (12 presses):', seq.join(' > '))
    await page.keyboard.press('Escape'); await sleep(800)
    L.log('focus after close:', await page.evaluate(() => { const a = document.activeElement; return a.tagName + ' ' + ((a.innerText || '').trim().slice(0, 25)) + ' | is opener row: ' + !!a.closest('.mn-row') }))
  })

  await L.step('reduced motion', async () => {
    const R = await setup(b, { reduced: true })
    await R.A.page.goto(URL_MENU); await R.A.page.waitForSelector('.mn-row'); await sleep(1200)
    await R.A.page.locator('.mn-row-btn').nth(4).click(); await R.A.page.waitForSelector('.bs-panel')
    const css = await R.A.page.evaluate(() => { const p = document.querySelector('.bs-panel'); const c = getComputedStyle(p); return { transition: c.transitionProperty + ' ' + c.transitionDuration, animation: c.animationName + ' ' + c.animationDuration, transform: c.transform } })
    L.log('reduced-motion panel css:', JSON.stringify(css))
    await R.A.ctx.close()
  })
  L.log('errors', A.errors.filter(e => !/ERR_ABORTED/.test(e)))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
