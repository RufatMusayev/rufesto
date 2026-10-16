# Home tabs (Home, Friends): integrator notes

Built against `docs/V2-CONTRACT.md` sections 17 (ranked Home feed) and 18 (Friends feed, design pass, speed). Discover has its own notes: `../discover/README.int.md`. `sql/58` / `sql/59` are on preview; `sql/60` (`friends_feed`, `discover`) was not when this was built, so Friends and Discover were checked against contract-shaped fixtures (Playwright, RPCs answered locally) and against the real preview database for the "RPC missing" path. Build: `cd client && npm run build` passes (no lint script exists).

## Files (`client/src/features/feed/`)

- `HomeFeed.jsx` Home tab (`home_feed`): reads `feeds.js`, location pill, new-posts pill, near-end paging, caught-up. Works signed out.
- `FriendsFeed.jsx` Friends tab (`friends_feed`): day separators, same cards, near-end paging, caught-up with the chronological tail, empty state with "Find friends" (`/friends?tab=find`), new-posts pill (realtime INSERT on `posts` + a check when the tab comes back after 30 s), signed out = `SignInCard`. Replaces `social/components/FeedTab.jsx` (deleted, with the unused `getPublicReviews` / `mapReviewRow`).
- `api.js` the only file that calls the feed RPCs (`getHomeFeed`, `getFriendsFeed`, `getHomeFeedNewCount`, `logFeedEvents`); `rpc` / `hasGps` are exported for Discover.
- `store.js` tiny module-level store (`createStore`, `useStore`); `pagedFeed.js` exclusion-paged feed on top of it (`ensure`, `reload`, `loadMore`, `remove`, `invalidate`, `clear`); `feeds.js` the two instances (`homeFeed`, `friendsFeed`) and `invalidateFeeds()`.
- `prefetch.js` route-load kick-off (see Speed). `useNearEnd.js` the "3 from the end" marker.
- `useViewerLocation.js` shared location state (one permission, one fix for Home, Friends and Discover). `events.js` / `useFeedEvents.js` impression + event queue (impressions now counted once per scope per load, also across a remount). `useNewPostCount.js` 60 s poll.
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
| `feed` (existing) | caught-up tail, signed in only | `p_scope 'all'` (Home) or `'friends'` (Friends), `p_cursor`, `p_limit` 15 | unchanged `{ items, next_cursor }`; Friends also calls it with `p_limit 1` when the tab returns after 30 s, to light the new-posts pill. |
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
3. Friends (signed in, with friends who posted): separators Today / Yesterday / dates; your own and your friends' posts and reviews; within a day the friends you interact with most come first; end: caught up + chronological tail grouped by day. A friend's new post: within the realtime event the "New posts" pill appears, tapping it reloads.
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
- The Friends tab's realtime pill counts any post of someone else the viewer can see (RLS decides), not only friends' posts, as before.
- `e2e/tests/feat-home-feed.spec.js` clicks "Load more" until caught up (paging is automatic now), and `e2e/tests/feat-discovery.spec.js` targets the old Discover markup; both will need updating (outside this scope, not touched).
- The `/rufesto` skill File System Map (`~/.claude/commands/rufesto.md`) has no `features/*` entries; not updated.
