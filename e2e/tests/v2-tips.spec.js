// v2 tips (sql/51 tip_report / my_tips): a guest pays the bill with the demo card and a 10 % tip assigned to the QA
// waiter; then the waiter sees it on /my-tips and on the Waiter page card, and the manager sees it on /tips (Today row,
// CSV export). @staff, needs QA_GUEST_*, QA_MANAGER_*, QA_WAITER_* and QA_TABLE_CODE (the free Bella Roma table that
// v2-bills uses too, which is why playwright.config.js runs this spec after the rest of the desktop project).
// Serial: the first test writes (claim, order, pay, leave), the next two read what it produced. beforeAll/afterAll
// reset the table over the API exactly like v2-bills. The order and the settled bill stay behind as history rows.
// The tip lands on the QA waiter's own total, so the checks compare against what the API says right before / after
// (other tips of the day may already be there): the delta must be the new tip, the UI must equal the API.
// The role-gate tests at the bottom need no table.
const fs = require('fs')
const { test, expect } = require('../support/fixtures')
const { CONSUMER_URL, RESTO_URL, creds, tableCode } = require('../support/env')
const { signInGuest, bakuDate } = require('../support/guest')
const { openAs, rpc, rest, resetTable } = require('../support/v2')

const url = path => CONSUMER_URL + path
const rurl = path => RESTO_URL + path
const num = text => Number(String(text).replace(/[^\d.]/g, ''))        // '₼12.30' -> 12.3
const fmt = n => `₼${n.toFixed(2)}`
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

async function claimTable(page) {
  await page.goto(url(`/t/${tableCode}`))
  await expect(page.getByRole('heading', { name: 'Join this table?' })).toBeVisible()
  await page.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(page).toHaveURL(url('/table'))
  await expect(page.getByRole('heading', { name: 'Your Table' })).toBeVisible()
}

/** Restaurant page -> first orderable dish -> cart sheet -> Place Order (same as v2-bills). */
async function orderOneDish(page) {
  await page.getByRole('link', { name: 'Add More Items' }).click()
  await expect(page).toHaveURL(/\/restaurant\/[\w-]+$/)
  const add = page.getByRole('button', { name: /^Add to Order/ })
  const tiles = page.locator('.menu-card')
  await expect(tiles.first()).toBeVisible()
  for (let i = 0, n = await tiles.count(); i < n && !(await add.isVisible()); i++) {   // skip sold-out dishes
    await tiles.nth(i).click()
    await add.waitFor({ timeout: 2_000 }).catch(() => page.keyboard.press('Escape'))
  }
  await add.click()
  const place = page.getByRole('button', { name: /^Place Order/ })
  if (!(await place.isVisible({ timeout: 3_000 }).catch(() => false))) await page.getByRole('button', { name: 'Open cart' }).click()
  const placed = page.waitForResponse(r => r.request().method() === 'POST' && /\/rest\/v1\/rpc\/place_order/.test(r.url()))
  await place.click()
  const res = await placed
  // sql/47c rate limit: at most 5 orders per user and table in 10 minutes (`too_many_orders`).
  expect(res.ok(), `place_order rpc: ${res.ok() ? '' : await res.text()}`).toBe(true)
}

/** An RPC that must succeed; the parsed jsonb. A failure names the rpc and shows the body (e.g. sql/51 not applied). */
async function call(page, who, name, args) {
  const res = await rpc(page, who, name, args)
  expect(res.ok, `${name} rpc: HTTP ${res.status} ${res.body}`).toBe(true)
  return JSON.parse(res.body)
}

