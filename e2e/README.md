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
| `npm test` | everything on the desktop project (specs without credentials skip themselves) |
| `npm run test:anon` | `@anon`: logged-out consumer + dashboard, always runnable |
| `npm run test:guest` | `@guest`: needs `QA_GUEST_*` |
| `npm run test:staff` | `@staff`: needs `QA_MANAGER_*` / `QA_WAITER_*` / `QA_KITCHEN_*` |
| `npm run test:tips` | `v2-tips` alone (the `chromium-tips` project, see below) |
| `npm run test:mobile` | the `mobile` project: every consumer spec on a Pixel 7 (touch) + the `@mobile` checklist, see below |
| `npm run test:all` | the whole suite, project by project, strictly one after the other with `--workers=1 --no-deps`: `chromium`, `mobile`, then `chromium-tips` (v2-tips) last, with a pause of `QA_PROJECT_GAP_MIN` minutes (default 5, the `place_order` cap) before the 2nd and 3rd. Runs every project even when an earlier one fails; exit code 1 if any failed. Extra arguments go to every run (`npm run test:all -- --grep @consumer`); a project the filter leaves empty is skipped. Not included: `npm run tour` |
| `npm run tour` | `@tour`: visual tour, writes numbered full-page PNGs to `report/tour/` (see below); not part of `npm test` |
| `npm run report` | open the last HTML report (`e2e/report`) |

Filter further with `npx playwright test --project=chromium --grep "@consumer"` or `--grep "@resto"`.

### Projects: desktop and mobile

| Project | Device | Runs |
|---|---|---|
| `chromium` | Desktop Chrome 1280x800 | every spec except `mobile-checklist` and `v2-tips` |
| `chromium-tips` | Desktop Chrome 1280x800 | `v2-tips` only, listed last in `playwright.config.js`. It is the *teardown* of `chromium`, so `npm test` / `test:staff` run it right after the rest of the desktop project (pass or fail): it pays at the same QA table, with the same QA guest, as `v2-bills`, and must not overlap it. `npm run test:all` runs it as the last of the three projects (`--no-deps` keeps it out of the `chromium` run); `npm run test:tips` runs it alone |
| `mobile` | Pixel 7 (Chromium, isMobile + touch, 412x839; the app shows the bottom nav at <= 768px) | the consumer specs only (`CONSUMER_SPECS` in `playwright.config.js`: `anon-consumer`, `guest`, `v2-social`, `v2-bookings`, `v2-bills`, `feat-social`, `feat-profile`, `feat-notifications`, `feat-bookings`, `feat-discovery`, `feat-table`, `feat-bills`) + `mobile-checklist`; the dashboard specs (`anon-resto`, `staff`, `v2-resto`, `feat-dash-ops`, `feat-dash-money`) run in the desktop project only |

The `v2-*` specs write on the same QA accounts and the same QA table, so **never run the two projects at the same
time**: every npm script picks one project (`npm test` = desktop, `npm run test:mobile` = phone). A bare
`npx playwright test` starts both in parallel and the two copies of a v2 spec will collide. Extra browser contexts
opened by the v2 specs (`openAs` / `openAnon`) inherit the project's viewport / touch settings.

Targets default to preview: `CONSUMER_URL=https://rufat-server.com`,
`RESTO_URL=https://resto.rufat-server.com`. A global setup pings both and aborts with a clear
message if either does not answer HTTP 200.

## Specs

