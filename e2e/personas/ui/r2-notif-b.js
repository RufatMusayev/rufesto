// Round 2 notifications part 2: empty filter states, mark all read, settings persistence, AZ inbox, Mehriban's inbox after a booking + cancel.
const L = require('./lib')
const out = {}
const note = (k, v) => { out[k] = v; console.log('##', k, typeof v === 'string' ? v : JSON.stringify(v)) }
const lines = t => [...new Set(t.split('\n').map(x => x.trim()).filter(Boolean))]
;(async () => {
  {
    const s = await L.open({ as: 'Fərid Məlikov' }); const { page } = s
    await page.goto(L.BASE + '/notifications', { waitUntil: 'load' }); await page.waitForTimeout(2500)
    for (const f of ['Social', 'Dine-in', 'Bookings', 'Places']) {
      await page.getByRole('button', { name: f, exact: true }).or(page.getByRole('tab', { name: f, exact: true })).first().click(); await page.waitForTimeout(1500)
      note(`F_filter_${f}`, lines(await page.evaluate(() => document.body.innerText)).slice(8, 16)); await L.shot(page, `RN-F-filter-${f}`)
    }
    note('filter_chip_semantics', await page.evaluate(() => [...document.querySelectorAll('.ntf-filters button, [role=tab]')].slice(0, 5).map(b => `${b.innerText}|pressed=${b.getAttribute('aria-pressed')}|sel=${b.getAttribute('aria-selected')}|${Math.round(b.getBoundingClientRect().height)}`)))
    await page.getByRole('button', { name: 'All', exact: true }).or(page.getByRole('tab', { name: 'All', exact: true })).first().click(); await page.waitForTimeout(1000)
    // mark all read
    const unreadBefore = await page.locator('text=Unread').count()
    await page.getByRole('button', { name: /Mark all read/ }).click(); await page.waitForTimeout(1500)
    note('unread_labels_before_after', [unreadBefore, await page.locator('text=Unread').count()]); await L.shot(page, 'RN-F-marked-read')
    // tap an item: lands where?
    await page.getByText(/accepted your friend request/).first().click(); await page.waitForTimeout(2000)
    note('tap_friend_accepted_lands', page.url().replace(L.BASE, ''))
    await page.goto(L.BASE + '/notifications', { waitUntil: 'load' }); await page.waitForTimeout(1500)
    await page.getByText(/Your bill at/).first().click(); await page.waitForTimeout(2500)
    note('tap_bill_lands', page.url().replace(L.BASE, '')); await L.shot(page, 'RN-F-tap-bill')
    await s.close()
  }
  {
    const s = await L.open({ as: 'Mehriban Rzayeva', lang: 'az' }); const { page } = s
    await page.goto(L.BASE + '/notifications', { waitUntil: 'load' }); await page.waitForTimeout(2800); await L.shot(page, 'RN-M-inbox-az')
    note('M_inbox_az', lines(await page.evaluate(() => document.body.innerText)).slice(0, 30))
    await page.goto(L.BASE + '/settings/notifications', { waitUntil: 'load' }); await page.waitForTimeout(2200); await L.shot(page, 'RN-M-settings-az')
    note('M_settings_az', lines(await page.evaluate(() => document.body.innerText)).slice(0, 26))
    await s.close()
  }
  {
    const s = await L.open({ as: 'Mehriban Rzayeva' }); const { page } = s
    await page.goto(L.BASE + '/notifications', { waitUntil: 'load' }); await page.waitForTimeout(2800); await L.shot(page, 'RN-M-inbox-after-booking')
    note('M_inbox_after_booking_cancel', lines(await page.evaluate(() => document.body.innerText)).slice(0, 30))
    // settings persistence: switch Places off, reload, back on
    await page.goto(L.BASE + '/settings/notifications', { waitUntil: 'load' }); await page.waitForTimeout(2200)
    const sw = page.locator('[role=switch], input[type=checkbox]')
    const state = () => sw.evaluateAll(a => a.map(e => e.checked ?? e.getAttribute('aria-checked')))
    note('switches_before', await state())
    await sw.nth(4).click(); await page.waitForTimeout(1500)
    note('switches_after_click', await state())
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(2200)
    note('switches_after_reload', await state())
    await sw.nth(4).click(); await page.waitForTimeout(1500); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(2200)
    note('switches_restored', await state())
    await s.close()
  }
  L.save('r2-notif-b', out)
})()
