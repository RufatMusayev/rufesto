// Consumer TABLE features, one by one, as the Bella Roma review guests review1-3 (docs/REVIEW-ACCOUNTS.md) against CONSUMER_URL, with
// the Bella staff on RESTO_URL (waiter1 = Waiter page, kitchen = KDS, manager = Orders / Tables). Runs on the desktop and the `mobile`
// project (guest pages use the project's device; the dashboard always uses a desktop window). Every test is independent: it takes the
// guest lock, picks a FREE Bella Roma table (never T5 = QA_TABLE_CODE), seats the guests over the API where the seating is not the
// thing under test, and resets the table in `finally`. App bugs stay failing tests (documented in docs/qa/consumer-table.md).
const F = require('../support/feat-table')
const { test, expect, url, rurl } = F

test.skip(!F.haveAccounts, 'docs/REVIEW-ACCOUNTS.md must list review1-3 and the Bella Roma manager / waiter1 / kitchen accounts')
test.describe.configure({ mode: 'default', timeout: 90_000 })   // in order inside this file; every test sets itself up, so a failure never cascades
const TAGS = { tag: ['@guest', '@staff', '@consumer', '@feat'] }
const PENNE = 'Penne alla Norma'

const { actors, withTable } = F

const claimError = page => page.locator('.claim-card')
const partyOf = page => page.locator('div[style*="border-radius: 12px"]').filter({ hasText: 'At This Table' })
const callButton = page => page.locator('.table-call-btn')
const orderBadge = page => page.locator('.stagger-item').first()

test.describe('table: joining', TAGS, () => {
  test('signed out: /t/<code> shows the sign-in gate and seats nobody', async ({ ui, browser }, testInfo) => {
    const A = await actors()
    const table = await F.pickTable({ mgr: A.mgr, guests: [] })
    test.skip(!table, 'no free Bella Roma table right now')
    const context = await browser.newContext({ storageState: testInfo.project.use.storageState, viewport: testInfo.project.use.viewport, isMobile: testInfo.project.use.isMobile, hasTouch: testInfo.project.use.hasTouch })
    try {
      const page = await context.newPage()
      await page.goto(url(`/t/${table.code}`))
      await expect(page.getByRole('heading', { name: 'Sign in to join your table' })).toBeVisible()
      await expect(page.getByText("Sign in and we'll seat you at the table you just scanned.")).toBeVisible()
      await expect(page.getByRole('button', { name: 'Sign in' }).first()).toBeVisible()
      await expect(page.getByRole('heading', { name: 'Welcome back' }), 'the sign-in sheet opens by itself').toBeVisible()
      await expect(page.getByRole('button', { name: 'Join', exact: true })).toHaveCount(0)
      expect(['free', 'cleared'], 'visiting the link must not seat anyone').toContain(await F.tableState(A.mgr, table.id))
      await page.goto(url('/t/bad%20code!'))
      await expect(page.getByRole('heading', { name: "This table link isn't valid" })).toBeVisible()
      await page.getByRole('link', { name: 'Enter a table code instead' }).click()
      await expect(page).toHaveURL(url('/table'))
    } finally { await context.close() }
  })

  test('Join card: a wrong code is refused, Cancel seats nobody, Join seats the guest as host', async ({ ui }) => {
    await withTable(ui, {}, async ({ g1, mgr, table }) => {
      const { page, consoleErrors } = await ui.open('g1')
      await F.claimByLink(page, 'BELLA-ZZZZZZ')
      await expect(claimError(page).getByRole('heading', { name: "Couldn't join this table" })).toBeVisible()
      await expect(claimError(page)).toContainText('Invalid table code')
      await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Enter a table code instead' })).toBeVisible()

      await page.goto(url(`/t/${table.code}`))
      await expect(page.getByRole('heading', { name: 'Join this table?' })).toBeVisible()
      await expect(page.getByText("We'll seat you here, and you can order from your phone.")).toBeVisible()
      await page.getByRole('button', { name: 'Cancel' }).click()
      await expect(page).toHaveURL(url('/'))
      expect((await g1.rpc('my_table_session')).body, 'Cancel must not seat the guest').toBeNull()
      expect(['free', 'cleared']).toContain(await F.tableState(mgr, table.id))

      await F.joinTable(page, table.code)
      await expect(page.getByText(`#${table.number} · Trattoria Bella Roma`)).toBeVisible()
      await expect(page.getByText(/^active$/i)).toBeVisible()
      await expect(page.getByText('No orders yet')).toBeVisible()
      await expect(page.getByRole('link', { name: 'Add More Items' })).toBeVisible()
      const mine = (await g1.rpc('my_table_session')).body
      expect(mine).toMatchObject({ table_id: table.id, session_status: 'active', is_host: true, seat_no: null })
      expect(await F.tableState(mgr, table.id)).toBe('occupied')
      expect(consoleErrors.filter(e => !/status of 400/.test(e)), 'console errors on the join flow').toEqual([])
    })
  })

  test('manual code entry on /table: a lower-case code seats the guest', async ({ ui }) => {
    await withTable(ui, {}, async ({ g1, table }) => {
      const { page } = await ui.open('g1')
      await page.goto(url('/table'))
      await expect(page.getByText('No Active Table')).toBeVisible()
      await page.getByPlaceholder('e.g. BELLA-T2').fill(table.code.toLowerCase())
      await page.getByRole('button', { name: 'Join Table' }).click()
      await expect(page.getByRole('heading', { name: 'Your Table' })).toBeVisible()
      expect((await g1.rpc('my_table_session')).body?.table_id).toBe(table.id)
    })
  })

  test('End Session: the table screen empties and the table becomes free', async ({ ui }) => {
    await withTable(ui, {}, async ({ mgr, table }) => {
      const { page } = await ui.open('g1')
      await F.joinTable(page, table.code)
      await page.getByRole('button', { name: 'End Session' }).click()
      await expect(page.getByText('No Active Table')).toBeVisible()
      await expect.poll(() => F.tableState(mgr, table.id), 'table state after the only guest ends the session').toMatch(/^(free|cleared)$/)
    })
  })

  test('a table session is restored in a new tab or browser session (from the server)', async ({ ui }) => {
    await withTable(ui, {}, async ({ table }) => {
      const first = await ui.open('g1')
      await F.joinTable(first.page, table.code)
      const second = await ui.open('g1')   // same account, fresh sessionStorage: another tab, the installed app, a returning visit
      await second.page.goto(url('/table'))
      await expect(second.page.getByRole('heading', { name: 'Your Table' }), 'the guest is still seated, the app must show the table').toBeVisible({ timeout: 8_000 })
    })
  })
})

