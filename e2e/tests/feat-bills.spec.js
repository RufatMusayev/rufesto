// Consumer BILL features, one by one, as the Bella Roma review guests review1-2 (stranger: review3) against CONSUMER_URL, with the Bella
// staff on RESTO_URL (manager = Bills / Tables). Desktop and `mobile` project (guest pages use the project's device, the dashboard a
// desktop window). Every test is independent: guest lock, a FREE Bella Roma table (never T5 = QA_TABLE_CODE), seating / ordering /
// serving over the API where that is not the thing under test, table reset in `finally`. App bugs stay failing tests (docs/qa/consumer-table.md).
const F = require('../support/feat-table')
const { test, expect, url, rurl, money } = F

test.skip(!F.haveAccounts, 'docs/REVIEW-ACCOUNTS.md must list review1-3 and the Bella Roma manager / waiter1 / kitchen accounts')
test.describe.configure({ mode: 'default', timeout: 90_000 })
const TAGS = { tag: ['@guest', '@staff', '@consumer', '@feat'] }
const PENNE = 'Penne alla Norma'
const TWO = { two: true }
const tipFor = (share, pct) => Math.round(Math.round(share * 100) * pct / 1000) * 10 / 100   // the app's rule: nearest 0.10

/** g1 (host) seated, optionally g2 too; their orders placed and served over the API. Returns the orders. */
async function dinner(A, table, { two = false, lines1 = [[PENNE, 2]], lines2 = [['Cappuccino', 2], ['Chianti Classico', 1]] } = {}) {
  await F.seatGuest(A.g1, table.code)
  if (two) await F.seatGuest(A.g2, table.code, A.g1)
  const o1 = await F.placeOrder(A.g1, table.id, lines1)
  const o2 = two ? await F.placeOrder(A.g2, table.id, lines2) : null
  for (const o of [o1, o2].filter(Boolean)) await F.serveOrder(A, o.orderId)
  return { o1, o2 }
}
/** The guest's own browser: join over the UI (the app keeps the table in sessionStorage), then "View bill". */
async function openBill(ui, key, table) {
  const g = await ui.open(key)
  await F.joinTable(g.page, table.code)
  await g.page.getByRole('link', { name: /^View bill/ }).click()
  await expect(g.page.getByRole('heading', { name: 'Your bill' })).toBeVisible()
  return g
}
const myBill = async guest => (await guest.rpc('my_bill')).body
const radio = (page, name) => page.getByRole('radio', { name })
const payBar = page => page.locator('.bl-paybar')
/** Taps the primary pay button, then the demo sheet's confirm button (the card needs both). Resolves when the sheet is up. */
async function payByCard(page) {
  await radio(page, /Card \(demo\)/).click()
  await page.getByRole('button', { name: /^Pay ₼/ }).click()
  const confirm = page.getByRole('button', { name: /\(demo\)$/ })
  await expect(confirm).toBeVisible()
  return confirm
}
/**
 * After the demo "Pay" confirm: wait for "Payment received". useBill refreshes the bill with my_bill until the first realtime event has
 * delivered the new shares; when that event is slower than the 1.2 s demo processing the settlement (which ends the table session) lands
 * first, my_bill answers no_session and the screen keeps the old bill: "Your table session has ended" or an Open bill with the Pay button,
 * although the payment succeeded. That is an app bug (BUG-9, soft failure here); the page is then reloaded on /bill/<id> so the rest of
 * the test can still check the settled screens.
 */
