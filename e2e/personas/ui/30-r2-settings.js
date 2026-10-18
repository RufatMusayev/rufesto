'use strict'
// Round 2: Settings tabs (Menu design, Notifications / "Notify me on this device"), chime switch persistence, Azerbaijani day names,
// the kitchen tablet at 1024 px, the Menu page loading state on a phone. Push on a real phone cannot be tested headless.
const C = require('./common')
const flat = async (p, sel) => (await C.text(p, sel)).split('\n').join(' | ')

;(async () => {
  const browser = await C.launch()
  const sink = []
  // ---- Leyla desktop: Settings tabs
  const L = await C.open(browser, 'leyla', { who: 'Leyla', sink })
  const lp = L.page
  await L.context.grantPermissions(['notifications'], { origin: C.RESTO })
  await lp.goto(C.RESTO + '/settings'); await lp.getByRole('tab', { name: 'Notifications' }).waitFor({ timeout: 20_000 })
  console.log('settings tabs:', JSON.stringify(await lp.getByRole('tab').allInnerTexts()))
  for (const tab of ['Menu design', 'Notifications']) {
    await lp.getByRole('tab', { name: tab }).click(); await lp.waitForTimeout(1500)
    console.log(`[${tab}]`, (await flat(lp, '.dash-content')).slice(0, 900))
    await C.shot(lp, 'r2-120-settings-' + tab.toLowerCase().replace(' ', '-'))
  }
  // notify this device: what happens headless with permission granted
  const dev = lp.getByRole('button', { name: /Notify me on this device|On for this device|Off for this device/ }).or(lp.getByRole('switch')).first()
  console.log('device control:', (await lp.locator('.dash-content').getByRole('switch').evaluateAll(e => e.map(x => (x.getAttribute('aria-label') || '') + ':' + x.getAttribute('aria-checked')))).join(' ; '))
  const sw = lp.locator('.dash-content').getByRole('switch', { name: /Notify me on this device/i })
  console.log('Notification.permission:', await lp.evaluate(() => (typeof Notification !== 'undefined' ? Notification.permission : 'no Notification API') + ' | PushManager: ' + ('PushManager' in window) + ' | serviceWorker: ' + ('serviceWorker' in navigator)))
  console.log('switch enabled?', await sw.isEnabled())
  if (await sw.count() && await sw.isEnabled()) {
    const before = await sw.getAttribute('aria-checked')
    await sw.click(); await lp.waitForTimeout(4000)
    console.log('Notify me on this device: before', before, '-> after', await sw.getAttribute('aria-checked'), '| message:', (await lp.locator('.dash-content').innerText()).split('\n').filter(l => /push|blocked|couldn|browser|ready|set up|available/i.test(l)).join(' | '))
    await C.shot(lp, 'r2-121-notify-device-clicked')
    if ((await sw.getAttribute('aria-checked')) === 'true') { await sw.click(); await lp.waitForTimeout(2500); console.log('turned back off ->', await sw.getAttribute('aria-checked')) }
  }
  console.log('serviceWorker registered:', await lp.evaluate(async () => { try { const r = await navigator.serviceWorker.getRegistrations(); return r.map(x => x.scope + ' ' + (x.active ? 'active' : 'no-active')).join(',') || 'none' } catch (e) { return 'err ' + e.message } }))
  console.log('manifest link:', await lp.evaluate(() => document.querySelector('link[rel=manifest]')?.href || 'none'))
  // chime switch persistence (panel)
  await lp.goto(C.RESTO + '/'); await lp.getByRole('button', { name: /^Notifications/ }).first().click(); await lp.locator('.notif-panel').waitFor()
  const chime = lp.locator('.notif-panel').getByRole('button', { name: /Sound for waiter calls/ }); const c0 = await chime.getAttribute('aria-pressed')
  await chime.click(); await lp.waitForTimeout(300)
  await lp.reload(); await lp.getByRole('button', { name: /^Notifications/ }).first().click(); await lp.locator('.notif-panel').waitFor()
  console.log('chime button: before', c0, '-> after click + reload', await lp.locator('.notif-panel').getByRole('button', { name: /Sound for waiter calls/ }).getAttribute('aria-pressed'))
  await lp.locator('.notif-panel').getByRole('button', { name: /Sound for waiter calls/ }).click()   // back to the original state

  // ---- Azerbaijani settings day names
  const A = await C.open(browser, 'leyla', { who: 'Leyla', lang: 'az', sink })
  await A.page.goto(C.RESTO + '/settings'); await A.page.waitForTimeout(3000)
  console.log('AZ settings hours:', (await flat(A.page, '.dash-content')).slice(0, 420))
  await C.shot(A.page, 'r2-122-az-settings-hours', { full: false })
  await A.page.goto(C.RESTO + '/'); await A.page.waitForTimeout(2500)
  await A.page.getByRole('button', { name: /^(Notifications|Bildiriş)/ }).first().click().catch(() => {}); await A.page.waitForTimeout(1500)
  await C.shot(A.page, 'r2-123-az-bell-panel', { full: false })
  console.log('AZ panel:', (await C.text(A.page, '.notif-panel')).split('\n').join(' | ').slice(0, 400))

  // ---- kitchen tablet 1024 px
  const T = await C.open(browser, 'tural', { who: 'Tural', sink })
  await T.page.goto(C.RESTO + '/kds'); await T.page.waitForTimeout(2500)
  const lang = await T.page.locator('.dash-sidebar-foot').boundingBox().catch(() => null)
  console.log('Tural 1024: sidebar foot', JSON.stringify(lang), '| language buttons:', JSON.stringify(await T.page.locator('.dash-sidebar-foot button').evaluateAll(e => e.map(x => x.innerText.trim() + '@' + Math.round(x.getBoundingClientRect().left) + '-' + Math.round(x.getBoundingClientRect().right)))))
  await C.shot(T.page, 'r2-124-kds-1024', { full: false })

  // ---- Menu page loading state on a phone
  const P = await C.open(browser, 'leyla-phone', { who: 'Leyla', sink })
  await P.page.goto(C.RESTO + '/menu', { waitUntil: 'commit' })
  const seen = []
  for (let i = 0; i < 12; i++) { seen.push(await P.page.evaluate(() => { const c = document.querySelector('.dash-content'); return c ? (c.querySelector('.skeleton') ? 'skeleton' : /Loading/.test(c.innerText) ? 'Loading-text' : /0 total/.test(c.innerText) ? '0-total' : 'content') : 'no-content' }).catch(() => 'nav')); await P.page.waitForTimeout(150) }
  console.log('Menu load states (150 ms steps):', seen.join(','))
  console.log('problems:', JSON.stringify(sink.map(s => s.stage + ' ' + s.who + ' ' + s.kind + ' ' + s.text).filter(s => !/ERR_ABORTED|vibrate/.test(s)).slice(0, 6)))
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