test.describe('table: seat codes', TAGS, () => {
  test('<code>-S2 seats the guest on chair 2 and the floor plan shows it; another seat code moves the guest', async ({ ui }) => {
    await withTable(ui, { minCapacity: 4 }, async ({ g1, g2, table }) => {
      const { page } = await ui.open('g1')
      await F.joinTable(page, `${table.code}-S2`)
      expect((await g1.rpc('my_table_session')).body).toMatchObject({ seat_no: 2, is_host: true })

      const seats = async n => { await page.goto(url('/restaurant/bella-roma')); await page.getByRole('button', { name: 'Floor plan' }).click(); await page.getByRole('button', { name: new RegExp(`^Table ${table.number},`) }).click(); return page.locator('.fl-detail') }
      let detail = await seats()
      await expect(detail).toContainText("You're here · seat 2")
      await expect(detail.getByLabel('Seat 2, yours')).toBeVisible()
      await expect(detail.getByLabel('Seat 1, free')).toBeVisible()

      await F.seatGuest(g2, `${table.code}-S3`, g1)   // a second guest on chair 3 (approved by the host over the API)
      detail = await seats()
      await expect(detail.getByLabel('Seat 3, taken')).toBeVisible()

      await page.goto(url('/table'))   // sessionStorage still holds the table
      await F.claimByLink(page, `${table.code}-S4`)
      await expect(page).toHaveURL(url('/table'))
      expect((await g1.rpc('my_table_session')).body.seat_no, 're-scanning another chair moves the guest').toBe(4)
      detail = await seats()
      await expect(detail.getByLabel('Seat 4, yours')).toBeVisible()
      await expect(detail.getByLabel('Seat 2, free')).toBeVisible()
    })
  })

  /** What the guest is told when `typed` is refused, on each entry point: the QR link, the /table code form, the in-app QR sheet. */
  async function refusals(ui, key, typed) {
    const { page } = await ui.open(key)
    await F.claimByLink(page, typed)
    await expect(claimError(page).getByRole('heading', { name: "Couldn't join this table" })).toBeVisible()
    const link = await claimError(page).locator('.state-body').innerText()
    await page.goto(url('/table'))
    await page.getByPlaceholder('e.g. BELLA-T2').fill(typed)
    await page.getByRole('button', { name: 'Join Table' }).click()
    const form = await page.locator('form + p').innerText()
    await page.setViewportSize({ width: 390, height: 844 })   // the Scan QR button lives in the bottom nav (<= 768px)
    await page.goto(url('/'))
    await page.getByRole('button', { name: 'Scan QR' }).click()
    await page.getByRole('button', { name: 'Enter code manually' }).click()
    await page.getByPlaceholder('Paste table token (UUID)').fill(typed)
    await page.getByRole('button', { name: 'Find Table' }).click()
    const sheet = await page.locator('.sheet form p').innerText()
    return { 'QR link page': link, '/table code form': form, 'QR sheet': sheet }
  }

  test('an invalid seat (-S99) is refused with a message that names the seat (link, code form, QR sheet)', async ({ ui }) => {
    test.setTimeout(90_000)
    await withTable(ui, { minCapacity: 2 }, async ({ g2, table }) => {
      const said = await refusals(ui, 'g2', `${table.code}-S99`)
      expect((await g2.rpc('my_table_session')).body, 'an invalid seat must not seat the guest').toBeNull()
      for (const [where, text] of Object.entries(said)) expect.soft(text, `${where} (the server says invalid_seat)`).toMatch(/seat|chair/i)
    })
  })

  test('a seat held by another guest is refused with a message (seat_taken: link, code form, QR sheet)', async ({ ui }) => {
    test.setTimeout(90_000)
    await withTable(ui, { minCapacity: 2 }, async ({ g1, g2, table }) => {
      await F.seatGuest(g1, `${table.code}-S2`)
      const said = await refusals(ui, 'g2', `${table.code}-S2`)
      expect((await g2.rpc('my_table_session')).body, 'a taken seat must not seat the second guest').toBeNull()
      for (const [where, text] of Object.entries(said)) expect.soft(text, `${where} (the server says seat_taken)`).toMatch(/seat|chair/i)
    })
  })

  test('a pending guest holds the chair too: a third guest cannot take it (API: seat_taken)', async ({ ui }) => {
    await withTable(ui, { minCapacity: 3 }, async ({ g1, g2, g3, table }) => {
      await F.seatGuest(g1, table.code)
      expect((await g2.rpc('claim_table', { p_code: `${table.code}-S3` })).body).toMatchObject({ session_status: 'pending', seat_no: 3 })
      const taken = await g3.rpc('claim_table', { p_code: `${table.code}-S3` })
      expect(taken.ok).toBe(false)
      expect(taken.error).toContain('seat_taken')
    })
  })
})

