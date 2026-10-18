// Round 3: the booking reminder (cron every 5 min, 55-65 min ahead). Books TODAY about 75 min ahead at Fincan, manager confirms in the dashboard,
// then waits for the reminder to appear in the inbox (bell + row + tap target), then cancels. Takes up to ~30 min of wall time.
const L = require('./aysel-r3-lib')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const PHONE = '+994503507503'
const baku = () => new Date(Date.now() + 4 * 3600 * 1000).toISOString().slice(11, 19)
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova', {})
  const api = await L.api('Aysel Məmmədova')
  let bookingUrl = null, slot = null
  L.log('Baku time now', baku())
  await L.step('reserve today', async () => {
    await A.page.goto(L.CONSUMER + '/book/fincan-coffee'); await A.page.waitForSelector('.bk-stepper-num'); await sleep(1500)
    await A.page.locator('.bk-day').nth(0).click(); await sleep(1800)
    const ok = A.page.locator('.slot-btn:enabled')
    const times = []; for (let i = 0; i < await ok.count(); i++) times.push((await ok.nth(i).innerText()).trim())
    L.log('today slots offered', JSON.stringify(times))
    // the slot that is 70-80 min ahead of now (Baku time), else the first one after 60 min
    const now = new Date(Date.now() + 4 * 3600 * 1000); const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes()
    const mins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
    const cand = times.filter(t => mins(t) - nowMin >= 66).sort((x, y) => mins(x) - mins(y))[0]
    slot = cand; L.log('chosen slot', slot, '(minutes ahead:', mins(slot) - nowMin + ')')
    const idx = times.indexOf(slot); await ok.nth(idx).click(); await sleep(400)
    await A.page.getByRole('button', { name: 'Continue' }).click(); await sleep(800)
    const sw = A.page.getByRole('switch', { name: 'Invite friends' })
    if (await sw.count()) { if ((await sw.getAttribute('aria-checked')) === 'true') await sw.click(); await A.page.getByRole('button', { name: 'Continue' }).click() }
    await sleep(800)
    const phone = A.page.getByLabel('Phone number'); if ((await phone.count()) && !(await phone.inputValue())) await phone.fill(PHONE)
    await A.page.getByLabel(/Share my name and phone/).check()
    await A.page.getByRole('button', { name: /Confirm|Reserve|Book/i }).last().click(); await sleep(2500)
    bookingUrl = A.page.url(); L.log('created | url', bookingUrl.replace(L.CONSUMER, ''))
  })
  await L.step('manager confirms', async () => {
    const M = await L.desk(b, 'Səid Əhmədov')
    await M.page.goto(L.RESTO + '/bookings'); await sleep(3500)
    const confirm = M.page.getByRole('button', { name: 'Confirm', exact: true }).first()
    if (await confirm.count()) { await confirm.click(); await sleep(1800); L.log('manager tapped Confirm at', baku()) } else L.log('no Confirm button')
    await M.ctx.close()
  })
  // wait for the reminder (poll the user's own notifications every 30 s, up to 35 min)
  let found = null
  for (let i = 0; i < 70 && !found; i++) {
    const rows = await api.get('notifications?select=type,sent_at&type=eq.booking_reminder&order=sent_at.desc&limit=1').catch(() => [])
    if (rows && rows[0] && Date.now() - new Date(rows[0].sent_at).getTime() < 3 * 3600 * 1000) found = rows[0]
    else await sleep(30000)
  }
  L.log('reminder row in the database:', found ? JSON.stringify(found) + ' (found at ' + baku() + ' Baku)' : 'NOT FOUND within 35 min')
  await L.step('what Aysel sees', async () => {
    await A.page.goto(L.CONSUMER + '/'); await A.page.waitForSelector('.soc-feed-slot article'); await sleep(2500)
    L.log('bell:', await A.page.evaluate(() => { const e = document.querySelector('[aria-label*="otification" i]'); return e ? (e.getAttribute('aria-label') + ' | ' + e.innerText.trim()) : null }))
    await A.page.locator('[aria-label*="otification" i]').first().click(); await A.page.waitForSelector('li.ntf-li'); await sleep(2000)
    L.log('top 3:', await A.page.evaluate(() => [...document.querySelectorAll('li.ntf-li')].slice(0, 3).map(li => li.innerText.replace(/\n+/g, ' | '))))
    await L.shot(A.page, '29-reminder-inbox')
    const li = A.page.locator('li.ntf-li').filter({ hasText: /remind|starts|in 1 h|in an hour/i }).first()
    if (await li.count()) { await li.click(); await sleep(2200); L.log('tap lands on', A.page.url().replace(L.CONSUMER, '')); await L.shot(A.page, '29-reminder-tap') }
  })
  await L.step('cancel the test booking', async () => {
    if (bookingUrl) { await A.page.goto(bookingUrl); await sleep(2500) }
    const cancel = A.page.getByRole('button', { name: /Cancel (booking|reservation)/i }).first()
    if (await cancel.count()) { await cancel.click(); await sleep(900); await A.page.locator('.bs-panel').getByRole('button', { name: /^Cancel booking/ }).click().catch(() => {}); await sleep(1800); L.log('after cancel:', (await A.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 160)) }
  })
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
