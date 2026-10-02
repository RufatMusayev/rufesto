# Rufesto e2e smoke suite

Playwright (Chromium, headless) smoke tests against a deployed Rufesto stack: the consumer app
(`client/`) and the staff dashboard (`client-resto/`). The v1 specs are read-only; the `v2-*` specs
write on the QA accounts (friend/post, booking, order + demo payment) and undo it. No accounts are created.

## Setup

```bash
cd e2e
npm install
npx playwright install chromium
cp .env.example .env     # optional, only needed for credentials or other targets
```

## Run

| Command | What runs |
|---|---|
| `npm test` | everything (specs without credentials skip themselves) |
| `npm run test:anon` | `@anon`: logged-out consumer + dashboard, always runnable |
| `npm run test:guest` | `@guest`: needs `QA_GUEST_*` |
| `npm run test:staff` | `@staff`: needs `QA_MANAGER_*` / `QA_WAITER_*` / `QA_KITCHEN_*` |
| `npm run report` | open the last HTML report (`e2e/report`) |

Filter further with `npx playwright test --grep "@consumer"` or `--grep "@resto"`.

Targets default to preview: `CONSUMER_URL=https://rufat-server.com`,
`RESTO_URL=https://resto.rufat-server.com`. A global setup pings both and aborts with a clear
message if either does not answer HTTP 200.

## Specs

| File | Tags | Covers |
|---|---|---|
| `tests/anon-consumer.spec.js` | `@anon @consumer` | home (no console errors, restaurant cards), restaurant menu, map, reserve gate, `/t/:code`, `/profile` |
| `tests/anon-resto.spec.js` | `@anon @resto` | staff login at `/`, SPA fallback for unknown routes, no console errors |
| `tests/guest.spec.js` | `@guest @consumer` | sign in, profile, restaurant, booking time slots, table-code sheet |
| `tests/staff.spec.js` | `@staff @resto` | manager / waiter / kitchen nav and route gating |
| `tests/v2-social.spec.js` | `@guest @v2` | friend request + accept (2nd context as manager), post, feed, like, comment, unfriend |
| `tests/v2-bookings.spec.js` | `@guest @v2` | group booking wizard, signed-out invite preview, manager joins/leaves, host cancels |
| `tests/v2-bills.spec.js` | `@guest @v2` | `/t/<code>` claim, order, demo-card payment (double tap), receipt, leave; needs `QA_TABLE_CODE` |
| `tests/v2-resto.spec.js` | `@staff @v2` | `/bills`, `/qr-sheet`, `/settings` tabs for the manager; waiter is redirected |

Both apps are forced to English (`localStorage.rufesto_lang = 'en'`, seeded in
`playwright.config.js`).

## Credentials (never committed)

Put them in `e2e/.env` (git-ignored); see `.env.example`.

- **Guest:** the consumer UI only offers email-code / OAuth sign-in in production builds (the
  password form is `import.meta.env.DEV` only). The guest spec therefore exchanges
  `QA_GUEST_EMAIL` / `QA_GUEST_PASSWORD` for a session over Supabase's public auth API and
  seeds it into localStorage. The account needs a password set in the Supabase dashboard. The
  Supabase URL and public anon key are read from the app's own network traffic (override with
  `QA_SUPABASE_URL` / `QA_SUPABASE_ANON_KEY`).
- **Staff:** `staff.spec.js` signs in through the dashboard's email + password form; the `v2-*` specs use the
  same auth-API exchange as the guest (`support/guest.js`, helpers in `support/v2.js`).
- **Table:** `v2-bills.spec.js` needs `QA_TABLE_CODE` (a free table at Trattoria Bella Roma, see `docs/QA-ACCOUNTS.md`).

## Console-error rule

Tests fail on any `console.error` or uncaught page error, except a 401 from Supabase (a logged-out
visitor hitting a protected table) and the Cloudflare analytics beacon injected at the edge.
Every failed network call (status >= 400) is attached to the test in the HTML report and printed
as `[failed network]` even when the test passes.

## Known gaps / deploy-gated tests

- `/t/:code` (anon-consumer): becomes `fixme` at run time while the route is not deployed (the SPA
  renders an empty page). It runs automatically once the route is live.
- Kitchen `/orders` bounce (staff): gated behind `QA_KITCHEN_LOCKDOWN_DEPLOYED=1` until the
  dashboard build with `kitchen: ['/kds']` ships. Remove the gate afterwards.
- Booking time slots need a session (the modal starts on its sign-in step when logged out), so
  that check lives in the guest spec; the anon spec asserts the sign-in gate instead.