test.describe('table: party', TAGS, () => {
  test('QR sheet manual entry takes a bare code and a pasted table link; pending guests wait; the host approves / declines live', async ({ ui }) => {
    test.setTimeout(180_000)
    await withTable(ui, { minCapacity: 4 }, async ({ g1, g2, g3, table }) => {
      const host = await ui.open('g1')
      await F.joinTable(host.page, table.code)

      const viaQrSheet = async (key, typed) => {
        const guest = await ui.open(key)
        await guest.page.setViewportSize({ width: 390, height: 844 })   // the Scan QR button lives in the bottom nav (<= 768px)
        await guest.page.goto(url('/'))
        await guest.page.getByRole('button', { name: 'Scan QR' }).click()
        await expect(guest.page.getByRole('heading', { name: 'Scan Table QR' })).toBeVisible()
        await guest.page.getByRole('button', { name: 'Enter code manually' }).click()
        await guest.page.getByPlaceholder('Paste table token (UUID)').fill(typed)
        await guest.page.getByRole('button', { name: 'Find Table' }).click()
        await expect(guest.page.getByRole('heading', { name: 'Request Sent' })).toBeVisible()
        await expect(guest.page.getByText("We'll seat you as soon as the host approves your request.")).toBeVisible()
        await expect(guest.page.locator('.overlay'), 'the sheet closes by itself').toHaveCount(0, { timeout: 5_000 })
        await guest.page.goto(url('/table'))   // sessionStorage kept the table: the waiting screen
        await expect(guest.page.getByRole('heading', { name: /^Waiting for Aysel to let you in/ })).toBeVisible()
        await expect(guest.page.getByRole('button', { name: 'Cancel' })).toBeVisible()
        return guest
      }
      const murad = await viaQrSheet('g2', table.code.toLowerCase())                  // a bare code, any case
      const leyla = await viaQrSheet('g3', `${F.CONSUMER_URL}/t/${table.code}-S3`)   // the full link a QR encodes (+ chair 3)
      expect((await g3.rpc('my_table_session')).body).toMatchObject({ session_status: 'pending', seat_no: 3 })

      // host: both requests show up live (notification / session realtime, poll as the fallback is 10 s)
      await expect(host.page.getByText('Pending requests')).toBeVisible({ timeout: 20_000 })
      const row = name => host.page.locator('div').filter({ has: host.page.getByRole('button', { name: 'Approve' }) }).filter({ hasText: name }).last()
      await expect(row('Murad')).toBeVisible()
      await expect(row('Leyla')).toBeVisible()

      await row('Leyla').getByRole('button', { name: 'Decline' }).click()
      await expect(leyla.page.getByRole('heading', { name: 'Not approved' })).toBeVisible({ timeout: 15_000 })
      await expect(leyla.page.getByText("The host didn't approve your request to join this table.")).toBeVisible()
      await expect(leyla.page.getByText('No Active Table'), 'the declined guest is sent back to the code screen').toBeVisible({ timeout: 10_000 })
      await F.claimByLink(leyla.page, table.code)
      await expect(claimError(leyla.page)).toContainText("The host didn't approve your last request to join this table.")

      await row('Murad').getByRole('button', { name: 'Approve' }).click()
      await expect(murad.page.getByRole('heading', { name: 'Your Table' }), 'the approved guest is seated live').toBeVisible({ timeout: 15_000 })
      expect((await g2.rpc('my_table_session')).body).toMatchObject({ session_status: 'active', is_host: false })
      await expect(host.page.getByText('Pending requests')).toHaveCount(0)
    })
  })

  test('party list names everybody at the table with their seat', async ({ ui }) => {
    await withTable(ui, { minCapacity: 4 }, async ({ g1, g2, g3, table }) => {
      await F.seatGuest(g1, `${table.code}-S1`)
      await F.seatGuest(g2, `${table.code}-S2`, g1)
      await F.seatGuest(g3, `${table.code}-S3`, g1)
      const host = await ui.open('g1')
      await F.joinTable(host.page, table.code)
      const party = partyOf(host.page)
      await expect(party).toContainText('Aysel', { timeout: 15_000 })
      await expect(party).toContainText('Murad')
      await expect(party).toContainText('Leyla')
      await expect(party.getByText('Host', { exact: true })).toBeVisible()
      await expect(party, 'the party list shows each guest on their chair (table_party returns seat_no)').toContainText(/seat\s*2/i)
      await expect(party).toContainText(/seat\s*3/i)
    })
  })

  test('a guest who ends their session disappears from the host\'s party list live', async ({ ui }) => {
    test.setTimeout(120_000)
    await withTable(ui, { minCapacity: 2 }, async ({ g1, g2, table }) => {
      await F.seatGuest(g1, table.code)
      await F.seatGuest(g2, table.code, g1)
      const host = await ui.open('g1')
      const mate = await ui.open('g2')
      await F.joinTable(host.page, table.code)
      await F.joinTable(mate.page, table.code)
      await expect(partyOf(host.page)).toContainText('Murad', { timeout: 15_000 })
      await expect(partyOf(mate.page).getByText('(You)')).toBeVisible()
      await mate.page.getByRole('button', { name: 'End Session' }).click()
      await expect(mate.page.getByText('No Active Table')).toBeVisible()
      await expect(host.page.getByText('At This Table'), 'the host\'s list drops the guest who left').toHaveCount(0, { timeout: 20_000 })
    })
  })
})

