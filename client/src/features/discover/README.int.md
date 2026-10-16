# Discover tab: integrator notes

Built against `docs/V2-CONTRACT.md` section 18 (18.2 `discover`, 18.3 client, 18.4 design, 18.5 speed). `sql/60b_discover.sql` was not applied to preview while this was built: everything below was checked against contract-shaped fixtures (Playwright, RPCs answered locally) and, for the "RPC missing" path, against the real preview database (404 / PGRST202). Build: `cd client && npm run build` passes (no lint script exists).

## What it is

`pages/HomePage.jsx` is now a thin shell (`<HomeTabs />`); the old Discover list (stories bar of emoji art, restaurant "posts", review cards with reply threads, promo cards, `buildFeed`, `FeedPost`, `ReviewPostCard`, `CommentThread`) and `pages/HomePage.css` are gone. `HomeTabs` mounts `DiscoverTab` (lazy chunk, preloaded in idle time) on the first visit to the tab.

One `discover()` call renders the tab. Sections, in this order, each with a serif heading and hidden when empty: cuisine chips, **Open now near you** (heading is plain "Open now" when the answer has no `radius_km`, i.e. no GPS), **Trending dishes**, **New places**, **Promos**, **Top reviews**, **All restaurants**. Everything empty: one "Nothing to discover yet" block.

## Files (`client/src/features/discover/`)

- `api.js` the only file that calls Supabase: `getDiscover` (rpc), `getRestaurantLikes`, `setRestaurantLike`, `setFollow`, mappers `mapDiscover` / `mapRestaurantCard` / `mapDishCard`.
- `discoverStore.js` module-level store (see Speed): answers per viewer + location + cuisine, cuisine chip state, optimistic follow / like state, `ensureDiscover`, `reloadDiscover`, `toggleFollow`, `toggleLike`, `currentViewer`.
- `DiscoverTab.jsx` the tab; `ActionsContext.js` follow / like state shared by every card.
- `components/`: `CuisineChips`, `RestaurantRail` + `RestaurantCard` (variants `rail` / `list`), `DishRail` + `DishCard`, `PromoRail` (reuses `feed/components/FeedItem` + `PromoCard`), `ReviewList` (reuses `social/components/ReviewCard`), `AllRestaurantsList`, `Section` (+ `Rail`), `CoverImage`, `DiscoverSkeleton` (+ `DiscoverFallback`).
- `styles.css` (prefix `dsc-`, 105 lines). Shared card chrome and tokens: `feed/cards.css`, photo overlays: `social/styles.css`.

## RPC call and expected shape

