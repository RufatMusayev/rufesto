// Dashboard money + settings QA, feature by feature, on the SEDA OCAĞI review restaurant (docs/REVIEW-ACCOUNTS.md):
// Bills (/bills), Tips (/tips, /my-tips), QR sheet (/qr-sheet), Settings (hours, closures, booking rules, staff),
// role gates, Azerbaijani copy and the 390 px layout. Findings: docs/qa/dashboard-money.md.
//
// Accounts: Seda admin / manager / waiter1 / waiter2 / kitchen and the guests review4..6, all signed in through the
// Supabase auth API (support/feat-money.js `as` -> support/v2.js openAs); no password is ever typed.
// Writes: orders, bills and tips at Seda tables (T2 / T3 / T4 / VIP1), plus hours, closures, booking rules, which each
// test restores in a `finally`; beforeAll / afterAll restoreBaseline() put Seda back (also after an aborted run).
// Run it alone with:  npx playwright test tests/feat-dash-money.spec.js --project=chromium --no-deps --workers=1
//   (--no-deps keeps the Bella v2-tips teardown project out; add --output=<dir> --reporter=list to leave test-results alone)
// Tests of one file run in order on one worker; every test sets up and cleans up what it needs on its own.
const fs = require('fs')
const path = require('path')
const { test: base, expect } = require('../support/fixtures')
const { openAnon } = require('../support/v2')
const { walker } = require('../support/mobile')
const { bakuDate } = require('../support/guest')
const F = require('../support/feat-money')

const { SEDA, CONSUMER_URL, RESTO_URL, addDays, mondayOf, daysBetween } = F
const rurl = p => RESTO_URL + p
const curl = p => CONSUMER_URL + p

// ───────────────────────────── fixture: signed-in actors with guaranteed cleanup ─────────────────────────────
const test = base.extend({
  fx: async ({ browser }, use, testInfo) => {
    const actors = []
    const cleanups = []
    let locked = false
    const fx = {
      /** A context signed in as a Seda review account (admin, manager, waiter1, waiter2, kitchen, g4, g5, g6). */
      open: async key => {
        if (/^g\d$/.test(key) && !locked) { await F.acquireGuestLock(); locked = true }   // review4..6 are shared with feat-dash-ops
        const a = await F.as(browser, testInfo, key); actors.push(a); return a
      },
      /** A signed-out consumer context. */
      anon: async () => { const a = await openAnon(browser, testInfo); a.key = 'anon'; a.watch = F.watchPage(a.page); actors.push(a); return a },
      /** Runs after the test (pass or fail), last registered first, before the contexts close. */
      cleanup: fn => { cleanups.push(fn) },
    }
    await use(fx)
    if (testInfo.status !== testInfo.expectedStatus) {
      for (const [i, a] of actors.entries()) {
        try {
          const file = testInfo.outputPath(`fail-${i}-${a.key}.png`)
          await a.page.screenshot({ path: file, fullPage: true })
          await testInfo.attach(`${a.key}-${i}`, { path: file, contentType: 'image/png' })
        } catch { /* page already gone */ }
      }
    }
    for (const fn of cleanups.reverse()) { try { await fn() } catch (e) { console.log(`[cleanup] ${testInfo.title}: ${e.message}`) } }
    for (const a of actors) await a.close().catch(() => {})
    if (locked) F.releaseGuestLock()
  },
})

/** First of the preferred Seda tables that is free right now (a table another run left occupied is skipped). */
function pickFree(tables, prefer) {
  for (const n of prefer) {
    const t = tables.find(x => x.number === n && !F.held(x.state))
    if (t) return t
  }
  throw new Error(`no free Seda table among ${prefer.join(', ')}: ${tables.map(t => `${t.number}=${t.state}`).join(' ')}`)
}

/** Shot of the page for the findings doc (saved in the test's output folder and attached to the report). */
async function shot(testInfo, page, name, opts = {}) {
  const file = testInfo.outputPath(`${name}.png`)
  await page.screenshot({ path: file, fullPage: true, ...opts })
  await testInfo.attach(name, { path: file, contentType: 'image/png' })
}

// ───────────────────────────── Bills page helpers ─────────────────────────────
const stat = (page, label) => page.locator('.v2-stats .stat-card').filter({ hasText: label }).locator('.stat-value').first()

/** What the Bills page shows right now: the three stat cards and the three filter chips. */
async function billsSnapshot(page) {
  await expect(page.locator('.v2-stats .stat-card').first()).toBeVisible()
  const chips = await page.locator('.v2-chips button.chip').allTextContents()
  const count = name => Number(((chips.find(c => c.trim().startsWith(name)) || '').match(/\((\d+)\)/) || [])[1])
  return {
    active: Number(((await stat(page, 'Active bills').textContent()) || '').trim()),
    toCollect: F.num(await stat(page, 'Still to collect').textContent()),
    collected: F.num(await stat(page, 'Collected today').textContent()),
    chipActive: count('Active'), chipPaid: count('Paid'), chipAll: count('All'),
  }
}
const wantSnapshot = rows => {
  const e = F.expectedBillStats(rows)
  return { active: e.active, toCollect: e.toCollect, collected: e.collected, chipActive: e.active, chipPaid: e.paid, chipAll: e.all }
}
/** Polls until the Bills page equals what restaurant_bills says (the page is realtime + debounced, so give it a moment). */
async function expectBillsMatchApi(page, mgr, label = 'Bills page vs restaurant_bills') {
  await expect.poll(async () => {
    const ui = await billsSnapshot(page)
    const want = wantSnapshot(await F.bills(mgr))
    return JSON.stringify(ui) === JSON.stringify(want) ? 'match' : `ui ${JSON.stringify(ui)} <> api ${JSON.stringify(want)}`
  }, { message: label, timeout: 20_000, intervals: [500, 1000, 2000] }).toBe('match')
}