test.describe('v2 tips', { tag: ['@staff', '@resto', '@v2'] }, () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!creds.guest || !creds.manager || !creds.waiter || !tableCode,
    'set QA_GUEST_*, QA_MANAGER_*, QA_WAITER_* and QA_TABLE_CODE (a free table at Trattoria Bella Roma)')

  const reset = async (browser, testInfo) => {
    const guest = await openAs(browser, testInfo, creds.guest)
    const mgr = await openAs(browser, testInfo, creds.manager)
    try {
      const { state } = await resetTable(guest.page, guest, mgr, tableCode)
      expect(['free', 'cleared'], 'QA table state after reset').toContain(state)
    } finally {
      await guest.close()
      await mgr.close()
    }
  }
  test.beforeAll(async ({ browser }, testInfo) => { await reset(browser, testInfo) })
  test.afterAll(async ({ browser }, testInfo) => { await reset(browser, testInfo) })

  const today = bakuDate()
  const shared = {}   // what the first test learned: { tip, tableNumber, waiterName }

  test('guest pays a 10 % demo-card tip to the QA waiter', async ({ page, browser, watch }, testInfo) => {
    test.setTimeout(180_000)
    await signInGuest(page, creds.guest)
    const waiter = await openAs(browser, testInfo, creds.waiter)
    const mgr = await openAs(browser, testInfo, creds.manager)
    try {
      let waiterStaffId, tableId, before
      await test.step('who the QA waiter is and what they have earned so far today', async () => {
        const [code] = await rest(page, mgr, 'GET', `table_access_codes?access_code=eq.${encodeURIComponent(tableCode)}&select=table_id`)
        expect(code, `QA_TABLE_CODE ${tableCode} is not a table of the manager's restaurant`).toBeTruthy()
        tableId = code.table_id
        const [table] = await rest(page, mgr, 'GET', `tables?id=eq.${tableId}&select=table_number,restaurant_id`)
        shared.tableNumber = String(table.table_number)
        const report = await call(page, mgr, 'tip_report', { p_restaurant_id: table.restaurant_id, p_from: today, p_to: today })
        const me = report.waiters.find(w => w.user_id === waiter.session.user.id)
        expect(me, 'the QA waiter is not an active waiter of the restaurant (tip_report)').toBeTruthy()
        waiterStaffId = me.staff_id
        shared.waiterName = me.display_name
        before = await call(page, waiter, 'my_tips', { p_from: today, p_to: today })
      })

      await test.step('claim the table and place an order', async () => {
        await claimTable(page)
        await orderOneDish(page)
        await page.goto(url('/table'))
        await expect(page.getByText(/^Order #\d+/).first()).toBeVisible()
      })

      let billId
      await test.step('open the bill: Card (demo), 10 % tip, the QA waiter picked explicitly', async () => {
        await page.goto(url('/bill'))
        await expect(page.getByRole('heading', { name: 'Payment method' })).toBeVisible()
        const card = page.getByRole('radio', { name: /Card \(demo\)/ })
        await card.click()
        await expect(card).toHaveAttribute('aria-checked', 'true')   // tips are only collected with the card

        const ten = page.getByRole('radiogroup', { name: 'Add a tip' }).getByRole('radio', { name: /^10%/ })
        await ten.click()
        await expect(ten).toHaveAttribute('aria-checked', 'true')
        const hint = await page.getByText(/^Tip: ₼/).innerText()
        shared.tip = num(hint)
        expect(shared.tip, `10 % of this order rounds to no tip (hint "${hint}")`).toBeGreaterThan(0)

        // The picker lists list_table_waiters in order (assigned first, then by name), then "Whole team".
        const listed = await call(page, waiter, 'list_table_waiters', { p_table_id: tableId })
        const at = listed.findIndex(w => w.staff_id === waiterStaffId)
        expect(at, 'the QA waiter is not offered for this table (list_table_waiters)').toBeGreaterThanOrEqual(0)
        const picker = page.getByRole('radiogroup', { name: 'Who gets the tip?' })
        await expect(picker).toBeVisible()
        const radios = picker.getByRole('radio')
        await expect(radios).toHaveCount(listed.length + 1)
        await radios.nth(at).click()
        await expect(radios.nth(at)).toHaveAttribute('aria-checked', 'true')
        await expect(radios.last()).toHaveAttribute('aria-checked', 'false')   // not "Whole team"
        await expect(page.locator('.bl-paybar-sum')).toContainText(`+ tip ${fmt(shared.tip)}`)
      })

      await test.step('pay once: Payment received, bill settled', async () => {
        await page.getByRole('button', { name: /^Pay ₼/ }).click()
        const confirm = page.getByRole('button', { name: /\(demo\)$/ })
        await expect(confirm).toBeVisible()
        await confirm.click()
        await expect(page.getByRole('heading', { name: 'Payment received' })).toBeVisible({ timeout: 20_000 })
        await expect(page.getByText('Bill settled', { exact: true })).toBeVisible()
        billId = (await page.getByRole('link', { name: 'View receipt' }).getAttribute('href')).split('/').pop()
      })

      await test.step('leave the table', async () => {
        await page.goto(url(`/bill/${billId}`))
        await page.getByRole('button', { name: 'Leave table' }).click()
        await expect(page).toHaveURL(url('/'))
        await page.goto(url('/table'))
        await expect(page.getByText('No Active Table')).toBeVisible()
      })

      await test.step('my_tips booked it on the waiter, as earned, with the table number', async () => {
        const after = await call(page, waiter, 'my_tips', { p_from: today, p_to: today })
        expect(after.total - before.total, 'waiter total grew by the tip').toBeGreaterThanOrEqual(shared.tip - 0.005)
        expect(after.count, 'waiter tip count').toBeGreaterThan(before.count)
        const mine = after.tips.find(t => String(t.table_number) === shared.tableNumber && Math.abs(t.amount - shared.tip) < 0.005 && t.status === 'earned')
        expect(mine, `no earned ${fmt(shared.tip)} tip for table ${shared.tableNumber} in my_tips: ${JSON.stringify(after.tips.slice(0, 3))}`).toBeTruthy()
      })
    } finally {
      await waiter.close()
      await mgr.close()
    }
    expect(watch.consoleErrors, 'console errors for the guest').toEqual([])
  })

  test('waiter: /my-tips shows the tip and the Waiter page card the day total', async ({ page, browser, watch }, testInfo) => {
    test.skip(!shared.tip, 'the payment test did not run')
    await signInGuest(page, creds.waiter)
    const api = await openAs(browser, testInfo, creds.waiter)
    let apiToday
    try { apiToday = await call(page, api, 'my_tips', { p_from: today, p_to: today }) } finally { await api.close() }

    await test.step('/my-tips, Today: total, count and the new tip in the list', async () => {
      await page.goto(rurl('/my-tips'))
      await expect(page.getByRole('heading', { level: 1, name: 'My tips' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Today', exact: true })).toHaveAttribute('aria-pressed', 'true')
      const hero = page.locator('.v2-tips-hero')
      await expect(hero).toBeVisible()
      const total = num(await hero.locator('.v2-tips-hero-value').innerText())
      expect(total, 'My tips total today').toBeGreaterThan(0)
      expect(total, 'total covers the new tip').toBeGreaterThanOrEqual(shared.tip - 0.005)
      expect(total, 'UI total = my_tips total').toBeCloseTo(apiToday.total, 2)
      await expect(hero).toContainText(`${apiToday.count} ${apiToday.count === 1 ? 'tip' : 'tips'}`)

      const entry = page.locator('.v2-tip-list .v2-tip')
        .filter({ hasText: `Table ${shared.tableNumber}` }).filter({ hasText: fmt(shared.tip) })
      await expect(entry.first(), `a ${fmt(shared.tip)} tip for Table ${shared.tableNumber}`).toBeVisible()
      await expect(entry.first()).toContainText('Earned')
      await expect(entry.first()).toContainText('Demo')
    })

    await test.step('This week: at least today, with the by-day strip once the range has two days', async () => {
      await page.getByRole('button', { name: 'This week', exact: true }).click()
      await expect(page.getByRole('button', { name: 'This week', exact: true })).toHaveAttribute('aria-pressed', 'true')
      const hero = page.locator('.v2-tips-hero-value')
      await expect.poll(async () => num(await hero.innerText()), 'week total >= today total').toBeGreaterThanOrEqual(apiToday.total - 0.005)
      const monday = new Date(`${today}T00:00:00Z`).getUTCDay() === 1   // the week then is just today: no strip
      if (!monday) await expect(page.getByRole('heading', { name: 'By day' })).toBeVisible()
    })

    await test.step('Waiter page: "My tips today" card with the same total, opens /my-tips', async () => {
      await page.goto(rurl('/waiter'))
      const cardLink = page.locator('a.v2-mytips')
      await expect(cardLink).toContainText('My tips today')
      await expect(cardLink.locator('.v2-money')).toHaveText(fmt(apiToday.total))
      await cardLink.click()
      await expect(page).toHaveURL(/\/my-tips$/)
    })
    expect(watch.consoleErrors, 'console errors for the waiter').toEqual([])
  })

  test('manager: /tips lists the QA waiter for Today and exports a CSV', async ({ page, browser, watch }, testInfo) => {
    test.skip(!shared.tip, 'the payment test did not run')
    await signInGuest(page, creds.manager)
    const waiter = await openAs(browser, testInfo, creds.waiter)
    let mine
    try { mine = await call(page, waiter, 'my_tips', { p_from: today, p_to: today }) } finally { await waiter.close() }
    expect(mine.count, 'the waiter has a tip today').toBeGreaterThanOrEqual(1)

    await page.goto(rurl('/tips'))
    await expect(page.getByRole('heading', { level: 1, name: 'Tips' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Today', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Custom', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'This month', exact: true })).toBeVisible()

    await test.step('stat cards and the QA waiter row (count >= 1, total = the waiter\'s own)', async () => {
      const stat = label => page.locator('.v2-stats .stat-card').filter({ hasText: label }).locator('.stat-value')
      await expect(stat('Total tips')).toBeVisible()
      expect(num(await stat('Total tips').innerText()), 'restaurant total covers the waiter').toBeGreaterThanOrEqual(mine.total - 0.005)
      expect(num(await stat('Tip count').innerText()), 'restaurant tip count').toBeGreaterThanOrEqual(mine.count)

      const row = page.locator('.v2-tips-table tbody tr').filter({ has: page.getByRole('rowheader', { name: shared.waiterName, exact: true }) })
      await expect(row, `row for ${shared.waiterName}`).toHaveCount(1)
      const count = Number(await row.locator('td[data-label="Tips"]').innerText())
      expect(count, 'tips in the row').toBeGreaterThanOrEqual(1)
      expect(count, 'row count = my_tips count').toBe(mine.count)
      await expect(row.locator('td[data-label="Total"]')).toHaveText(fmt(mine.total))
      await expect(row).toContainText('Waiter')   // role pill
    })

    await test.step('Export CSV downloads a file whose first line is the header', async () => {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'Export CSV' }).click(),
      ])
      expect(download.suggestedFilename()).toBe(`tips_${today}_${today}.csv`)
      const text = fs.readFileSync(await download.path(), 'utf8').replace(/^﻿/, '')
      const lines = text.split(/\r?\n/)
      expect(lines[0]).toBe('Waiter,Role,Tips,Total,Average,Last tip')
      const line = lines.find(l => l.startsWith(`${shared.waiterName},`))
      expect(line, `a CSV line for ${shared.waiterName}`).toBeTruthy()
      expect(line).toMatch(new RegExp(`^${escRe(shared.waiterName)},Waiter,${mine.count},${escRe(mine.total.toFixed(2))},`))
    })
    expect(watch.consoleErrors, 'console errors for the manager').toEqual([])
  })
})

test.describe('v2 tips: role gates', { tag: ['@staff', '@resto', '@v2'] }, () => {
  test('waiter is redirected away from /tips', async ({ page }) => {
    test.skip(!creds.waiter, 'set QA_WAITER_EMAIL and QA_WAITER_PASSWORD')
    await signInGuest(page, creds.waiter)
    await page.goto(rurl('/tips'))
    await expect(page, 'waiter on /tips').toHaveURL(/\/waiter$/)   // RoleGate bounces to the role's home
  })

  test('manager can open /my-tips (hidden from the sidebar, linked from /tips)', async ({ page, watch }) => {
    test.skip(!creds.manager, 'set QA_MANAGER_EMAIL and QA_MANAGER_PASSWORD')
    await signInGuest(page, creds.manager)
    await page.goto(rurl('/my-tips'))
    await expect(page).toHaveURL(/\/my-tips$/)
    await expect(page.getByRole('heading', { level: 1, name: 'My tips' })).toBeVisible()
    await expect(page.locator('.v2-tips-hero')).toBeVisible()   // the total card renders even with no tips of their own
    await expect(page.getByRole('alert')).toHaveCount(0)
    expect(watch.consoleErrors, 'console errors on /my-tips').toEqual([])
  })
})
