const { defineConfig, devices } = require('@playwright/test')
const { CONSUMER_URL, RESTO_URL } = require('./support/env')

// Both apps keep the language in localStorage 'rufesto_lang' (client/src/lib/i18n.js,
// client-resto/src/lib/i18n.js). Seed it so every test sees English copy.
const forceEnglish = url => ({ origin: new URL(url).origin, localStorage: [{ name: 'rufesto_lang', value: 'en' }] })

// Consumer specs: the app people use on phones. The `mobile` project runs exactly these (the dashboard
// specs stay desktop-only) plus the mobile-only checklist.
const CONSUMER_SPECS = /[\/]tests[\/](anon-consumer|guest|v2-social|v2-bookings|v2-bills|mobile-checklist)\.spec\.js$/

module.exports = defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  globalSetup: require.resolve('./global-setup'),
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: Number(process.env.QA_RETRIES || 0),
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { outputFolder: 'report', open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'],
    headless: true,
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    storageState: { cookies: [], origins: [forceEnglish(CONSUMER_URL), forceEnglish(RESTO_URL)] },
  },
  // The v2 specs write on the same QA accounts / QA table, so never run the two projects at the same
  // time: the npm scripts each pick one (`npm test` = desktop, `npm run test:mobile` = phone).
  projects: [
    { name: 'chromium', testIgnore: /mobile-checklist\.spec\.js$/ },
    // Pixel 7 = Chromium with isMobile + touch + 412x839 viewport (the app switches to the bottom nav at <= 768px).
    { name: 'mobile', testMatch: CONSUMER_SPECS, use: { ...devices['Pixel 7'] } },
  ],
})