test.describe('table: call waiter', TAGS, () => {
  test('four kinds; a call reaches the Waiter page; On my way and Done reflect back on the guest\'s screen', async ({ ui }) => {
    test.setTimeout(240_000)
    await withTable(ui, { minCapacity: 4, exclude: [] }, async ({ g1, g2, g3, mgr, table }) => {
      await F.seatGuest(g1, table.code)
      await F.seatGuest(g2, table.code, g1)
      await F.seatGuest(g3, table.code, g1)
      const guests = { g1: await ui.open('g1'), g2: await ui.open('g2'), g3: await ui.open('g3') }
      for (const g of Object.values(guests)) await F.joinTable(g.page, table.code)
      const waiter = await ui.open('waiter', { staff: true })
      await waiter.page.goto(rurl('/waiter'))
      await waiter.page.getByRole('button', { name: /^Calls \(\d+\)/ }).click()
      const call = label => F.dashCard(waiter.page).filter({ hasText: `Table ${table.number}` }).filter({ has: waiter.page.getByText(label, { exact: true }) })

      const p1 = guests.g1.page
      await callButton(p1).click()
      for (const kind of ['Need help', 'Water', 'Cutlery', 'Clear the table']) await expect(p1.getByRole('button', { name: new RegExp(kind) }), `kind "${kind}"`).toBeVisible()
      await p1.getByRole('button', { name: /Water/ }).click()
      await expect(callButton(p1)).toContainText('Waiter called')
      await expect(call('Water')).toBeVisible({ timeout: 20_000 })
      await call('Water').getByRole('button', { name: 'On my way' }).click()
      await expect(callButton(p1), 'On my way reflects back').toContainText('On the way', { timeout: 15_000 })
      await call('Water').getByRole('button', { name: 'Done', exact: true }).click()
      await expect(call('Water')).toHaveCount(0)
      await expect(callButton(p1), 'Done clears the call; the button waits out the 2-minute cooldown').toContainText(/Wait \d+s/, { timeout: 15_000 })

      await guests.g2.page.locator('.table-call-btn').click()
      await guests.g2.page.getByRole('button', { name: /Cutlery/ }).click()
      await expect(call('Cutlery')).toBeVisible({ timeout: 20_000 })
      await call('Cutlery').getByRole('button', { name: 'Done', exact: true }).click()
      await guests.g3.page.locator('.table-call-btn').click()
      await guests.g3.page.getByRole('button', { name: /Need help/ }).click()
      await expect(call('Needs help')).toBeVisible({ timeout: 20_000 })
      await call('Needs help').getByRole('button', { name: 'Done', exact: true }).click()

      // the fourth kind, "Clear the table": the 2-minute cooldown is per guest AND table, so g2 asks from another free table
      const other = await F.pickTable({ mgr, guests: [g2], minCapacity: 2, orders: 0 })
      if (other) {
        try {
          await F.seatGuest(g2, other.code)
          const p2 = guests.g2.page
          await F.joinTable(p2, other.code)
          await callButton(p2).click()
          await p2.getByRole('button', { name: /Clear the table/ }).click()
          await expect(F.dashCard(waiter.page).filter({ hasText: `Table ${other.number}` }).filter({ has: waiter.page.getByText('Clear table', { exact: true }) })).toBeVisible({ timeout: 20_000 })
        } finally { await F.resetTable({ ...(await actors()), tableId: other.id }) }
      } else test.info().annotations.push({ type: 'note', description: 'no second free table: the "Clear the table" call was not exercised' })
    })
  })

  test('a second call within two minutes is refused with a message', async ({ ui }) => {
    await withTable(ui, {}, async ({ g1, table }) => {
      await F.seatGuest(g1, table.code)
      expect((await g1.rpc('call_waiter', { p_table_id: table.id, p_kind: 'assist' })).ok).toBe(true)
      const { page } = await ui.open('g1')   // fresh page: no local cooldown, the server decides
      await F.joinTable(page, table.code)
      await expect(callButton(page)).toContainText('Waiter called')   // the open request is shown live
      await page.reload()
      await callButton(page).click()
      await page.getByRole('button', { name: /Water/ }).click()
      await expect(page.getByText('You just called — the waiter is coming.')).toBeVisible()
    })
  })
})

