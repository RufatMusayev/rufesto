// `npm run tour`: the visual tour (tour.spec.js, tagged @tour). Reuses the base config (targets, English,
// storage state, global setup) but runs only that one spec, serially. `npm test` never loads it because the
// base config's testDir is ./tests.
const { defineConfig } = require('@playwright/test')
const base = require('./playwright.config')

module.exports = defineConfig({
  ...base,
  testDir: '.',
  projects: base.projects.filter(p => p.name === 'chromium'),   // desktop project only (the tour sets its own viewports)
  testMatch: 'tour.spec.js',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 600_000,
  reporter: [['list']],
  use: { ...base.use, trace: 'off', screenshot: 'off' },
})
