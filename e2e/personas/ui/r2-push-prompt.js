// Round 2: push prompt appears only after an action (a booking), once, and never on load / inbox / follow / request.
// Notification.permission is stubbed to "default" (headless Chromium always reports "denied"; a real push subscription cannot be tested here).
// Creates ONE booking for Mehriban at Fincan Coffee (tomorrow 09:00, party 2) and cancels it afterwards. ROUND=round2 node personas/ui/r2-push-prompt.js
const L = require('./lib')
const out = {}
const note = (k, v) => { out[k] = v; console.log('##', k, typeof v === 'string' ? v : JSON.stringify(v)) }
const lines = t => [...new Set(t.split('\n').map(x => x.trim()).filter(Boolean))]
;(async () => {
  const s = await L.open({ as: 'Mehriban Rzayeva', sw: true }); const { page, watch } = s
  await page.addInitScript(() => { window.__asked = 0; Object.defineProperty(Notification, 'permission', { get: () => 'default', configurable: true }); Notification.requestPermission = async () => { window.__asked++; return 'granted' } })
  try {
    await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor(); await page.waitForTimeout(3500)
    note('prompt_on_home_load', await page.locator('.ntf-prompt').count())
    await page.goto(L.BASE + '/notifications', { waitUntil: 'load' }); await page.waitForTimeout(2500)
    note('prompt_in_inbox', await page.locator('.ntf-prompt').count()); note('permission_requested_so_far', await page.evaluate(() => window.__asked))
    await page.goto(L.BASE + '/settings/notifications', { waitUntil: 'load' }); await page.waitForTimeout(2500); await L.shot(page, 'RP00-settings-default-permission')
    note('settings_push_row', lines(await page.evaluate(() => document.body.innerText)).slice(3, 9))
    note('settings_switches', await page.evaluate(() => [...document.querySelectorAll('[role=switch], input[type=checkbox]')].map(e => `checked=${e.checked ?? e.getAttribute('aria-checked')} disabled=${e.disabled}`)))
    // the action: book a table
    await page.goto(L.BASE + '/book/fincan-coffee', { waitUntil: 'load' }); await page.waitForTimeout(2500)
    await page.getByRole('button', { name: /^Sunday 18 October/ }).click(); await page.waitForTimeout(2000)
    await page.getByRole('button', { name: '09:00', exact: true }).click(); await page.getByRole('button', { name: 'Continue' }).click(); await page.waitForTimeout(1200)
    await page.getByRole('button', { name: 'Continue' }).click(); await page.waitForTimeout(1500)
    await page.locator('input[type=checkbox]').check()
    const t0 = Date.now()
    await page.getByRole('button', { name: 'Request booking' }).click()
    await page.locator('.ntf-prompt').waitFor({ timeout: 15000 }).catch(() => { })
    note('prompt_after_booking_ms', (await page.locator('.ntf-prompt').count()) ? Date.now() - t0 : null)
    await page.waitForTimeout(500); await L.shot(page, 'RP04-push-prompt-after-booking')
    note('prompt_text', lines(await page.locator('.ntf-prompt').innerText().catch(() => 'none')))
    note('page_text_after_booking', lines(await page.evaluate(() => document.body.innerText)).slice(0, 22))
    note('prompt_buttons', await page.locator('.ntf-prompt button').evaluateAll(b => b.map(x => `${x.innerText}|${Math.round(x.getBoundingClientRect().width)}x${Math.round(x.getBoundingClientRect().height)}`)).catch(() => []))
    note('flag_stored', await page.evaluate(() => localStorage.getItem('rufesto_push_prompt_booking')))
    // Turn on: what happens without a push service (headless)?
    await page.getByRole('button', { name: 'Turn on' }).click().catch(() => { })
    await page.waitForTimeout(9000)
    await L.shot(page, 'RP05-push-turn-on-result')
    note('after_turn_on', lines(await page.locator('.ntf-prompt').innerText().catch(() => 'prompt gone')))
    note('permission_requested_after_tap', await page.evaluate(() => window.__asked))
    // back to a normal page: does it return?
    await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(3500)
    note('prompt_returns_on_home', await page.locator('.ntf-prompt').count())
  } catch (e) { note('ERROR', String(e).split(/\r?\n/)[0].slice(0, 300)); await L.shot(page, 'RP99-error').catch(() => { }) }
  note('console', watch.console.slice(0, 6)); note('bad', watch.bad.filter(b => !/ABORTED/.test(b)).slice(0, 6))
  L.save('r2-push-prompt', out); await s.close()
})()