test.describe('table: cart, order and kitchen', TAGS, () => {
  test('cart: quantity + / −, remove, notes and the total', async ({ ui }) => {
    await withTable(ui, {}, async ({ g1, mgr, table }) => {
      const { page } = await ui.open('g1')
      await F.joinTable(page, table.code)
      await F.openMenu(page)
      const penne = await F.dish(g1, PENNE)
      const cappu = await F.dish(g1, 'Cappuccino')
      await F.addToCart(page, PENNE)
      const sheet = F.cartSheet(page)
      const qty = name => sheet.locator('.cart-row').filter({ hasText: name }).locator('.cart-qty-num')
      await sheet.getByRole('button', { name: `Add one more ${PENNE}` }).click()
      await expect(qty(PENNE)).toHaveText('2')
      await expect(sheet.locator('.cart-row').filter({ hasText: PENNE })).toContainText(F.money(penne.price * 2))
      await sheet.getByRole('button', { name: `Remove one ${PENNE}` }).click()
      await expect(qty(PENNE)).toHaveText('1')
      await sheet.getByRole('button', { name: `Add one more ${PENNE}` }).click()
      await sheet.getByRole('button', { name: 'Close' }).click()   // a second dish
      await F.addToCart(page, 'Cappuccino')
      await expect(sheet.locator('.cart-row')).toHaveCount(2)
      // the button shows what will be charged: the food plus VAT (the rows above stay the dish prices)
      await expect(sheet.getByRole('button', { name: /^Place Order/ })).toContainText(F.money(await F.withVat(mgr, penne.price * 2 + cappu.price)))
      await sheet.getByRole('button', { name: `Remove ${PENNE} from the order` }).click()
      await expect(sheet.locator('.cart-row')).toHaveCount(1)
      await sheet.getByRole('button', { name: 'Remove one Cappuccino' }).click()   // qty 1 -> removes the line
      await expect(sheet.getByText('Your cart is empty')).toBeVisible()
      await expect(sheet.getByRole('button', { name: /^Place Order/ })).toHaveCount(0)
    })
  })

  test('cart: a note for the kitchen (when the cart offers one)', async ({ ui }) => {
    await withTable(ui, { orders: 1 }, async ({ g1, mgr, kitchen, table }) => {
      const { page } = await ui.open('g1')
      await F.joinTable(page, table.code)
      await F.openMenu(page)
      await F.addToCart(page, PENNE)
      const note = F.cartSheet(page).locator('textarea, input[type="text"], input:not([type])').first()
      test.skip(!(await note.count()), 'not offered: the cart has no note field and place_order is called with p_notes = null')
      await note.fill('no cheese, please')
      await F.cartSheet(page).getByRole('button', { name: /^Place Order/ }).click()
      await expect(F.cartSheet(page).getByRole('heading', { name: 'Order placed!' })).toBeVisible()
      const [order] = await g1.rows(`orders?table_id=eq.${table.id}&user_id=eq.${g1.uid}&select=id,notes,order_items(special_request)`)
      expect(JSON.stringify(order)).toContain('no cheese')
    })
  })

  test('Place Order: confirmation panel, the total matches the cart, the order reaches Orders and the kitchen board', async ({ ui }) => {
    test.setTimeout(150_000)
    await withTable(ui, { orders: 1 }, async ({ g1, table }) => {
      const guest = await ui.open('g1')
      const page = guest.page
      await F.joinTable(page, table.code)
      await F.openMenu(page)
      await F.addToCart(page, PENNE)
      const sheet = F.cartSheet(page)
      await sheet.getByRole('button', { name: `Add one more ${PENNE}` }).click()
      const place = sheet.getByRole('button', { name: /^Place Order/ })
      const cartTotal = F.num((await place.innerText()).split('·')[1])
      await ui.snap('cart-before-placing')
      const placed = page.waitForResponse(r => r.request().method() === 'POST' && /\/rpc\/place_order/.test(r.url()))
      await place.click()
      const res = await placed
      expect(res.ok(), `place_order: ${res.ok() ? '' : await res.text()}`).toBe(true)
      const order = await res.json()
      await expect(sheet.getByRole('heading', { name: 'Order placed!' })).toBeVisible()
      await expect(sheet.getByText('Your kitchen ticket is being prepared. We\'ll keep you updated.')).toBeVisible()
      await expect(sheet).toContainText(/Order #[0-9A-F]{8}/)
      const shown = F.num(await sheet.locator('.cart-placed-total').innerText())
      expect(shown, 'the confirmation shows the server total').toBeCloseTo(Number(order.total), 2)
      expect.soft(cartTotal, `the cart said ${F.money(cartTotal)}, the order costs ${F.money(shown)} (the Place Order button shows the VAT-inclusive total)`).toBeCloseTo(shown, 2)
      await sheet.getByRole('button', { name: 'Go to my table' }).click()
      await expect(page).toHaveURL(url('/table'))
      await expect(page.getByText('Order #1')).toBeVisible()
      await expect(orderBadge(page)).toContainText(/Placed/i)
      await expect(orderBadge(page)).toContainText(`${F.money(order.total)}`)
      await expect(page.getByRole('link', { name: /^View bill/ }), 'the bill is offered only once the order is served').toHaveCount(0)

      const mgr = await ui.open('manager', { staff: true })
      await mgr.page.goto(rurl('/orders'))
      const card = F.dashCard(mgr.page).filter({ hasText: 'Aysel R.' }).filter({ hasText: F.money(order.total) }).filter({ hasText: /Open/ }).first()
      await expect(card).toContainText(table.number)
      await card.locator('div[style*="cursor: pointer"]').first().click()
      await expect(card).toContainText(PENNE)
      await expect(card.getByRole('button', { name: 'Cancel' })).toBeVisible()

      const kit = await ui.open('kitchen', { staff: true })
      await kit.page.goto(rurl('/kds'))
      await expect(F.kdsTicket(kit.page, table.number, PENNE), 'a fresh kitchen ticket').toHaveCount(1, { timeout: 15_000 })
      await expect(F.kdsTicket(kit.page, table.number, PENNE)).toContainText('2×')
      expect(guest.consoleErrors, 'guest console errors').toEqual([])
    })
  })

  test('order status on the table screen follows the kitchen: Placed, Preparing, Ready, Served (live)', async ({ ui }) => {
    test.setTimeout(150_000)
    await withTable(ui, { orders: 1 }, async ({ g1, mgr, kitchen, table }) => {
      await F.seatGuest(g1, table.code)
      const { orderId, total } = await F.placeOrder(g1, table.id, [[PENNE, 2]])
      const { page } = await ui.open('g1')
      await F.joinTable(page, table.code)
      const status = () => page.locator('.stagger-item').first()
      await expect(status()).toContainText(/Placed/i)

      expect(await F.setTickets(kitchen, orderId, 'preparing')).toBe('')   // the kitchen taps "Start Preparing"
      await expect.soft(status(), 'kitchen started this order; the guest should see "Preparing" (the order stays "Placed")').toContainText(/Preparing/i, { timeout: 10_000 })
      if (test.info().errors.length) await ui.snap('after-start-preparing')
      expect(await F.setTickets(kitchen, orderId, 'ready')).toBe('')       // "Mark Ready"
      const doneError = await F.setTickets(kitchen, orderId, 'done')      // "Done": the order is ready (BUG-10 has its own test)
      if (doneError) await mgr.patch('orders?id=eq.' + orderId, { status: 'ready' })   // keep the flow going
      await expect(status(), 'all tickets done -> order Ready, live').toContainText(/Ready/i, { timeout: 15_000 })
      await expect(page.getByRole('link', { name: `View bill · ${F.money(total)}` })).toBeVisible()

      expect((await mgr.patch(`orders?id=eq.${orderId}`, { status: 'served' })).ok).toBe(true)   // the waiter's "Mark Served"
      await expect(status(), 'served, live').toContainText(/Served/i, { timeout: 15_000 })
      await expect(page.getByRole('link', { name: /^View bill/ })).toBeVisible()
    })
  })

  test('kitchen board: a ticket can be started, marked ready and done with the buttons', async ({ ui }) => {
    test.setTimeout(150_000)
    await withTable(ui, { orders: 1 }, async ({ g1, kitchen, table }) => {
      await F.seatGuest(g1, table.code)
      const { orderId } = await F.placeOrder(g1, table.id, [[PENNE, 1]])
      const kit = await ui.open('kitchen', { staff: true })
      await kit.page.goto(rurl('/kds'))
      const ticket = F.kdsTicket(kit.page, table.number, PENNE)
      await expect(ticket).toHaveCount(1, { timeout: 15_000 })
      const stuck = []
      for (const [label, status] of [['Start Preparing', 'preparing'], ['Mark Ready', 'ready'], ['Done', 'done']]) {
        const ok = await ticket.getByRole('button', { name: new RegExp(`^${label}`) }).click({ timeout: 6_000 }).then(() => true, () => false)
        if (!ok) { stuck.push(label); await F.setTickets(kitchen, orderId, status); continue }   // keep the order moving
        await expect.poll(async () => (await F.tickets(kitchen, orderId))[0].status, `ticket after "${label}"`).toBe(status)
      }
      expect(stuck, 'KDS buttons the kitchen could not press (the board squeezes tickets to a 2px line when a column is long)').toEqual([])
    })
  })

  test('kitchen Done completes a ticket: the stock deduction must not fail', async ({ ui }) => {
    await withTable(ui, { orders: 1 }, async ({ g1, kitchen, table }) => {
      await F.seatGuest(g1, table.code)
      const { orderId } = await F.placeOrder(g1, table.id, [[PENNE, 1]])
      expect(await F.setTickets(kitchen, orderId, 'preparing')).toBe('')
      expect(await F.setTickets(kitchen, orderId, 'ready')).toBe('')
      expect(await F.setTickets(kitchen, orderId, 'done'), 'Done on the KDS board (deduct_stock_fifo > check_stock_threshold)').toBe('')
      expect(await F.orderStatus(g1, orderId), 'all tickets done -> order ready').toBe('ready')
    })
  })

  test('staff cancels an open order: it leaves the guest\'s screen and the kitchen board', async ({ ui }) => {
    test.setTimeout(150_000)
    await withTable(ui, { orders: 1 }, async ({ g1, kitchen, table }) => {
      await F.seatGuest(g1, table.code)
      const { orderId, total } = await F.placeOrder(g1, table.id, [[PENNE, 1]])
      const guest = await ui.open('g1')
      await F.joinTable(guest.page, table.code)
      await expect(guest.page.getByText('Order #1')).toBeVisible()
      const mgr = await ui.open('manager', { staff: true })
      await mgr.page.goto(rurl('/orders'))
      const mine = F.dashCard(mgr.page).filter({ hasText: 'Aysel R.' }).filter({ hasText: F.money(total) })   // newest first: the order just placed
      await expect(mine.first()).toContainText(/Open/)
      const card = mine.first()
      await card.locator('div[style*="cursor: pointer"]').first().click()
      await card.getByRole('button', { name: 'Cancel' }).click()
      await expect(card).toContainText(/Cancelled/, { timeout: 10_000 })
      await expect(guest.page.getByText('No orders yet'), 'a cancelled order leaves the guest\'s table screen live').toBeVisible({ timeout: 15_000 })
      expect(await F.orderStatus(g1, orderId)).toBe('cancelled')

      const kit = await ui.open('kitchen', { staff: true })
      await kit.page.goto(rurl('/kds'))
      await kit.page.waitForTimeout(2_000)
      await expect(F.kdsTicket(kit.page, table.number, PENNE), 'the kitchen must not cook a cancelled order').toHaveCount(0)
    })
  })

  test('the guest can cancel their own open order (when the table screen offers it)', async ({ ui }) => {
    await withTable(ui, { orders: 1 }, async ({ g1, table }) => {
      await F.seatGuest(g1, table.code)
      await F.placeOrder(g1, table.id, [[PENNE, 1]])
      const { page } = await ui.open('g1')
      await F.joinTable(page, table.code)
      await expect(page.getByText('Order #1')).toBeVisible()
      const cancel = page.getByRole('button', { name: /cancel (my |the )?order/i })
      test.skip(!(await cancel.count()), 'not offered: the order card has no cancel button (cancel_order_draft exists in the database only)')
      await cancel.first().click()
      await expect(page.getByText('No orders yet')).toBeVisible()
    })
  })
})