| Call | When | Arguments | Expected answer |
|---|---|---|---|
| `discover` (anon + authenticated) | first visit of the tab (or route-load prefetch), cuisine chip pick, GPS change, retry, stale (> 5 min) refresh on return | `p_lat` / `p_lng` only with GPS (3 decimals), `p_cuisine` only when a chip is selected (the chip's own `key`) | jsonb `{ location{radius_km}, open_now[], trending_dishes[], new_places[], top_reviews[], promos[], all_restaurants[], cuisines[{key,count}] }` as in 18.2. Restaurant card `{id,name,slug,cuisine_type,logo,cover_photo,cover_fallback,address,latitude,longitude,km,open_now,closes_at,rating,review_count,follower_count,free_seats,is_followed,trending,pull}`; dish card `{id,name,photo,price,category,available,avg_rating,review_count,orders_7d,restaurant{id,name,slug,logo,open_now,km}}`; review = `_review_json` (the mapper adds `kind:'review'` when missing); promo = 17.3 promo (mapper adds `kind:'promo'`). Checked against `sql/60b_discover.sql` as written (keys match). |
| `likes` select (existing table) | after each answer, for the ids of `all_restaurants` not asked yet | `target_type 'restaurant'`, `target_id in (...)`; plus the same with `user_id` when signed in | rows; counted client side. Two batched reads per answer instead of the old one-per-feed-load pair, same data. |
| `likes` insert / delete, `user_follows` insert / delete (existing) | like / follow taps | as the old Home list wrote them | a duplicate-key error (23505) counts as done; any other error rolls the optimistic change back and shows a toast. |

Missing RPC (PostgREST 404 / PGRST202, the error code `unavailable`): the tab shows "Nothing to show yet" with a "Try again" button (same component for Home and Friends), never throws. A mount retries a failed answer once.

## Behaviour

- Restaurant cover: `cover_photo`, then `cover_fallback` (first available dish photo, from the RPC), then `logo` (contained, not cropped), then the initials of the name on a tokens-only tile. An image that fails to load moves to the next one. No emoji art anywhere.
- Restaurant card: status pill over the photo ("Open · closes 23:00" / "Closed"), "Trending" pill, name in Playfair, `cuisine · km`, rating ★ and review count, follower count, Follow button. Rails show Follow to signed-in viewers only (18.3); the "All restaurants" list also offers it to signed-out viewers, where a tap opens the sign-in sheet (as the old list did). The list card adds address, free seats (only while open), the like button (🤌 with count), "View menu →" and the share / copy-link menu (`PostMenu`). The list renders 12 cards and a "Show more" button adds 12 more.
- Follow is shared: following in "Open now" shows in "All restaurants" at once; the follower count moves by one.
- Dish card: one link to `/restaurant/<slug>?dish=<id>` (RestaurantPage opens that dish's sheet), Available / Sold out pill and price over the photo. `DishDetailSheet` is no longer used on Home (the old reviews and promos opened it; reviews now link to the restaurant, promo dishes to `?dish=`).
- Promos: the existing `PromoCard` in a rail, tracked like Home (impression after 50 % for 1 s, click via `track_campaign`; feed events pool `promo`).
- Top reviews: the existing `ReviewCard` (like, dish chip, photo, verified pill). The old reply thread and "save dish" on the home review card are not part of that card.
- Location: `useViewerLocation` is one module-level state shared with Home and Friends (one permission, one fix, one pill). A tap in either tab updates all of them; Discover refetches once with the coordinates.
- Cuisine chips: "All" + `cuisines`; the chip list comes from the unfiltered answer. Each cuisine answer is cached (up to 8 answers kept), so picking a chip you used before costs nothing.

## Speed

- `discoverStore` keeps answers outside React: no refetch on a tab switch, nor when the guest leaves Home and comes back (stale after 5 min: refreshed in the background while the old answer stays on screen).
- `feed/prefetch.js` (imported by `HomePage.jsx`, runs when the app boots on `/`) requests the remembered tab first, then Discover and Friends in idle time, and `HomeTabs` preloads their chunks in idle time.
- Images: `loading="lazy"`, `decoding="async"`, fixed aspect boxes (cards 4:3, list 16:10, dishes 1:1, review photos 4:3); skeletons for chips, both rail kinds and the first list card use the final geometry.

## Check on preview once `sql/60` + `sql/60b` are applied

1. Signed out, no GPS: Discover shows chips, "Open now", "Trending dishes", "New places" (only when a restaurant is < 30 days old), "Promos" and "Top reviews" only when they have rows, "All restaurants". Reviewer names show for a signed-out viewer (the old embed said "Anonymous").
2. Covers: a restaurant without `cover_photo` shows its first dish photo, without either its logo, without any its initials. Dishes without a photo show initials.
3. Tap a cuisine chip: one `discover` request with `p_cuisine`, lists filter; "All" and a repeated chip make no request.
4. Tap the location pill (Home or Discover): one `discover` request with `p_lat` / `p_lng`, heading becomes "Open now near you", `km` appears on cards; the other tab shows the same state.
5. Signed in: Follow in a rail inserts `user_follows` (check the row), the button reads "Following", the same restaurant in the list agrees, count +1; tap again deletes. Like in the list inserts / deletes `likes` (`target_type = 'restaurant'`). Signed out: no Follow in rails, Follow / like in the list open the sign-in sheet.
6. A dish card opens `/restaurant/<slug>?dish=<id>` with the dish sheet open; a promo with a dish does the same with `&src=promo:<id>`.
7. Network tab: switching Home / Friends / Discover makes no request; go to a restaurant and back inside 5 minutes: no request.
8. 360 / 390 / 430 px, dark and light, English and Azerbaijani: no horizontal page scroll (only the rails and the chip row scroll), tap targets >= 44 px.
9. Break the RPC (before 60b is applied, or rename it): "Nothing to show yet" + "Try again", no console exception.

## Known gaps

- Not run against the real `discover` (not on preview when this was built); layout, states, actions and requests were verified with contract-shaped fixtures. Check 1 and 2 above need real data.
- Restaurant likes are counted by reading `likes` rows (as the old list did, capped by PostgREST's row limit); a `like_count` on the restaurant card would remove the read.
- `e2e/tests/feat-discovery.spec.js` targets the old markup (stories bar, `.menu-card` restaurant posts, "View menu →" from the `feed` namespace, reply threads, double-tap like) and will need updating; not touched (outside scope).
- The `/rufesto` skill File System Map (`~/.claude/commands/rufesto.md`) has no `features/*` entries; not updated.
