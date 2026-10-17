# Home tabs (Home, Friends): integrator notes

Built against `docs/V2-CONTRACT.md` sections 17 (ranked Home feed) and 18 (Friends feed, design pass, speed). Discover has its own notes: `../discover/README.int.md`. `sql/58` / `sql/59` are on preview; `sql/60` (`friends_feed`, `discover`) was not when this was built, so Friends and Discover were checked against contract-shaped fixtures (Playwright, RPCs answered locally) and against the real preview database for the "RPC missing" path. Build: `cd client && npm run build` passes (no lint script exists).

## Files (`client/src/features/feed/`)

- `HomeFeed.jsx` Home tab (`home_feed`): reads `feeds.js`, location pill, new-posts pill, near-end paging, caught-up. Works signed out.
- `FriendsFeed.jsx` Friends tab (`friends_feed`): day separators, same cards, near-end paging, caught-up with the chronological tail, empty state with "Find friends" (`/friends?tab=find`), a persistent "Find friends" header entry while the viewer has fewer than 3 friends (`useFriendCount`: one HEAD count on `friendships`, again when the tab is shown and after any friend write), new-posts pill from `friends_new_count` polled every 60 s while the tab is shown (no realtime), signed out = `SignInCard`. Replaces `social/components/FeedTab.jsx` (deleted, with the unused `getPublicReviews` / `mapReviewRow`).
- `api.js` the only file that calls the feed RPCs (`getHomeFeed`, `getFriendsFeed`, `getHomeFeedNewCount`, `getFriendsNewCount`, `logFeedEvents`); `rpc` / `hasGps` are exported for Discover. A page is returned before its photos are signed (`signed`: one promise per signing call, see Speed).
- `store.js` tiny module-level store (`createStore`, `useStore`); `pagedFeed.js` exclusion-paged feed on top of it (`ensure`, `reload`, `loadMore`, `remove`, `patch`, `invalidate`, `clear`); `feeds.js` the two instances (`homeFeed`, `friendsFeed`), `invalidateFeeds()` (a post was created), `invalidateAllTabs()` (follows / friends changed: Home, Friends and Discover) and `patchFeedItem(kind, id, partial)` (a like or comment made elsewhere is written into the lists).
- `dishAvailability.js` live "Available now" / "Sold out" of the dishes on the cards in or near the viewport: every 60 s while the page is visible and on window focus, one `GET dishes?id=in.(...)&select=id,available` (cards carry `data-dish-id`); `useDishAvailable(id, fallback)` is read by the post card, its photo chips, the dish strip and Discover's dish card. A sold-out dish turns the "Order this" link into a disabled "Sold out" button.
- `useEagerPhotos.js` the first two photos of the shown tab load eagerly with `fetchpriority="high"` (every other image stays lazy).
- `prefetch.js` route-load kick-off (see Speed). `useNearEnd.js` the "3 from the end" marker.
- `useViewerLocation.js` shared location state (one permission, one fix for Home, Friends and Discover). `events.js` / `useFeedEvents.js` impression + event queue (impressions now counted once per scope per load, also across a remount). `useNewPostCount.js` 60 s poll (Home: `home_feed_new_count`, Friends: `friends_new_count`; an RPC that answers "not found" is not asked again and its pill stays hidden).
- `components/`: `FeedItem` (post, promo or review slot + tracking), `DaySeparator`, `CaughtUp`, `MoreRow`, `FeedStatus`, `FeedSkeleton`, `LocationPill`. `lib/days.js` Baku calendar days. `styles.css` (separators, skeleton, marker, location pill, caught-up), `cards.css` (card chrome of the three tabs).

## What changed outside this folder