/** The page opens on Active, where a bill disappears once it is paid: scenario tests watch it on All instead. */
async function showAll(page) {
  const all = page.locator('.v2-chips').getByRole('button', { name: /^All \(/ })
  await all.click()
  await expect(all).toHaveAttribute('aria-pressed', 'true')
}

/** The newest bill card of a table in the given state ('open' | 'requested' | 'paying' | 'paid' | 'void' | any). */
const billCard = (page, tableNumber, status = '') =>
  page.locator(status ? `article.v2-bill--${status}` : 'article.v2-bill').filter({ has: page.locator('.v2-bill-table', { hasText: new RegExp(`^Table ${tableNumber}$`) }) }).first()
const shareRow = (card, firstName) => card.locator('.v2-share').filter({ hasText: firstName })

// ───────────────────────────── guest (consumer app) helpers ─────────────────────────────
/** The dashboard shell is up (after the role gate); one reload when the first load of the page stalls. */
async function layoutReady(page) {
  try { await page.locator('.dash-layout').waitFor({ timeout: 20_000 }) } catch { await page.reload(); await page.locator('.dash-layout').waitFor({ timeout: 30_000 }) }
}

/** Seat a guest the way the app does it: /t/<code> -> Join (the consumer app keeps the table in sessionStorage, so a table claimed over the API is invisible to its UI). */
async function uiClaim(g, code) {
  await g.page.goto(curl(`/t/${code}`))
  await expect(g.page.getByRole('heading', { name: 'Join this table?' })).toBeVisible({ timeout: 20_000 })
  await g.page.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(g.page).toHaveURL(curl('/table'))
}
async function guestOpensBill(g) {
  await g.page.goto(curl('/bill'))
  await expect(g.page.getByRole('heading', { name: 'Payment method' })).toBeVisible({ timeout: 20_000 })
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
test.describe('dashboard money (Seda)', { tag: ['@resto', '@money'] }, () => {
  // not tagged @staff: these tests write on the Seda review restaurant (see the header), so `npm run test:staff` leaves them out
  test.describe.configure({ mode: 'default', timeout: 240_000 })
  test.skip(!F.haveAccounts(), 'docs/REVIEW-ACCOUNTS.md has no Seda review accounts')

  const resetSeda = async (browser, testInfo, when) => {
    const mgr = await F.as(browser, testInfo, 'manager')
    try {
      const diffs = await F.baselineDiff(mgr)
      if (diffs.length) console.log(`[feat-money] ${when}: Seda differs from the baseline, restoring: ${diffs.join('; ')}`)
      const left = await F.restoreBaseline(mgr)
      await F.tidyTables(mgr)
      if (left.length) console.log(`[feat-money] ${when}: could NOT restore: ${left.join('; ')}`)
    } finally { await mgr.close() }
  }
  test.beforeAll(async ({ browser }, testInfo) => { await resetSeda(browser, testInfo, 'before') })
  test.afterAll(async ({ browser }, testInfo) => { await resetSeda(browser, testInfo, 'after') })

  // ───────────────────────────────────── 1. Bills ─────────────────────────────────────
  test.describe('Bills', () => {
    test('stats, filter chips and bill cards agree with restaurant_bills', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager'); const g4 = await fx.open('g4')
      const T = pickFree(await F.sedaTables(mgr), ['T2', 'T3'])
      fx.cleanup(() => F.freeTable(mgr, T.id, [g4]))
      const dishes = await F.cheapDishes(mgr)
      await F.seat(g4, T.code); await F.placeOrder(g4, T.id, dishes.slice(0, 2)); const bill = await F.myBill(g4)

      const page = mgr.page
      await page.goto(rurl('/bills'))
      await expect(page.getByRole('heading', { name: 'Bills', exact: true })).toBeVisible()
      await expectBillsMatchApi(page, mgr)
      const snap = await billsSnapshot(page)
      expect(snap.active, 'the open bill counts as an active bill').toBeGreaterThanOrEqual(1)
      expect(snap.toCollect, 'Still to collect covers the open bill').toBeGreaterThanOrEqual(Number(bill.total) - 0.005)
      await expect(page.locator('.v2-page-count')).toHaveText(`${snap.chipAll} ${snap.chipAll === 1 ? 'bill' : 'bills'}`)

      const cards = page.locator('article.v2-bill')
      const classes = () => cards.evaluateAll(els => els.map(e => [...e.classList].find(c => c.startsWith('v2-bill--')) || ''))
      const chip = re => page.locator('.v2-chips').getByRole('button', { name: re })
      await expect(chip(/^Active \(/)).toHaveAttribute('aria-pressed', 'true')   // opens on Active
      await expect(cards).toHaveCount(snap.chipActive)
      expect((await classes()).every(c => /--(open|requested|paying)$/.test(c)), `Active shows only unpaid bills: ${await classes()}`).toBe(true)

      await chip(/^Paid \(/).click()
      await expect(chip(/^Paid \(/)).toHaveAttribute('aria-pressed', 'true')
      if (snap.chipPaid === 0) await expect(page.getByText('No bills match this filter')).toBeVisible()
      else {
        await expect(cards).toHaveCount(snap.chipPaid)
        expect((await classes()).every(c => c === 'v2-bill--paid'), `Paid shows only paid bills: ${await classes()}`).toBe(true)
      }
      await chip(/^All \(/).click()
      await expect(cards).toHaveCount(snap.chipAll)
      const voids = (await classes()).filter(c => c === 'v2-bill--void').length
      expect(snap.chipAll - snap.chipActive - snap.chipPaid, 'All = Active + Paid + void').toBe(voids)
      await shot(testInfo, page, 'bills-all')
      expect(mgr.watch.consoleErrors, 'console errors on /bills').toEqual([])
    })

    test('reception share: Mark paid settles it and the guest screen flips to Payment received', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager'); const g4 = await fx.open('g4')
      const T = pickFree(await F.sedaTables(mgr), ['T2', 'T3'])
      fx.cleanup(() => F.freeTable(mgr, T.id, [g4]))
      const dishes = await F.cheapDishes(mgr)
      await uiClaim(g4, T.code); await F.placeOrder(g4, T.id, dishes.slice(0, 2)); const bill = await F.myBill(g4)

      await test.step('guest asks to pay at reception (consumer app)', async () => {
        await guestOpensBill(g4)
        await g4.page.getByRole('button', { name: /^Notify staff/ }).click()
        await expect(g4.page.getByRole('heading', { name: 'Staff notified' })).toBeVisible()
      })

      const page = mgr.page
      await page.goto(rurl('/bills'))
      await showAll(page)
      const card = billCard(page, T.number)
      const share = shareRow(card, 'Tural')
      await test.step('dashboard: reception pill, Owes amount, no DEMO badge', async () => {
        await expect(card).toBeVisible()
        await expect(share.locator('.v2-pill')).toContainText('Reception')
        await expect(share.locator('.v2-demo-badge'), 'no DEMO badge on a reception share').toHaveCount(0)
        await expect(share).toContainText(`Owes ${F.fmt(bill.total)}`)
        await shot(testInfo, page, 'bills-reception-owes')
      })
      await test.step('Mark paid: the share and the bill flip to Paid', async () => {
        await share.getByRole('button', { name: 'Mark paid' }).click()
        await expect(share.locator('.v2-share-state--paid')).toBeVisible()
        await expect(card).toHaveClass(/v2-bill--paid/, { timeout: 15_000 })
        await expect(card.getByRole('button', { name: 'Mark whole bill paid' })).toHaveCount(0)
        await expect(share.getByRole('button', { name: 'Mark paid' })).toHaveCount(0)
      })
      await test.step('the guest screen flips without a reload', async () => {
        await expect(g4.page.getByRole('heading', { name: 'Payment received' })).toBeVisible({ timeout: 20_000 })
        await expect(g4.page.getByText('Bill settled', { exact: true })).toBeVisible()
        await expect(g4.page.locator('.bl-settled').getByText('DEMO', { exact: true }), 'no DEMO badge for a reception payment').toHaveCount(0)
      })
      await test.step('server: reception intent succeeded, settled by the manager', async () => {
        const it = await mgr.api('GET', `payment_intents?bill_id=eq.${bill.bill_id}&select=provider,status,settled_by`)
        expect(it.json).toEqual([{ provider: 'reception', status: 'succeeded', settled_by: mgr.userId }])
        const row = (await F.bills(mgr)).find(b => b.bill_id === bill.bill_id)
        expect(row.status).toBe('settled')
        expect(F.cents(row.collected)).toBe(F.cents(row.total))
      })
      expect(mgr.watch.consoleErrors, 'console errors on /bills').toEqual([])
    })

    test('cash share: Mark paid on a share the guest chose no method for settles it as Cash and flips the guest screen to Payment received', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager'); const g4 = await fx.open('g4')
      const T = pickFree(await F.sedaTables(mgr), ['T2', 'T3'])
      fx.cleanup(() => F.freeTable(mgr, T.id, [g4]))
      const dishes = await F.cheapDishes(mgr)
      await uiClaim(g4, T.code); await F.placeOrder(g4, T.id, dishes.slice(0, 2)); const bill = await F.myBill(g4)
      const sp = await g4.rpc('split_bill', { p_bill_id: bill.bill_id, p_mode: 'own', p_assignments: {} })
      expect(sp.ok, `split_bill: ${F.errOf(sp)}`).toBe(true)
      await guestOpensBill(g4)

      const page = mgr.page
      await page.goto(rurl('/bills'))
      await showAll(page)
      const card = billCard(page, T.number)
      const share = shareRow(card, 'Tural')
      await expect(share.locator('.v2-share-tags'), 'no method chosen yet: no pill').toHaveCount(0)
      await share.getByRole('button', { name: 'Mark paid' }).click()
      await expect(share.locator('.v2-pill')).toContainText('Cash', { timeout: 20_000 })
      await expect(card).toHaveClass(/v2-bill--paid/, { timeout: 20_000 })
      await expect(card.locator('.v2-demo-badge'), 'no DEMO badge on a cash share').toHaveCount(0)
      await expect(g4.page.getByRole('heading', { name: 'Payment received' }), 'the guest screen flips').toBeVisible({ timeout: 20_000 })
      await expect(g4.page.getByText('Bill settled', { exact: true })).toBeVisible()
      await shot(testInfo, g4.page, 'guest-cash-settled')
    })

    test('guest pays by demo card with a tip in the consumer app: the open Bills page updates live (new card, DEMO badge, tip line, stats)', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager'); const g5 = await fx.open('g5'); const w1 = await fx.open('waiter1')
      const T = pickFree(await F.sedaTables(mgr), ['T3', 'T2'])
      fx.cleanup(() => F.freeTable(mgr, T.id, [g5]))
      const w1Staff = (await F.sedaStaff(mgr)).find(s => s.user_id === w1.userId)
      expect(w1Staff, 'waiter1 is an active staff member of Seda').toBeTruthy()
      const dishes = await F.cheapDishes(mgr)
      await uiClaim(g5, T.code); await F.placeOrder(g5, T.id, dishes.slice(0, 2))

      const page = mgr.page
      await page.goto(rurl('/bills'))
      await showAll(page)
      const before = await billsSnapshot(page)

      const card = billCard(page, T.number)
      await test.step('the guest opens the bill: a new open card shows up on the dashboard without a reload', async () => {
        await guestOpensBill(g5)
        await expect(card).toBeVisible({ timeout: 20_000 })
        await expect(card).toHaveClass(/v2-bill--open/)
      })

      let tip = 0
      await test.step('the guest picks Card (demo), 10 % tip, waiter 1 and pays', async () => {
        const radio = g5.page.getByRole('radio', { name: /Card \(demo\)/ })
        await radio.click()
        await expect(radio).toHaveAttribute('aria-checked', 'true')
        const ten = g5.page.getByRole('radiogroup', { name: 'Add a tip' }).getByRole('radio', { name: /^10%/ })
        await ten.click()
        tip = F.num(await g5.page.getByText(/^Tip: ₼/).innerText())
        expect(tip, 'a 10 % tip on this order rounds to more than 0').toBeGreaterThan(0)
        const listed = (await g5.rpc('list_table_waiters', { p_table_id: T.id })).json
        const at = listed.findIndex(w => w.staff_id === w1Staff.staff_id)
        expect(at, 'waiter 1 is offered for the tip').toBeGreaterThanOrEqual(0)
        await g5.page.getByRole('radiogroup', { name: 'Who gets the tip?' }).getByRole('radio').nth(at).click()
        await g5.page.getByRole('button', { name: /^Pay ₼/ }).click()
        await g5.page.getByRole('button', { name: /\(demo\)$/ }).click()
        await expect(g5.page.getByRole('heading', { name: 'Payment received' })).toBeVisible({ timeout: 20_000 })
      })

      const share = shareRow(card, 'Nigar')
      await test.step('dashboard: bill Paid, share Card + DEMO, tip line, totals', async () => {
        await expect(card).toHaveClass(/v2-bill--paid/, { timeout: 20_000 })
        await expect(share.locator('.v2-demo-badge'), 'DEMO badge on the card share').toHaveCount(1)
        await expect(share.locator('.v2-pill')).toContainText('Card')
        await expect(card.locator('.v2-bill-tip')).toContainText(`Tip ${F.fmt(tip)} → Waiter`)
        await shot(testInfo, page, 'bills-demo-card-tip')
        const row = (await F.bills(mgr)).find(b => b.table?.label === T.number && b.status === 'settled')
        expect(row, 'the settled bill is in restaurant_bills').toBeTruthy()
        await expect(card.locator('.v2-bill-head-right .v2-money')).toHaveText(F.fmt(row.total))
        expect(F.cents(row.collected), 'collected = paid shares + tip').toBe(F.cents(row.total))
        expect(F.cents(row.tip_total), 'the tip is on the bill').toBe(F.cents(tip))
        await expect(card.locator('progress.v2-progress')).toHaveAttribute('aria-label', `${F.fmt(row.total)} of ${F.fmt(row.total)} collected`)
        await expectBillsMatchApi(page, mgr)
        const after = await billsSnapshot(page)
        expect(F.cents(after.collected) - F.cents(before.collected), 'Collected today grew by the share plus the tip').toBe(F.cents(row.total))
        expect(after.chipPaid - before.chipPaid).toBe(1)
      })
      expect(mgr.watch.consoleErrors, 'console errors on /bills').toEqual([])
    })

    test('mixed table: Mark paid rules, cash / card / reception pills, DEMO only on the demo share, void blocked once a share is paid', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager'); const g4 = await fx.open('g4'); const g5 = await fx.open('g5'); const g6 = await fx.open('g6')
      const T = pickFree(await F.sedaTables(mgr), ['T4', 'VIP1', 'T3'])
      fx.cleanup(() => F.freeTable(mgr, T.id, [g4, g5, g6]))
      const dishes = await F.cheapDishes(mgr)
      await F.seat(g4, T.code); await F.seat(g5, T.code, g4); await F.seat(g6, T.code, g4)
      await F.placeOrder(g4, T.id, dishes.slice(0, 1)); await F.placeOrder(g5, T.id, dishes.slice(1, 2)); await F.placeOrder(g6, T.id, dishes.slice(0, 2))
      const bill = await F.myBill(g4)
      const split = await g4.rpc('split_bill', { p_bill_id: bill.bill_id, p_mode: 'own', p_assignments: {} })
      expect(split.ok, `split_bill: ${F.errOf(split)}`).toBe(true)

      const page = mgr.page
      await page.goto(rurl('/bills'))
      await showAll(page)
      const card = billCard(page, T.number)
      const tural = shareRow(card, 'Tural'); const nigar = shareRow(card, 'Nigar'); const elvin = shareRow(card, 'Elvin')
      const markPaid = row => row.getByRole('button', { name: 'Mark paid' })

      await test.step('three shares that nobody has chosen a method for: Owes, Mark paid, no method pill, no DEMO', async () => {
        await expect(card.locator('.v2-share')).toHaveCount(3, { timeout: 20_000 })
        for (const row of [tural, nigar, elvin]) {
          await expect(row).toContainText('Owes ₼')
          await expect(markPaid(row)).toBeVisible()
          await expect(row.locator('.v2-share-tags')).toHaveCount(0)
        }
        await expect(card.locator('.v2-demo-badge')).toHaveCount(0)
        await shot(testInfo, page, 'bills-mixed-3-owing')
      })

      await test.step('Elvin asks for reception: Reception pill, still Mark paid', async () => {
        await F.askReception(g6, bill.bill_id)
        await expect(elvin.locator('.v2-pill')).toContainText('Reception', { timeout: 20_000 })
        await expect(markPaid(elvin)).toBeVisible()
        await expect(elvin.locator('.v2-demo-badge')).toHaveCount(0)
      })

      let nigarIntent
      await test.step('Nigar is mid card payment (demo intent, not confirmed): Card + DEMO, but no Mark paid', async () => {
        const i = await g5.rpc('create_payment_intent', { p_bill_id: bill.bill_id, p_method: 'demo', p_tip: 0.5, p_tip_staff_id: null, p_mode: null })
        expect(i.ok, `create_payment_intent: ${F.errOf(i)}`).toBe(true)
        nigarIntent = i.json.intent_id
        await expect(nigar.locator('.v2-pill')).toContainText('Card', { timeout: 20_000 })
        await expect(nigar.locator('.v2-demo-badge')).toHaveCount(1)
        await expect(markPaid(nigar), 'staff must not take money for a share a guest is paying by card').toHaveCount(0)
      })

      await test.step('Mark paid on Tural (no intent): settled as Cash, no DEMO', async () => {
        await markPaid(tural).click()
        await expect(tural.locator('.v2-share-state--paid')).toBeVisible()
        await expect(tural.locator('.v2-pill')).toContainText('Cash', { timeout: 20_000 })
        await expect(tural.locator('.v2-demo-badge')).toHaveCount(0)
      })

      await test.step('Mark paid on Elvin (reception intent): settled, pill stays Reception', async () => {
        await markPaid(elvin).click()
        await expect(elvin.locator('.v2-share-state--paid')).toBeVisible()
        await expect(elvin.locator('.v2-pill')).toContainText('Reception')
        await expect(card.getByRole('button', { name: 'Mark whole bill paid' }), 'Nigar still owes: the whole-bill action stays').toBeVisible()
        await expect(card.locator('.v2-pill').filter({ hasText: /^Paying$/ }).first(), 'bill is Paying while a share is paid and one is open').toBeVisible({ timeout: 20_000 })
      })

      await test.step('void_bill is refused once a share is paid (bill_has_payments) and changes nothing', async () => {
        const v = await mgr.rpc('void_bill', { p_bill_id: bill.bill_id, p_reason: 'QA money: must be refused' })
        expect(F.errOf(v), 'void_bill after a payment').toBe('bill_has_payments')
        const row = (await F.bills(mgr)).find(b => b.bill_id === bill.bill_id)
        expect(row.status).toBe('paying')
      })

      await test.step('Nigar confirms the card payment: bill Paid, exactly one DEMO badge, tip to the whole team', async () => {
        const s = await g5.rpc('demo_settle_payment', { p_intent_id: nigarIntent })
        expect(s.ok, `demo_settle_payment: ${F.errOf(s)}`).toBe(true)
        await expect(card).toHaveClass(/v2-bill--paid/, { timeout: 20_000 })
        await expect(card.locator('.v2-demo-badge')).toHaveCount(1)
        await expect(nigar.locator('.v2-demo-badge')).toHaveCount(1)
        const pills = (await card.locator('.v2-share-tags .v2-pill').allTextContents()).map(x => x.trim()).sort()
        expect(pills, 'one pill per share: Card, Cash, Reception').toEqual(['Card', 'Cash', 'Reception'])
        await expect(card.locator('.v2-bill-tip')).toContainText('Tip ₼0.50 → whole team')
        await expect(card.getByRole('button', { name: 'Mark whole bill paid' })).toHaveCount(0)
        await shot(testInfo, page, 'bills-mixed-paid')
      })
      expect(mgr.watch.consoleErrors, 'console errors on /bills').toEqual([])
    })

    test('Mark whole bill paid: confirm dialog (Escape cancels), pays every share as cash', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager'); const g6 = await fx.open('g6')
      const T = pickFree(await F.sedaTables(mgr), ['VIP1', 'T4', 'T3'])
      fx.cleanup(() => F.freeTable(mgr, T.id, [g6]))
      const dishes = await F.cheapDishes(mgr)
      await F.seat(g6, T.code); await F.placeOrder(g6, T.id, dishes.slice(0, 2)); const bill = await F.myBill(g6)

      const page = mgr.page
      await page.goto(rurl('/bills'))
      await showAll(page)
      const card = billCard(page, T.number)
      await expect(card).toBeVisible()
      await expect(card.getByText('No shares recorded yet')).toBeVisible()
      const wholeBtn = card.getByRole('button', { name: 'Mark whole bill paid' })
      const dialog = page.getByRole('dialog', { name: 'Mark the whole bill as paid?' })

      await test.step('the dialog names the table and the outstanding amount; Escape cancels', async () => {
        await wholeBtn.click()
        await expect(dialog).toBeVisible()
        await expect(dialog).toContainText(`Table ${T.number}: ${F.fmt(bill.total)} still outstanding will be recorded as paid.`)
        await page.keyboard.press('Escape')
        await expect(dialog).toHaveCount(0)
        await expect(card).not.toHaveClass(/v2-bill--paid/)
        const row = (await F.bills(mgr)).find(b => b.bill_id === bill.bill_id)
        expect(row.status, 'cancelling must not change the bill').not.toBe('settled')
      })
      await test.step('Cancel button also leaves the bill open', async () => {
        await wholeBtn.click()
        await dialog.getByRole('button', { name: 'Cancel' }).click()
        await expect(dialog).toHaveCount(0)
        await expect(wholeBtn).toBeVisible()
      })
      await test.step('confirm: the bill is Paid with a cash share for the guest', async () => {
        await wholeBtn.click()
        await dialog.getByRole('button', { name: 'Mark whole bill paid' }).click()
        await expect(dialog).toHaveCount(0)
        await expect(card).toHaveClass(/v2-bill--paid/, { timeout: 20_000 })
        const share = shareRow(card, 'Elvin')
        await expect(share.locator('.v2-share-state--paid')).toBeVisible({ timeout: 20_000 })
        await expect(share.locator('.v2-pill')).toContainText('Cash')
        await expect(card.locator('.v2-demo-badge')).toHaveCount(0)
        await shot(testInfo, page, 'bills-whole-paid')
      })
      await test.step('server: settled, one succeeded cash intent settled by the manager', async () => {
        const row = (await F.bills(mgr)).find(b => b.bill_id === bill.bill_id)
        expect(row.status).toBe('settled')
        expect(F.cents(row.collected)).toBe(F.cents(row.total))
        const it = await mgr.api('GET', `payment_intents?bill_id=eq.${bill.bill_id}&select=provider,status,settled_by`)
        expect(it.json).toEqual([{ provider: 'cash', status: 'succeeded', settled_by: mgr.userId }])
      })
      expect(mgr.watch.consoleErrors, 'console errors on /bills').toEqual([])
    })

    test('guest screen after staff closes a bill nobody has split yet: shows the bill settled (consumer /bill, open while staff close it)', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager'); const g6 = await fx.open('g6')
      const T = pickFree(await F.sedaTables(mgr), ['VIP1', 'T4', 'T3'])
      fx.cleanup(() => F.freeTable(mgr, T.id, [g6]))
      const dishes = await F.cheapDishes(mgr)
      await uiClaim(g6, T.code); await F.placeOrder(g6, T.id, dishes.slice(0, 2)); const bill = await F.myBill(g6)
      await guestOpensBill(g6)
      const c = await mgr.rpc('close_bill', { p_bill_id: bill.bill_id })
      expect(c.ok, `close_bill: ${F.errOf(c)}`).toBe(true)
      await g6.page.waitForTimeout(6_000)   // the guest's realtime refresh
      await shot(testInfo, g6.page, 'guest-after-whole-bill-close')
      await expect(g6.page.getByRole('heading', { name: /Payment received|Bill settled/ }).first(), 'the guest screen flips to settled').toBeVisible({ timeout: 15_000 })
    })

    test('void: an unpaid bill is voided (out of Active and the stats, a Void card under All, the guest deep link says cancelled)', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager'); const g4 = await fx.open('g4')
      const T = pickFree(await F.sedaTables(mgr), ['T2', 'T3'])
      fx.cleanup(() => F.freeTable(mgr, T.id, [g4]))
      const dishes = await F.cheapDishes(mgr)
      await F.seat(g4, T.code); await F.placeOrder(g4, T.id, dishes.slice(0, 2)); const bill = await F.myBill(g4)

      const page = mgr.page
      await page.goto(rurl('/bills'))
      await expectBillsMatchApi(page, mgr)
      const before = await billsSnapshot(page)
      expect(before.active).toBeGreaterThanOrEqual(1)

      const v = await mgr.rpc('void_bill', { p_bill_id: bill.bill_id, p_reason: 'QA money: void test' })
      expect(v.ok, `void_bill: ${F.errOf(v)}`).toBe(true)
      expect(v.json.status).toBe('void')

      await expect.poll(async () => (await billsSnapshot(page)).active, { timeout: 20_000, message: 'Active drops by one' }).toBe(before.active - 1)
      await expectBillsMatchApi(page, mgr)
      await showAll(page)
      const card = billCard(page, T.number, 'void')
      await expect(card).toBeVisible()
      await expect(card.locator('.v2-pill').first()).toContainText('Void')
      await expect(card.getByRole('button', { name: 'Mark whole bill paid' }), 'a void bill cannot be closed').toHaveCount(0)
      await expect(card.getByRole('button', { name: 'Mark paid' })).toHaveCount(0)
      const again = await mgr.rpc('void_bill', { p_bill_id: bill.bill_id, p_reason: 'twice' })
      expect(F.errOf(again), 'voiding twice').toBe('bill_closed')
      await g4.page.goto(curl(`/bill/${bill.bill_id}`))
      await expect(g4.page.getByText('This bill was cancelled'), 'the guest opens the voided bill by its link').toBeVisible({ timeout: 20_000 })
      expect(mgr.watch.consoleErrors, 'console errors on /bills').toEqual([])
    })

    test('void while the guest has the bill screen open: the guest sees the bill cancelled and the void sticks (no new bill is opened by the refresh)', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager'); const g4 = await fx.open('g4')
      const T = pickFree(await F.sedaTables(mgr), ['T2', 'T3'])
      fx.cleanup(() => F.freeTable(mgr, T.id, [g4]))
      const dishes = await F.cheapDishes(mgr)
      await uiClaim(g4, T.code); await F.placeOrder(g4, T.id, dishes.slice(0, 2)); const bill = await F.myBill(g4)
      await guestOpensBill(g4)
      const v = await mgr.rpc('void_bill', { p_bill_id: bill.bill_id, p_reason: 'QA money: void under an open guest screen' })
      expect(v.ok, `void_bill: ${F.errOf(v)}`).toBe(true)
      await g4.page.waitForTimeout(6_000)   // the guest's realtime refresh
      await shot(testInfo, g4.page, 'guest-after-void')
      const open = (await F.bills(mgr)).filter(b => b.table?.label === T.number && F.isActive(b))
      expect(open.map(b => b.bill_id), 'the void must not be undone by the guest screen re-opening a bill from the same orders').toEqual([])
      await expect(g4.page.getByText('This bill was cancelled')).toBeVisible()
    })

    test('a seated guest who opens /bill in a fresh tab (nothing in sessionStorage) still reaches the bill', async ({ fx }, testInfo) => {
      // The table lives in sessionStorage (CartContext); my_table_session() is only asked when a tab already carries one,
      // so a guest who reopens the browser, or opens the link in a new tab, is told "Nothing to pay yet" while seated.
      const mgr = await fx.open('manager'); const g4 = await fx.open('g4')
      const T = pickFree(await F.sedaTables(mgr), ['T2', 'T3'])
      fx.cleanup(() => F.freeTable(mgr, T.id, [g4]))
      const dishes = await F.cheapDishes(mgr)
      await F.seat(g4, T.code); await F.placeOrder(g4, T.id, dishes.slice(0, 2)); await F.myBill(g4)
      expect((await g4.rpc('my_table_session')).json?.table_number, 'the server knows the guest is seated').toBe(T.number)
      await g4.page.goto(curl('/bill'))
      await g4.page.waitForTimeout(4_000)
      await shot(testInfo, g4.page, 'guest-new-tab-bill')
      await expect(g4.page.getByRole('heading', { name: 'Payment method' }), 'the seated guest sees the bill to pay').toBeVisible({ timeout: 10_000 })
    })

    test('a void bill does not show its shares as "Owes" (nothing is owed on a cancelled bill)', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager'); const g4 = await fx.open('g4')
      const T = pickFree(await F.sedaTables(mgr), ['T2', 'T3'])
      fx.cleanup(() => F.freeTable(mgr, T.id, [g4]))
      const dishes = await F.cheapDishes(mgr)
      await F.seat(g4, T.code); await F.placeOrder(g4, T.id, dishes.slice(0, 2)); const bill = await F.myBill(g4)
      const sp = await g4.rpc('split_bill', { p_bill_id: bill.bill_id, p_mode: 'own', p_assignments: {} })
      expect(sp.ok, `split_bill: ${F.errOf(sp)}`).toBe(true)
      expect((await mgr.rpc('void_bill', { p_bill_id: bill.bill_id, p_reason: 'QA money: void shares' })).ok).toBe(true)
      const page = mgr.page
      await page.goto(rurl('/bills'))
      await showAll(page)
      const card = billCard(page, T.number, 'void')
      await expect(card).toBeVisible()
      await shot(testInfo, page, 'bills-void-card-owes')
      await expect(card.locator('.v2-share-state--owes'), 'a cancelled bill still lists "Owes ₼…" for the guest').toHaveCount(0)
    })

    test('void: the Bills page lets a manager void an unpaid bill', async ({ fx }, testInfo) => {
      // void_bill (sql/42d, sql/47 F-V2-16) and the "Void" status pill exist, but BillCard offers no action for it.
      const mgr = await fx.open('manager'); const g4 = await fx.open('g4')
      const T = pickFree(await F.sedaTables(mgr), ['T2', 'T3'])
      fx.cleanup(() => F.freeTable(mgr, T.id, [g4]))
      const dishes = await F.cheapDishes(mgr)
      await F.seat(g4, T.code); await F.placeOrder(g4, T.id, dishes.slice(0, 1)); await F.myBill(g4)
      const page = mgr.page
      await page.goto(rurl('/bills'))
      const card = billCard(page, T.number, 'open')
      await expect(card).toBeVisible()
      await shot(testInfo, page, 'bills-no-void-action')
      await expect(card.getByRole('button', { name: /void|cancel bill|ləğv/i }), 'a void / cancel-bill action on an unpaid bill card').toBeVisible({ timeout: 2_000 })
    })

    test('older active bill: "from {date}" tag, in Still to collect but not in Collected today (response of restaurant_bills edited)', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager'); const g4 = await fx.open('g4')
      const T = pickFree(await F.sedaTables(mgr), ['T2', 'T3'])
      fx.cleanup(() => F.freeTable(mgr, T.id, [g4]))
      const dishes = await F.cheapDishes(mgr)
      await F.seat(g4, T.code); await F.placeOrder(g4, T.id, dishes.slice(0, 2)); const bill = await F.myBill(g4)

      const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString()
      const edit = rows => rows.map(b => (b.bill_id === bill.bill_id ? { ...b, created_at: twoDaysAgo, collected: 2 } : b))
      const page = mgr.page
      await page.route('**/rest/v1/rpc/restaurant_bills', async route => {
        const res = await route.fetch()
        await route.fulfill({ response: res, json: edit(await res.json()) })
      })
      await page.goto(rurl('/bills'))
      const card = billCard(page, T.number)
      await expect(card).toBeVisible()
      const want = await page.evaluate(iso => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Baku' }), twoDaysAgo)
      await expect(card.locator('.v2-bill-section'), 'tag of an older bill').toContainText(`from ${want}`)
      await showAll(page)
      await expect(page.locator('article.v2-bill .v2-bill-section').filter({ hasText: /from / }), 'only the older bill is tagged').toHaveCount(1)
      const rows = edit(await F.bills(mgr))
      const e = F.expectedBillStats(rows)
      await expect.poll(async () => JSON.stringify(await billsSnapshot(page)), { timeout: 15_000 }).toBe(JSON.stringify({
        active: e.active, toCollect: e.toCollect, collected: e.collected, chipActive: e.active, chipPaid: e.paid, chipAll: e.all,
      }))
      const mine = rows.find(b => b.bill_id === bill.bill_id)
      expect(F.cents(mine.total) - F.cents(mine.collected), 'the older bill still owes money').toBeGreaterThan(0)
      await shot(testInfo, page, 'bills-older-bill-tag')
    })

    test('a refused Mark paid / Mark whole bill paid rolls the screen back and shows a readable message', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager'); const g4 = await fx.open('g4')
      const T = pickFree(await F.sedaTables(mgr), ['T2', 'T3'])
      fx.cleanup(() => F.freeTable(mgr, T.id, [g4]))
      const dishes = await F.cheapDishes(mgr)
      await F.seat(g4, T.code); await F.placeOrder(g4, T.id, dishes.slice(0, 1)); const bill = await F.myBill(g4)
      const sp = await g4.rpc('split_bill', { p_bill_id: bill.bill_id, p_mode: 'own', p_assignments: {} })
      expect(sp.ok, `split_bill: ${F.errOf(sp)}`).toBe(true)

      const page = mgr.page
      const refuse = (rpcName, message) => page.route(`**/rest/v1/rpc/${rpcName}`, route =>
        route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message, details: null, hint: null }) }))
      await refuse('staff_settle_share', 'already_paid')
      await refuse('close_bill', 'bill_closed')
      await page.goto(rurl('/bills'))
      const card = billCard(page, T.number)
      await expect(card).toBeVisible()
      const share = shareRow(card, 'Tural')

      await share.getByRole('button', { name: 'Mark paid' }).click()
      await expect(page.getByRole('alert').filter({ hasText: 'This share is already paid.' })).toBeVisible()
      await expect(share.locator('.v2-share-state--owes'), 'the share goes back to Owes').toBeVisible()
      await expect(share.getByRole('button', { name: 'Mark paid' })).toBeVisible()
      await expect(card).toHaveClass(/v2-bill--(open|requested|paying)/)
      await page.getByRole('button', { name: 'Dismiss' }).click()

      await card.getByRole('button', { name: 'Mark whole bill paid' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Mark whole bill paid' }).click()
      await expect(page.getByRole('alert').filter({ hasText: "This bill is already closed and can't be changed." })).toBeVisible()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await expect(card).toHaveClass(/v2-bill--(open|requested|paying)/)
      await shot(testInfo, page, 'bills-refused-write')
    })
  })
  // ───────────────────────────────────── 2. Tips ─────────────────────────────────────
  test.describe('Tips', () => {
    const today = bakuDate()
    const weekStart = mondayOf(today)
    const monthStart = `${today.slice(0, 8)}01`
    const role = r => ({ waiter: 'Waiter', manager: 'Manager', admin: 'Admin', host: 'Host', cashier: 'Cashier', kitchen: 'Kitchen' }[r] || r)
    const report = async (mgr, from, to) => {
      const r = await mgr.rpc('tip_report', { p_restaurant_id: SEDA.id, p_from: from, p_to: to })
      expect(r.ok, `tip_report ${from}..${to}: ${F.errOf(r)}`).toBe(true)
      return r.json
    }
    const sortWaiters = ws => ws.slice().sort((a, b) => F.cents(b.total) - F.cents(a.total) || b.count - a.count || a.display_name.localeCompare(b.display_name))

    /** Makes sure today has an earned tip for waiter 1 and one for the whole team (two small demo-card payments at Seda). */
    async function ensureTips(fx, mgr) {
      const w1 = await fx.open('waiter1')
      const r = await report(mgr, today, today)
      const w1Staff = r.waiters.find(w => w.user_id === w1.userId)
      expect(w1Staff, 'waiter1 is listed by tip_report').toBeTruthy()
      const missing = []
      if (w1Staff.count < 1) missing.push(w1Staff.staff_id)
      if (r.unassigned.count < 1) missing.push(null)
      if (!missing.length) return { w1, w1Staff }
      const g5 = await fx.open('g5')
      const T = pickFree(await F.sedaTables(mgr), ['T3', 'T2'])
      fx.cleanup(() => F.freeTable(mgr, T.id, [g5]))
      const dishes = await F.cheapDishes(mgr)
      for (const staffId of missing) {
        await F.seat(g5, T.code); await F.placeOrder(g5, T.id, dishes.slice(0, 2)); const bill = await F.myBill(g5)
        await F.demoPay(g5, bill.bill_id, { tip: 0.7, tipStaffId: staffId })
      }
      return { w1, w1Staff }
    }

    /** What the Tips page shows: four stat cards and the per-waiter rows. */
    async function tipsUi(page) {
      await expect(page.locator('.v2-stats .stat-card').first()).toBeVisible()
      const stat = label => page.locator('.v2-stats .stat-card').filter({ hasText: label }).locator('.stat-value').first()
      const rows = await page.locator('.v2-tips-table tbody tr').evaluateAll(trs => trs.map(tr => {
        const cell = l => (tr.querySelector(`td[data-label="${l}"]`)?.textContent || '').trim()
        return { name: (tr.querySelector('th')?.textContent || '').trim(), role: (tr.querySelector('.v2-tips-role')?.textContent || '').trim(), count: cell('Tips'), total: cell('Total'), avg: cell('Average'), last: cell('Last tip') }
      }))
      return {
        total: F.num(await stat('Total tips').textContent()), count: Number((await stat('Tip count').textContent()).trim()),
        avg: F.num(await stat('Average per tip').textContent()), unassigned: F.num(await stat('Unassigned (team)').textContent()),
        unassignedSub: (await page.locator('.v2-stats .stat-card').filter({ hasText: 'Unassigned (team)' }).locator('.stat-sub').textContent()).trim(),
        rows,
      }
    }
    const chipTip = (page, name) => page.getByRole('group', { name: 'Date range' }).getByRole('button', { name, exact: true })

    test('/tips Today: stat cards, per-waiter rows (zero-tip waiters too, biggest first) and the team bucket match tip_report', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager')
      await ensureTips(fx, mgr)
      const page = mgr.page
      await page.goto(rurl('/tips'))
      await expect(page.getByRole('heading', { level: 1, name: 'Tips' })).toBeVisible()
      await expect(chipTip(page, 'Today')).toHaveAttribute('aria-pressed', 'true')
      await expect.poll(async () => (await tipsUi(page)).count, { timeout: 15_000 }).toBeGreaterThanOrEqual(2)
      const api = await report(mgr, today, today)
      const ui = await tipsUi(page)
      await shot(testInfo, page, 'tips-today')

      expect(ui.total, 'Total tips').toBe(api.total)
      expect(ui.count, 'Tip count').toBe(api.count)
      expect(ui.avg, 'Average per tip').toBeCloseTo(api.count ? api.total / api.count : 0, 2)
      expect(ui.unassigned, 'Unassigned (team) stat').toBe(api.unassigned.total)
      expect(ui.unassignedSub).toBe(`${api.unassigned.count} ${api.unassigned.count === 1 ? 'tip' : 'tips'}`)

      const want = sortWaiters(api.waiters)
      const named = ui.rows.filter(r => r.name !== 'Unassigned (whole team)')
      expect(named.map(r => r.name), 'one row per waiter, biggest total first').toEqual(want.map(w => w.display_name))
      for (const [i, w] of want.entries()) {
        expect(named[i], `row of ${w.display_name}`).toMatchObject({ role: role(w.role), count: String(w.count), total: F.fmt(w.total), avg: F.fmt(w.avg) })
        if (w.count === 0) expect(named[i].last, `a waiter with no tips has no last-tip time (${w.display_name})`).toBe('—')
        else expect(named[i].last).toMatch(/^\d{2}:\d{2}$/)   // today: time only
      }
      expect(want.some(w => w.count === 0), 'the data has a zero-tip waiter, so the 0 rows are really checked').toBe(true)
      const team = ui.rows.find(r => r.name === 'Unassigned (whole team)')
      expect(team, 'the whole-team row shows when tips went to nobody').toBeTruthy()
      expect(team).toMatchObject({ count: String(api.unassigned.count), total: F.fmt(api.unassigned.total), last: '—' })
      expect(mgr.watch.consoleErrors, 'console errors on /tips').toEqual([])
    })

    test('/tips ranges: This week and This month agree with tip_report (by-day strip once the range has two days), Custom works', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager')
      await ensureTips(fx, mgr)
      const page = mgr.page
      await page.goto(rurl('/tips'))
      await expect(page.locator('.v2-stats .stat-card').first()).toBeVisible()

      const check = async (from, to, label) => {
        const api = await report(mgr, from, to)
        await expect.poll(async () => { const u = await tipsUi(page); return `${u.total}/${u.count}/${u.unassigned}` }, { message: label, timeout: 15_000 })
          .toBe(`${api.total}/${api.count}/${api.unassigned.total}`)
        const ui = await tipsUi(page)
        expect(ui.rows.filter(r => r.name !== 'Unassigned (whole team)').map(r => `${r.name}:${r.count}:${r.total}`), `${label}: waiter rows`)
          .toEqual(sortWaiters(api.waiters).map(w => `${w.display_name}:${w.count}:${F.fmt(w.total)}`))
        const days = from === to ? 1 : daysBetween(from, to) + 1
        if (days >= 2) await expect(page.getByRole('heading', { name: 'By day' }), `${label}: by-day strip`).toBeVisible()
        else await expect(page.getByRole('heading', { name: 'By day' }), `${label}: no strip for one day`).toHaveCount(0)
        return api
      }

      await chipTip(page, 'This week').click()
      await expect(chipTip(page, 'This week')).toHaveAttribute('aria-pressed', 'true')
      const wk = await check(weekStart, today, 'This week')
      expect(wk.total, 'the week covers today').toBeGreaterThanOrEqual((await report(mgr, today, today)).total)

      await chipTip(page, 'This month').click()
      await expect(chipTip(page, 'This month')).toHaveAttribute('aria-pressed', 'true')
      await check(monthStart, today, 'This month')

      await chipTip(page, 'Custom').click()
      await expect(chipTip(page, 'Custom')).toHaveAttribute('aria-pressed', 'true')
      const from = page.locator('#v2-range-from'); const to = page.locator('#v2-range-to')
      await expect(from, 'Custom starts from the range on screen').toHaveValue(monthStart)
      await expect(to).toHaveValue(today)
      await from.fill(addDays(today, -6))
      await check(addDays(today, -6), today, 'Custom: last 7 days')
      await shot(testInfo, page, 'tips-custom-7-days')
      await from.fill(today)
      await check(today, today, 'Custom: today only')
      expect(mgr.watch.consoleErrors, 'console errors on /tips').toEqual([])
    })

    test('/tips custom range: start after end, 367 days and a past period without tips show the right state', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager')
      const page = mgr.page
      await page.goto(rurl('/tips'))
      await chipTip(page, 'Custom').click()
      const from = page.locator('#v2-range-from'); const to = page.locator('#v2-range-to')
      const alert = page.locator('.v2-range-error')

      await test.step('start after end: message, no data, fields marked invalid', async () => {
        await from.fill(addDays(today, 1))
        await expect(alert).toContainText('The start date must not be after the end date')
        await expect(from).toHaveClass(/is-invalid/)
        await expect(page.locator('.v2-stats .stat-card')).toHaveCount(0)
      })
      await test.step('365 days apart (366 days inclusive) is the longest range, the API agrees', async () => {
        await from.fill(addDays(today, -365))
        await expect(alert).toHaveCount(0)
        await expect(page.locator('.v2-stats .stat-card').first()).toBeVisible({ timeout: 15_000 })
        expect((await mgr.rpc('tip_report', { p_restaurant_id: SEDA.id, p_from: addDays(today, -365), p_to: today })).ok, 'API accepts 366 days').toBe(true)
      })
      await test.step('one day more is refused with the same limit in UI and API', async () => {
        await from.fill(addDays(today, -366))
        await expect(alert).toContainText('Pick a range of at most 366 days')
        await expect(page.locator('.v2-stats .stat-card')).toHaveCount(0)
        expect(F.errOf(await mgr.rpc('tip_report', { p_restaurant_id: SEDA.id, p_from: addDays(today, -366), p_to: today }))).toBe('invalid_range')
      })
      await test.step('a past week with no tips: empty state, zero stat cards, Export CSV disabled', async () => {
        await from.fill('2025-01-01'); await to.fill('2025-01-07')
        await expect(alert).toHaveCount(0)
        await expect(page.getByText('No tips in this period')).toBeVisible({ timeout: 15_000 })
        await expect(page.getByText('Tips appear here once guests pay their bills.')).toBeVisible()
        const ui = await tipsUi(page)
        expect(ui).toMatchObject({ total: 0, count: 0, avg: 0, unassigned: 0 })
        await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
        await shot(testInfo, page, 'tips-empty-period')
      })
    })

    test('/tips custom range: clearing a date explains that a date is missing (not "start after end")', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager')
      const page = mgr.page
      await page.goto(rurl('/tips'))
      await chipTip(page, 'Custom').click()
      await page.locator('#v2-range-from').fill('')
      const alert = page.locator('.v2-range-error')
      await expect(alert).toBeVisible()
      await shot(testInfo, page, 'tips-custom-empty-date')
      await expect(alert, 'a missing start date is not a start-after-end problem').not.toContainText('must not be after')
    })

    test('/tips Export CSV: file name, BOM, header, one line per waiter and the team line, amounts equal the report', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager')
      await ensureTips(fx, mgr)
      const page = mgr.page
      await page.goto(rurl('/tips'))
      await expect.poll(async () => (await tipsUi(page)).count, { timeout: 15_000 }).toBeGreaterThanOrEqual(2)
      const api = await report(mgr, today, today)
      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()])
      expect(download.suggestedFilename()).toBe(`tips_${today}_${today}.csv`)
      const raw = fs.readFileSync(await download.path(), 'utf8')
      expect(raw.charCodeAt(0), 'UTF-8 BOM so Excel reads Azerbaijani letters').toBe(0xfeff)
      const lines = raw.replace(/^﻿/, '').split('\r\n')
      expect(lines[0]).toBe('Waiter,Role,Tips,Total,Average,Last tip')
      const want = sortWaiters(api.waiters)
      const hasTeam = api.unassigned.count > 0 || api.unassigned.total > 0
      expect(lines.length, 'header + waiters + team line, no trailing newline').toBe(1 + want.length + (hasTeam ? 1 : 0))
      for (const [i, w] of want.entries()) {
        const cols = lines[1 + i].split(',')
        expect(cols.slice(0, 5), `CSV line of ${w.display_name}`).toEqual([w.display_name, role(w.role), String(w.count), w.total.toFixed(2), w.avg.toFixed(2)])
        if (w.count === 0) expect(cols[5], 'no last tip').toBe('')
        else expect(cols[5]).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
      }
      if (hasTeam) {
        expect(lines[lines.length - 1].split(',').slice(0, 5)).toEqual(['Unassigned (whole team)', '', String(api.unassigned.count), api.unassigned.total.toFixed(2), (api.unassigned.total / api.unassigned.count).toFixed(2)])
      }
      testInfo.attachments.push({ name: 'tips.csv', contentType: 'text/csv', body: Buffer.from(raw) })
      // the same range as a multi-day export gets its own file name
      await chipTip(page, 'This week').click()
      const [d2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()])
      expect(d2.suggestedFilename()).toBe(`tips_${weekStart}_${today}.csv`)
    })

    test('/my-tips: a waiter sees only their own tips (list, total, count, Waiter-page card); another waiter and the manager see theirs', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager'); const w2 = await fx.open('waiter2')
      const { w1 } = await ensureTips(fx, mgr)
      const mine = (await w1.rpc('my_tips', { p_from: today, p_to: today })).json
      const theirs = (await w2.rpc('my_tips', { p_from: today, p_to: today })).json
      expect(mine.count, 'waiter 1 has tips today').toBeGreaterThanOrEqual(1)

      const page = w1.page
      await page.goto(rurl('/my-tips'))
      await expect(page.getByRole('heading', { level: 1, name: 'My tips' })).toBeVisible()
      await expect(chipTip(page, 'Today')).toHaveAttribute('aria-pressed', 'true')
      const hero = page.locator('.v2-tips-hero')
      await expect(hero.locator('.v2-tips-hero-value')).toHaveText(F.fmt(mine.total), { timeout: 15_000 })
      await expect(hero).toContainText(`${mine.count} ${mine.count === 1 ? 'tip' : 'tips'}`)
      const items = page.locator('.v2-tip-list .v2-tip')
      await expect(items).toHaveCount(mine.tips.length)
      for (const [i, t] of mine.tips.entries()) {
        const item = items.nth(i)
        await expect(item, `tip ${i + 1} (newest first)`).toContainText(`Table ${t.table_number}`)
        await expect(item).toContainText(F.fmt(t.amount))
        await expect(item).toContainText(t.status === 'earned' ? 'Earned' : t.status === 'pending' ? 'Pending' : 'Void')
        if (t.payer_first_name) await expect(item).toContainText(`from ${t.payer_first_name}`)
      }
      await shot(testInfo, page, 'my-tips-waiter1')
      expect(F.cents(mine.total), 'the totals of two waiters are separate').not.toBe(F.cents((await report(mgr, today, today)).total))

      await test.step('the Waiter page card shows the same total and opens /my-tips', async () => {
        await page.goto(rurl('/waiter'))
        const card = page.locator('a.v2-mytips')
        await expect(card).toContainText('My tips today')
        await expect(card.locator('.v2-money')).toHaveText(F.fmt(mine.total))
        await card.click()
        await expect(page).toHaveURL(/\/my-tips$/)
      })
      await test.step("the manager's /tips row for waiter 1 is exactly what waiter 1 sees", async () => {
        const rep = await report(mgr, today, today)
        const row = rep.waiters.find(w => w.user_id === w1.userId)
        expect({ count: row.count, total: row.total }).toEqual({ count: mine.count, total: mine.total })
      })
      await test.step("waiter 2 sees none of waiter 1's tips", async () => {
        await w2.page.goto(rurl('/my-tips'))
        await expect(w2.page.locator('.v2-tips-hero-value')).toHaveText(F.fmt(theirs.total), { timeout: 15_000 })
        await expect(w2.page.locator('.v2-tip-list .v2-tip')).toHaveCount(theirs.tips.length)
        if (theirs.count === 0) {
          await expect(w2.page.getByText('No tips in this period')).toBeVisible()
          await expect(w2.page.getByText('Tips left for you appear here after guests pay.')).toBeVisible()
        }
      })
      expect(w1.watch.consoleErrors, 'console errors for waiter 1').toEqual([])
    })

    test('/my-tips lists a tip the guest has put on an unpaid card payment as Pending without counting it, and drops it once the bill is voided', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager'); const w2 = await fx.open('waiter2'); const g5 = await fx.open('g5')
      const T = pickFree(await F.sedaTables(mgr), ['T3', 'T2'])
      fx.cleanup(() => F.freeTable(mgr, T.id, [g5]))
      const w2Staff = (await F.sedaStaff(mgr)).find(s => s.user_id === w2.userId)
      const before = (await w2.rpc('my_tips', { p_from: today, p_to: today })).json
      const dishes = await F.cheapDishes(mgr)
      await F.seat(g5, T.code); await F.placeOrder(g5, T.id, dishes.slice(0, 2)); const bill = await F.myBill(g5)
      const i = await g5.rpc('create_payment_intent', { p_bill_id: bill.bill_id, p_method: 'demo', p_tip: 0.9, p_tip_staff_id: w2Staff.staff_id, p_mode: null })
      expect(i.ok, `create_payment_intent: ${F.errOf(i)}`).toBe(true)

      const page = w2.page
      await page.goto(rurl('/my-tips'))
      const pending = page.locator('.v2-tip-list .v2-tip').filter({ hasText: '₼0.90' })
      await expect(pending.first()).toBeVisible({ timeout: 15_000 })
      await expect(pending.first()).toContainText('Pending')
      await expect(page.locator('.v2-tips-hero-value'), 'a pending tip is not counted').toHaveText(F.fmt(before.total))
      await expect(page.locator('.v2-tips-hero')).toContainText(`${before.count} ${before.count === 1 ? 'tip' : 'tips'}`)
      await shot(testInfo, page, 'my-tips-pending')

      const v = await mgr.rpc('void_bill', { p_bill_id: bill.bill_id, p_reason: 'QA money: pending tip' })
      expect(v.ok, `void_bill: ${F.errOf(v)}`).toBe(true)
      await expect(pending, 'the pending tip of a voided bill is no longer listed').toHaveCount(0, { timeout: 20_000 })
      await expect(page.locator('.v2-tips-hero-value')).toHaveText(F.fmt(before.total))
    })

    test('tips role gates: waiter and kitchen are bounced from /tips, kitchen from /my-tips, manager and admin open both, API refuses the rest', async ({ fx }) => {
      const mgr = await fx.open('manager'); const adm = await fx.open('admin'); const w1 = await fx.open('waiter1'); const kit = await fx.open('kitchen')
      await w1.page.goto(rurl('/tips'))
      await expect(w1.page, 'waiter on /tips').toHaveURL(/\/waiter$/)
      await kit.page.goto(rurl('/tips'))
      await expect(kit.page, 'kitchen on /tips').toHaveURL(/\/kds$/)
      await kit.page.goto(rurl('/my-tips'))
      await expect(kit.page, 'kitchen on /my-tips').toHaveURL(/\/kds$/)
      for (const who of [mgr, adm]) {
        await who.page.goto(rurl('/tips'))
        await expect(who.page, `${who.key} on /tips`).toHaveURL(/\/tips$/)
        await expect(who.page.getByRole('heading', { level: 1, name: 'Tips' })).toBeVisible()
        await expect(who.page.getByRole('link', { name: 'My tips' }), `${who.key}: My tips shortcut`).toHaveAttribute('href', '/my-tips')
        await who.page.goto(rurl('/my-tips'))
        await expect(who.page, `${who.key} on /my-tips`).toHaveURL(/\/my-tips$/)
        await expect(who.page.locator('.v2-tips-hero')).toBeVisible()
      }
      // sidebar: the waiter has My tips and no Tips; the manager the other way round
      await w1.page.goto(rurl('/waiter'))
      const hrefs = async p => { await p.locator('.dash-nav a').first().waitFor(); return p.locator('.dash-nav a').evaluateAll(as => as.map(a => new URL(a.href).pathname)) }
      await mgr.page.goto(rurl('/'))
      expect(await hrefs(w1.page)).toEqual(expect.arrayContaining(['/my-tips']))
      expect(await hrefs(w1.page)).not.toContain('/tips')
      expect(await hrefs(mgr.page)).toEqual(expect.arrayContaining(['/tips']))
      expect(await hrefs(mgr.page)).not.toContain('/my-tips')
      // the server says the same
      const today2 = today
      expect(F.errOf(await w1.rpc('tip_report', { p_restaurant_id: SEDA.id, p_from: today2, p_to: today2 })), 'waiter tip_report').toBe('not_allowed')
      expect(F.errOf(await kit.rpc('tip_report', { p_restaurant_id: SEDA.id, p_from: today2, p_to: today2 })), 'kitchen tip_report').toBe('not_allowed')
      expect(F.errOf(await kit.rpc('my_tips', { p_from: today2, p_to: today2 })), 'kitchen my_tips').toBe('not_staff')
      expect((await adm.rpc('tip_report', { p_restaurant_id: SEDA.id, p_from: today2, p_to: today2 })).ok, 'admin tip_report').toBe(true)
      expect(F.errOf(await w1.rpc('my_tips', { p_from: addDays(today2, -400), p_to: today2 })), 'my_tips range cap').toBe('invalid_range')
    })
  })

  // ───────────────────────────────────── 3. QR sheet ─────────────────────────────────────
  test.describe('QR sheet', () => {
    const RESTO_NAME = 'Səda Ocağı'
    const toolbar = page => ({
      perPage: n => page.getByRole('radiogroup', { name: 'Per page' }).getByRole('radio', { name: String(n), exact: true }),
      code: page.getByLabel('Show access code'),
      chair: page.getByLabel('Per chair'),
      print: page.getByRole('button', { name: 'Print', exact: true }),
      section: name => page.getByRole('group', { name: 'Section' }).getByRole('button', { name, exact: true }),
    })
    const cardsOf = page => page.locator('.v2-qr-preview .v2-qr-card')
    async function openSheet(page) {
      await page.goto(rurl('/qr-sheet'))
      await expect(page.getByRole('heading', { name: 'QR sheet' })).toBeVisible()
      await expect(cardsOf(page).first()).toBeVisible()
      await settledSheet(page)
    }
    /** Every QR drawn: no "Generating" line, Print enabled. */
    const settledSheet = async page => { await expect(toolbar(page).print).toBeEnabled({ timeout: 40_000 }) }
    const cardInfo = page => cardsOf(page).evaluateAll(cs => cs.map(c => ({
      label: (c.querySelector('.v2-qr-table')?.textContent || '').trim(),
      resto: (c.querySelector('.v2-qr-resto')?.textContent || '').trim(),
      scan: (c.querySelector('.v2-qr-scan')?.textContent || '').trim(),
      code: (c.querySelector('.v2-qr-code strong')?.textContent || '').trim() || null,
      src: c.querySelector('img.v2-qr-img')?.src || null,
      alt: c.querySelector('img.v2-qr-img')?.alt || null,
      seat: c.classList.contains('v2-qr-card--seat'),
    })))
    const shortName = n => (/^[0-9]/.test(n) ? `T${n}` : n)
    /** Cards the sheet should hold for these tables (table card, then its chairs when perChair), in order. */
    const wantCards = (tables, perChair) => tables.filter(t => t.code).flatMap(t => [
      { label: `Table ${t.number}`, code: t.code, seat: false },
      ...(perChair ? Array.from({ length: t.capacity }, (_, i) => ({ label: `${shortName(t.number)} · seat ${i + 1}`, code: `${t.code}-S${i + 1}`, seat: true })) : []),
    ])

    test('/qr-sheet: one card per active table in table order, with restaurant name, label, hint and access code, every QR drawn', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager')
      const tables = await F.sedaTables(mgr)
      const page = mgr.page
      await openSheet(page)
      await expect(page.getByText('One card per table, ready to print on A4.')).toBeVisible()
      const want = wantCards(tables, false)
      const got = await cardInfo(page)
      expect(got.map(c => c.label), 'cards in table order (numbers compared as numbers)').toEqual(want.map(c => c.label))
      expect(got.map(c => c.code)).toEqual(want.map(c => c.code))
      for (const c of got) {
        expect(c.resto).toBe(RESTO_NAME)
        expect(c.scan).toBe('Scan to order')
        expect(c.src, `QR image of ${c.label}`).toMatch(/^data:image\/png;base64,/)
      }
      expect(got.map(c => c.alt)).toEqual(want.map(c => `QR code for ${c.label}`))
      await expect(toolbar(page).perPage(6), 'default is 6 per page').toHaveAttribute('aria-checked', 'true')
      await expect(toolbar(page).code).toBeChecked()
      await expect(toolbar(page).chair).not.toBeChecked()
      await shot(testInfo, page, 'qr-sheet-default')
      expect(mgr.watch.consoleErrors, 'console errors on /qr-sheet').toEqual([])
    })

    test('/qr-sheet section chips: All and each section show exactly their tables', async ({ fx }) => {
      const mgr = await fx.open('manager')
      const tables = await F.sedaTables(mgr)
      const page = mgr.page
      await openSheet(page)
      const sections = [...new Set(tables.map(t => t.section))].sort((a, b) => a.localeCompare(b))
      const chips = await page.getByRole('group', { name: 'Section' }).getByRole('button').allTextContents()
      expect(chips, 'All first, then the sections by name').toEqual(['All', ...sections])
      for (const name of sections) {
        await toolbar(page).section(name).click()
        await expect(toolbar(page).section(name)).toHaveAttribute('aria-pressed', 'true')
        await expect(toolbar(page).section('All')).toHaveAttribute('aria-pressed', 'false')
        await expect.poll(async () => (await cardInfo(page)).map(c => c.label), { message: `section ${name}` })
          .toEqual(wantCards(tables.filter(t => t.section === name), false).map(c => c.label))
      }
      await toolbar(page).section('All').click()
      await expect(cardsOf(page)).toHaveCount(tables.length)
    })

    test('/qr-sheet per page 1 / 4 / 6: A4 sheets of that many cards, last sheet holds the rest', async ({ fx }) => {
      const mgr = await fx.open('manager')
      const tables = await F.sedaTables(mgr)
      const n = wantCards(tables, false).length
      const page = mgr.page
      await openSheet(page)
      for (const per of [1, 4, 6]) {
        await toolbar(page).perPage(per).click()
        await expect(toolbar(page).perPage(per)).toHaveAttribute('aria-checked', 'true')
        const sheets = page.locator('.v2-qr-preview .v2-qr-page')
        await expect(sheets).toHaveCount(Math.ceil(n / per))
        await expect(page.locator(`.v2-qr-preview .v2-qr-page--${per}`)).toHaveCount(Math.ceil(n / per))
        const counts = await sheets.evaluateAll(ss => ss.map(s => s.querySelectorAll('.v2-qr-card').length))
        expect(counts, `cards on each sheet at ${per} per page`).toEqual(Array.from({ length: Math.ceil(n / per) }, (_, i) => Math.min(per, n - i * per)))
        await expect(sheets.first()).toHaveAttribute('aria-label', 'Page 1')
        const box = await sheets.first().boundingBox()
        expect(box.height / box.width, 'A4 proportions (276 x 190 mm)').toBeCloseTo(276 / 190, 1)
      }
    })

    test('/qr-sheet Show access code toggle hides and shows the code on every card', async ({ fx }) => {
      const mgr = await fx.open('manager')
      const tables = await F.sedaTables(mgr)
      const page = mgr.page
      await openSheet(page)
      const n = (await cardInfo(page)).length
      await expect(page.locator('.v2-qr-preview .v2-qr-code')).toHaveCount(n)
      await toolbar(page).code.uncheck()
      await expect(page.locator('.v2-qr-preview .v2-qr-code')).toHaveCount(0)
      await expect(page.locator('.v2-qr-print-root .v2-qr-code'), 'the print copy follows the toggle').toHaveCount(0)
      await toolbar(page).code.check()
      await expect(page.locator('.v2-qr-preview .v2-qr-code')).toHaveCount(n)
      await settledSheet(page)
      expect((await cardInfo(page)).map(c => c.code)).toEqual(wantCards(tables, false).map(c => c.code))
      await expect(page.locator('.v2-qr-print-root .v2-qr-code')).toHaveCount(n)
    })

    test('/qr-sheet Per chair: card count = tables + sum of capacities, "T2 · seat 3" labels, codes <code>-S<n>, filters and paging follow', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager')
      const tables = await F.sedaTables(mgr)
      const page = mgr.page
      await openSheet(page)
      const sum = tables.reduce((s, t) => s + t.capacity, 0)
      await toolbar(page).chair.check()
      await settledSheet(page)
      const total = tables.length + sum
      await expect(cardsOf(page)).toHaveCount(total)
      await expect(page.getByText(`${total} cards: each table plus one per chair.`)).toBeVisible()
      const got = await cardInfo(page)
      const want = wantCards(tables, true)
      expect(got.map(c => [c.label, c.code, c.seat]), 'table card first, then its chairs, per table').toEqual(want.map(c => [c.label, c.code, c.seat]))
      expect(got.filter(c => c.seat).every(c => c.scan === 'Scan to sit here')).toBe(true)
      expect(got.filter(c => c.seat).map(c => c.alt)[0]).toMatch(/^QR code for Table T\d, seat 1$/)
      await shot(testInfo, page, 'qr-sheet-per-chair')

      await test.step('a section filter and the page size apply to the chair cards too', async () => {
        const garden = tables.filter(t => t.section === 'Garden')
        await toolbar(page).section('Garden').click()
        await settledSheet(page)
        const n = garden.length + garden.reduce((s, t) => s + t.capacity, 0)
        await expect(cardsOf(page)).toHaveCount(n)
        await toolbar(page).perPage(4).click()
        await expect(page.locator('.v2-qr-preview .v2-qr-page')).toHaveCount(Math.ceil(n / 4))
        await toolbar(page).code.uncheck()
        await expect(page.locator('.v2-qr-preview .v2-qr-code')).toHaveCount(0)
      })
      await test.step('turning it off again goes back to one card per table', async () => {
        await toolbar(page).section('All').click()
        await toolbar(page).chair.uncheck()
        await expect(cardsOf(page)).toHaveCount(tables.length)
        await expect(page.getByText(/cards: each table plus one per chair/)).toHaveCount(0)
      })
    })

    test('/qr-sheet every QR encodes the right link: table cards and all chair cards decode to <consumer>/t/<code>[-S<n>]', async ({ fx }) => {
      const mgr = await fx.open('manager')
      const tables = await F.sedaTables(mgr)
      const page = mgr.page
      await openSheet(page)
      await toolbar(page).chair.check()
      await settledSheet(page)
      const got = await cardInfo(page)
      const want = wantCards(tables, true)
      expect(got.length).toBe(want.length)
      const bad = []
      for (const [i, c] of got.entries()) {
        const url = F.qrLink(want[i].code)
        const diff = F.qrMismatch(c.src, url)
        if (diff !== 0) bad.push(`${c.label}: ${diff === Infinity ? 'unreadable image' : `${diff} modules differ from ${url}`}`)
      }
      expect(bad, 'cards whose QR is not the link of their label').toEqual([])
      // the checker itself: a card's QR is not the QR of another table's link
      expect(F.qrMismatch(got[0].src, F.qrLink(want[1].code)), 'checker rejects a different code').toBeGreaterThan(20)
      expect(F.qrMismatch(got[0].src, F.qrLink(want[0].code).replace('/t/', '/x/')), 'checker rejects a different path').toBeGreaterThan(20)
      expect(F.qrLink('SEDA-4VMDX7-S3')).toBe(`${CONSUMER_URL}/t/SEDA-4VMDX7-S3`)
    })

    test('a chair QR seats the guest on that chair, a chair past the capacity is refused, the link opens the Join card', async ({ fx }) => {
      const mgr = await fx.open('manager'); const g6 = await fx.open('g6')
      const T = pickFree(await F.sedaTables(mgr), ['T2', 'T3'])
      fx.cleanup(() => F.freeTable(mgr, T.id, [g6]))
      const bad = await g6.rpc('claim_table', { p_code: `${T.code}-S${T.capacity + 1}` })
      expect(F.errOf(bad), `chair ${T.capacity + 1} of a ${T.capacity}-seat table`).toBe('invalid_seat')
      const ok = await g6.rpc('claim_table', { p_code: `${T.code}-S${T.capacity}` })
      expect(ok.ok, `claim_table ${T.code}-S${T.capacity}: ${F.errOf(ok)}`).toBe(true)
      expect(ok.json).toMatchObject({ table_number: T.number, seat_no: T.capacity, session_status: 'active' })
      await F.freeTable(mgr, T.id, [g6])
      await g6.page.goto(curl(`/t/${T.code}-S1`))
      await expect(g6.page.getByRole('heading', { name: 'Join this table?' })).toBeVisible({ timeout: 20_000 })
      await g6.page.getByRole('button', { name: 'Cancel' }).click()
    })

    test('print preview: only the sheets print (toolbar, sidebar and preview hidden), A4 with 10 mm margins, page counts match', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager')
      const tables = await F.sedaTables(mgr)
      const n = wantCards(tables, false).length
      const page = mgr.page
      await openSheet(page)
      const style = sel => page.evaluate(([s]) => { const el = document.querySelector(s); return el ? getComputedStyle(el).display : 'missing' }, [sel])

      await test.step('on screen the print copy is hidden and the app is shown', async () => {
        expect(await style('.v2-qr-print-root'), 'print copy on screen').toBe('none')
        expect(await style('#root')).not.toBe('none')
        await expect(page.locator('body')).toHaveClass(/v2-qr-printing/)
      })

      await page.emulateMedia({ media: 'print' })
      await test.step('print media: app, toolbar, sidebar and preview are gone, the sheets show', async () => {
        expect(await style('#root'), 'the app is hidden when printing').toBe('none')
        await expect(toolbar(page).print).toBeHidden()
        await expect(page.locator('.dash-sidebar')).toBeHidden()
        await expect(page.locator('.v2-qr-preview')).toBeHidden()
        expect(await style('.v2-qr-print-root')).toBe('block')
        const sheets = page.locator('.v2-qr-print-root .v2-qr-page')
        await expect(sheets).toHaveCount(Math.ceil(n / 6))
        const box = await sheets.first().evaluate(el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return { w: r.width, h: r.height, shadow: s.boxShadow, radius: s.borderRadius, bg: s.backgroundColor } })
        expect(box.w, 'sheet width = 190 mm').toBeCloseTo(190 * 96 / 25.4, 0)
        expect(box.h, 'sheet height = 276 mm').toBeCloseTo(276 * 96 / 25.4, 0)
        expect(box.shadow).toBe('none')
        expect(box.radius).toBe('0px')
        await expect(page.locator('.v2-qr-print-root .v2-qr-card')).toHaveCount(n)
        expect(await page.locator('.v2-qr-print-root img.v2-qr-img').evaluateAll(is => is.every(i => i.complete && i.naturalWidth >= 600))).toBe(true)
      })
      await test.step('@page v2qr is A4 with a 10 mm margin', async () => {
        const rule = await page.evaluate(() => {
          for (const sheet of document.styleSheets) {
            let rules; try { rules = sheet.cssRules } catch { continue }
            for (const r of rules) if (r.type === CSSRule.PAGE_RULE && r.selectorText === 'v2qr') return { size: r.style.getPropertyValue('size'), margin: r.style.getPropertyValue('margin') }
          }
          return null
        })
        expect({ size: rule?.size.toLowerCase(), margin: rule?.margin }, 'a named @page v2qr rule').toEqual({ size: 'a4', margin: '10mm' })
      })
      await test.step('the real PDF has one page per sheet, A4, for 6 / 4 / 1 per page and with chairs', async () => {
        const pdf = async () => page.pdf({ preferCSSPageSize: true, printBackground: true })
        let buf = await pdf()
        expect(F.pdfPages(buf), '6 per page').toBe(Math.ceil(n / 6))
        const mb = F.pdfMediaBox(buf)
        expect(mb.w).toBeCloseTo(595.28, 0)
        expect(mb.h).toBeCloseTo(841.89, 0)
        testInfo.attachments.push({ name: 'qr-sheet-6-per-page.pdf', contentType: 'application/pdf', body: buf })
        await page.emulateMedia({ media: 'screen' })
        await toolbar(page).perPage(4).click(); await settledSheet(page)
        buf = await pdf(); expect(F.pdfPages(buf), '4 per page').toBe(Math.ceil(n / 4))
        await toolbar(page).perPage(1).click(); await settledSheet(page)
        buf = await pdf(); expect(F.pdfPages(buf), '1 per page').toBe(n)
        await toolbar(page).perPage(6).click(); await toolbar(page).chair.check(); await settledSheet(page)
        const total = tables.length + tables.reduce((s, t) => s + t.capacity, 0)
        buf = await pdf(); expect(F.pdfPages(buf), 'with chairs').toBe(Math.ceil(total / 6))
      })
      await test.step('leaving the page restores the app for printing elsewhere', async () => {
        await page.emulateMedia({ media: 'screen' })
        await page.getByRole('link', { name: 'Bills' }).first().click()
        await expect(page).toHaveURL(/\/bills$/)
        await expect(page.locator('body')).not.toHaveClass(/v2-qr-printing/)
        await expect(page.locator('.v2-qr-print-root')).toHaveCount(0)
        await page.emulateMedia({ media: 'print' })
        expect(await style('#root'), 'Bills page prints normally').not.toBe('none')
      })
      await page.emulateMedia({ media: null })
    })

    test('Print button stays disabled until every QR is drawn, then calls window.print once', async ({ fx }) => {
      const mgr = await fx.open('manager')
      const page = mgr.page
      await page.addInitScript(() => { window.__prints = 0; window.print = () => { window.__prints += 1 } })
      await page.goto(rurl('/qr-sheet'))
      await expect(page.getByRole('heading', { name: 'QR sheet' })).toBeVisible()
      await settledSheet(page)
      await toolbar(page).print.click()
      expect(await page.evaluate(() => window.__prints)).toBe(1)
      await toolbar(page).chair.check()
      await expect(toolbar(page).print, 'new chair QRs are being drawn').toBeDisabled()
      await settledSheet(page)
    })

    test('a table without an access code is listed as "not printed" and gets no card (table_access_codes response edited)', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager')
      const tables = await F.sedaTables(mgr)
      const page = mgr.page
      await page.route('**/rest/v1/table_access_codes*', async route => {
        const res = await route.fetch()
        const rows = await res.json()
        await route.fulfill({ response: res, json: rows.filter(r => r.table_id !== tables[0].id) })
      })
      await page.goto(rurl('/qr-sheet'))
      await expect(page.locator('.v2-banner--warn')).toContainText('1 table has no access code and won\'t be printed.')
      await expect(page.locator('.v2-missing li')).toHaveText([`Table ${tables[0].number} · No code`])
      await expect(cardsOf(page)).toHaveCount(tables.length - 1)
      await shot(testInfo, page, 'qr-sheet-missing-code')
    })

    test('QR sheet access: manager and admin open it, waiter and kitchen are bounced; the Tables page has Print all QR codes for managers only', async ({ fx }) => {
      const mgr = await fx.open('manager'); const adm = await fx.open('admin'); const w1 = await fx.open('waiter1'); const kit = await fx.open('kitchen')
      for (const who of [mgr, adm]) {
        await who.page.goto(rurl('/qr-sheet'))
        await expect(who.page, `${who.key}`).toHaveURL(/\/qr-sheet$/)
        await expect(who.page.getByRole('heading', { name: 'QR sheet' })).toBeVisible()
      }
      await w1.page.goto(rurl('/qr-sheet')); await expect(w1.page, 'waiter').toHaveURL(/\/waiter$/)
      await kit.page.goto(rurl('/qr-sheet')); await expect(kit.page, 'kitchen').toHaveURL(/\/kds$/)
      await mgr.page.goto(rurl('/tables'))
      const link = mgr.page.getByRole('link', { name: 'Print all QR codes' })
      await expect(link).toHaveAttribute('href', '/qr-sheet')
      await link.click()
      await expect(mgr.page).toHaveURL(/\/qr-sheet$/)
      await w1.page.goto(rurl('/tables'))
      await expect(w1.page.getByRole('heading', { name: /Tables/ }).first()).toBeVisible()
      await expect(w1.page.getByRole('link', { name: 'Print all QR codes' }), 'waiter has no QR sheet button').toHaveCount(0)
    })
  })

  // ───────────────────────────────────── 4. Settings: opening hours and closures ─────────────────────────────────────
  test.describe('Settings: opening hours and closures', () => {
    const WEEK = [1, 2, 3, 4, 5, 6, 0]   // the editor lists Monday first; operating_hours.day_of_week 0 = Sunday
    const NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    const baseOf = dow => `${F.BASE_HOURS[dow][0]}-${F.BASE_HOURS[dow][1]}`
    const gotoHours = async page => { await page.goto(rurl('/settings?tab=hours')); await expect(page.locator('.v2-day')).toHaveCount(7) }
    const row = (page, dow) => page.locator('.v2-day').nth(WEEK.indexOf(dow))
    const day = (page, dow) => ({ sw: page.locator(`#v2-day-${dow}`), open: page.locator(`#v2-day-${dow}-open`), close: page.locator(`#v2-day-${dow}-close`) })
    const saveBtn = page => page.getByRole('button', { name: 'Save hours' })
    const toast = page => page.locator('.v2-toast')
    const hoursDb = async mgr => {
      const r = await mgr.api('GET', `operating_hours?restaurant_id=eq.${SEDA.id}&select=day_of_week,open_time,close_time,is_closed`)
      return Object.fromEntries((r.json || []).map(x => [x.day_of_week, `${x.is_closed ? 'closed ' : ''}${x.open_time.slice(0, 5)}-${x.close_time.slice(0, 5)}`]))
    }
    const saveUi = async page => { await saveBtn(page).click(); await expect(toast(page)).toContainText('Saved ✓'); await expect(toast(page)).not.toContainText('Saved', { timeout: 6_000 }) }
    const slotsFor = (mgr, date, party = 2) => F.anonRpc(mgr, 'get_available_slots', { p_restaurant_id: SEDA.id, p_date: date, p_party_size: party })
    const times = r => (r.json || []).map(s => s.slot_time)
    /** The date strip of the consumer booking wizard at Seda; offset = days from today. Returns what the time step shows. */
    async function wizardDay(anon, offset) {
      await anon.page.goto(curl(`/book/${SEDA.slug}`))
      await expect(anon.page.locator('.bk-day').first()).toBeVisible({ timeout: 20_000 })
      await anon.page.locator('.bk-day').nth(offset).click()
      await expect(anon.page.locator('.slot-btn, .bk-slot-empty').first()).toBeVisible({ timeout: 20_000 })
    }

    test('hours tab: seven rows (Monday first) with the stored hours, Save disabled until a change, one "Copy times to all days", tab deep links', async ({ fx }) => {
      const mgr = await fx.open('manager')
      const page = mgr.page
      await gotoHours(page)
      await expect(page.getByRole('tab', { name: 'Opening hours' })).toHaveAttribute('aria-selected', 'true')
      expect(await page.locator('.v2-day .v2-day-name').allTextContents()).toEqual(NAMES)
      for (const dow of WEEK) {
        const d = day(page, dow)
        await expect(d.sw, NAMES[WEEK.indexOf(dow)]).toHaveAttribute('aria-checked', 'true')
        await expect(d.open).toHaveValue(F.BASE_HOURS[dow][0])
        await expect(d.close).toHaveValue(F.BASE_HOURS[dow][1])
      }
      await expect(saveBtn(page)).toBeDisabled()
      await expect(page.getByRole('button', { name: 'Copy times to all days' })).toHaveCount(1)
      await expect(row(page, 1).getByRole('button', { name: 'Copy times to all days' }), 'the copy button sits on the first open day').toBeVisible()
      await expect(page.getByText('Bookings can\'t run past midnight. A closing time of 00:00 is saved as 23:59.')).toBeVisible()
      for (const [tab, label] of [['rules', 'Booking rules'], ['staff', 'Staff'], ['nope', 'Opening hours']]) {
        await page.goto(rurl(`/settings?tab=${tab}`))
        await expect(page.getByRole('tab', { name: label, exact: true }), `?tab=${tab}`).toHaveAttribute('aria-selected', 'true')
      }
      await page.getByRole('tab', { name: 'Booking rules' }).click()
      await expect(page).toHaveURL(/tab=rules/)
      expect(mgr.watch.consoleErrors, 'console errors on /settings').toEqual([])
    })

    test('hours: edit and Save (toast), the database and a reload keep it, reverting disables Save, a closed day hides its times', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager')
      fx.cleanup(() => F.restoreBaseline(mgr))
      const page = mgr.page
      await gotoHours(page)
      const mon = day(page, 1); const sun = day(page, 0)
      await mon.close.fill('22:00')
      await expect(page.getByText('Unsaved changes')).toBeVisible()
      await expect(saveBtn(page)).toBeEnabled()
      await mon.close.fill(F.BASE_HOURS[1][1])
      await expect(saveBtn(page), 'back to the stored value: nothing to save').toBeDisabled()
      await expect(page.getByText('Unsaved changes')).toHaveCount(0)

      await mon.close.fill('22:00')
      await sun.sw.click()
      await expect(sun.sw).toHaveAttribute('aria-checked', 'false')
      await expect(sun.open, 'a closed day has no time inputs').toHaveCount(0)
      await expect(row(page, 0)).toHaveClass(/is-closed/)
      await shot(testInfo, page, 'hours-edited')
      await saveUi(page)
      const db = await hoursDb(mgr)
      expect(db[1]).toBe('11:00-22:00')
      expect(db[0]).toBe(`closed ${baseOf(0)}`)
      for (const dow of [2, 3, 4, 5, 6]) expect(db[dow], `day ${dow} untouched`).toBe(baseOf(dow))

      await page.reload()
      await expect(page.locator('.v2-day')).toHaveCount(7)
      await expect(day(page, 1).close).toHaveValue('22:00')
      await expect(day(page, 0).sw).toHaveAttribute('aria-checked', 'false')
      await expect(saveBtn(page)).toBeDisabled()
      await day(page, 0).sw.click()       // reopen Sunday: back to the stored times
      await expect(day(page, 0).open).toHaveValue(F.BASE_HOURS[0][0])
    })

    test('hours: "Copy times to all days" copies the first open day\'s times onto every day (closed days keep their closed state)', async ({ fx }) => {
      const mgr = await fx.open('manager')
      fx.cleanup(() => F.restoreBaseline(mgr))
      const page = mgr.page
      await gotoHours(page)
      await day(page, 1).open.fill('12:00'); await day(page, 1).close.fill('20:00')
      await day(page, 2).sw.click()   // Tuesday closed
      await row(page, 1).getByRole('button', { name: 'Copy times to all days' }).click()
      for (const dow of [1, 3, 4, 5, 6, 0]) {
        await expect(day(page, dow).open, `day ${dow} opens`).toHaveValue('12:00')
        await expect(day(page, dow).close, `day ${dow} closes`).toHaveValue('20:00')
      }
      await expect(day(page, 2).sw, 'Tuesday stays closed').toHaveAttribute('aria-checked', 'false')
      await saveUi(page)
      const db = await hoursDb(mgr)
      for (const dow of [1, 3, 4, 5, 6, 0]) expect(db[dow], `day ${dow}`).toBe('12:00-20:00')
      expect(db[2]).toBe('closed 12:00-20:00')
    })

    test('hours: an invalid range (close <= open, or an empty time) is marked, explained and blocks Save; a closed day is never flagged', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager')
      const page = mgr.page
      await gotoHours(page)
      const mon = day(page, 1)
      await mon.close.fill('10:00')
      await expect(row(page, 1)).toHaveClass(/is-invalid/)
      await expect(row(page, 1).getByRole('alert')).toHaveText('Closing time must be after opening time')
      await expect(mon.open).toHaveAttribute('aria-invalid', 'true')
      await expect(mon.close).toHaveAttribute('aria-invalid', 'true')
      await expect(saveBtn(page)).toBeDisabled()
      await expect(page.getByText('Fix the highlighted days to save')).toBeVisible()
      await shot(testInfo, page, 'hours-invalid')

      await mon.close.fill('11:00')   // equal to the opening time
      await expect(row(page, 1), 'closing = opening is invalid').toHaveClass(/is-invalid/)
      await expect(saveBtn(page)).toBeDisabled()
      await mon.close.fill('12:00')
      await expect(row(page, 1)).not.toHaveClass(/is-invalid/)
      await expect(saveBtn(page)).toBeEnabled()

      await mon.open.fill('')
      await expect(row(page, 1), 'an empty time is invalid').toHaveClass(/is-invalid/)
      await expect(saveBtn(page)).toBeDisabled()
      await mon.open.fill('11:00'); await mon.close.fill(F.BASE_HOURS[1][1])
      await expect(saveBtn(page)).toBeDisabled()   // back to stored

      await day(page, 2).close.fill('09:00')
      await day(page, 3).close.fill('09:00')
      await expect(page.locator('.v2-day.is-invalid'), 'two bad days are both marked').toHaveCount(2)
      await day(page, 2).sw.click(); await day(page, 3).sw.click()
      await expect(page.locator('.v2-day.is-invalid'), 'a closed day is not checked').toHaveCount(0)
      await expect(saveBtn(page)).toBeEnabled()
    })

    test('hours: a 00:00 closing time is accepted and saved as 23:59 (database, screen, reload)', async ({ fx }) => {
      const mgr = await fx.open('manager')
      fx.cleanup(() => F.restoreBaseline(mgr))
      const page = mgr.page
      await gotoHours(page)
      await day(page, 1).close.fill('00:00')
      await expect(row(page, 1), '00:00 is not flagged').not.toHaveClass(/is-invalid/)
      await expect(saveBtn(page)).toBeEnabled()
      await saveUi(page)
      expect((await hoursDb(mgr))[1]).toBe('11:00-23:59')
      await expect(day(page, 1).close, 'the field shows what was stored').toHaveValue('23:59')
      await page.reload()
      await expect(day(page, 1).close).toHaveValue('23:59')
      await expect(saveBtn(page)).toBeDisabled()
    })

    test('consumer booking wizard follows the hours: a closed weekday has no slots, new hours give exactly the new slots (00:00 close = 23:59)', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager'); const anon = await fx.anon()
      fx.cleanup(() => F.restoreBaseline(mgr))
      const offset = 8
      const date = bakuDate(offset); const dow = F.dowOf(date)
      const [bo, bc] = F.BASE_HOURS[dow]
      const turn = 75   // default table time for 2 guests, step 30
      const page = mgr.page
      await gotoHours(page)

      expect(times(await slotsFor(mgr, date)), `baseline slots on ${date}`).toEqual(F.expectedSlots(bo, bc, turn, 30))
      await day(page, dow).sw.click()
      await saveUi(page)
      expect((await slotsFor(mgr, date)).json, 'closed weekday: no slots').toEqual([])
      await wizardDay(anon, offset)
      await expect(anon.page.getByText('The restaurant is closed on this date.')).toBeVisible()
      await shot(testInfo, anon.page, 'wizard-closed-day')

      await day(page, dow).sw.click()
      await day(page, dow).open.fill('12:00'); await day(page, dow).close.fill('20:00')
      await saveUi(page)
      expect(times(await slotsFor(mgr, date)), 'hours 12:00-20:00').toEqual(F.expectedSlots('12:00', '20:00', turn, 30))
      await wizardDay(anon, offset)
      expect(await anon.page.locator('.slot-btn').allTextContents()).toEqual(F.expectedSlots('12:00', '20:00', turn, 30))

      await day(page, dow).close.fill('00:00')
      await saveUi(page)
      expect(times(await slotsFor(mgr, date)), '00:00 close is stored as 23:59').toEqual(F.expectedSlots('12:00', '23:59', turn, 30))
      // another weekday keeps its own hours
      const other = bakuDate(offset + 1)
      expect(times(await slotsFor(mgr, other)), 'the next weekday is unchanged').toEqual(F.expectedSlots(...F.BASE_HOURS[F.dowOf(other)], turn, 30))
    })

    test('closures: add (list sorted by date, reason, saved), duplicates and past dates refused, remove; the consumer has no slots on a closed date', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager'); const anon = await fx.anon()
      fx.cleanup(() => F.restoreBaseline(mgr))
      const page = mgr.page
      await gotoHours(page)
      const c1 = bakuDate(10); const c2 = bakuDate(9)
      const dateInput = page.locator('#v2-closure-date'); const reasonInput = page.locator('#v2-closure-reason')
      const addBtn = page.getByRole('button', { name: 'Add closure' })
      const pretty = iso => page.evaluate(d => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }), iso)
      const items = page.locator('.v2-closure')

      await expect(page.getByText('No upcoming closures')).toBeVisible()
      await expect(addBtn, 'no date, no Add').toBeDisabled()
      expect(await reasonInput.getAttribute('maxlength')).toBe('80')
      expect(await dateInput.getAttribute('min'), 'dates before today cannot be picked').toBe(bakuDate())

      await test.step('add one: listed with its date and reason, form cleared, saved toast, stored', async () => {
        await dateInput.fill(c1); await reasonInput.fill(`${F.CLOSURE_REASON}holiday`)
        await addBtn.click()
        await expect(items).toHaveCount(1)
        await expect(items.first()).toContainText(await pretty(c1))
        await expect(items.first()).toContainText(`${F.CLOSURE_REASON}holiday`)
        await expect(dateInput).toHaveValue(''); await expect(reasonInput).toHaveValue('')
        await expect(toast(page)).toContainText('Saved ✓')
        const db = await mgr.api('GET', `special_closures?restaurant_id=eq.${SEDA.id}&select=closed_date,reason`)
        expect(db.json).toEqual([{ closed_date: c1, reason: `${F.CLOSURE_REASON}holiday` }])
      })
      await test.step('an earlier date added later is listed first; a closure needs no reason', async () => {
        await dateInput.fill(c2)
        await addBtn.click()
        await expect(items).toHaveCount(2)
        await expect(items.first()).toContainText(await pretty(c2))
        await expect(items.nth(1)).toContainText(await pretty(c1))
        await shot(testInfo, page, 'closures-two')
      })
      await test.step('duplicate and past dates are refused with a message', async () => {
        await dateInput.fill(c1); await addBtn.click()
        await expect(page.getByRole('alert').filter({ hasText: 'That day is already closed' })).toBeVisible()
        await expect(items).toHaveCount(2)
        await dateInput.fill('2020-01-01'); await addBtn.click()
        await expect(page.getByRole('alert').filter({ hasText: 'Pick today or a later date' })).toBeVisible()
        expect((await mgr.api('GET', `special_closures?restaurant_id=eq.${SEDA.id}&select=id`)).json).toHaveLength(2)
      })
      await test.step('the consumer: no slots on a closed date, the wizard says closed; other dates are fine', async () => {
        expect((await slotsFor(mgr, c1)).json).toEqual([])
        expect((await slotsFor(mgr, c2)).json).toEqual([])
        expect(times(await slotsFor(mgr, bakuDate(11))).length, 'the day after').toBeGreaterThan(0)
        await wizardDay(anon, 10)
        await expect(anon.page.getByText('The restaurant is closed on this date.')).toBeVisible()
        await wizardDay(anon, 11)
        await expect(anon.page.locator('.slot-btn').first()).toBeVisible()
      })
      await test.step('remove: gone from the list and the database, slots are back', async () => {
        await page.getByRole('button', { name: `Remove closure on ${await pretty(c1)}` }).click()
        await expect(items).toHaveCount(1)
        await page.getByRole('button', { name: `Remove closure on ${await pretty(c2)}` }).click()
        await expect(items).toHaveCount(0)
        await expect(page.getByText('No upcoming closures')).toBeVisible()
        expect((await mgr.api('GET', `special_closures?restaurant_id=eq.${SEDA.id}&select=id`)).json).toEqual([])
        expect(times(await slotsFor(mgr, c1)).length).toBeGreaterThan(0)
        await page.reload()
        await expect(page.getByText('No upcoming closures')).toBeVisible()
      })
    })

    test('closures: today can be closed (no slots today), and a closure that is today or later shows up after a reload while a past one does not', async ({ fx }) => {
      const mgr = await fx.open('manager')
      fx.cleanup(() => F.restoreBaseline(mgr))
      const page = mgr.page
      const today = bakuDate()
      await gotoHours(page)
      await page.locator('#v2-closure-date').fill(today)
      await page.getByRole('button', { name: 'Add closure' }).click()
      await expect(page.locator('.v2-closure')).toHaveCount(1)
      expect((await slotsFor(mgr, today)).json, 'a closure today closes today').toEqual([])
      // a closure in the past (inserted behind the form's back, as old rows would be) is not listed
      const old = await mgr.api('POST', 'special_closures', { restaurant_id: SEDA.id, closed_date: bakuDate(-3), reason: `${F.CLOSURE_REASON}past` }, 'return=representation')
      expect(old.ok, `insert a past closure: ${old.text}`).toBe(true)
      await page.reload()
      await expect(page.locator('.v2-closure')).toHaveCount(1)
      await expect(page.locator('.v2-closure').first()).not.toContainText('past')
    })
  })

  // ───────────────────────────────────── 5. Settings: booking rules, staff, write gates ─────────────────────────────────────
  test.describe('Settings: booking rules, staff and write gates', () => {
    const gotoRules = async page => { await page.goto(rurl('/settings?tab=rules')); await expect(page.locator('#v2-turn12')).toBeVisible() }
    const rf = (page, key) => page.locator(`#v2-${key}`)
    const saveRules = page => page.getByRole('button', { name: 'Save rules' })
    const toast = page => page.locator('.v2-toast')
    const FIELDS = [['turn12', 30, 240], ['turn34', 30, 240], ['turn56', 30, 240], ['turn7', 30, 240], ['buffer', 0, 60], ['maxCovers', 1, 500, true], ['maxParty', 1, 50], ['minNotice', 0, 1440], ['autoCancel', 0, 120]]
    const DEFAULTS = { slotStep: '30', turn12: '75', turn34: '90', turn56: '105', turn7: '120', buffer: '10', maxCovers: '', maxParty: '20', minNotice: '30', autoCancel: '15' }
    async function fillRules(page, vals) {
      for (const [k, v] of Object.entries(vals)) {
        if (k === 'slotStep') await page.locator('#v2-slotStep').selectOption(String(v))
        else await rf(page, k).fill(String(v))
      }
    }
    // the toast of an earlier save stays up for 2 s: wait for it to go before saving, so "Saved" is this save's
    const saveRulesUi = async page => {
      await expect(toast(page)).not.toContainText('Saved', { timeout: 6_000 })
      await saveRules(page).click()
      await expect(toast(page)).toContainText('Saved ✓')
    }
    const rulesDb = async mgr => ({
      s: (await mgr.api('GET', `restaurant_settings?restaurant_id=eq.${SEDA.id}&select=max_party_size,min_booking_notice,auto_cancel_minutes,allow_walk_in,group_booking_enabled`)).json?.[0],
      r: (await mgr.api('GET', `availability_rules?restaurant_id=eq.${SEDA.id}&select=*`)).json?.[0],
    })
    const slotsFor = (mgr, date, party = 2) => F.anonRpc(mgr, 'get_available_slots', { p_restaurant_id: SEDA.id, p_date: date, p_party_size: party })
    const times = r => (r.json || []).map(s => s.slot_time)

    test('booking rules: form shows the defaults when no rules are stored, every field refuses out-of-range / fractional / empty values (max covers may be empty)', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager')
      const page = mgr.page
      await gotoRules(page)
      for (const [k, v] of Object.entries(DEFAULTS)) {
        if (k === 'slotStep') await expect(page.locator('#v2-slotStep')).toHaveValue(v)
        else await expect(rf(page, k), k).toHaveValue(v)
      }
      await expect(page.getByRole('switch', { name: 'Allow walk-ins' })).toHaveAttribute('aria-checked', 'true')
      await expect(page.getByRole('switch', { name: 'Group booking links' })).toHaveAttribute('aria-checked', 'true')
      for (const name of ['Garden', 'Main Hall', 'VIP Room']) await expect(page.getByRole('checkbox', { name })).toBeChecked()
      await expect(saveRules(page)).toBeDisabled()
      await expect(page.getByText('Booking deposits')).toBeVisible()
      await expect(page.getByText('Coming soon')).toBeVisible()

      const err = key => page.locator(`#v2-${key}-err`)
      for (const [key, min, max, optional] of FIELDS) {
        const msg = `Enter a whole number from ${min} to ${max}`
        const input = rf(page, key)
        for (const bad of [String(min - 1), String(max + 1), '1.5']) {
          if (min === 0 && bad === '-1') { /* -1 is still a number below the minimum */ }
          await input.fill(bad)
          await expect(err(key), `${key} = ${bad}`).toHaveText(msg)
          await expect(input).toHaveAttribute('aria-invalid', 'true')
          await expect(saveRules(page), `Save with ${key} = ${bad}`).toBeDisabled()
        }
        await input.fill('')
        if (optional) await expect(err(key), `${key} may stay empty`).toHaveCount(0)
        else await expect(err(key), `${key} must not be empty`).toHaveText(msg)
        for (const good of [String(min), String(max)]) {
          await input.fill(good)
          await expect(err(key), `${key} = ${good}`).toHaveCount(0)
        }
        await input.fill(DEFAULTS[key])
      }
      await rf(page, 'turn12').fill('5')
      await expect(page.getByText('Fix the highlighted values to save')).toBeVisible()
      await shot(testInfo, page, 'rules-invalid')
      expect(mgr.watch.consoleErrors, 'console errors on the rules tab').toEqual([])
    })

    test('booking rules: Save stores every value (settings + availability rules), the form shows them after a reload, all sections checked = NULL', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager')
      fx.cleanup(() => F.restoreBaseline(mgr))
      const page = mgr.page
      await gotoRules(page)
      await fillRules(page, { slotStep: 60, turn12: 100, turn34: 110, turn56: 120, turn7: 130, buffer: 15, maxCovers: 12, maxParty: 8, minNotice: 45, autoCancel: 20 })
      await page.getByRole('switch', { name: 'Allow walk-ins' }).click()
      await page.getByRole('switch', { name: 'Group booking links' }).click()
      await page.getByRole('checkbox', { name: 'VIP Room' }).uncheck()
      await expect(page.getByText('Unsaved changes')).toBeVisible()
      await saveRulesUi(page)
      await shot(testInfo, page, 'rules-saved')

      const sections = (await mgr.api('GET', `sections?restaurant_id=eq.${SEDA.id}&select=id,name`)).json
      const keep = sections.filter(s => s.name !== 'VIP Room').map(s => s.id).sort()
      let db = await rulesDb(mgr)
      expect(db.s).toEqual({ max_party_size: 8, min_booking_notice: 45, auto_cancel_minutes: 20, allow_walk_in: false, group_booking_enabled: false })
      expect(db.r).toMatchObject({ slot_step_minutes: 60, turn_minutes_1_2: 100, turn_minutes_3_4: 110, turn_minutes_5_6: 120, turn_minutes_7_plus: 130, buffer_minutes: 15, max_covers_per_slot: 12 })
      expect([...db.r.online_section_ids].sort(), 'VIP Room left out').toEqual(keep)

      await page.reload()
      await expect(rf(page, 'turn12')).toHaveValue('100')
      await expect(page.locator('#v2-slotStep')).toHaveValue('60')
      await expect(rf(page, 'maxCovers')).toHaveValue('12')
      await expect(rf(page, 'maxParty')).toHaveValue('8')
      await expect(page.getByRole('switch', { name: 'Allow walk-ins' })).toHaveAttribute('aria-checked', 'false')
      await expect(page.getByRole('checkbox', { name: 'VIP Room' })).not.toBeChecked()
      await expect(page.getByRole('checkbox', { name: 'Garden' })).toBeChecked()
      await expect(saveRules(page)).toBeDisabled()

      await page.getByRole('checkbox', { name: 'VIP Room' }).check()
      await rf(page, 'maxCovers').fill('')
      await saveRulesUi(page)
      db = await rulesDb(mgr)
      expect(db.r.online_section_ids, 'every section checked is stored as NULL (new sections are included)').toBeNull()
      expect(db.r.max_covers_per_slot, 'an empty max covers is stored as no limit').toBeNull()
    })

    test('consumer follows the rules: table times per party size and the slot step decide the slot list', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager'); const anon = await fx.anon()
      fx.cleanup(() => F.restoreBaseline(mgr))
      const date = bakuDate(8); const [bo, bc] = F.BASE_HOURS[F.dowOf(date)]
      const page = mgr.page
      await gotoRules(page)
      await fillRules(page, { slotStep: 60, turn12: 120, turn34: 100, turn56: 110, turn7: 130 })
      await saveRulesUi(page)
      for (const [party, turn] of [[1, 120], [2, 120], [3, 100], [4, 100], [5, 110], [6, 110], [7, 130], [10, 130]]) {
        expect(times(await slotsFor(mgr, date, party)), `party of ${party}: table time ${turn} min, step 60`).toEqual(F.expectedSlots(bo, bc, turn, 60))
      }
      await anon.page.goto(curl(`/book/${SEDA.slug}`))
      await anon.page.locator('.bk-day').nth(8).click()
      await expect(anon.page.locator('.slot-btn').first()).toBeVisible({ timeout: 20_000 })
      expect(await anon.page.locator('.slot-btn').allTextContents(), 'the wizard lists the same slots (party of 2)').toEqual(F.expectedSlots(bo, bc, 120, 60))
      await shot(testInfo, anon.page, 'wizard-hourly-slots')
    })

    test('consumer follows the rules: max party size and max covers per slot', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager'); const anon = await fx.anon()
      fx.cleanup(() => F.restoreBaseline(mgr))
      const date = bakuDate(8)
      const page = mgr.page
      await gotoRules(page)
      await fillRules(page, { maxParty: 4 })
      await saveRulesUi(page)
      expect(F.errOf(await slotsFor(mgr, date, 5)), 'a party above the maximum').toBe('invalid_party_size')
      expect((await slotsFor(mgr, date, 4)).ok, 'a party of the maximum').toBe(true)
      await anon.page.goto(curl(`/book/${SEDA.slug}`))
      await anon.page.locator('.bk-day').nth(8).click()
      const more = anon.page.getByRole('button', { name: 'More guests' })
      for (let i = 0; i < 3; i++) await more.click()   // 2 -> 5
      await expect(anon.page.getByText("That party size isn't accepted here. Pick a different number of guests.")).toBeVisible({ timeout: 20_000 })
      await shot(testInfo, anon.page, 'wizard-party-too-large')
      await anon.page.getByRole('button', { name: 'Fewer guests' }).click()   // 4
      await expect(anon.page.locator('.slot-btn').first()).toBeVisible({ timeout: 20_000 })

      const before = (await slotsFor(mgr, date, 3)).json
      test.skip(!before.some(s => s.available), 'no table for 3 is free on that date, max covers cannot be observed')
      await fillRules(page, { maxParty: 20, maxCovers: 2 })
      await saveRulesUi(page)
      const three = (await slotsFor(mgr, date, 3)).json
      expect(three.length).toBeGreaterThan(0)
      expect(three.every(s => s.available === false && s.reason === 'full'), 'max 2 covers per slot: a party of 3 never fits').toBe(true)
      expect((await slotsFor(mgr, date, 2)).json.some(s => s.available), 'a party of 2 fits under 2 covers').toBe(true)
      await anon.page.goto(curl(`/book/${SEDA.slug}`))
      await anon.page.locator('.bk-day').nth(8).click()
      await expect(anon.page.locator('.slot-btn:not([disabled])').first(), 'party of 2: bookable slots').toBeVisible({ timeout: 20_000 })
      await anon.page.getByRole('button', { name: 'More guests' }).click()   // party of 3
      await expect(anon.page.getByText('No tables are free on this day for your party size.')).toBeVisible({ timeout: 20_000 })
      await shot(testInfo, anon.page, 'wizard-max-covers-full')
    })

    test('consumer follows the rules: minimum notice marks the slots inside it "too_soon"', async ({ fx }) => {
      const mgr = await fx.open('manager')
      fx.cleanup(() => F.restoreBaseline(mgr))
      const tomorrow = bakuDate(1)
      const reasons = r => [...new Set((r.json || []).map(s => s.reason))]
      expect(reasons(await slotsFor(mgr, tomorrow)), 'with 30 min notice nothing tomorrow is too soon').not.toContain('too_soon')
      const page = mgr.page
      await gotoRules(page)
      await fillRules(page, { minNotice: 1440 })
      await saveRulesUi(page)
      const r = await slotsFor(mgr, tomorrow)
      const inside = r.json.filter(s => Date.parse(s.starts_at) < Date.now() + 1440 * 60_000)
      const outside = r.json.filter(s => Date.parse(s.starts_at) >= Date.now() + 1440 * 60_000 + 60_000)
      expect(inside.every(s => s.available === false && s.reason === 'too_soon'), `slots within 24 h: ${JSON.stringify(inside.slice(0, 2))}`).toBe(true)
      expect(outside.every(s => s.reason !== 'too_soon'), 'slots beyond 24 h are not too soon').toBe(true)
      const today = await slotsFor(mgr, bakuDate())
      expect(today.json.every(s => s.reason === 'too_soon'), 'today is entirely inside 24 h').toBe(true)
    })

    test('consumer follows the rules: online-bookable sections decide which tables a booking can use', async ({ fx }) => {
      const mgr = await fx.open('manager')
      fx.cleanup(() => F.restoreBaseline(mgr))
      const date = bakuDate(8)
      const freeSum = r => (r.json || []).reduce((s, x) => s + (x.tables_free || 0), 0)
      const baseline = freeSum(await slotsFor(mgr, date, 8))
      test.skip(baseline === 0, 'no table for 8 guests is free on that date, the section filter cannot be observed')
      const page = mgr.page
      await gotoRules(page)
      await page.getByRole('checkbox', { name: 'Garden' }).uncheck()
      await page.getByRole('checkbox', { name: 'VIP Room' }).uncheck()
      await saveRulesUi(page)
      const mainOnly = await slotsFor(mgr, date, 8)
      expect(freeSum(mainOnly), 'only Main Hall (tables of 4 and 6) is bookable: nothing for 8').toBe(0)
      expect(mainOnly.json.every(s => !s.available)).toBe(true)
      expect(freeSum(await slotsFor(mgr, date, 4)), 'but a party of 4 still has Main Hall tables').toBeGreaterThan(0)

      await page.getByRole('checkbox', { name: 'Main Hall' }).uncheck()
      await expect(page.getByText("No section is checked, so guests can't book online.")).toBeVisible()
      await expect(saveRules(page), 'saving with no section is allowed (it closes online booking)').toBeEnabled()
      await saveRulesUi(page)
      expect((await slotsFor(mgr, date, 2)).json.every(s => !s.available), 'no section: nothing can be booked online').toBe(true)
    })

    test('staff tab: the whole team with names and roles (read-only), invite is disabled', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager'); const adm = await fx.open('admin')
      const staff = await F.sedaStaff(mgr)
      expect(staff.length).toBeGreaterThanOrEqual(9)
      for (const who of [mgr, adm]) {
        const page = who.page
        await page.goto(rurl('/settings?tab=staff'))
        await expect(page.getByRole('heading', { name: 'Team' })).toBeVisible()
        await expect(page.getByText('Read-only list. Staff changes are made by Rufesto for now.')).toBeVisible()
        const rows = page.locator('.v2-staff-row')
        await expect(rows, `${who.key}: one row per staff member`).toHaveCount(staff.length)
        const ui = await rows.evaluateAll(rs => rs.map(r => ({ name: r.querySelector('.v2-staff-name').textContent.trim(), avatar: r.querySelector('.v2-avatar').textContent.trim(), pills: [...r.querySelectorAll('.v2-pill')].map(p => p.textContent.trim()) })))
        const label = r => ({ admin: 'Admin', manager: 'Manager', waiter: 'Waiter', host: 'Host', cashier: 'Cashier', kitchen: 'Kitchen' }[r] || r)
        expect(ui.map(u => `${u.name} | ${u.pills.join(' / ')}`).sort(), `${who.key}: names, roles, status`)
          .toEqual(staff.map(s => `${s.display_name} | ${label(s.role)} / ${s.active ? 'Active' : 'Inactive'}`).sort())
        expect(ui.every(u => u.avatar === u.name[0].toUpperCase()), 'avatar initials').toBe(true)
        const created = new Map(staff.map(s => [s.display_name, s.created_at]))
        const order = ui.map(u => created.get(u.name))
        expect(order, 'oldest team member first').toEqual([...order].sort())
        await expect(page.getByRole('heading', { name: 'Invite staff' })).toBeVisible()
        await expect(page.getByText('Coming soon: invite by email or phone')).toBeVisible()
        await expect(page.getByRole('button', { name: 'Invite staff' })).toBeDisabled()
      }
      await shot(testInfo, mgr.page, 'settings-staff')
      expect(mgr.watch.consoleErrors, 'console errors on the staff tab').toEqual([])
    })

    test('staff list and settings writes are closed to waiters, kitchen and managers of other restaurants (nothing changes)', async ({ fx }) => {
      const mgr = await fx.open('manager'); const w1 = await fx.open('waiter1'); const kit = await fx.open('kitchen'); const sak = await fx.open('sakura')
      fx.cleanup(() => F.restoreBaseline(mgr))
      for (const who of [w1, kit, sak]) {
        expect(F.errOf(await who.rpc('list_staff', { p_restaurant_id: SEDA.id })), `${who.key} list_staff`).toBe('not_allowed')
      }
      for (const who of [w1, kit, sak]) {
        const tries = [
          await who.api('PATCH', `operating_hours?restaurant_id=eq.${SEDA.id}&day_of_week=eq.1`, { close_time: '21:15' }, 'return=representation'),
          await who.api('POST', 'operating_hours?on_conflict=restaurant_id,day_of_week', [{ restaurant_id: SEDA.id, day_of_week: 2, open_time: '10:00', close_time: '21:15', is_closed: false }], 'resolution=merge-duplicates,return=representation'),
          await who.api('POST', 'special_closures', { restaurant_id: SEDA.id, closed_date: bakuDate(30), reason: `${F.CLOSURE_REASON}intruder` }, 'return=representation'),
          await who.api('PATCH', `restaurant_settings?restaurant_id=eq.${SEDA.id}`, { max_party_size: 3 }, 'return=representation'),
          await who.api('POST', 'availability_rules?on_conflict=restaurant_id', { restaurant_id: SEDA.id, slot_step_minutes: 15 }, 'resolution=merge-duplicates,return=representation'),
        ]
        for (const [i, t] of tries.entries()) {
          const wrote = t.ok && Array.isArray(t.json) && t.json.length > 0
          expect(wrote, `${who.key}: write #${i + 1} must not change a row (${t.status} ${t.text.slice(0, 80)})`).toBe(false)
        }
      }
      expect(await F.baselineDiff(mgr), 'Seda still equals its baseline').toEqual([])
      for (const who of [w1, kit, sak]) {
        expect(F.errOf(await who.rpc('void_bill', { p_bill_id: '00000000-0000-0000-0000-000000000000', p_reason: 'x' })), `${who.key} void_bill`).toMatch(/forbidden|bill_not_found/)
      }
      expect(F.errOf(await sak.rpc('restaurant_bills', { p_restaurant_id: SEDA.id })), 'another restaurant\'s manager reads Seda bills').toBe('forbidden')
      expect(F.errOf(await sak.rpc('tip_report', { p_restaurant_id: SEDA.id, p_from: bakuDate(), p_to: bakuDate() })), 'another restaurant\'s manager reads Seda tips').toBe('not_allowed')
    })
  })

  // ───────────────────────────────────── 5b. Failing calls: retry, partial save, readable messages, double taps ─────────────────────────────────────
  test.describe('Failing calls and double taps', () => {
    const json = (status, body) => ({ status, contentType: 'application/json', body: JSON.stringify(body) })
    const RAW = /serialize|violates|constraint|policy|jwt|postgres|sql|pgrst|\[object/i
    const toast = page => page.locator('.v2-toast')

    test('a page whose data call fails once shows a readable error with "Try again" and recovers (Bills, Tips, QR sheet, hours, rules, staff)', async ({ fx }) => {
      const mgr = await fx.open('manager')
      const cases = [
        ['/bills', /rpc\/restaurant_bills/, p => p.locator('.v2-stats .stat-card').first()],
        ['/tips', /rpc\/tip_report/, p => p.locator('.v2-stats .stat-card').first()],
        ['/qr-sheet', /rest\/v1\/tables\?/, p => p.locator('.v2-qr-preview .v2-qr-card').first()],
        ['/settings?tab=hours', /rest\/v1\/operating_hours/, p => p.locator('.v2-day').first()],
        ['/settings?tab=rules', /rest\/v1\/restaurant_settings/, p => p.locator('#v2-turn12')],
        ['/settings?tab=staff', /rpc\/list_staff/, p => p.locator('.v2-staff-row').first()],
      ]
      for (const [route, call, ok] of cases) {
        const page = await mgr.context.newPage()
        let failed = 0
        await page.route(call, async r => {
          if (r.request().method() !== 'GET' && r.request().method() !== 'POST') return r.continue()
          if (failed++ === 0) return r.fulfill(json(500, { code: 'XX000', message: 'internal error: could not serialize access', details: null, hint: null }))
          return r.continue()
        })
        await page.goto(rurl(route))
        const err = page.locator('.v2-load-error')
        await expect(err, `${route}: error state`).toBeVisible({ timeout: 20_000 })
        expect(await err.textContent(), `${route}: no raw database text`).not.toMatch(RAW)
        await err.getByRole('button', { name: 'Try again' }).click()
        await expect(ok(page), `${route}: recovers`).toBeVisible({ timeout: 20_000 })
        await expect(err).toHaveCount(0)
        await page.close()
      }
    })

    test('writes that fail show a readable message and never database text: hours, closure, booking rules, Mark paid', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager'); const g4 = await fx.open('g4')
      const T = pickFree(await F.sedaTables(mgr), ['T2', 'T3'])
      fx.cleanup(() => F.freeTable(mgr, T.id, [g4]))
      fx.cleanup(() => F.restoreBaseline(mgr))
      const dishes = await F.cheapDishes(mgr)
      await F.seat(g4, T.code); await F.placeOrder(g4, T.id, dishes.slice(0, 1)); const bill = await F.myBill(g4)
      await g4.rpc('split_bill', { p_bill_id: bill.bill_id, p_mode: 'own', p_assignments: {} })
      const raw = { code: '40001', message: 'could not serialize access due to concurrent update', details: 'violates policy', hint: null }
      const page = mgr.page
      const fail = pattern => page.route(pattern, r => (['POST', 'PATCH', 'DELETE'].includes(r.request().method()) ? r.fulfill(json(400, raw)) : r.continue()))

      await fail(/rest\/v1\/operating_hours/)
      await page.goto(rurl('/settings?tab=hours'))
      await expect(page.locator('.v2-day')).toHaveCount(7)
      await page.locator('#v2-day-1-close').fill('22:00')
      await page.getByRole('button', { name: 'Save hours' }).click()
      const banner = page.locator('.v2-banner--error')
      await expect(banner, 'hours save failure').toBeVisible()
      expect(await banner.textContent()).not.toMatch(RAW)
      await expect(toast(page)).not.toContainText('Saved')
      await expect(page.getByRole('button', { name: 'Save hours' }), 'the edit is kept so it can be retried').toBeEnabled()
      await expect(page.locator('#v2-day-1-close')).toHaveValue('22:00')
      await shot(testInfo, page, 'write-failure-hours')

      await fail(/rest\/v1\/special_closures/)
      await page.locator('#v2-closure-date').fill(bakuDate(12))
      await page.getByRole('button', { name: 'Add closure' }).click()
      const closureErr = page.locator('.v2-closure-form ~ .v2-field-error, section .v2-field-error').last()
      await expect(closureErr, 'closure failure').toBeVisible()
      expect(await closureErr.textContent()).not.toMatch(RAW)
      await expect(page.locator('.v2-closure')).toHaveCount(0)

      await fail(/rest\/v1\/restaurant_settings/)
      await page.goto(rurl('/settings?tab=rules'))
      await expect(page.locator('#v2-turn12')).toBeVisible()
      await page.locator('#v2-maxParty').fill('7')
      await page.getByRole('button', { name: 'Save rules' }).click()
      await expect(page.locator('.v2-banner--error'), 'rules save failure').toBeVisible()
      expect(await page.locator('.v2-banner--error').textContent()).not.toMatch(RAW)
      await expect(page.locator('#v2-maxParty'), 'the edit is kept').toHaveValue('7')

      await fail(/rest\/v1\/rpc\/staff_settle_share/)
      await page.goto(rurl('/bills'))
      const card = billCard(page, T.number)
      await expect(card).toBeVisible()
      await shareRow(card, 'Tural').getByRole('button', { name: 'Mark paid' }).click()
      await expect(page.getByRole('alert').filter({ hasText: /\S/ }).first(), 'Mark paid failure').toBeVisible()
      expect(await page.getByRole('alert').first().textContent()).not.toMatch(RAW)
      await expect(shareRow(card, 'Tural').locator('.v2-share-state--owes'), 'rolled back').toBeVisible()
      expect(await F.baselineDiff(mgr), 'no failed write changed anything').toEqual([])
    })

    test('booking rules: when the second of the two writes fails, the form reloads with what the server holds and says only part was saved', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager')
      fx.cleanup(() => F.restoreBaseline(mgr))
      const page = mgr.page
      await page.route(/rest\/v1\/availability_rules/, r => (r.request().method() === 'POST' ? r.fulfill(json(403, { code: '42501', message: 'new row violates row-level security policy for table "availability_rules"', details: null, hint: null })) : r.continue()))
      await page.goto(rurl('/settings?tab=rules'))
      await expect(page.locator('#v2-turn12')).toBeVisible()
      await page.locator('#v2-maxParty').fill('7')
      await page.locator('#v2-turn12').fill('100')
      await page.getByRole('button', { name: 'Save rules' }).click()
      await expect(page.getByText('Only part of your changes was saved, so the form was reloaded with what the restaurant has now. Check the values and save again.')).toBeVisible()
      await expect(page.locator('#v2-maxParty'), 'the stored half is shown').toHaveValue('7')
      await expect(page.locator('#v2-turn12'), 'the refused half is shown as stored').toHaveValue('75')
      await shot(testInfo, page, 'rules-partial-save')
      const s = (await mgr.api('GET', `restaurant_settings?restaurant_id=eq.${SEDA.id}&select=max_party_size`)).json[0]
      expect(s.max_party_size).toBe(7)
    })

    test('double tap in the same tick: Mark paid and the confirm of Mark whole bill paid send one request each and show no "already paid" error', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager'); const g4 = await fx.open('g4')
      const T = pickFree(await F.sedaTables(mgr), ['T2', 'T3'])
      fx.cleanup(() => F.freeTable(mgr, T.id, [g4]))
      const dishes = await F.cheapDishes(mgr)
      await F.seat(g4, T.code); await F.placeOrder(g4, T.id, dishes.slice(0, 1)); const bill = await F.myBill(g4)
      await g4.rpc('split_bill', { p_bill_id: bill.bill_id, p_mode: 'own', p_assignments: {} })
      const page = mgr.page
      const calls = { settle: 0, close: 0 }
      page.on('request', r => { if (/rpc\/staff_settle_share/.test(r.url())) calls.settle++; if (/rpc\/close_bill/.test(r.url())) calls.close++ })
      await page.goto(rurl('/bills'))
      await showAll(page)
      const card = billCard(page, T.number)
      const share = shareRow(card, 'Tural')
      await expect(share).toBeVisible()
      await share.getByRole('button', { name: 'Mark paid' }).evaluate(b => { b.click(); b.click() })
      await expect(share.locator('.v2-share-state--paid')).toBeVisible()
      await page.waitForTimeout(1_500)
      expect.soft(calls.settle, 'staff_settle_share requests for a double tap').toBe(1)
      await expect.soft(page.getByRole('alert'), 'an error banner after a double tap on Mark paid').toHaveCount(0)
      await shot(testInfo, page, 'double-tap-mark-paid')

      // a second bill for the whole-bill confirm
      await F.freeTable(mgr, T.id, [g4])
      await F.seat(g4, T.code); await F.placeOrder(g4, T.id, dishes.slice(0, 1)); await F.myBill(g4)
      await page.reload()
      await showAll(page)
      const card2 = billCard(page, T.number, 'open')
      await expect(card2).toBeVisible({ timeout: 15_000 })
      await card2.getByRole('button', { name: 'Mark whole bill paid' }).click()
      await page.getByRole('dialog').getByRole('button', { name: 'Mark whole bill paid' }).evaluate(b => { b.click(); b.click() })
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await page.waitForTimeout(1_500)
      expect.soft(calls.close, 'close_bill requests for a double tap').toBe(1)
      await expect.soft(page.getByRole('alert'), 'an error banner after a double tap on the whole-bill confirm').toHaveCount(0)
    })
  })

  // ───────────────────────────────────── 6. Role gates ─────────────────────────────────────
  test.describe('Role gates', () => {
    const ROUTES = ['/bills', '/tips', '/my-tips', '/settings', '/qr-sheet']
    const HOME = { admin: '/', manager: '/', waiter: '/waiter', host: '/waiter', cashier: '/waiter', kitchen: '/kds' }
    // lib/roles.js + features/v2/nav.js: bills admin / manager / cashier; tips and settings and the QR sheet admin / manager;
    // my-tips every floor role (waiter, host, cashier, manager, admin); kitchen none.
    const ALLOWED = {
      admin: ROUTES, manager: ROUTES,
      cashier: ['/bills', '/my-tips'], waiter: ['/my-tips'], host: ['/my-tips'], kitchen: [],
    }
    const pathOf = page => new URL(page.url()).pathname
    const navHrefs = async (page, sel) => { await page.locator(sel).first().waitFor({ state: 'attached' }); return page.locator(sel).evaluateAll(as => as.map(a => new URL(a.href).pathname)) }

    test('every settings / money route per role: admin and manager open all, waiter only /my-tips, kitchen none (bounced to the role home); URL case and trailing slash do not matter; sidebar and bottom nav agree', async ({ fx }) => {
      const mgr = await fx.open('manager'); const adm = await fx.open('admin'); const w1 = await fx.open('waiter1'); const kit = await fx.open('kitchen')
      const by = { admin: adm, manager: mgr, waiter: w1, kitchen: kit }
      for (const [role, who] of Object.entries(by)) {
        for (const route of ROUTES) {
          await who.page.goto(rurl(route))
          await layoutReady(who.page)
          const want = ALLOWED[role].includes(route) ? route : HOME[role]
          expect(pathOf(who.page), `${role} on ${route}`).toBe(want)
        }
      }
      await mgr.page.goto(rurl('/Bills/'))
      await expect(mgr.page.getByRole('heading', { name: 'Bills', exact: true }), 'manager on /Bills/').toBeVisible()
      await w1.page.goto(rurl('/MY-TIPS'))
      await expect(w1.page.getByRole('heading', { level: 1, name: 'My tips' }), 'waiter on /MY-TIPS').toBeVisible()
      await w1.page.goto(rurl('/Tips/'))
      await layoutReady(w1.page)
      expect(pathOf(w1.page), 'waiter on /Tips/').toBe('/waiter')
      await kit.page.goto(rurl('/nope'))
      await layoutReady(kit.page)
      expect(pathOf(kit.page), 'unknown route').toBe('/kds')

      // sidebar (desktop) and bottom nav (<= 768 px) list exactly the allowed v2 pages
      const v2 = list => list.filter(p => ['/bills', '/tips', '/my-tips', '/settings', '/qr-sheet'].includes(p)).sort()
      for (const [role, who] of Object.entries(by)) {
        await who.page.goto(rurl(HOME[role]))
        await layoutReady(who.page)
        const wantNav = ALLOWED[role].filter(r => r !== '/qr-sheet' && !(r === '/my-tips' && ['admin', 'manager'].includes(role))).sort()   // hidden entries
        expect(v2(await navHrefs(who.page, '.dash-nav a')), `${role} sidebar`).toEqual(wantNav)
        expect(v2(await navHrefs(who.page, '.dash-mobile-nav a')), `${role} bottom nav`).toEqual(wantNav)
      }
    })

    test('cashier and host (role of the staff row edited in the response; the UI gate only): cashier opens /bills and /my-tips, host only /my-tips', async ({ fx }) => {
      const mgr = await fx.open('manager')
      for (const role of ['cashier', 'host']) {
        const page = await mgr.context.newPage()
        await page.route(/\/rest\/v1\/staff\?/, async route => {
          const res = await route.fetch()
          const rows = await res.json().catch(() => null)
          await route.fulfill({ response: res, json: Array.isArray(rows) ? rows.map(r => ({ ...r, role })) : rows })
        })
        for (const route of ROUTES) {
          await page.goto(rurl(route))
          await layoutReady(page)
          const want = ALLOWED[role].includes(route) ? route : HOME[role]
          expect(pathOf(page), `${role} on ${route}`).toBe(want)
        }
        await page.close()
      }
    })

    test('the server agrees with the gates: kitchen reads no bills, waiters read no tip report or staff list, a waiter may read bills (cashier work)', async ({ fx }) => {
      const w1 = await fx.open('waiter1'); const kit = await fx.open('kitchen')
      expect(F.errOf(await kit.rpc('restaurant_bills', { p_restaurant_id: SEDA.id })), 'kitchen restaurant_bills').toBe('forbidden')
      expect((await w1.rpc('restaurant_bills', { p_restaurant_id: SEDA.id })).ok, 'waiter restaurant_bills (floor role)').toBe(true)
      expect(F.errOf(await w1.rpc('tip_report', { p_restaurant_id: SEDA.id, p_from: bakuDate(), p_to: bakuDate() }))).toBe('not_allowed')
      expect(F.errOf(await kit.rpc('close_bill', { p_bill_id: '00000000-0000-0000-0000-000000000000' })), 'kitchen close_bill').toMatch(/forbidden|bill_not_found/)
    })
  })

  // ───────────────────────────────────── 7. Azerbaijani copy ─────────────────────────────────────
  test.describe('Azerbaijani copy', () => {
    const loc = (lang, ns) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'client-resto', 'src', 'locales', lang, `${ns}.json`), 'utf8'))
    const EN = loc('en', 'v2'); const AZ = loc('az', 'v2')
    const placeholders = s => [...String(s).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(m => m[1]).sort()
    const SAME_OK = new Set(['demoBadge', 'role_admin', 'methodDemo', 'dismiss', 'byDayItem'])   // identical in both languages on purpose
    const asAz = async who => { await who.page.addInitScript(() => { try { localStorage.setItem('rufesto_lang', 'az') } catch { /* blocked */ } }) }
    const text = page => page.locator('.dash-content').evaluate(el => el.textContent.replace(/\s+/g, ' '))
    /** English phrases of the v2 strings (>= 12 chars, static part of the longest piece) and raw i18n keys found in an Azerbaijani page. */
    function leaks(pageText) {
      const found = []
      for (const [k, v] of Object.entries(EN)) {
        if (typeof v !== 'string' || SAME_OK.has(k) || AZ[k] === v) continue
        const piece = v.split(/\{\{.*?\}\}/).sort((a, b) => b.length - a.length)[0].trim()
        if (piece.length >= 12 && pageText.includes(piece)) found.push(`English text "${piece}" (v2:${k})`)
        const base = k.replace(/_(one|other)$/, '')
        if (/[A-Z_]/.test(base) && new RegExp(`(^|[^A-Za-z0-9_])${base}([^A-Za-z0-9_]|$)`).test(pageText)) found.push(`raw key ${base}`)
      }
      return [...new Set(found)]
    }
    const has = (t, parts) => parts.filter(p => !(p instanceof RegExp ? p.test(t) : t.includes(p)))

    test('locale files: az/v2.json has every key of en/v2.json with the same placeholders, no empty or untranslated value', async () => {
      const miss = Object.keys(EN).filter(k => !(k in AZ))
      const extra = Object.keys(AZ).filter(k => !(k in EN))
      expect({ missingInAz: miss, extraInAz: extra }).toEqual({ missingInAz: [], extraInAz: [] })
      const badPh = Object.keys(EN).filter(k => JSON.stringify(placeholders(EN[k])) !== JSON.stringify(placeholders(AZ[k])))
      expect(badPh, 'keys whose {{placeholders}} differ between en and az').toEqual([])
      expect(Object.keys(AZ).filter(k => !String(AZ[k]).trim()), 'empty az values').toEqual([])
      const same = Object.keys(EN).filter(k => EN[k] === AZ[k] && String(EN[k]).length > 6 && !SAME_OK.has(k))
      expect(same, 'az values identical to the English text (untranslated)').toEqual([])
      for (const ns of ['common']) {
        const e = loc('en', ns); const a = loc('az', ns)
        expect(Object.keys(e).filter(k => !(k in a)), `${ns}.json keys missing in az`).toEqual([])
      }
    })

    test('Bills page in Azerbaijani: title, stats, chips, card labels, pills, the confirm dialog; no English text, no raw keys', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager'); const g4 = await fx.open('g4')
      const T = pickFree(await F.sedaTables(mgr), ['T2', 'T3'])
      fx.cleanup(() => F.freeTable(mgr, T.id, [g4]))
      const dishes = await F.cheapDishes(mgr)
      await F.seat(g4, T.code); await F.placeOrder(g4, T.id, dishes.slice(0, 2)); const bill = await F.myBill(g4)
      await g4.rpc('split_bill', { p_bill_id: bill.bill_id, p_mode: 'own', p_assignments: {} })
      await F.askReception(g4, bill.bill_id)
      await asAz(mgr)
      const page = mgr.page
      await page.goto(rurl('/bills'))
      await expect(page.getByRole('heading', { name: 'Hesablar', exact: true })).toBeVisible()
      const azCard = page.locator('article.v2-bill').filter({ has: page.locator('.v2-bill-table', { hasText: new RegExp(`^Masa ${T.number}$`) }) }).first()
      await expect(azCard).toBeVisible({ timeout: 15_000 })
      let t = await text(page)
      expect(has(t, ['Aktiv hesablar', 'Yığılacaq məbləğ', 'Bu gün yığılan', /Aktiv \(\d+\)/, /Ödənilib \(\d+\)/, /Hamısı \(\d+\)/, `Masa ${T.number}`, 'Resepşn', /Borcu: ₼/, 'Ödənilib kimi işarələ', 'Bütün hesabı ödənilib kimi işarələ']), 'expected Azerbaijani copy missing').toEqual([])
      await page.locator('.v2-chips').getByRole('button', { name: /^Hamısı/ }).click()
      t = await text(page)
      expect(leaks(t), 'English leaking into the Bills page').toEqual([])
      await azCard.getByRole('button', { name: 'Bütün hesabı ödənilib kimi işarələ' }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toContainText('Bütün hesab ödənilib kimi işarələnsin?')
      await expect(dialog).toContainText(`Masa ${T.number}:`)
      await expect(dialog).toContainText('qalan')
      await expect(dialog.getByRole('button', { name: 'Ləğv et' })).toBeVisible()
      await shot(testInfo, page, 'az-bills-dialog')
      expect(leaks(await dialog.evaluate(el => el.textContent)), 'English in the dialog').toEqual([])
      await dialog.getByRole('button', { name: 'Ləğv et' }).click()
      expect(mgr.watch.consoleErrors).toEqual([])
    })

    test('Tips and My tips in Azerbaijani: titles, ranges, columns, role pills, team row, errors, CSV header, Waiter-page card', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager'); const w1 = await fx.open('waiter1')
      await asAz(mgr); await asAz(w1)
      const page = mgr.page
      await page.goto(rurl('/tips'))
      await expect(page.getByRole('heading', { level: 1, name: 'Bəxşişlər' })).toBeVisible()
      await expect(page.locator('.v2-stats .stat-card').first()).toBeVisible()
      const t = await text(page)
      expect(has(t, ['Hər ofisiantın qazandığı bəxşişlər', 'Bu gün', 'Bu həftə', 'Bu ay', 'Fərdi', 'Cəmi bəxşiş', 'Bəxşiş sayı', 'Orta bəxşiş', 'Təyin olunmayıb (komanda)', 'Ofisiantlər üzrə', 'Ofisiant', 'Son bəxşiş', 'CSV yüklə', 'Bəxşişlərim']), 'expected Azerbaijani copy missing').toEqual([])
      expect(leaks(t), 'English on /tips').toEqual([])
      await shot(testInfo, page, 'az-tips')
      const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'CSV yüklə' }).click()])
      const csv = fs.readFileSync(await dl.path(), 'utf8').replace(/^﻿/, '')
      expect(csv.split('\r\n')[0], 'CSV header follows the language').toBe('Ofisiant,Rol,Bəxşiş,Cəmi,Orta,Son bəxşiş')
      expect(csv, 'role names in the CSV follow the language').toContain(',Ofisiant,')
      await page.getByRole('button', { name: 'Fərdi', exact: true }).click()
      await page.locator('#v2-range-from').fill(addDays(bakuDate(), 1))
      await expect(page.locator('.v2-range-error')).toHaveText('Başlanğıc tarixi son tarixdən sonra ola bilməz')
      await page.locator('#v2-range-from').fill(addDays(bakuDate(), -400))
      await expect(page.locator('.v2-range-error')).toHaveText('Ən çox 366 günlük aralıq seçin')
      await page.locator('#v2-range-from').fill('2025-01-01'); await page.locator('#v2-range-to').fill('2025-01-07')
      await expect(page.getByText('Bu dövrdə bəxşiş yoxdur')).toBeVisible()
      await expect(page.getByText('Qonaqlar hesabı ödədikdən sonra bəxşişlər burada görünəcək.')).toBeVisible()

      await w1.page.goto(rurl('/my-tips'))
      await expect(w1.page.getByRole('heading', { level: 1, name: 'Bəxşişlərim' })).toBeVisible()
      await expect(w1.page.locator('.v2-tips-hero')).toBeVisible()
      const t2 = await text(w1.page)
      expect(has(t2, ['Yalnız sizə qoyulan bəxşişlər', 'Cəmi bəxşiş', 'Bəxşişləriniz', 'Qazanılıb', 'Masa ']), 'expected Azerbaijani copy missing on /my-tips').toEqual([])
      expect(leaks(t2), 'English on /my-tips').toEqual([])
      await w1.page.goto(rurl('/waiter'))
      await expect(w1.page.locator('a.v2-mytips')).toContainText('Bu gün bəxşişlərim')
      await expect(w1.page.locator('a.v2-mytips')).toContainText('Ətraflı')
    })

    test('Settings in Azerbaijani: hours (weekday names, switches, validation, closures), booking rules (labels, units, errors), staff (role names)', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager')
      await asAz(mgr)
      const page = mgr.page
      await page.goto(rurl('/settings?tab=hours'))
      await expect(page.getByRole('heading', { name: 'Ayarlar', exact: true })).toBeVisible()
      await expect(page.locator('.v2-day')).toHaveCount(7)
      for (const label of ['İş saatları', 'Rezervasiya qaydaları', 'İşçilər']) await expect(page.getByRole('tab', { name: label })).toBeVisible()
      const dayNames = await page.locator('.v2-day .v2-day-name').allTextContents()
      const wantDays = await page.evaluate(() => [1, 2, 3, 4, 5, 6, 0].map(d => new Date(Date.UTC(2024, 0, 7 + d)).toLocaleDateString('az-AZ', { weekday: 'long', timeZone: 'UTC' })))
      expect(dayNames, 'weekday names in Azerbaijani').toEqual(wantDays)
      await page.locator('#v2-day-1-close').fill('10:00')
      await expect(page.locator('.v2-day').first().getByRole('alert')).toHaveText('Bağlanış vaxtı açılışdan sonra olmalıdır')
      await expect(page.getByText('Saxlamaq üçün qırmızı günləri düzəldin')).toBeVisible()
      await page.locator('#v2-day-1-close').fill(F.BASE_HOURS[1][1])
      await page.locator('#v2-closure-date').fill('2020-01-01')
      await page.getByRole('button', { name: 'Bağlı gün əlavə et' }).click()
      await expect(page.getByRole('alert').filter({ hasText: 'Bu gün və ya sonrakı tarixi seçin' })).toBeVisible()
      let t = await text(page)
      expect(has(t, ['Rezervasiyalar gecə yarısını keçə bilməz. 00:00 bağlanış vaxtı 23:59 kimi saxlanılır.', 'Açıq', 'Saatları bütün günlərə kopyala', 'Saatları saxla', 'Xüsusi bağlı günlər', 'Qarşıdakı bağlı gün yoxdur', 'Səbəb (istəyə bağlı)']), 'expected Azerbaijani copy missing').toEqual([])
      expect(leaks(t), 'English on the hours tab').toEqual([])
      await shot(testInfo, page, 'az-settings-hours')

      await page.goto(rurl('/settings?tab=rules'))
      await expect(page.locator('#v2-turn12')).toBeVisible()
      await page.locator('#v2-turn12').fill('5')
      await expect(page.locator('#v2-turn12-err')).toHaveText('30 ilə 240 arasında tam ədəd daxil edin')
      t = await text(page)
      expect(has(t, ['Seçimlər', 'Qrup rezervasiya linkləri', 'Rezervasiyasız qonaqlara icazə ver', 'Onlayn rezerv olunan bölmələr', 'Vaxtlama', 'Limitlər', 'Vaxt addımı', 'Oturumlar arası fasilə', 'Maksimum qonaq sayı', 'dəq', 'qonaq', 'Qaydaları saxla', 'Rezervasiya depoziti', 'Tezliklə', 'Saxlamaq üçün qırmızı sahələri düzəldin']), 'expected Azerbaijani copy missing').toEqual([])
      expect(await page.locator('#v2-slotStep option').allTextContents(), 'slot step options').toEqual(['15 dəq', '30 dəq', '60 dəq'])
      expect(leaks(t), 'English on the rules tab').toEqual([])
      await shot(testInfo, page, 'az-settings-rules')

      await page.goto(rurl('/settings?tab=staff'))
      await expect(page.locator('.v2-staff-row').first()).toBeVisible()
      t = await text(page)
      expect(has(t, ['Komanda', 'Yalnız oxumaq üçündür', 'Menecer', 'Ofisiant', 'Mətbəx', 'Aktiv', 'İşçi dəvət et', 'Tezliklə: e-poçt və ya telefonla dəvət']), 'expected Azerbaijani copy missing').toEqual([])
      expect(leaks(t), 'English on the staff tab').toEqual([])
      expect(mgr.watch.consoleErrors).toEqual([])
    })

    test('QR sheet in Azerbaijani: labels, hints, section chips, toggles, chair cards', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager')
      await asAz(mgr)
      const page = mgr.page
      await page.goto(rurl('/qr-sheet'))
      await expect(page.getByRole('heading', { name: 'QR vərəqi' })).toBeVisible()
      await expect(page.locator('.v2-qr-preview .v2-qr-card').first()).toBeVisible()
      await expect(page.getByRole('button', { name: 'Çap et', exact: true })).toBeEnabled({ timeout: 40_000 })
      await page.getByLabel('Hər stul üçün').check()
      await expect(page.getByRole('button', { name: 'Çap et', exact: true })).toBeEnabled({ timeout: 40_000 })
      const t = await text(page)
      await expect(page.getByRole('group', { name: 'Bölmə' }), 'the section filter is labelled').toBeVisible()
      expect(has(t, ['Hər masa üçün bir kart, A4 formatında çapa hazırdır.', 'Hamısı', 'Səhifədə', 'Giriş kodunu göstər', 'Hər stul üçün', 'Masa T1', 'Sifariş üçün skan edin', 'və ya kodu daxil edin', /T2 · stul 3/, 'Burada əyləşmək üçün skan edin', /\d+ kart: hər masa və hər stul üçün bir kart\./]), 'expected Azerbaijani copy missing').toEqual([])
      expect(leaks(t), 'English on the QR sheet').toEqual([])
      expect(await page.locator('.v2-qr-preview img.v2-qr-img').first().getAttribute('alt')).toBe('Masa T1 üçün QR kod')
      await shot(testInfo, page, 'az-qr-sheet')
    })
  })

  // ───────────────────────────────────── 8. 390 px layout ─────────────────────────────────────
  test.describe('Phone layout (390 px)', () => {
    const PHONE = { width: 390, height: 844 }
    /** Controls under 40 px tall (a finger needs about 40), in-page; the switch has a 44 px hit area from ::after. */
    const smallTargets = page => page.evaluate(() => {
      const out = []
      const seen = new Set()
      for (const el of document.querySelectorAll('.dash-content button, .dash-content a, .dash-content input:not([type=checkbox]):not([type=radio]), .dash-content select, .dash-mobile-nav a, .dash-content label.v2-check')) {
        const r = el.getBoundingClientRect(); const s = getComputedStyle(el)
        if (r.width === 0 || r.height === 0 || s.visibility === 'hidden' || el.classList.contains('v2-switch') || el.closest('.v2-sr-only')) continue
        if (r.height < 39.9) {
          const label = (el.getAttribute('aria-label') || el.textContent || el.id || el.className || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 30)
          const key = `${el.tagName}:${label}`
          if (!seen.has(key)) { seen.add(key); out.push(`${label} (${Math.round(r.height)}px)`) }
        }
      }
      return out
    })

    test('Bills, Tips, My tips, Settings (3 tabs) and the QR sheet at 390 px: no overflow or cut-off text, no console errors, controls >= 40 px, bottom nav fits', async ({ fx }, testInfo) => {
      const mgr = await fx.open('manager'); const w1 = await fx.open('waiter1'); const g4 = await fx.open('g4')
      const T = pickFree(await F.sedaTables(mgr), ['T2', 'T3'])
      fx.cleanup(() => F.freeTable(mgr, T.id, [g4]))
      const dishes = await F.cheapDishes(mgr)
      await F.seat(g4, T.code); await F.placeOrder(g4, T.id, dishes.slice(0, 2)); const bill = await F.myBill(g4)
      await g4.rpc('split_bill', { p_bill_id: bill.bill_id, p_mode: 'own', p_assignments: {} })
      await F.askReception(g4, bill.bill_id)
      await mgr.page.setViewportSize(PHONE); await w1.page.setViewportSize(PHONE)
      const W = walker(mgr.page, mgr.watch, testInfo)
      const Ww = walker(w1.page, w1.watch, testInfo)
      const small = {}
      const visit = async (who, walk, p, label, ready, extra) => {
        await who.page.goto(rurl(p))
        await ready(who.page)
        await walk.check(label)
        if (extra) await extra(who.page)
        await walk.scrollThrough(label)
        small[label] = await smallTargets(who.page)
        await shot(testInfo, who.page, `phone-${label.replace(/\W+/g, '-')}`)
      }
      await visit(mgr, W, '/bills', 'bills', async p => { await expect(p.locator('article.v2-bill').first()).toBeVisible({ timeout: 20_000 }) }, async p => {
        await p.locator('.v2-chips').getByRole('button', { name: /^All \(/ }).click()
        await W.check('bills all')
        await p.locator('article.v2-bill').first().getByRole('button', { name: 'Mark whole bill paid' }).first().click().catch(() => {})
        if (await p.getByRole('dialog').count()) { await W.check('bills confirm dialog'); await p.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click() }
      })
      await visit(mgr, W, '/tips', 'tips', async p => { await expect(p.locator('.v2-stats .stat-card').first()).toBeVisible() }, async p => {
        await p.getByRole('button', { name: 'Custom', exact: true }).click()
        await W.check('tips custom range')
        await p.getByRole('button', { name: 'This week', exact: true }).click()
      })
      await visit(w1, Ww, '/my-tips', 'my-tips', async p => { await expect(p.locator('.v2-tips-hero')).toBeVisible() })
      await visit(mgr, W, '/settings?tab=hours', 'settings hours', async p => { await expect(p.locator('.v2-day')).toHaveCount(7) }, async p => {
        await p.locator('#v2-day-1-close').fill('10:00')
        await W.check('settings hours invalid')
        await p.locator('#v2-day-1-close').fill(F.BASE_HOURS[1][1])
      })
      await visit(mgr, W, '/settings?tab=rules', 'settings rules', async p => { await expect(p.locator('#v2-turn12')).toBeVisible() }, async p => {
        await p.locator('#v2-turn12').fill('5')
        await W.check('settings rules invalid')
      })
      await visit(mgr, W, '/settings?tab=staff', 'settings staff', async p => { await expect(p.locator('.v2-staff-row').first()).toBeVisible() })
      await visit(mgr, W, '/qr-sheet', 'qr sheet', async p => { await expect(p.getByRole('button', { name: 'Print', exact: true })).toBeEnabled({ timeout: 40_000 }) }, async p => {
        await p.getByLabel('Per chair').check()
        await expect(p.getByRole('button', { name: 'Print', exact: true })).toBeEnabled({ timeout: 40_000 })
        await W.check('qr sheet per chair')
      })

      await test.step('bottom navigation: every item is reachable and not clipped', async () => {
        await mgr.page.goto(rurl('/'))
        const nav = await mgr.page.locator('.dash-mobile-nav').evaluate(el => {
          const r = el.getBoundingClientRect()
          const items = [...el.querySelectorAll('a')].map(a => { const b = a.getBoundingClientRect(); return { name: a.textContent.trim(), left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width) } })
          return { scroll: el.scrollWidth, client: el.clientWidth, overflowX: getComputedStyle(el).overflowX, right: Math.round(r.right), items }
        })
        testInfo.annotations.push({ type: 'bottom-nav', description: JSON.stringify(nav) })
        const clipped = nav.items.filter(i => i.right > 391 || i.left < -1)
        expect.soft(clipped.map(i => i.name), `bottom nav items cut off by the screen edge (${nav.items.length} items, ${nav.scroll}px of content in ${nav.client}px, overflow-x ${nav.overflowX})`).toEqual([])
        expect.soft(nav.items.filter(i => i.w < 40).map(i => `${i.name} ${i.w}px`), 'bottom nav items narrower than 40 px').toEqual([])
      })
      const bad = Object.entries(small).filter(([, v]) => v.length).map(([k, v]) => `${k}: ${v.join(', ')}`)
      expect.soft(bad, 'controls shorter than 40 px at 390 px').toEqual([])
    })
  })

  // ───────────────────────────────────── 9. Seda is back to normal ─────────────────────────────────────
  test.describe('Cleanup check', () => {
    test('hours, closures, booking rules and settings are back to the baseline; the tables used are free and no bill is left active', async ({ fx }) => {
      const mgr = await fx.open('manager')
      expect(await F.baselineDiff(mgr), 'Seda hours / closures / rules / settings differ from the baseline').toEqual([])
      const tables = await F.sedaTables(mgr)
      expect(tables.filter(t => ['T2', 'T3', 'T4', 'VIP1'].includes(t.number) && t.state !== 'free').map(t => `${t.number}=${t.state}`), 'tables not back to free').toEqual([])
      expect((await F.bills(mgr)).filter(F.isActive).map(b => `${b.table?.label} ${b.status}`), 'active bills left behind').toEqual([])
    })
  })
})
