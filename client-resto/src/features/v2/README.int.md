# WP4 v2 dashboard: integrator notes

Folder `client-resto/src/features/v2/` + `src/locales/{en,az}/v2.json`. Coded to docs/V2-CONTRACT.md (sql/41-43). All Supabase calls are in `api.js`. CSS: `styles.css` (imports `qr.css`), prefix `v2-`.

**Exports:** `routes.jsx` (default array of 5 `<Route>`: `/bills`, `/qr-sheet`, `/settings?tab=hours|rules|staff`, `/tips`, `/my-tips`), `nav.js` (6 entries; `/qr-sheet` and the manager/admin `/my-tips` have `hidden: true`), `mounts.js` (`GroupBookingPanel`, `PrintAllQrButton`, `MyTipsCard`), `roles.js` (`V2_ROLE_ROUTES`, `canOpenV2`).

**One-line edits**
1. `App.jsx`: `import v2Routes from './features/v2/routes'`, then `{v2Routes}` inside `<Route element={<DashboardLayout />}>` (inside RoleGate).
2. `lib/i18n.js`: import `v2EN`/`v2AZ` from `../locales/{en,az}/v2.json` and add `v2: v2EN` / `v2: v2AZ` to `resources`.
3. `lib/roles.js` (D-9): `ALL_PAGES` += `'/bills', '/settings', '/qr-sheet'` (admin + manager); `cashier: ['/waiter', '/orders', '/tables', '/bills']`. Waiter, host, kitchen get none of the three.
4. `DashboardLayout.jsx`: `import v2Nav from '../../features/v2/nav'`; append to `ALL_NAV`: `...v2Nav.filter(n => !n.hidden).map(n => ({ to: n.to, label: t(n.labelKey), icon: n.icon }))` (`t('v2:navBills')` resolves the namespace). The mobile bottom nav then has 10 items; consider a "More" item.
5. `BookingsPage.jsx`: `import { GroupBookingPanel } from '../features/v2/mounts'`; render `<GroupBookingPanel booking={b} />` in each card, after the `special_requests` block and before the status buttons. Renders nothing for solo bookings.
6. `TablesPage.jsx`: `import { PrintAllQrButton } from '../features/v2/mounts'`; render `<PrintAllQrButton />` in the header row (renders only for admin/manager).
7. `WaiterPage.jsx`: `import { MyTipsCard } from '../features/v2/mounts'`; render `<MyTipsCard />` between the header and the tab chips (renders nothing for roles without `/my-tips` and while `my_tips` isn't deployed).

(Done: 1-4 and 7 are in. The sidebar in `DashboardLayout.jsx` also filters v2 entries by each entry's `roles`, so a `hidden` twin entry can exist for other roles.)

**Behaviour you should know**
- `/bills` calls `restaurant_bills` without `p_day`: today's bills (Baku) plus any older bill still open, because one active bill per table blocks the table. Older ones carry a "from {date}" tag; "Collected today" counts today's bills only. This is allowed by the contract (spec criterion 3 says "only today's").
- Mark paid: `mark_payment_paid(intent)` when a reception/cash intent is pending, else `staff_settle_share(share, 'cash')`; none for a share whose guest is mid card payment. "Mark whole bill paid" = `close_bill`.
- Hours: `operating_hours` has `CHECK close_time > open_time`, so a 00:00 close is saved as 23:59.
- QR sheet prints through `body.v2-qr-printing` + a portaled `.v2-qr-print-root` and a named `@page v2qr` (A4, 10mm); links need a `resto.*` / localhost host (else Print is disabled).

**Open (not in sql/4x yet)**
- Staff tab: managers cannot read other staff rows or their names (`staff_read_own` only). Needs a policy or an RPC such as `restaurant_staff(p_restaurant_id)`; until then the tab lists the caller only. Swap the query in `api.js fetchStaffList`.
- Realtime and writes need sql/43 applied (publication for `bills`, `payment_intents`, `booking_members`; manager writes on hours, closures, rules).
- Live check (preview, manager login): `pages/BookingsPage.jsx` loads nothing since sql/41 (PGRST201: `bookings` to `users` is now ambiguous). Change its select to `users!bookings_user_id_fkey(name, email, phone)`; check other `bookings(... users(...))` embeds (consumer app too).

**QR sheet, "Per chair" (floor/seat codes)**
- `pages/QrSheetPage.jsx` has a "Per chair" checkbox (`components/PrintToolbar.jsx`). On: every table card is followed by one card per chair (`capacity` of them), labelled `T5 · seat 3`, QR = `<origin>/t/<access code>-S<n>` (`qrCards.js`: `buildQrCards`). The seat code is derived, nothing is stored; `claim_table` (sql/49) accepts it. Per page 1 / 4 / 6, the section filter and the access-code toggle apply to seat cards too. `fetchQrData` now also selects `tables.capacity`.
- The Tables-page QR modal is `components/TableQRModal.jsx` (outside `features/v2`), so it has no per-chair toggle; "Print all QR codes" (`PrintAllQrButton` -> `/qr-sheet`) is the place for seat QRs.

**Tips (sql/51; `pages/TipsPage.jsx`, `pages/MyTipsPage.jsx`)**
- `/tips` (admin, manager, cashier in the role map): range chips (Today / This week Mon..today / This month 1st..today / Custom, Baku calendar, max 366 days), stat cards, by-day strip (plain divs), per-waiter table (cards on phones), Export CSV (client-side, `tipsCsv.js`). Calls `tip_report`, which the contract limits to managers and admins: a cashier gets "not allowed" until the backend widens it (or drop `'cashier'` from the `/tips` entry in `nav.js`).
- `/my-tips` (waiter, host, cashier in the sidebar; manager, admin via the hidden entry and the "My tips" button on `/tips`): the caller's own tips from `my_tips`. Pending tips are listed with a pill but never counted in the total (server rule). `my_tips` is not restaurant-scoped.
- `MyTipsCard` (WaiterPage): today's total + count, links to `/my-tips`.
- Realtime: `subscribeTips` listens to `payment_intents` and `bills` (restaurant_id filter) and polls every 30 s; `tips` has no restaurant_id and isn't published, so it is not subscribed.
