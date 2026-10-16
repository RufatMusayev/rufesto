# Ranked Home feed: integrator notes

Built against `docs/V2-CONTRACT.md` section 17 (17.2 to 17.5), written before the SQL (`sql/58`, `sql/59`) was applied. Nothing here was run against a database; the build passes (`cd client && npm run build`, no lint script exists).

## What changed

**New, `client/src/features/feed/`**
- `HomeFeed.jsx` the Home tab: `home_feed` first page, exclusion paging with "Load more", loading / error (retry) / empty / caught-up states, new-posts pill, location pill. Works signed out.
- `api.js` the only file that calls the three RPCs (`getHomeFeed`, `getHomeFeedNewCount`, `logFeedEvents`).
- `events.js` module-level event queue (`logFeedEvent`, `flushFeedEvents`); `useFeedEvents.js` impression tracker (IntersectionObserver).
- `useViewerLocation.js` geolocation (see below); `useNewPostCount.js` 60 s poll.
- `components/FeedItem.jsx` (post or promo slot + impression / open tracking), `LocationPill.jsx`, `CaughtUp.jsx` (end state + chronological tail), `styles.css` (`soc-geo*`, `soc-caught*`, `soc-feed-slot`).

**Edited**
- `social/components/HomeTabs.jsx`: tabs `home | friends | discover`, default `home`; Home and Friends mount on first visit and then stay mounted (hidden), Discover children always mounted as before. `PostComposerFab` on home and friends.
- `social/homeTab.js`: remembered value `feed` is read as `friends`; anything unknown is `home`.
- `social/components/FeedTab.jsx`: scope fixed to `friends` (chips removed). Signed out: only the `SignInCard` (the old public-reviews list under it is gone; `getPublicReviews` in `social/api.js` is now unused).
- `social/components/PostCard.jsx` + new `RestaurantPostParts.jsx`: when `item.author.type === 'restaurant'` the header shows logo + name linking to `/restaurant/<slug>` (plus `km` and "Open now" when Home sends them); a dish strip under the photo shows dish, price, "Available now" / "Sold out" and "Order this" (link `/restaurant/<slug>?dish=<dish id>&src=post:<post id>`, logs `order_tap`; only shown when the post has a dish). People's posts are unchanged. Like (when it turns on) logs `like`.
- `social/usePostThread.js`: a sent comment logs `comment`.
- `social/mappers.js`: `mapFeedItem` adds `author {type,id,name,slug,photo}`, `pool`, `position`, `km`, `openNow`, `dish.price`, `dish.available`, and a `kind: 'promo'` branch.
- `pages/RestaurantPage.jsx`: `?dish=<id>` opens that dish's `DishDetailSheet` once the menu is loaded (once per slug + id; unknown ids ignored; `src` is not read).
- `locales/en|az/social.json`: `home.tab_home`, `home.tab_friends`, geo / new-posts / caught-up keys, `post.availableNow|soldOut|orderThis|kmAway|openNow`, `feed.signInFriendsTitle|Body`. Removed the unused `feed.filter|scope_all|scope_friends|signInTitle|signInBody`. (The task said `social/i18n.js`; that file only registers the JSON bundles, the keys live in the locale files.)

## RPC calls and expected shapes

| Call | When | Arguments | Expected answer |
|---|---|---|---|
| `home_feed` | first load, reload, "Load more" | `p_exclude` (uuid[], `[]` on the first page), `p_limit` 20, `p_lat` / `p_lng` only with GPS (3 decimals) | jsonb `{ items, exclude, caught_up, mix, radius_km }`. Post item = 17.2 shape + `pool`, `position`, `km`, `open_now`; promo item = `{ kind:'promo', id, pool:'promo', position, restaurant{id,name,slug,logo}, title, description, image_url, dish{id,name,photo,price,available}\|null, starts_at, ends_at, type }`. `photo_url` is a storage path (signed here with `createSignedUrls`, bucket `post-photos`, incl. `r/<restaurant_id>/...`). |
| `home_feed_new_count` | every 60 s while the Home tab is shown and the browser tab is visible | `p_since` (ISO time the current load started, client clock), `p_lat` / `p_lng` with GPS | int 0..50. 50 or more shows "50+ new posts". |
| `log_feed_events` | batch | `p_events` jsonb array, at most 50: `{ item_type, item_id, event, pool?, position?, anon_key? }` | int (rows written). The answer is ignored. |
| `feed` (existing) | caught-up tail, signed in only | `p_scope 'all'`, `p_cursor`, `p_limit` 15 | unchanged `{ items, next_cursor }`. |
| `track_campaign` (existing) | promo | `{ p_campaign_id, p_event 'impression' \| 'click' }` | ignored. Click: `PromoCard` as before. Impression: fired when the promo was really seen (50 % for 1 s, once per load), not when it is fetched. Intentional (decided by the coordinator). |

