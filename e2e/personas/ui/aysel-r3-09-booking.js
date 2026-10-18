// Round 2, part 9: booking at Fincan (tomorrow) with notification permission granted -> push prompt card, manager confirms on the dashboard ->
// "booking confirmed" notification (Bookings filter, bell), tap -> booking page, enable-push attempt (no push service headless), then cancel the booking.
const L = require('./aysel-r3-lib')
const PHONE = '+994503507503'
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova', {})
  const api = await L.api('Aysel Məmmədova')
  let bookingUrl = null
  await L.step('reserve wizard', async () => {
    await A.page.goto(L.CONSUMER + '/book/fincan-coffee'); await A.page.waitForTimeout(2500)
    const num = A.page.locator('.bk-stepper-num'); await num.waitFor()
    L.log('party default', await num.innerText())
    const chips = A.page.locator('.bk-day')
    let picked = null
    for (let d = 1; d < 8 && !picked; d++) {
      await chips.nth(d).click(); await A.page.waitForTimeout(1500)
      const ok = A.page.locator('.slot-btn:enabled')
      if (await ok.count()) { const k = Math.min(1, (await ok.count()) - 1); picked = { day: d, time: (await ok.nth(k).innerText()).trim() }; await ok.nth(k).click() }
    }
    L.log('picked slot', JSON.stringify(picked))
    await L.shot(A.page, '15-reserve-slot')
    await A.page.getByRole('button', { name: 'Continue' }).click(); await A.page.waitForTimeout(800)
    const sw = A.page.getByRole('switch', { name: 'Invite friends' })
    if (await sw.count()) { if ((await sw.getAttribute('aria-checked')) === 'true') await sw.click(); await A.page.getByRole('button', { name: 'Continue' }).click() }
    await A.page.waitForTimeout(800)
    await L.shot(A.page, '15-reserve-confirm')
    const phone = A.page.getByLabel('Phone number'); if ((await phone.count()) && !(await phone.inputValue())) await phone.fill(PHONE)
    await A.page.getByLabel(/Share my name and phone/).check()
    const t0 = Date.now()
    await A.page.getByRole('button', { name: /Confirm|Reserve|Book/i }).last().click()
    await A.page.waitForTimeout(2500)
    L.log('created in ~', Date.now() - t0 - 2500, 'ms | url', A.page.url().replace(L.CONSUMER, ''))
    bookingUrl = A.page.url()
    await L.shot(A.page, '15-booking-created')
    L.log((await A.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 500))
    await A.page.waitForTimeout(1800)
    await L.shot(A.page, '15-push-prompt')
    L.log('prompt card:', await A.page.evaluate(() => [...document.querySelectorAll('[class*=prompt i], [role=dialog], [role=alert], [aria-live]')].map(e => e.innerText.trim().replace(/\n+/g, ' ')).filter(Boolean).join(' || ').slice(0, 400)))
  })
  await L.step('manager confirms on the dashboard', async () => {
    const M = await L.desk(b, 'Səid Əhmədov')
    await M.page.goto(L.RESTO + '/bookings'); await M.page.waitForTimeout(3500)
    await L.shot(M.page, '15-mgr-bookings')
    L.log('mgr bookings:', (await M.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(150, 700))
    L.log('mgr bell:', await M.page.evaluate(() => [...document.querySelectorAll('[aria-label*="otification" i]')].map(e => (e.getAttribute('aria-label') || '') + ' ' + e.innerText.trim())))
    const confirm = M.page.getByRole('button', { name: 'Confirm', exact: true }).first()
    if (await confirm.count()) { await confirm.click(); await M.page.waitForTimeout(1800); L.log('manager tapped Confirm') } else L.log('no Confirm button (auto-confirmed?)')
    await L.shot(M.page, '15-mgr-confirmed')
    await M.ctx.close()
  })
  await L.step('Aysel sees the notification', async () => {
    await A.page.goto(L.CONSUMER + '/'); await A.page.waitForSelector('.soc-feed-slot article'); await A.page.waitForTimeout(2500)
    L.log('bell:', await A.page.evaluate(() => { const e = document.querySelector('[aria-label*="otification" i]'); return e ? (e.getAttribute('aria-label') + ' | ' + e.innerText.trim()) : null }))
    await A.page.locator('[aria-label*="otification" i]').first().click(); await A.page.waitForSelector('li.ntf-li'); await A.page.waitForTimeout(2500)
    L.log('top 3:', await A.page.evaluate(() => [...document.querySelectorAll('li.ntf-li')].slice(0, 3).map(li => li.innerText.replace(/\n+/g, ' | '))))
    await L.shot(A.page, '15-inbox-after-confirm')
    const li = A.page.locator('li.ntf-li').filter({ hasText: /booking|Booking|reserv/i }).first()
    if (await li.count()) { await li.click(); await A.page.waitForTimeout(2200); L.log('tap lands on', A.page.url().replace(L.CONSUMER, '')); await L.shot(A.page, '15-tap-booking') }
  })
  await L.step('enable push (permission granted, no push service)', async () => {
    await A.page.goto(L.CONSUMER + '/settings/notifications'); await A.page.waitForTimeout(3000)
    await L.shot(A.page, '15-settings-granted')
    L.log('push row:', (await A.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(40, 360))
    const sw = A.page.locator('input[type=checkbox], [role=switch]').first()
    L.log('first switch disabled?', await sw.isDisabled())
    if (!(await sw.isDisabled())) {
      await sw.click({ force: true }); await A.page.waitForTimeout(4000)
      await L.shot(A.page, '15-settings-enable-try')
      L.log('after enabling:', (await A.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(40, 420), '| checked now', await sw.isChecked())
      L.log('prefs:', JSON.stringify(await api.rpc('get_notification_prefs')))
    }
  })
  await L.step('cancel the test booking', async () => {
    if (bookingUrl) { await A.page.goto(bookingUrl); await A.page.waitForTimeout(2500) }
    const cancel = A.page.getByRole('button', { name: /Cancel (booking|reservation)/i }).first()
    L.log('cancel button', await cancel.count())
    if (await cancel.count()) { await cancel.click(); await A.page.waitForTimeout(800); await A.page.getByRole('button', { name: /^(Yes|Cancel booking|Cancel reservation|Confirm)/i }).last().click().catch(() => {}); await A.page.waitForTimeout(1800); L.log('after cancel:', (await A.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 300)) }
  })
  L.log('errors', A.errors.filter(e => !/ERR_ABORTED/.test(e)))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
