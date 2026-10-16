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

**Posts (sql/58 + sql/59, V2-CONTRACT 17.1, 17.2, 17.6; `pages/PostsPage.jsx`)**
- Already wired, nothing to integrate: `routes.jsx` (+ `/posts`, lazy), `nav.js` (+ `/posts`, roles admin / manager, `more: true`), so `roles.js`, the sidebar, the bottom bar and the route guard pick it up. `components/layout/MobileMoreSheet.jsx` lists every nav entry flagged `more` for the role (Posts for admin / manager); `MobileNav.jsx` is unchanged apart from a comment. Strings: `navPosts`, `posts*`, `errPost*` and friends in `locales/{en,az}/v2.json`; `errors.js` maps `empty_post`, `invalid_photo_url`, `caption_too_long`, `dish_not_found`, `too_many_posts`, `post_not_found`, plus the client-side `not_an_image` / `photo_too_large`; `forbidden` was already mapped.
- Files: `postsApi.js` (all Supabase calls of the page; separate from `api.js`, which is past the size budget), `hooks/usePosts.js` (cursor paging), `lib/image.js` (port of `client/src/features/social/lib/image.js`: 1080 px edge, JPEG q 0.85 / 0.7 / 0.55 / 0.4 until <= 5 MB; nothing is imported across apps), `components/PostComposer.jsx`, `PostCard.jsx`, `DeletePostModal.jsx` (uses `lib/useDialog`), `posts.css` (imported by `styles.css`).
- Calls and shapes:
  - Dish select: `from('dishes').select('id, name, available').eq('restaurant_id', ...)` (RLS: staff read their restaurant's dishes). Sold-out dishes are listed with a "Sold out" suffix and can still be tagged.
  - Publish: Storage upload to `post-photos` at `r/<restaurant_id>/<crypto.randomUUID()>.jpg` (contentType `image/jpeg`, `upsert: false`), then `rpc('create_restaurant_post', { p_restaurant_id, p_photo_url: <that path>, p_caption, p_dish_id })` -> `{ id, created_at }`. A photo or a caption is enough (server rule `empty_post`); absent values are sent as null. If the server REFUSES the post (forbidden, empty_post, invalid_photo_url, caption_too_long, dish_not_found, too_many_posts, or the function is not deployed) the uploaded object is removed again (best effort). After a network / unknown failure the object is KEPT (the post may have been committed), the first page is reloaded and the user sees "couldn't confirm, check Your posts before trying again" (client marker `post_unconfirmed`); a retry uploads a fresh object, it never reuses the kept one (a delete removes its post's photo).
  - List: `rpc('restaurant_posts', { p_restaurant_id, p_cursor, p_limit: 20 })` -> `{ items, next_cursor }`, items in the 17.2 shape; read keys: `id`, `created_at`, `photo_url` (a path; a legacy `http(s)` URL is shown as is), `caption` (falls back to `text`), `like_count`, `comment_count`, `dish {id, name, available}`. The photo paths of a page are signed in ONE call, `storage.from('post-photos').createSignedUrls(paths, 3600)`; a path that cannot be signed shows a plate placeholder. Signed URLs last 1 h: when a photo fails to load (page left open) the card re-signs that one path once and retries, and only then shows the placeholder. "Load more" passes `next_cursor` back as `p_cursor`. After a publish the first page is reloaded silently (paging restarts).
  - Delete: `rpc('delete_post', { p_id })` (confirmed `p_id`). `post_not_found` counts as already deleted. After a successful delete the photo object is removed (best effort, allowed by the manager storage policy).
- Not-ready behaviour: until the SQL is applied the list shows the "isn't available yet" error with Try again, the composer still renders, and Publish shows the same message (PGRST202 / 42883 / 42P01 are treated as "not deployed").
- Phone (390 px): the composer and cards are one column, controls are 44 px (`.v2-page` rules), the delete dialog is the usual centred `.modal`.

**PM check on preview once sql/58 + sql/59 are applied** (manager or admin login on resto.rufat-server.com)
1. Sidebar (desktop) and bottom bar + More sheet (390 px) show "Posts" for admin / manager only; a waiter / host / cashier / kitchen login does not see it and `/posts` bounces them to their home page.
2. `/posts` loads without a red banner: composer + "No posts yet" (or the existing posts). The dish select lists the menu; a sold-out dish is marked.
3. Publish with a photo larger than 1080 px (e.g. a 12 MP phone photo): the preview appears, Publish succeeds, the post is at the top of the list with its photo, caption, dish name + Available / Sold out pill, counts 0 / 0 and "just now". In Storage the object is `post-photos/r/<restaurant_id>/<uuid>.jpg` and is <= 5 MB, <= 1080 px.
4. Caption only and photo only both publish; neither is refused client-side (Publish stays disabled with the hint). A 2000-character caption works; the textarea stops at 2000.
5. Error mapping: a non-image file -> "That file isn't a photo"; a staff login of another restaurant or a cashier cannot publish (storage RLS or `forbidden` -> "You don't have permission"); a 31st post in one day -> the daily-limit message; no raw error text anywhere.
6. The post appears on the consumer Home feed with the restaurant as author (not the staff member); likes / comments made there show up here after a reload.
7. Delete: confirm dialog (Esc, focus trap), the card disappears; the row and the storage object are gone; deleting a post that was removed elsewhere just removes the card.
8. With more than 20 posts "Load more" appends the next page without duplicates.
9. Dark and light theme, Azerbaijani and English strings.