Behaviour notes
- Photos: if a signed photo URL fails to load (expired in a long-open tab), `PostCard` signs that one path again (`resignPostPhoto`, fresh `createSignedUrls`) and retries once before showing the placeholder.
- Paging: next page sends the `exclude` of the previous answer. `caught_up` (empty page) ends the list. The client also treats an `exclude` above 300 ids as caught up instead of calling (the RPC would raise `too_many_excluded`).
- Events: impression = 50 % of the card (or half the viewport for a card taller than the screen) visible for 1 s while the browser tab is visible, once per card per feed load (a reload via the pill counts again). `open` = any tap on the card that is not a control (photo, caption, dish strip, header and "view all comments" links count; like, comment, share, more and "Order this" do not; taps inside sheets / modals of the card are ignored; at most one per 0.8 s per card, so a double tap on the photo is one open); `like` = like turned on; `comment` = comment sent (PostPage, pool / position come from the router state when the post was opened from Home); `order_tap` = "Order this". `like` / `order_tap` / `comment` are also logged outside Home, without pool / position. Flush: 10 s after the first queued event, on `visibilitychange` hidden, on `pagehide` / `beforeunload`, immediately at 50. Failures are dropped. If the RPC answers "not found" the queue switches itself off for the page load.
- `anon_key`: 32 hex chars in `localStorage.rufesto_feed_anon`, sent only while signed out (also while the auth state is not known yet, a signed-in answer ignores it).
- `position` in every event is the 1-based index across the whole loaded list (page 2 starts at 21; `HomeFeed` re-numbers the server's per-page slot), `null` outside Home.
- Location: no automatic prompt. The pill calls `navigator.geolocation.getCurrentPosition` once per tap. Granted: rounded to 3 decimals, kept in memory, `rufesto_geo_ok=1` in localStorage; on the next visit the feed waits (max 4 s) for a silent fix only when the Permissions API explicitly reports `granted`; a missing / failing Permissions API counts as unknown, never prompts: the flag is cleared and the pill waits for a tap. Denied: flag cleared, GPS-off mix, the pill stays with a hint. After a fix arrives the feed reloads once with the coordinates.
- Signed out: no SignInCard on Home; like / comment go through `useRequireAuth`. Friends shows only the SignInCard.

## Check on preview once `sql/58` + `sql/59` are applied

1. Signed out, no GPS: `/` opens on the Home tab, cards load, photos render for restaurant posts (anon signing of `r/<id>/...` paths), "Load more" ends in "You're all caught up" with an "Open Discover" button, no tail.
2. Signed in: same, and under the caught-up block a chronological tail from `feed('all')` without the posts already shown.
3. Tap the pill with GPS: one reload, `radius_km` line ("Nearby: places within X km"), `km` on restaurant cards, then reload the page: it fetches silently without a prompt. Deny once: pill stays, hint text.
4. Restaurant post with a dish: header = restaurant, pill follows the Menu availability toggle after a reload, "Order this" opens `/restaurant/<slug>?dish=<id>&src=post:<post id>` with that dish's sheet open; an unknown `dish` id opens nothing.
5. Promo slots at positions 5 / 10 / 15 / 20 render `PromoCard`; tapping a promo dish opens the restaurant with the dish sheet; `ad_campaigns.impressions` grows only when the card was on screen.
6. `feed_events` rows: impressions after about 1 s on screen (and about 10 s later in the table), `open`, `like`, `comment`, `order_tap` with `pool` / `position`; signed-out rows carry `anon_key`, signed-in rows `user_id`. No more than 50 per request in the network tab.
7. New-posts pill: create a restaurant post from the dashboard, within about 60 s the pill shows "1 new post" on a tab left open; tapping reloads the feed.
8. Friends tab: no chips, `feed('friends')`, signed out shows the sign-in card. A remembered tab `feed` opens Friends. Tabs fit at 390 px and the page has no horizontal scroll.
9. `p_exclude` growth: after about 15 pages the list ends as caught up (300-id cap).

## Known gaps

- Nothing was run in a browser or against the database (no dev server was running; no Playwright). Layout at 390 px and dark mode were built from the existing tokens but not looked at.
- `save` and `hide` events exist in the schema but have no UI here.
- The new-posts poll uses the client clock for `p_since`; a badly wrong device clock skews the count.
- The signed-out Friends tab no longer shows public reviews. `getPublicReviews` is unused and can be deleted.
- The sponsored impression moved from "fetched" to "seen" on purpose (kept as decided); `components/FeedItem.jsx` `onImpression` is the one place to change it.
- Restaurant posts in the Friends feed / tail use the same card; "Order this" works there too and logs `order_tap` without a pool.
- The `/rufesto` skill File System Map (`~/.claude/commands/rufesto.md`) was not updated: it has no entries for `features/*` at all, so this is left to the PM.