async function receivedOrRecover(page, billId) {
  const received = page.getByRole('heading', { name: 'Payment received' })
  const shown = await received.waitFor({ timeout: 20_000 }).then(() => true, () => false)
  let notice = ''
  if (!shown) {   // evidence before the reload: what the sheet / screen said
    notice = (await page.locator('.bl-sheet-note, .bl-sheet-error').allInnerTexts()).join(' | ')
    await test.info().attach('bill-screen-before-recover.png', { body: await page.screenshot(), contentType: 'image/png' })
  }
  expect.soft(shown, 'the payment went through (bill settled) but the screen did not switch to "Payment received" (' + ((await page.getByRole('heading', { name: 'Your table session has ended' }).isVisible()) ? 'it says "Your table session has ended"' : 'it still offers to pay') + (notice ? `; the pay sheet says: ${notice}` : '') + ')').toBe(true)
  if (!shown) { await page.goto(url('/bill/' + billId)); await expect(received).toBeVisible() }
}
/** A demo-card payment over the API (setup for the tests that are not about paying). */
async function payApi(guest, billId, { mode = 'own', tip = 0 } = {}) {
  const i = await guest.rpc('create_payment_intent', { p_bill_id: billId, p_method: 'demo', p_tip: tip, p_tip_staff_id: null, p_mode: mode })
  expect(i.ok, `create_payment_intent: ${i.error}`).toBe(true)
  const s = await guest.rpc('demo_settle_payment', { p_intent_id: i.body.intent_id })
  expect(s.ok, `demo_settle_payment: ${s.error}`).toBe(true)
  return s.body
}

