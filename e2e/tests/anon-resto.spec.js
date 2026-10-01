// B. Logged-out visitor on the staff dashboard. Always runs; writes nothing.
const { test, expect, settle } = require('../support/fixtures')
const { RESTO_URL } = require('../support/env')

const url = path => RESTO_URL + path
const loginForm = page => ({
  heading: page.getByRole('heading', { name: 'Sign in to your restaurant' }),
  email: page.getByLabel('Email'),
  password: page.getByLabel('Password'),
  submit: page.getByRole('button', { name: 'Sign In', exact: true }),
})

test.describe('anon resto', { tag: ['@anon', '@resto'] }, () => {
  test('dashboard root shows the staff login', async ({ page }) => {
    await page.goto(url('/'))
    const form = loginForm(page)
    await expect(form.heading).toBeVisible()
    await expect(form.email).toBeVisible()
    await expect(form.password).toBeVisible()
    await expect(form.submit).toBeEnabled()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('unknown routes fall back to the SPA, not an nginx 404', async ({ page, request }) => {
    const res = await request.get(url('/no/such/route'))
    expect(res.status(), 'GET /no/such/route').toBe(200)
    expect(res.headers()['content-type']).toContain('text/html')

    await page.goto(url('/no/such/route'))
    await expect(loginForm(page).heading).toBeVisible()
    await expect(page).toHaveTitle('Rufesto for Business')
    // A protected deep link bounces to the same login.
    await page.goto(url('/orders'))
    await expect(page).toHaveURL(/\/login$/)
  })

  test('login screen has no console errors', async ({ page, watch }) => {
    await page.goto(url('/login'))
    await expect(loginForm(page).submit).toBeVisible()
    await settle(page)
    expect(watch.consoleErrors, 'console errors on /login').toEqual([])
  })
})
