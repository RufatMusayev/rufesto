# WP2 Group bookings: integrator notes

**Routes** (`routes.jsx`, array of `<Route>`; public, no auth redirect; imports `styles.css` and registers the `bookings` namespace itself): `/book/:slug` BookGroupPage, `/b/:code` InvitePage, `/bookings/:id` BookingDetailPage. `App.jsx`: `import bookingsRoutes from './features/bookings/routes'` and `{bookingsRoutes}` inside `<Route element={<AppLayout />}>`.
**nav.js:** one entry, `placement: 'none'` (`to: '/profile'`, never rendered). **i18n:** `lib/i18n.js`: `import bookingsEN from '../locales/en/bookings.json'` (and az), `resources.en.bookings = bookingsEN` (and az).
**Mounts** (`mounts.js`; one line each):
- `RestaurantPage.jsx`: `import { BookWithFriendsButton } from '../features/bookings/mounts'`; in the action row, between Reserve and the floor-plan button: `<BookWithFriendsButton restaurant={restaurant} />` (short label "With friends", fits beside Reserve at 360px).
- `ProfilePage.jsx`: `import { MyBookingsTab as BookingsTab } from '../features/bookings/mounts'` and delete the local `BookingsTab` function (call site and tab id `bookings` stay as they are).
- `TablePage.jsx`: `<ActiveBookingBanner />` at the top of the no-table empty state (booking pending or confirmed that starts within 2 h or is under way).
**`PendingClaimRedirect.jsx`** (resume an invite after OAuth / magic link; key `rufesto_pending_invite`, 10-min TTL, written by InvitePage while signed out, cleared on sign-in or when the page goes away):
```js
import { readPendingInvite } from '../features/bookings/pendingInvite'
if (pathname.startsWith('/t/') || pathname.startsWith('/b/') || pathname.startsWith('/auth/')) return   // guard gains '/b/'
const invite = readPendingInvite()   // after `const code = readPendingClaim()`
if (!code && invite) { navigate(`/b/${encodeURIComponent(invite)}`, { replace: true }); return }
```
**Contract (matches docs/V2-CONTRACT.md section 2 and sql/41, 41b, 41c; nothing unconfirmed):** `get_available_slots`, `create_group_booking`, `get_group_booking_preview` (anon), `join_group_booking(p_code, p_consent, p_name, p_phone)`, `leave_group_booking`, `cancel_booking`, `claim_table_from_booking`, `list_my_bookings`, plus `group_booking_detail` (not in the spec; replaces table reads for the detail screen, phones come from the server for the host only). `invite_to_booking` has no UI here.
**Differences handled in the UI:** guests cannot read `restaurant_settings`, so `group_booking_enabled=false` shows up as slots with reason `not_bookable` or the `bookings_disabled` error, both ending in the "not available" EmptyState; "We're here" is offered for `pending` as well as `confirmed` (the server accepts both) with the pending note above it; solo bookings (no invite, no members) get a header card plus Cancel only (no role pill, no check-in); status pills use `Pill` tones (BOOKING_STATUS_STYLE has no `no_show`); az dates come from tables in `timeFormat.js` because some browser builds lack az Intl data.
**Verified:** `vite build` of every module (harness build), en/az key parity (163 keys), anon RPC existence and signatures on preview, live slots and closed/full days, invalid-code invite, signed-out screens, 360px, light/dark, az; signed-in flows (create, join, detail, We're here, go to table, leave, cancel, list, banner, 20 s poll fallback) against an in-memory mock. **Not verified live with a session** (no credentials were typed): create/join/claim against the preview database.