test.describe('bills: before paying', TAGS, () => {
  test('nothing_due: a seated guest with nothing ordered sees "Nothing to pay"; Leave table frees the table', async ({ ui }) => {
    await F.withTable(ui, {}, async ({ mgr, table }) => {
      const { page } = await ui.open('g1')
      await F.joinTable(page, table.code)
      await page.goto(url('/bill'))
      await expect(page.getByRole('heading', { name: 'Nothing to pay' })).toBeVisible()
      await expect(page.getByText("This table's bill is already covered, so there's nothing left to pay.")).toBeVisible()
      await page.getByRole('link', { name: 'Stay at the table' }).click()
      await expect(page).toHaveURL(url('/table'))
      await page.goto(url('/bill'))
      await page.getByRole('button', { name: 'Leave table' }).click()
      await expect(page).toHaveURL(url('/'))
      await page.goto(url('/table'))
      await expect(page.getByText('No Active Table')).toBeVisible()
      await expect.poll(() => F.tableState(mgr, table.id), 'table after the only guest left').toMatch(/^(free|cleared)$/)
    })
  })

  test('View bill appears on the table screen once the order is served (live) and opens the bill', async ({ ui }) => {
    await F.withTable(ui, {}, async ({ g1, mgr, kitchen, table, ...A }) => {
      await F.seatGuest(g1, table.code)
      const { orderId, total } = await F.placeOrder(g1, table.id, [[PENNE, 1]])
      const { page } = await ui.open('g1')
      await F.joinTable(page, table.code)
      await expect(page.getByRole('link', { name: /^View bill/ }), 'not before the order is served').toHaveCount(0)
      await F.serveOrder({ kitchen, mgr }, orderId)
      const link = page.getByRole('link', { name: `View bill · ${money(total)}` })
      await expect(link).toBeVisible({ timeout: 15_000 })
      await link.click()
      await expect(page).toHaveURL(url('/bill'))
      await expect(page.getByRole('heading', { name: 'Your bill' })).toBeVisible()
      await expect(page.getByText(`Trattoria Bella Roma · Table ${table.number}`)).toBeVisible()
    })
  })

  test('bill: one card per person with their lines, VAT and total; the people add up to the total', async ({ ui }) => {
    test.setTimeout(150_000)
    await F.withTable(ui, { orders: 1 }, async ({ g1, table, ...A }) => {
      await dinner({ g1, table, ...A, g2: A.g2 }, table, TWO)
      const { page } = await openBill(ui, 'g1', table)
      const bill = await myBill(g1)
      await expect(page.locator('.bl-person')).toHaveCount(bill.people.length)
      await expect(page.locator('.bl-person').first(), 'my card comes first').toContainText(/\(you\)/i)
      for (const p of bill.people) {
        const card = page.locator('.bl-person').filter({ hasText: p.name })
        await expect(card.locator('.bl-person-head')).toContainText(money(p.amount_due))
        for (const i of p.items) await expect(card.locator('.bl-item').filter({ hasText: `${i.qty}× ${i.name}` })).toContainText(money(i.line_total))
      }
      expect(bill.people.reduce((s, p) => s + p.amount_due, 0)).toBeCloseTo(bill.total, 1)
      const totals = page.getByLabel('Bill summary')
      await expect(totals).toContainText(`Subtotal${money(bill.subtotal)}`)
      await expect(totals).toContainText(`VAT (18%)${money(bill.tax_total)}`)
      await expect(totals).toContainText(`Total${money(bill.total)}`)
    })
  })

  test('split: own / equal / all show the server amounts, and they add up to the bill for two guests', async ({ ui }) => {
    test.setTimeout(150_000)
    await F.withTable(ui, { orders: 1 }, async ({ g1, g2, table, ...A }) => {
      await dinner({ g1, g2, table, ...A }, table, TWO)
      const [one, two] = [await openBill(ui, 'g1', table), await openBill(ui, 'g2', table)]
      const [b1, b2] = [await myBill(g1), await myBill(g2)]
      expect(b1.modes.own + b2.modes.own, 'own shares of both guests').toBeCloseTo(b1.total, 1)
      expect(b1.modes.equal * 2, 'two equal shares').toBeCloseTo(b1.total, 1)
      expect(b1.modes.all, 'pay for everyone').toBeCloseTo(b1.total, 2)
      for (const [g, bill] of [[one, b1], [two, b2]]) {
        await expect(g.page.getByRole('radiogroup', { name: 'Split the bill' })).toBeVisible()
        for (const [mode, label] of [['own', /^Pay my own/], ['equal', /^Split equally \(2\)/], ['all', /^Pay for everyone/]]) {
          const r = radio(g.page, label)
          await expect(r).toContainText(money(bill.modes[mode]))
          await r.click()
          await expect(r).toHaveAttribute('aria-checked', 'true')
          await expect(payBar(g.page)).toContainText(`Your share ${money(bill.modes[mode])}`)
        }
      }
    })
  })

  test('tips: No tip / 5 / 10 / 15 % / custom (validated) and the waiter pick', async ({ ui }) => {
    test.setTimeout(150_000)
    await F.withTable(ui, { orders: 1 }, async ({ g1, table, ...A }) => {
      await dinner({ g1, table, ...A }, table)
      const { page } = await openBill(ui, 'g1', table)
      const share = (await myBill(g1)).modes.own
      const waiters = (await g1.rpc('list_table_waiters', { p_table_id: table.id })).body
      await expect(page.getByText('Tips can be added with the card payment.')).toBeVisible()   // reception is preselected: no tip, no waiter
      await radio(page, /Card \(demo\)/).click()
      const group = page.getByRole('radiogroup', { name: 'Add a tip' })
      await expect(page.getByRole('radiogroup', { name: 'Who gets the tip?' }), 'no waiter pick without a tip').toHaveCount(0)
      for (const pct of [5, 10, 15]) {
        const chip = group.getByRole('radio', { name: new RegExp(`^${pct}%`) })
        await chip.click()
        await expect(chip).toHaveAttribute('aria-checked', 'true')
        await expect(chip).toContainText(money(tipFor(share, pct)))
        await expect(page.getByText(`Tip: ${money(tipFor(share, pct))}`)).toBeVisible()
        await expect(payBar(page)).toContainText(`+ tip ${money(tipFor(share, pct))}`)
        await expect(payBar(page).getByRole('button')).toContainText(`Pay ${money(share + tipFor(share, pct))}`)
      }
      const picker = page.getByRole('radiogroup', { name: 'Who gets the tip?' })
      await expect(picker.getByRole('radio')).toHaveCount(waiters.length + 1)
      await expect(picker.getByRole('radio').last(), 'the whole team is the default').toHaveAttribute('aria-checked', 'true')
      await picker.getByRole('radio').nth(1).click()
      await expect(picker.getByRole('radio').nth(1)).toHaveAttribute('aria-checked', 'true')
      await expect(picker.getByRole('radio').last()).toHaveAttribute('aria-checked', 'false')

      const pay = payBar(page).getByRole('button')
      await group.getByRole('radio', { name: 'Custom' }).click()
      const custom = page.getByLabel('Custom tip (₼)')
      for (const bad of ['abc', '1000', '1.234']) {
        await custom.fill(bad)
        await expect(page.getByText('Enter an amount from 0 to 999.99'), `"${bad}" is not a tip`).toBeVisible()
        await expect(pay).toBeDisabled()
      }
      await custom.fill('2,5')   // a comma is accepted
      await expect(page.getByText('Tip: ₼2.50')).toBeVisible()
      await expect(pay).toContainText(`Pay ${money(share + 2.5)}`)
      await custom.fill('999.99')
      await expect(pay).toBeEnabled()
      await custom.fill('0')
      await expect(pay).toContainText(`Pay ${money(share)}`)
      await group.getByRole('radio', { name: 'No tip' }).click()
      await expect(page.getByRole('radiogroup', { name: 'Who gets the tip?' })).toHaveCount(0)
      await radio(page, /Pay at reception/).click()
      await expect(page.getByText('Tips can be added with the card payment.')).toBeVisible()
    })
  })
})