- `social/components/HomeTabs.jsx`: no `children` any more. Home is a static import; Friends and Discover are lazy chunks preloaded in idle time; each tab mounts on its first visit and stays mounted, hidden.
- `pages/HomePage.jsx`: thin shell that calls `prefetchHome()` at module load. `pages/HomePage.css` deleted.
- `social/components/PostCard.jsx` + `RestaurantPostParts.jsx` + `social/styles.css`: when a post has a photo, the restaurant chip (people's post) or distance / "Open now" (restaurant post) and the live availability pill sit over the photo on a soft bottom gradient (`PhotoChips`); the dish strip keeps name, price and "Order this" (the pill stays in the strip only when there is no photo). `ReviewCard`: `decoding="async"`.
- `social/mappers.js`: `mapFeedItem` adds `day`. `social/api.js`: `getPublicReviews` removed.
- `social/homeTab.js` + `social/pages/NewPostPage.jsx` (coordinator request, found by QA): publishing a post stored `'feed'`, which `rememberHomeTab` turned into `'home'`; it now remembers `'friends'`, and `rememberHomeTab('feed')` is stored as `'friends'` too. After publishing, `invalidateFeeds()` marks Home and Friends stale so the new post shows (they live in memory now).
- `locales/en|az/social.json`: new `feed.*` (today, yesterday, caughtUpFriendsBody, retry, unavailable*, weekdays, months, dayLabel*) and `discover.*` keys. Day names come from the locale files, not from `Intl` (a browser without Azerbaijani locale data prints dates in a root pattern; headless Chromium does).

## RPC calls and expected shapes

| Call | When | Arguments | Expected answer |
|---|---|---|---|
| `home_feed` | first load, reload, near-end paging | `p_exclude` (uuid[], `[]` on the first page), `p_limit` 20, `p_lat` / `p_lng` only with GPS (3 decimals) | jsonb `{ items, exclude, caught_up, mix, radius_km }`. Post item = 17.2 shape + `pool`, `position`, `km`, `open_now`; promo item = `{ kind:'promo', id, pool:'promo', position, restaurant{id,name,slug,logo}, title, description, image_url, dish{id,name,photo,price,available}\|null, starts_at, ends_at, type }`. `photo_url` is a storage path (signed here: one `createSignedUrls` per page, bucket `post-photos`, incl. `r/<restaurant_id>/...`). |
| `friends_feed` (authenticated only) | first load, reload, near-end paging | same arguments as `home_feed` | jsonb `{ items, exclude, caught_up }` (18.1). Items are post items and review items (`_review_json`), each with `day` ('YYYY-MM-DD', Baku), `position`, `affinity`, `km`, `pool 'friends'`. Ordered by day, then by score: the client renders them in the order received and starts a new separator whenever `day` changes. One `createSignedUrls` per page. |
| `feed` (existing) | caught-up tail, signed in only | `p_scope 'all'` (Home) or `'friends'` (Friends), `p_cursor`, `p_limit` 15 | unchanged `{ items, next_cursor }`. |
| `friends_new_count` (sql/63, authenticated only) | every 60 s while the Friends tab is shown and the browser tab is visible (and when the browser tab becomes visible again) | `p_since` (ISO time the current load started) | int 0..50: friends' posts / reviews newer than `p_since` that the list does not show. Not deployed (PGRST202 -> error code `unavailable`): not asked again, pill hidden. No realtime subscription on `posts` any more. |
| `dishes` select (existing table) | every 60 s + window focus, for the dishes of the cards in or near the viewport | `id=in.(...)` (max 60), `select=id,available` | rows; a card's "Order this" turns into a disabled "Sold out" when `available` is false. |
| `review_comments` select / insert / delete (existing table, sql/24) | opening the reply thread of a review card; sending / deleting a reply | `review_id`, `is_flagged = false`, oldest first, limit 50; insert `{ review_id, user_id, body }` (body <= 500) | rows with the author embedded (`users(name, profile_photo)`). |
| `home_feed_new_count` | every 60 s while the Home tab is shown and the browser tab is visible | `p_since` (ISO time the current load started, client clock), `p_lat` / `p_lng` with GPS | int 0..50. 50 or more shows "50+ new posts". |
| `log_feed_events` | batch | `p_events` jsonb array, at most 50: `{ item_type, item_id, event, pool?, position?, anon_key? }` | int; ignored. Friends events carry `pool 'friends'` (needs the `feed_events` check from `sql/60`; until then a Friends batch is rejected and dropped). Reviews are not feed-event items and are not tracked. |
| `track_campaign` (existing) | promo | `{ p_campaign_id, p_event 'impression' \| 'click' }` | ignored. Unchanged. |

Missing RPC (PostgREST 404 / PGRST202, error code `unavailable`): Home, Friends and Discover show the calm "Nothing to show yet" block with a "Try again" button (`components/FeedStatus.jsx`); any other failure shows the usual `LoadError`. Never a crash.

## Behaviour

- Paging: next page sends the `exclude` of the previous answer; an empty page (or 300 ids) ends the list. The page after the first loads by itself when the marker in front of the item 3 from the end scrolls into view; a skeleton card shows while it loads, a retry button after a failure, and a plain "Load more" button only where `IntersectionObserver` is missing. There is no "Load more" button otherwise.
- Day separators (Friends): small-caps label per Baku day: Today, Yesterday, else "Monday, 12 October" (year only when not this year). The same separators group the chronological tail.
- Caught up: "You're all caught up" and, for a signed-in viewer, the chronological tail (`feed`) minus the items already shown (posts and reviews). A signed-out Home viewer gets a way into Discover instead.
- Friends empty (ranked list and tail both empty): "No posts from friends" + "Find friends" (`/friends?tab=find`).
- Design: posts, reviews and promos are 16 px rounded cards on the page background (`--s2` on `--bg`), 16 px side gutter, photo with a soft bottom gradient and chips over it, serif headings, review photos in a 4:3 box, skeleton cards with the same geometry, gold text uses `--gold-text` (darker in the light theme). No `overflow:hidden` on the cards (the rise-in animation leaves a transform that would clip a card's toast).
- Photos: if a signed photo URL fails to load (expired in a long-open tab), `PostCard` signs that one path again (`resignPostPhoto`) and retries once before showing the placeholder.
- Events: impression = 50 % of the card (or half the viewport for a taller card) visible for 1 s while the browser tab is visible, once per card per load of that tab (kept across a remount, reset by a fresh first page). `open` = any tap on the card that is not a control or the photo chips; `like` = like turned on; `comment` = comment sent; `order_tap` = "Order this". Flush: 10 s after the first queued event, on `visibilitychange` hidden, on `pagehide` / `beforeunload`, immediately at 50. Failures are dropped; "not found" switches the queue off for the page load. `anon_key`: 32 hex chars in `localStorage.rufesto_feed_anon`, only while signed out. `position` = 1-based index across the whole loaded list.
- Location: no automatic prompt. The pill calls `navigator.geolocation` once per tap (granted: rounded to 3 decimals, `rufesto_geo_ok=1`; denied: flag cleared, hint). On the next visit the tabs wait (max 2.5 s, was 4 s) for a silent fix only when the Permissions API explicitly reports `granted`. Home, Friends and Discover share it and reload once when the coordinates arrive.
- Signed out: Home and Discover work; Friends shows only the `SignInCard`; like / comment go through `useRequireAuth`. Signing out clears the Friends list from memory.

## Speed

- Each tab keeps its data in module-level stores (`feeds.js`, `discover/discoverStore.js`): a tab switch, or leaving Home and coming back, makes no request while the data is for the same viewer + location and younger than 5 minutes (after that it refreshes in the background, the old list stays until the new first page arrives). The new-posts pill / `reload()` start over; `invalidateFeeds()` (after publishing a post) marks both lists stale.
- `prefetch.js` is imported by `HomePage.jsx`, so it runs when the app boots on `/`: it reads the stored session locally, waits for a remembered location, and requests the first page of the remembered tab before any Home component has mounted. After that tab has landed and the browser is idle it fetches the other two, and `HomeTabs` preloads their chunks.
- Images: `loading="lazy"`, `decoding="async"`, fixed aspect boxes; signed URLs: one `createSignedUrls` per page (cached in memory, as before).

### Persona fix round (docs/qa/persona-newcomer.md N03-N21, persona-leyla #7 / #8, persona-aysel M5 / m1 / m14 / m17 / m19 / m22 / m24)

What changed and why (the code is commented where it is not obvious):

- **Follows / friends reach every tab (N03).** `lib/supabase.js` wraps `fetch` and announces every successful `user_follows` write and friend RPC (`send` / `respond` / `cancel` / `remove`) as `window` event `rufesto:social-write`; `feeds.js` listens and calls `invalidateAllTabs()` (Home, Friends, Discover `loadedAt = 0`). A tab that becomes the shown one (`active` prop; `HomeTabs` passes it) calls `ensure()` again: stale means a quiet refetch of page 1 with the old list on screen, and a refetch that brings the same cards keeps the objects already rendered (`reuse()` in `pagedFeed`, `JSON` equality in `discoverStore`), so nothing repaints. This covers the restaurant page's Follow button too, without touching it. Checked with a fixture run: Discover follow, back to Home: old list at once, one `home_feed` request, new list in place; Friends refetches on its visit; no request when nothing changed.
- **Friends pill (N05)**: realtime `posts` subscription removed (`subscribePosts` deleted); `friends_new_count(p_since)` every 60 s while the tab is shown. **Find friends (N06)**: header entry while < 3 friends.
- **Likes and comments written back (aysel m1)**: `patchFeedItem` writes `likeCount` / `likedByMe` (post and review cards) and `commentCount` (post thread, review replies) into the Home / Friends / Discover stores, so a card that mounts again shows them. `usePostThread` syncs the count of the post page into the lists.
- **Review replies (aysel M5)**: the fork-and-knife button and "View N replies" expand the thread inside the card (`ReviewReplies`, `review_comments` calls in `social/api.js`), reply box for signed-in guests (a signed-out guest gets the sign-in sheet on focus). Review cards: no auto "Rated <dish> 5/5" line when the body is empty, no gap under "Verified visit" (m22), dish and venue are separate spans so a long dish name is cut first and the venue (up to 60 % of the line) stays readable (m17).
- **Distance copy (m14)**: `social/lib/distance.js`: "< 100 m", "0.4 km", "12 km" (Home posts, Discover cards).
- **Theme (m19)**: the first visit follows `prefers-color-scheme` (live, until the guest toggles); only the toggle writes `rufesto_theme`; the `theme-color` meta follows the active theme (`ThemeContext`, `public/boot.js`). Note for e2e: Playwright contexts default to a light colour scheme, so specs that assume the old dark default must set `colorScheme: 'dark'` or store `rufesto_theme`.
- **Console noise (aysel m24)**: not duplicate or aborted-by-the-app requests. Every count query (`head: true`: notifications badge, profile counts, friends) is a HEAD request whose body postgrest-js never reads; Chromium then reports it as `net::ERR_ABORTED`. `lib/supabase.js` reads the (empty) body and returns the same status and headers without one; the same fixture run shows 0 failed requests (was 5) and each count is still sent once per mount (production has no StrictMode double effects).
- **Sold out (leyla #7 / #8)**: `dishAvailability.js` (see Files). **Error boundary**: `components/ErrorBoundary.jsx` around the app and around the page (keyed by pathname).
- **Promo card**: one label ("Sponsored" / "Reklam"); a "-15 %" / "-₼5" badge when `discount_percent` / `discount_amount` come with the promo (home_feed, discover; sql/63), and a leading `[discount:percent=n]` / `[discount:amount=n]` in the description is parsed and never shown (`mapDiscount` in `social/mappers.js`).
- **Text-only restaurant posts (N15)**: `TextCard` (accent gradient, serif italic quote, venue chip, as tall as wide).
- **Accessibility**: one `<h1>` per Home tab (visually hidden, names the tab), tablist with roving tabindex and arrow keys, `tabpanel` / `aria-controls`, Profile link name, photo `alt` no longer repeats the caption (the caption is read as text), `--t3` / `--t2` (light) / `--accent-text` / `--gold-text` tokens give >= 4.5:1, author names, venue chips, card titles are real 44 px boxes. A scripted scan of Home / Friends / Discover, dark and light, signed in (fixtures) and signed out (real data): 0 contrast failures, 0 unnamed controls, 0 targets under 44 px (text over photos is not measured).

### Speed round (N07): what was done

- The entry bundle was one 1,329 kB file (402 kB gzip). Now: every page except Home is `React.lazy` (`App.jsx`), the cart drawer and the QR scanner load when needed, vendor chunks are split (`vite.config.js`: react, supabase, i18n, leaflet, qr-scanner). Entry chunk 230 kB / 75 kB gzip (final build); the JavaScript a first visit downloads is about 200 kB gzip (was 398 kB).
- First paint before any script: the phone header is in `index.html`, the fonts stylesheet no longer blocks rendering (`media="print"` until `public/boot.js` switches it on; the enforced CSP forbids inline scripts and `onload`), the theme is applied by `boot.js` before the first paint.
- `<link rel="preconnect">` to the Supabase origin (fetch and image connections) and `images.unsplash.com`, injected from `VITE_SUPABASE_URL` at build time.
- The cards render as soon as `home_feed` answers: photo signing runs in parallel with rendering (`signInBackground`: the first 3 paths in a small call, the rest in a second call sent at the same time; a card whose photo is still being signed shows a shimmering box of the final size). The first two photos are eager with `fetchpriority="high"` and skip the rise-in animation; the others stay lazy.
- Tab switches: the hidden tab is `content-visibility: hidden` where supported (layout is kept), sections of Discover are memoised.

Measured with `vite build` output served by a gzip static server (this PC, Pixel 7 profile in Playwright, fresh browser per run, real Supabase backend, signed out, median), before = the build deployed on the preview (`index-D9ZRBzZM`), interleaved runs:

| | before | after |
|---|---|---|
| JavaScript downloaded (gzip) | 398 kB | 207 kB |
| Entry chunk (gzip) | 402 kB | 75 kB |
| FCP, native (6 runs) | 412 ms | 108 ms |
| First card in the DOM, native | 1265 ms | 533 ms |
| First photo / LCP, native | 2589 / 2600 ms | 2141 / 2156 ms |
| Total blocking time, native | 43 ms | 19 ms |
| FCP, CPU x4 + 1.6 Mbit/s + 150 ms RTT (3 runs) | 3164 ms | 752 ms |
| First card, throttled | 4526 ms | 3120 ms |
| First photo / LCP, throttled | 7985 / 7996 ms | 7284 / 7296 ms |
| Back to Discover, CPU x4 (4 runs) | 207 ms | 106 ms |
| Back to Home, CPU x4 | 200 ms | 84 ms |

The first photo is now limited by the image itself (1080 px JPEGs, about 1.1 s on this connection after its URL is signed), not by the app; a smaller rendition (Supabase image transformation on the signed URL, or `w=` on the Unsplash URLs) is the remaining lever. Total blocking time under the 4x CPU throttle did not improve (about 1.1 s either way: the work moved from parsing a big bundle to rendering the feed).

### Numbers measured (this PC, built client served by `vite preview` on 127.0.0.1:4173, Pixel 7 profile in Playwright, 5 runs, warm HTTP cache, median)

| | no CPU throttle | CPU 4x throttle |
|---|---|---|
| Skeleton first visible (ms after navigation start) | 23 | 84 |
| `home_feed` request starts | 29 | 130 |
| `home_feed` answer complete (real preview backend, signed out, answer had no posts) | 375 | 474 |
| First content painted, real backend | 376 | 482 |
| First card painted, fixture network with 8 posts, 0 ms latency | 344 | 674 |
| Tab switch to Friends / Discover / Home (click to second frame, data already in memory) | 6 / 31 / 19 | 30 / 37 / 66 |

Not measured, and why: (1) "Home first items < 1.2 s on preview" with real posts: preview has no `home_feed` posts, so the first-items time is the fixture row (client work only) plus the real answer time (about 350 ms round trip to Supabase from here), not one end-to-end number; remeasure on https://rufat-server.com after the PM deploys, with real data. (2) `home_feed` / `friends_feed` / `discover` server time (`explain analyze`): `friends_feed` and `discover` are not on preview, and the database is outside this scope. (3) Real devices: CPU throttling is only an approximation of a Pixel 7.

## Check on preview once `sql/60` + `sql/60b` are applied

1. Signed out, no GPS: `/` opens on Home, cards load, restaurant posts show their photo with distance / "Open now" and the availability pill over it; scrolling to 3 cards from the end loads page 2 by itself (no button) and the list ends in "You're all caught up" with "Open Discover", no tail.
2. Signed in: same, plus under the caught-up block a chronological tail from `feed('all')` without the posts already shown.
3. Friends (signed in, with friends who posted): separators Today / Yesterday / dates; your own and your friends' posts and reviews; within a day the friends you interact with most come first; end: caught up + chronological tail grouped by day. A friend's new post: within a minute (poll of `friends_new_count`) the "N new posts" pill appears, tapping it reloads.
4. Friends with no friends: "No posts from friends" + "Find friends" opening `/friends?tab=find`.
5. Publish a post (`/post/new`): you land on Friends and the post is there (refreshes in the background, the list swaps in after the answer).
6. Tap the location pill on any tab: one reload with GPS per tab; `radius_km` line on Home; reload the page: it fetches silently without a prompt. Deny once: pill stays, hint text.
7. Network tab: no request on a tab switch; `friends_feed` page 2 sends the first page's `exclude`; `feed_events` rows for Friends impressions have `pool = 'friends'`.
8. Break `friends_feed` (before 60 is applied): "Nothing to show yet" + "Try again".
9. 360 / 390 / 430 px, dark and light, en and az: no horizontal scroll, tab bar and cards inside the 16 px gutter.

## Known gaps

- Friends and Discover were not run against the real RPCs (not on preview when this was built).
- `save` and `hide` events exist in the schema but have no UI here. The new-posts poll (Home) uses the client clock for `p_since`.
- Pull-to-refresh is not built: the new-posts pill, the retry buttons and the 5-minute background refresh are the refresh paths.
- `search_users` (Find people) sends no mutual-friends count, district or join date, so the second line under a result (`FindPeople`) shows nothing yet; `mapSearchRow` already reads `mutual_friends`, `district` and `joined_at` when the RPC grows them.
- The 60 s dish availability refresh is a poll, not a realtime channel: a dish that sells out is shown as sold out within a minute (or at once when the window gets focus).
- `e2e/tests/feat-home-feed.spec.js` clicks "Load more" until caught up (paging is automatic now), and `e2e/tests/feat-discovery.spec.js` targets the old Discover markup; both will need updating (outside this scope, not touched).
- The `/rufesto` skill File System Map has entries for `features/feed`, `features/discover` and the new shared files since the persona fix round.
