// `npm run test:all`: the whole suite, one project after the other, strictly sequential (`--workers=1`, `--no-deps`).
//   1. desktop `chromium` (every desktop spec except v2-tips and mobile-checklist)
//   2. `mobile` (Pixel 7: the consumer specs + mobile-checklist)
//   3. `chromium-tips` (v2-tips, always last: same QA table and QA guest as v2-bills)
// The v2 / feat specs write on the same QA accounts and tables, and place_order allows 5 orders per user and table in
// 10 minutes, so the projects must never overlap and every project after the first waits QA_PROJECT_GAP_MIN minutes
// (default 5). `--no-deps` stops Playwright from also running chromium's teardown (chromium-tips) after step 1.
// Extra arguments are passed to every playwright run (e.g. `npm run test:all -- --grep @consumer`); a project in which
// the filter matches nothing is skipped, not counted as a failure.
// Exit code: 0 when every project passed, 1 otherwise (all projects run even when an earlier one failed).
const { spawnSync } = require('child_process')

const extra = process.argv.slice(2)
const gapMin = Number(process.env.QA_PROJECT_GAP_MIN ?? 5)
const projects = ['chromium', 'mobile', 'chromium-tips']
const cli = require.resolve('@playwright/test/cli')
const pw = args => spawnSync(process.execPath, [cli, 'test', ...args], { stdio: 'inherit' })

let failed = false
let ran = 0
for (const project of projects) {
  const args = [`--project=${project}`, '--workers=1', '--no-deps', ...extra]
  // skip a project the extra filter leaves empty (--list exits 1 with "No tests found")
  const probe = spawnSync(process.execPath, [cli, 'test', '--list', `--project=${project}`, '--no-deps', ...extra], { stdio: 'ignore' })
  if (probe.status !== 0) { console.log(`\n[test:all] project '${project}': no matching tests, skipped`); continue }
  if (ran > 0 && gapMin > 0) {
    console.log(`\n[test:all] waiting ${gapMin} min before '${project}' (place_order cap: 5 per table session per 10 min)`)
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, gapMin * 60_000)
  }
  console.log(`\n[test:all] project '${project}' (--workers=1 --no-deps)`)
  if (pw(args).status !== 0) failed = true
  ran++
}
process.exit(failed ? 1 : 0)