test.describe('bills: paying', TAGS, () => {
  test('Card (demo): DEMO badge + notice, one payment on a double tap, settled panel, loyalty, receipt (payer / stranger / signed out)', async ({ ui, browser }, testInfo) => {
    test.setTimeout(180_000)
    await F.withTable(ui, { orders: 1 }, async ({ g1, g3, table, ...A }) => {
      await dinner({ g1, table, ...A }, table)
      const { page, consoleErrors } = await openBill(ui, 'g1', table)
      const bill = await myBill(g1)
      const waiters = (await g1.rpc('list_table_waiters', { p_table_id: table.id })).body
      const card = radio(page, /Card \(demo\)/)
      await card.click()
      await expect(card).toHaveAttribute('aria-checked', 'true')
      await expect(card.getByText('DEMO', { exact: true })).toBeVisible()
      await expect(card.getByText('Demo payment — no money moves')).toBeVisible()
      const tip = tipFor(bill.modes.own, 10)
      await page.getByRole('radiogroup', { name: 'Add a tip' }).getByRole('radio', { name: /^10%/ }).click()
      const picker = page.getByRole('radiogroup', { name: 'Who gets the tip?' })
      await picker.getByRole('radio').nth(1).click()   // the second waiter of the list, explicitly
      await page.getByRole('button', { name: /^Pay ₼/ }).click()
      const sheet = page.getByRole('dialog').or(page.locator('.sheet')).last()
      await expect(sheet.getByText('DEMO CARD •••• 4242')).toBeVisible()
      await expect(sheet.getByText('DEMO', { exact: true }).first()).toBeVisible()
      await expect(sheet).toContainText(`Your share${money(bill.modes.own)}`)
      await expect(sheet).toContainText(`Tip${money(tip)}`)
      await expect(sheet).toContainText(`To pay${money(bill.modes.own + tip)}`)
      const confirm = page.getByRole('button', { name: `Pay ${money(bill.modes.own + tip)} (demo)` })
      await confirm.evaluate(b => { b.click(); b.click() })   // two taps in the same tick: only the ref guard stops the second
      await receivedOrRecover(page, bill.id)
      const settled = page.locator('.bl-settled')
      await expect(settled.getByText('DEMO', { exact: true })).toBeVisible()
      await expect(settled.getByText('Demo payment — no money moves')).toBeVisible()
      await expect(settled.getByText('Bill settled', { exact: true })).toBeVisible()
      await expect(settled.getByText(/\+\d+ Resto-Credits/), 'loyalty earned is shown').toBeVisible()

      const intents = await g1.rows(`payment_intents?bill_id=eq.${bill.id}&select=status,amount,tip_amount,tip_staff_id,provider`)
      expect(intents, 'a double tap makes exactly one payment').toHaveLength(1)
      expect(intents[0]).toMatchObject({ status: 'succeeded', provider: 'demo', tip_amount: tip, tip_staff_id: waiters[1].staff_id })
      expect(Number(intents[0].amount)).toBeCloseTo(bill.modes.own + tip, 2)
      const final = (await g1.rpc('bill_detail', { p_bill_id: bill.id })).body   // the paid tip is part of the bill total now
      expect(final).toMatchObject({ status: 'settled' })

      await page.getByRole('link', { name: 'View receipt' }).click()
      await expect(page).toHaveURL(url(`/receipt/${bill.id}`))
      const receipt = page.getByRole('article', { name: 'Receipt' })
      await expect(receipt).toContainText('Trattoria Bella Roma')
      await expect(receipt).toContainText(PENNE)
      await expect(receipt).toContainText(money(final.total))
      await expect(page.locator('.bl-r-pay')).toHaveCount(1)
      await expect(page.locator('.bl-r-pay').getByText('DEMO', { exact: true })).toBeVisible()

      const stranger = await ui.open('g3')   // not at this table, not on this bill
      await stranger.page.goto(url(`/receipt/${bill.id}`))
      await expect(stranger.page.getByText('Receipt not found', { exact: true })).toBeVisible()
      const context = await browser.newContext({ storageState: testInfo.project.use.storageState })
      try {
        const anon = await context.newPage()
        await anon.goto(url(`/receipt/${bill.id}`))
        await expect(anon.getByText('Sign in to see your bill', { exact: true })).toBeVisible()
      } finally { await context.close() }
      expect(consoleErrors, 'console errors of the payer').toEqual([])
    })
  })

  test('Card (demo) on a flaky connection (realtime down): the guest still learns that the payment went through', async ({ ui }) => {
    test.setTimeout(120_000)
    await F.withTable(ui, { orders: 1 }, async ({ g1, table, ...A }) => {
      await dinner({ g1, table, ...A }, table)
      const { page } = await ui.open('g1', { blockRealtime: true })   // the socket opens, no event ever arrives
      await F.joinTable(page, table.code)
      await page.getByRole('link', { name: /^View bill/ }).click()
      await expect(page.getByRole('heading', { name: 'Your bill' })).toBeVisible()
      const bill = await myBill(g1)
      await (await payByCard(page)).click()
      await expect.poll(async () => (await g1.rpc('bill_detail', { p_bill_id: bill.id })).body.status, 'the payment itself succeeds').toBe('settled')
      await expect(page.getByRole('heading', { name: 'Payment received' }),
        'the payment went through but the screen never says so (my_bill answers no_session after the settlement and the old bill stays on screen)').toBeVisible({ timeout: 25_000 })
      await expect(page.getByRole('button', { name: /^Pay ₼/ }), 'a settled bill must not offer to pay again').toHaveCount(0)
    })
  })

  test('split equally: both guests pay by card; the shares add up; receipt for the table mate too', async ({ ui }) => {
    test.setTimeout(240_000)
    await F.withTable(ui, { orders: 1 }, async ({ g1, g2, g3, table, ...A }) => {
      await dinner({ g1, g2, table, ...A }, table, TWO)
      const [one, two] = [await openBill(ui, 'g1', table), await openBill(ui, 'g2', table)]
      const bill = await myBill(g1)
      const equal = bill.modes.equal

      await radio(one.page, /^Split equally \(2\)/).click()
      await (await payByCard(one.page)).click()
      await receivedOrRecover(one.page, bill.id)
      await expect(one.page.getByText('Waiting for 1 person')).toBeVisible()
      await expect(one.page.locator('.bl-waiting-row')).toContainText(`Murad`)

      // the mate's screen follows: the split is locked to the plan, their share is the server's equal amount
      await expect(radio(two.page, /^Split equally \(2\)/)).toHaveAttribute('aria-checked', 'true', { timeout: 15_000 })
      await expect(radio(two.page, /^Pay my own/)).toBeDisabled()
      const tip = tipFor(equal, 5)
      await radio(two.page, /Card \(demo\)/).click()
      await two.page.getByRole('radiogroup', { name: 'Add a tip' }).getByRole('radio', { name: /^5%/ }).click()
      await two.page.getByRole('button', { name: /^Pay ₼/ }).click()
      await two.page.getByRole('button', { name: `Pay ${money(equal + tip)} (demo)` }).click()
      await receivedOrRecover(two.page, bill.id)
      await expect(two.page.getByText('Bill settled', { exact: true })).toBeVisible()
      await expect(one.page.locator('.bl-settled').getByText('Bill settled', { exact: true }), 'the first payer sees the bill settle live').toBeVisible({ timeout: 20_000 })
      await expect(one.page.getByRole('link', { name: 'View receipt' })).toBeVisible()

      const paid = (await g1.rows(`payment_intents?bill_id=eq.${bill.id}&status=eq.succeeded&select=amount,tip_amount`))
      expect(paid).toHaveLength(2)
      expect(paid.reduce((s, p) => s + Number(p.amount) - Number(p.tip_amount), 0), 'shares paid = the bill').toBeCloseTo(bill.total, 1)
      expect(paid.reduce((s, p) => s + Number(p.tip_amount), 0)).toBeCloseTo(tip, 2)
      const final = (await g1.rpc('bill_detail', { p_bill_id: bill.id })).body
      expect(final.total, 'bill total = food + tips paid').toBeCloseTo(bill.total + tip, 2)

      for (const g of [one, two]) {
        await g.page.goto(url(`/receipt/${bill.id}`))
        await expect(g.page.getByRole('article', { name: 'Receipt' })).toContainText(money(final.total))
        await expect(g.page.locator('.bl-r-pay')).toHaveCount(2)
      }
      const stranger = await ui.open('g3')
      await stranger.page.goto(url(`/receipt/${bill.id}`))
      await expect(stranger.page.getByText('Receipt not found', { exact: true })).toBeVisible()
    })
  })

  // create_payment_intent(p_mode) is honoured only for the person who opened the bill, the table host and floor staff (sql/52);
  // for everyone else it is ignored. g1 is the table host and opens the bill, so g1 pays for everyone and g2 is the covered mate.
  test('pay for everyone: the host\'s one payment covers the table, the mate\'s screen settles without paying', async ({ ui }) => {
    test.setTimeout(180_000)
    await F.withTable(ui, { orders: 1 }, async ({ g1, g2, table, ...A }) => {
      await dinner({ g1, g2, table, ...A }, table, TWO)
      const [one, two] = [await openBill(ui, 'g1', table), await openBill(ui, 'g2', table)]
      const bill = await myBill(g1)
      await radio(one.page, /^Pay for everyone/).click()
      await (await payByCard(one.page)).click()
      await receivedOrRecover(one.page, bill.id)
      await expect(one.page.locator('.bl-settled')).toContainText(money(bill.modes.all))
      await expect(two.page.getByText('Bill settled', { exact: true }), 'the covered guest owes nothing').toBeVisible({ timeout: 20_000 })
      await expect(two.page.getByRole('heading', { name: 'Payment received' }), 'no payment of their own').toHaveCount(0)
      await expect(two.page.getByRole('link', { name: 'View receipt' })).toBeVisible()
      const paid = await g1.rows(`payment_intents?bill_id=eq.${bill.id}&status=eq.succeeded&select=amount,tip_amount`)
      expect(paid).toHaveLength(1)
      expect(Number(paid[0].amount)).toBeCloseTo(bill.total, 2)
    })
  })

  // The server ignores p_mode for a guest who neither opened the bill nor hosts the table, so the first tap on "Pay" bounces with "The amount is
  // now ₼X. Tap pay to continue." (the share is the guest's own): the choice should not be offered to them in the first place.
  test('a table mate who is not the host is not offered Pay for everyone / Split equally (the server would ignore the choice)', async ({ ui }) => {
    test.setTimeout(150_000)
    await F.withTable(ui, { orders: 1 }, async ({ g1, g2, table, ...A }) => {
      await dinner({ g1, g2, table, ...A }, table, TWO)
      await myBill(g1)   // the host opens the bill, so there is no plan yet and the mate's modes are all still selectable
      const two = await openBill(ui, 'g2', table)
      const offered = two.page.getByRole('radio', { name: /^(Pay for everyone|Split equally)/ })
      await expect(offered.first()).toBeVisible()
      for (const r of await offered.all()) {
        const off = (await r.getAttribute('aria-disabled')) === 'true' || (await r.isDisabled())
        expect.soft(off, `"${(await r.innerText()).split('\n')[0]}" is offered to a guest the server ignores it for`).toBe(true)
      }
    })
  })

  test('Pay at reception: "Staff notified", the dashboard Bills page shows the share, Mark paid flips the guest; table states follow', async ({ ui }) => {
    test.setTimeout(240_000)
    await F.withTable(ui, { orders: 1 }, async ({ g1, mgr, table, ...A }) => {
      const tables = await ui.open('manager', { staff: true })
      await tables.page.goto(rurl('/tables'))
      const chip = tables.page.locator('div[style*="border-radius: 14px"]').filter({ has: tables.page.locator('.tbl-card-title', { hasText: `Table ${table.number}` }) })
      await expect(chip.locator('.tbl-card-state')).toHaveText(/Free|Cleared/)

      await dinner({ g1, mgr, table, ...A }, table)
      // sql/53: the kitchen starting a ticket moves the order Open -> Submitted -> Preparing and the table occupied -> ordering
      expect(await F.tableState(mgr, table.id), 'the order was cooked and served: the table is Ordering').toBe('ordering')
      await expect(chip.locator('.tbl-card-state'), 'dashboard Tables page: ordering').toHaveText('Ordering', { timeout: 15_000 })
      const { page } = await openBill(ui, 'g1', table)
      const bill = await myBill(g1)
      await expect(radio(page, /Pay at reception/)).toHaveAttribute('aria-checked', 'true')
      await page.getByRole('button', { name: `Notify staff · ${money(bill.modes.own)}` }).click()
      await expect(page.getByRole('heading', { name: 'Staff notified' })).toBeVisible()
      await expect(page.getByText(`Pay ${money(bill.modes.own)} at reception.`)).toBeVisible()
      await expect(page.getByText('Please go to the reception desk.')).toBeVisible()
      expect(await F.tableState(mgr, table.id)).toBe('awaiting_payment')
      await expect(chip.locator('.tbl-card-state'), 'dashboard Tables page: awaiting payment').toHaveText('Awaiting Pay', { timeout: 15_000 })

      await tables.page.goto(rurl('/bills'))
      const dash = tables.page.locator('article.v2-bill').filter({ has: tables.page.locator('.v2-bill-table', { hasText: `Table ${table.number}` }) }).filter({ hasText: money(bill.modes.own) }).first()
      await expect(dash).toContainText(/Requested/)
      const share = dash.locator('.v2-share').filter({ hasText: 'Aysel' })
      await expect(share).toContainText('Reception')
      await expect(share).toContainText(`Owes ${money(bill.modes.own)}`)
      await expect(share.getByText('DEMO')).toHaveCount(0)
      await share.getByRole('button', { name: 'Mark paid' }).click()
      await expect(page.getByRole('heading', { name: 'Payment received' }), "the guest's screen flips").toBeVisible({ timeout: 20_000 })
      await expect(page.getByText('Bill settled', { exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: 'View receipt' })).toBeVisible()
      expect(await F.tableState(mgr, table.id)).toBe('cleared')

      await page.getByRole('button', { name: 'Leave table' }).click()
      await expect(page).toHaveURL(url('/'))
      await tables.page.goto(rurl('/tables'))
      await expect(chip.locator('.tbl-card-state')).toHaveText('Cleared')
      await chip.locator('.tbl-card-top').click()
      await chip.getByRole('button', { name: '→ Free' }).click()
      await expect(chip.locator('.tbl-card-state')).toHaveText('Free')
      await expect.poll(() => F.tableState(mgr, table.id), 'the dashboard "→ Free" frees the table').toBe('free')
    })
  })
})

