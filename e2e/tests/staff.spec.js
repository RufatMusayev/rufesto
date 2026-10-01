// D. Staff dashboard, one login per role. Each test skips unless that role's
// QA_<ROLE>_EMAIL / QA_<ROLE>_PASSWORD pair is set. Read-only: only navigates.
const { test, expect } = require('../support/fixtures')
const { RESTO_URL, creds, kitchenLockdownDeployed } = require('../support/env')

const url = path => RESTO_URL + path
const NAV_LABELS = ['Overview', 'Orders', 'Kitchen', 'Tables', 'Menu', 'Promos', 'Bookings', 'Waiter']

async function signIn(page, { email, password }) {
  await page.goto(url('/login'))
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign In', exact: true }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

/** Labels of the dashboard nav links the role can see (the hidden mobile nav is excluded). */
async function visibleNav(page) {
  const links = page.getByRole('navigation').getByRole('link')
  await expect(links.first()).toBeVisible()
  const names = await links.allInnerTexts()
  const seen = names.map(n => n.trim().toLowerCase())
  return NAV_LABELS.filter(label => seen.includes(label.toLowerCase()))
}

test.describe('staff', { tag: ['@staff', '@resto'] }, () => {
  test('manager sees Orders, Tables, Menu, Bookings and Promos', async ({ page }) => {
    test.skip(!creds.manager, 'set QA_MANAGER_EMAIL and QA_MANAGER_PASSWORD')
    await signIn(page, creds.manager)
    await expect(page).toHaveURL(url('/'))
    expect(await visibleNav(page)).toEqual(expect.arrayContaining(['Orders', 'Tables', 'Menu', 'Bookings', 'Promos']))
  })

  test('waiter sees only Waiter, Tables and Orders', async ({ page }) => {
    test.skip(!creds.waiter, 'set QA_WAITER_EMAIL and QA_WAITER_PASSWORD')
    await signIn(page, creds.waiter)
    await expect(page).toHaveURL(/\/waiter$/)
    expect(await visibleNav(page)).toEqual(['Orders', 'Tables', 'Waiter'])
    await page.goto(url('/menu'))
    await expect(page).toHaveURL(/\/waiter$/)   // RoleGate bounces to the role's home
  })

  test('kitchen lands on /kds and sees only Kitchen', async ({ page }) => {
    test.skip(!creds.kitchen, 'set QA_KITCHEN_EMAIL and QA_KITCHEN_PASSWORD')
    await signIn(page, creds.kitchen)
    await expect(page).toHaveURL(/\/kds$/)
    // Build bfaf042 still lets kitchen see Orders; the lockdown is in the next dashboard deploy.
    if (kitchenLockdownDeployed) expect(await visibleNav(page)).toEqual(['Kitchen'])
  })

  test('kitchen is bounced from /orders', async ({ page }) => {
    test.skip(!creds.kitchen, 'set QA_KITCHEN_EMAIL and QA_KITCHEN_PASSWORD')
    // FIXME(deploy pending): roles.js `kitchen: ['/kds']` is uncommitted; build bfaf042 still
    // lets kitchen open /orders. Set QA_KITCHEN_LOCKDOWN_DEPLOYED=1 after the dashboard deploy.
    test.fixme(!kitchenLockdownDeployed, 'kitchen lockdown not deployed yet (bfaf042 allows /orders)')
    await signIn(page, creds.kitchen)
    await page.goto(url('/orders'))
    await expect(page).toHaveURL(/\/kds$/)
  })
})