| File | Tags | Covers |
|---|---|---|
| `tests/anon-consumer.spec.js` | `@anon @consumer` | home (no console errors, restaurant cards), restaurant menu, map, reserve gate, `/t/:code`, `/profile` |
| `tests/anon-resto.spec.js` | `@anon @resto` | staff login at `/`, SPA fallback for unknown routes, no console errors |
| `tests/guest.spec.js` | `@guest @consumer` | sign in, profile, restaurant, booking time slots (wizard step 1), table-code sheet |
| `tests/staff.spec.js` | `@staff @resto` | manager / waiter / kitchen nav and route gating |
| `tests/v2-social.spec.js` | `@guest @v2` | friend request + accept (2nd context as manager), post, feed, like, comment, unfriend |
| `tests/v2-bookings.spec.js` | `@guest @v2` | group booking wizard, signed-out invite preview, manager joins/leaves, host cancels |
| `tests/v2-bills.spec.js` | `@guest @v2` | `/t/<code>` claim, order, demo-card payment (double tap), receipt, leave; needs `QA_TABLE_CODE` |
| `tests/v2-resto.spec.js` | `@staff @v2` | `/bills`, `/qr-sheet`, `/settings` tabs for the manager; waiter is redirected |
| `tests/v2-tips.spec.js` | `@staff @v2` | tip report: guest pays a 10 % demo-card tip assigned to the QA waiter (`/t/<code>` claim, order, pay, leave), the waiter sees it on `/my-tips` and in the Waiter page card, the manager on `/tips` (Today row, CSV export header), `/tips` bounces the waiter, `/my-tips` opens for the manager; needs `QA_GUEST_*`, `QA_MANAGER_*`, `QA_WAITER_*`, `QA_TABLE_CODE` and sql/51 applied |
| `tests/feat-social.spec.js` | `@guest @consumer @feat` | friends, requests, find (3+ letters), public profile, posts, feed, comments (docs/qa/consumer-social.md) |
| `tests/feat-profile.spec.js` | `@guest @consumer @feat` | profile header numbers, credits, the five tabs, empty states, settings and edit sheets, sign out |
| `tests/feat-notifications.spec.js` | `@guest @consumer @feat` | bell badge, list text, deep link and mark read for every v2 notification type a second account can trigger |
| `tests/feat-bookings.spec.js` | `@guest @consumer @feat` | reserve wizard, invite page, booking screen, seating (the host scans the table QR / code, members scan the same code and the host approves), Profile > Bookings, availability rules |
| `tests/feat-discovery.spec.js` | `@consumer @feat` | Home feed + campaigns, Explore, Map, restaurant page, floor plan (Reserve this table > `/book/:slug?table=<id>`), Azerbaijani, signed-out gates |
| `tests/feat-table.spec.js` | `@guest @consumer @feat` | dine-in table: join / seats / party, cart with VAT, order status timeline, kitchen board, call waiter (Bella Roma review guests, never `QA_TABLE_CODE`'s table) |
| `tests/feat-bills.spec.js` | `@guest @consumer @feat` | consumer bill: split modes, demo payment, tips, settled / void bills, leaving |
| `tests/feat-dash-ops.spec.js` | `@staff @resto @dash-ops` | dashboard operations as the Sakura House staff: login, overview, orders, KDS, tables, menu, promos, bookings (Upcoming / Past, Load more), waiter, roles, Azerbaijani, 390 px incl. the More sheet. **Desktop project only** |
| `tests/feat-dash-money.spec.js` | `@resto @money` | dashboard money and settings as the Seda staff: bills (void action), tips, QR sheet (rotating ONE table's code from the Tables QR dialog; "Rotate all codes" is only opened and cancelled, never confirmed), hours, closures, booking rules, staff, role gates. **Desktop project only**; run alone with `npx playwright test tests/feat-dash-money.spec.js --project=chromium --no-deps --workers=1` |
| `tests/mobile-checklist.spec.js` | `@mobile @consumer` | `mobile` project only: feature-by-feature phone walk as review1 at 390x844, see below |
| `tour.spec.js` | `@tour` | screenshot tour of the v2 flows: consumer at 390x844 as the QA guest, dashboard at 1280x800 as the QA manager (and, with `QA_WAITER_*`, as the QA waiter for `22b-my-tips`; the demo payment then carries a 10 % tip for that waiter so `22-tips` / `22b-my-tips` show numbers); writes on the QA accounts and undoes it like the v2 specs; needs `QA_TABLE_CODE`; run with `npm run tour` (own config `playwright.tour.config.js`, outside `tests/`) |

## Mobile checklist (`npm run test:mobile`)

`tests/mobile-checklist.spec.js` walks the consumer app at 390x844 as the **review1** guest (Home Discover + Feed,
Explore filters, Map and leaving it, restaurant menu / dish sheet / Reserve / floor plan, notifications, friends,
`/t/<code>` join -> cart -> order -> bill -> demo pay -> leave, profile tabs, EN/AZ switch, dark/light, Azerbaijani
copy). One test per feature. On every screen it asserts, softly (a screen reports all its problems): no horizontal
overflow, no content cut off at the right edge, main headings inside their container, no new console errors, and that
every control it taps is >= 40px tall (`getBoundingClientRect`), not covered by another element, and tappable with a
touch event. Failing screens save a PNG in `test-results/<test>/` (small / covered targets are outlined in red); the
HTML report lists every small target under annotations. Helpers: `support/mobile.js`.

- Sign-in goes through the Supabase auth API like the other specs. review1's password is read at run time from
  `docs/REVIEW-ACCOUNTS.md` (git-excluded) or `QA_REVIEW1_EMAIL` / `QA_REVIEW1_PASSWORD` in `.env`; nothing is copied into the suite.
- The table test seats review1 at a *free* Bella Roma table other than `QA_TABLE_CODE` (found through the QA manager),
  orders, pays with the demo card and leaves; the QA manager resets that table afterwards. It skips when no such table is free.
- `document.documentElement.scrollWidth <= innerWidth` cannot fail in this app: `.main-content` is `overflow-x: clip` and
  `body` is `overflow-x: hidden`, so wide content is cut off instead of widening the page. The walk therefore also looks
  for interactive / text elements that straddle the right edge inside such a clipping ancestor.
- Tap targets use touch events (`locator.tap()`), not mouse clicks; the page has `scroll-behavior: smooth`, so measure
  after an instant scroll.

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
- `place_order` allows 5 orders per user and table in 10 minutes (`too_many_orders`, sql/47c). `v2-bills` places 2 per run (`v2-tips` and the tour 1 each), so
  run the desktop and the mobile project at least ~5 minutes apart; a failure then shows the rpc body in the assertion message.
- `list_my_bookings` answers only the newest 100 rows by start time, cancelled ones included, and the QA accounts (review4, review6 ...) hold 100+ cancelled
  future bookings from earlier runs (users cannot delete them). A fresh booking one hour from now is then missing from `/table` (banner) and Profile > Bookings.
  The specs that read those screens therefore use a host with a short list (`bannerHost`, `waiter2.bella`) or take the slot inside the window; the
  cancelled rows have to be purged in the database from time to time (docs/qa/RUN-REPORT.md).
- Preview grants move: sql/55 revoked anon SELECT on `users` / `user_follows` / `staff` and column-limited `tables` (anon must name columns); the public follower count is the
  RPC `restaurant_follower_count`. Specs that read as anon (`anonApi`) must use named columns and the RPC.
- Reserve flow: the restaurant page has one "Reserve a table" link to the `/book/:slug` wizard (slots are public in step 1,
  the sign-in is asked when going on to confirm). `anon-consumer` and `guest` become `fixme` at run time on a build that still
  has the old Reserve modal, and run on their own once the merged flow is deployed.
