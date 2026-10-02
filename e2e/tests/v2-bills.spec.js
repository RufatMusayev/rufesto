// v2 bills & payments (WP3): claim the free QA table, order, pay the bill with the demo card (double-tapped:
// exactly one payment), open the receipt, leave the table. @guest, needs QA_TABLE_CODE (a free Bella Roma table).
// Serial: test 1 leaves an order on the table session, test 2 re-claims it (idempotent), orders again and pays
// everything, so a green run ends with a settled bill and a free table. Orders/bills stay as history rows.
const { test, expect } = require('../support/fixtures')
const { CONSUMER_URL, creds, tableCode } = require('../support/env')
const { signInGuest } = require('../support/guest')

const url = path => CONSUMER_URL + path

async function claimTable(page) {
  await page.goto(url(`/t/${tableCode}`))
  await expect(page.getByRole('heading', { name: 'Join this table?' })).toBeVisible()
  await page.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(page).toHaveURL(url('/table'))
  await expect(page.getByRole('heading', { name: 'Your Table' })).toBeVisible()
}

/** Restaurant page -> first orderable dish -> cart sheet -> Place Order. */
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
  // placeOrder() is two client requests (orders, then order_items). Navigating away between them leaves an empty
  // open order that keeps the table in awaiting_payment, so wait for the second one before doing anything else.
  const items = page.waitForResponse(r => r.request().method() === 'POST' && /\/rest\/v1\/order_items/.test(r.url()))
  await place.click()   // adding a dish opens the cart sheet by itself on the current build
  expect((await items).ok(), 'order_items insert').toBe(true)
}

test.describe('v2 bills', { tag: ['@guest', '@consumer', '@v2'] }, () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(!creds.guest || !tableCode, 'set QA_GUEST_* and QA_TABLE_CODE (a free table at Trattoria Bella Roma)')
  test.beforeEach(async ({ page }) => { await signInGuest(page, creds.guest) })

  test('a freshly claimed table starts with no orders', async ({ page }) => {
    // APP BUG (pre-v2, TablePage.jsx load()): orders are read by table_id + user_id only, with no session or
    // bill filter, so a guest who sits at the same table again sees every earlier order (even `paid` ones) and an
    // inflated "Session Total" / "View bill" amount. Remove test.fail() once the query is scoped to the session.
    // (Passes unexpectedly on a database where this guest never ordered at the QA table.)
    test.fail()
    await claimTable(page)
    await expect(page.getByText('No orders yet')).toBeVisible({ timeout: 5_000 })
  })

  test('placing an order shows the "Order placed!" confirmation', async ({ page }) => {
    // APP BUG (pre-v2, CartSheet.jsx + CartContext.jsx): placeOrder() calls setOpen(false), and CartSheet returns
    // null while !open BEFORE it reaches its `ordered` panel, so the confirmation never renders. Remove test.fail()
    // once CartSheet checks `ordered` first (or the context stops closing the cart).
    test.fail()
    await claimTable(page)
    await orderOneDish(page)
    await expect(page.getByText('Order placed!')).toBeVisible({ timeout: 5_000 })
  })

  test('claim, order, pay with the demo card once, receipt, leave', async ({ page, watch }) => {
    test.setTimeout(150_000)
    let billId
    await test.step('claim the table (/t/<code> -> Join) and place an order', async () => {
      await claimTable(page)
      await orderOneDish(page)
      await page.goto(url('/table'))   // fresh load: the order is on the table screen
      await expect(page.getByText(/^Order #\d+/).first()).toBeVisible()
    })

    await test.step('open the bill, pick Card (demo), double-tap pay: DEMO badge, settled panel', async () => {
      await page.goto(url('/bill'))   // BillEntry on /table only shows once staff served the order
      await expect(page.getByRole('heading', { name: 'Payment method' })).toBeVisible()
      const card = page.getByRole('radio', { name: /Card \(demo\)/ })
      await card.click()
      await expect(card).toHaveAttribute('aria-checked', 'true')
      await expect(card.getByText('DEMO', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: /^Pay ₼/ }).click()
      const confirm = page.getByRole('button', { name: /\(demo\)$/ })
      await expect(confirm).toBeVisible()
      // Two clicks in the same tick, before React can disable the button: only the ref guard stops the second.
      await confirm.evaluate(b => { b.click(); b.click() })
      await expect(page.getByRole('heading', { name: 'Payment received' })).toBeVisible({ timeout: 20_000 })
      await expect(page.locator('.bl-settled').getByText('DEMO', { exact: true })).toBeVisible()
      await expect(page.getByText('Bill settled', { exact: true })).toBeVisible()
      const receipt = page.getByRole('link', { name: 'View receipt' })
      billId = (await receipt.getAttribute('href')).split('/').pop()
      await receipt.click()
    })

    await test.step('receipt lists exactly one demo payment', async () => {
      await expect(page).toHaveURL(url(`/receipt/${billId}`))
      await expect(page.getByRole('article', { name: 'Receipt' })).toContainText('Trattoria Bella Roma')
      await expect(page.locator('.bl-r-pay')).toHaveCount(1)
      await expect(page.locator('.bl-r-pay').getByText('DEMO', { exact: true })).toBeVisible()
    })

    await test.step('leave the table', async () => {
      await page.goto(url(`/bill/${billId}`))
      await page.getByRole('button', { name: 'Leave table' }).click()
      await expect(page).toHaveURL(url('/'))
      await page.goto(url('/table'))
      await expect(page.getByText('No Active Table')).toBeVisible()
    })
    expect(watch.consoleErrors, 'console errors for the guest').toEqual([])
  })
})