test.describe('bills: after paying', TAGS, () => {
  test('review prompt: a verified review is saved and visible on the restaurant page', async ({ ui }) => {
    test.setTimeout(180_000)
    await F.withTable(ui, { orders: 1 }, async ({ g1, table, ...A }) => {
      const reviewed = new Set((await g1.rows(`reviews?user_id=eq.${g1.uid}&select=dish_id`)).map(r => r.dish_id))
      const dishes = await g1.rows(`dishes?restaurant_id=eq.${F.BELLA}&available=eq.true&select=id,name&order=name`)
      const dish = dishes.find(d => !reviewed.has(d.id))
      test.skip(!dish, 'review1 has reviewed every Bella Roma dish already')
      await dinner({ g1, table, ...A }, table, { lines1: [[dish.name, 1]] })
      const bill = await myBill(g1)
      await payApi(g1, bill.id)
      const { page } = await ui.open('g1')
      await page.goto(url(`/bill/${bill.id}`))   // the bill is settled: the settled panel and the review prompt
      await expect(page.getByRole('heading', { name: 'How was your meal?' })).toBeVisible()
      await expect(page.locator('.bl-review-row')).toContainText(dish.name)
      await page.getByRole('button', { name: 'Send review' }).click()
      await expect(page.getByText('Rate at least one dish to send your review.')).toBeVisible()
      await page.getByRole('radio', { name: `Rate ${dish.name}: 4 of 5` }).click()
      const text = `e2e review ${Date.now()}`
      await page.getByRole('textbox', { name: 'Add a comment (optional)' }).fill(text)
      await page.getByRole('button', { name: 'Send review' }).click()
      await expect(page.getByText('Thanks for your review!')).toBeVisible()
      await expect(page.getByText('Verified visit')).toBeVisible()
      try {
        const [row] = await g1.rows(`reviews?user_id=eq.${g1.uid}&dish_id=eq.${dish.id}&select=id,rating,body,is_verified`)
        expect(row).toMatchObject({ rating: 4, body: text, is_verified: true })

        await page.goto(url('/restaurant/bella-roma'))
        await page.locator('.menu-card').filter({ hasText: dish.name }).first().click()
        const sheet = page.locator('.sheet')
        const body = sheet.getByText(text)
        await expect(body, 'the review is listed on the dish').toBeVisible()
        // other reviews of the dish can carry the pill too: look at the header row (previous sibling) of THIS review
        await expect(body.locator('xpath=preceding-sibling::div[1]').getByText(/verified/i), 'the restaurant page marks the review as a verified visit').toBeVisible({ timeout: 3_000 })
      } finally { await g1.del(`reviews?user_id=eq.${g1.uid}&dish_id=eq.${dish.id}`) }   // meant to keep the dish reviewable; since sql/52 a guest has no DELETE on reviews (403), so every run uses up one dish of review1 (23 at Bella Roma, the test skips when none is left)
    })
  })
})
