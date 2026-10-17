// Round 2, first-time notifications experience, part 1: inbox state before any friend request, settings page, push prompt rules.
// ROUND=round2 node personas/ui/r2-notif-a.js  -> results/round2/r2-notif-a.json, screenshots round2/RN*.png
const L = require('./lib')
const out = {}
const note = (k, v) => { out[k] = v; console.log('##', k, typeof v === 'string' ? v : JSON.stringify(v)) }
const lines = t => [...new Set(t.split('\n').map(x => x.trim()).filter(Boolean))]

async function inbox(page, tag) {
  await page.goto(L.BASE + '/notifications', { waitUntil: 'load' }); await page.waitForTimeout(2800)
  await L.shot(page, `RN-${tag}-inbox`)
  note(`${tag}_inbox_text`, lines(await page.evaluate(() => document.body.innerText)).slice(0, 40))
  note(`${tag}_inbox_chips`, await page.locator('[role=tab], .ntf-chip, .ntf-filters button').allInnerTexts().catch(() => []))
}

;(async () => {
  // ---- Mehriban: bell + inbox before the friend request
  {
    const s = await L.open({ as: 'Mehriban Rzayeva', sw: true }); const { page, watch } = s
    await page.addInitScript(() => { window.__perm = []; const orig = Notification.requestPermission.bind(Notification); Notification.requestPermission = (...a) => { window.__perm.push('requestPermission called'); return orig(...a) } })
    await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor(); await page.waitForTimeout(2500)
    note('M_bell_badge_home', await page.evaluate(() => { const b = document.querySelector('[aria-label*=otification]'); return b ? { label: b.getAttribute('aria-label'), text: b.innerText, badge: (b.parentElement.querySelector('.badge, .notif-badge, [class*=badge]') || {}).innerText || null } : null }))
    await L.shot(page, 'RN-M-home')
    await inbox(page, 'M')
    note('M_notification_permission_after_inbox', await page.evaluate(() => Notification.permission))
    note('M_requestPermission_calls_on_load_and_inbox', await page.evaluate(() => window.__perm))
    // settings page
    await page.goto(L.BASE + '/settings/notifications', { waitUntil: 'load' }); await page.waitForTimeout(2500)
    await L.shot(page, 'RN-M-settings')
    note('M_settings_text', lines(await page.evaluate(() => document.body.innerText)).slice(0, 50))
    note('M_settings_switches', await page.evaluate(() => [...document.querySelectorAll('[role=switch], input[type=checkbox]')].map(e => `${e.getAttribute('aria-label') || (e.closest('label') || {}).innerText || e.id}|checked=${e.checked ?? e.getAttribute('aria-checked')}|disabled=${e.disabled}|${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`)))
    note('M_permission_still_default', await page.evaluate(() => Notification.permission))
    // how a newcomer finds the settings: Profile -> settings sheet
    await page.goto(L.BASE + '/profile', { waitUntil: 'load' }); await page.waitForTimeout(2000)
    await page.getByRole('button', { name: /Settings/i }).first().click().catch(() => page.locator('button[aria-label*=ettings]').first().click())
    await page.waitForTimeout(1000); await L.shot(page, 'RN-M-profile-settings-sheet')
    note('M_profile_settings_rows', lines(await page.evaluate(() => document.body.innerText)).filter(x => /otif|Language|Theme|Sign out|Dark|Light/i.test(x)))
    note('M_console', watch.console.slice(0, 6)); note('M_bad', watch.bad.filter(b => !/ABORTED/.test(b)).slice(0, 6))
    await s.close()
  }
  // ---- Fərid: inbox (old bill notices) and the same
  {
    const s = await L.open({ as: 'Fərid Məlikov', sw: true }); const { page } = s
    await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor(); await page.waitForTimeout(2000)
    await inbox(page, 'F')
    await s.close()
  }
  L.save('r2-notif-a', out)
})()
