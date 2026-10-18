// Shared test fixture: records console errors and failed network calls for every page.
// Tests that care assert on `watch.consoleErrors`; failed calls are always attached to
// the report (and printed) so a green run still shows what the app got wrong.
const base = require('@playwright/test')

// Chromium logs a failed fetch as a console error: "Failed to load resource: ... 401".
// A logged-out visitor legitimately gets 401s from Supabase for protected tables.
const SUPABASE_URL = /supabase|\/(rest|auth|storage|realtime)\/v1\//i
// Cloudflare injects this beacon at the edge; it is not part of the app.
const EDGE_NOISE = /static\.cloudflareinsights\.com/i

function isKnownNoise(text, url) {
  if (EDGE_NOISE.test(text) || EDGE_NOISE.test(url)) return true
  return /status of 401/.test(text) && SUPABASE_URL.test(url)
}

function attachWatchers(page) {
  const consoleErrors = []
  const failedCalls = []
  page.on('console', msg => {
    if (msg.type() !== 'error') return
    const url = msg.location()?.url || ''
    if (!isKnownNoise(msg.text(), url)) consoleErrors.push(`${msg.text()} [${url}]`)
  })
  page.on('pageerror', err => consoleErrors.push(`uncaught: ${err.message}`))
  page.on('response', res => {
    if (res.status() >= 400) failedCalls.push(`${res.status()} ${res.request().method()} ${res.url()}`)
  })
  page.on('requestfailed', req => {
    const why = req.failure()?.errorText || 'failed'
    if (!/ERR_ABORTED/.test(why)) failedCalls.push(`${why} ${req.method()} ${req.url()}`)
  })
  return { consoleErrors, failedCalls }
}

const test = base.test.extend({
  watch: [async ({ page }, use, testInfo) => {
    const watch = attachWatchers(page)
    await use(watch)
    if (watch.failedCalls.length) {
      const body = watch.failedCalls.join('\n')
      testInfo.annotations.push({ type: 'failed-network', description: body })
      await testInfo.attach('failed-network.txt', { body, contentType: 'text/plain' })
      console.log(`[failed network] ${testInfo.title}\n  ${watch.failedCalls.join('\n  ')}`)
    }
  }, { auto: true }],
})

/** Wait for the page's initial data calls to finish, but never fail on a chatty page. */
async function settle(page, timeout = 10_000) {
  await page.waitForLoadState('networkidle', { timeout }).catch(() => {})
}

module.exports = { test, expect: base.expect, settle }
