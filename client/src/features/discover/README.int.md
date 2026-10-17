# Discover: the Search zero state (UX plan 2026-10-18, D1)

The Discover tab of Home is gone. Its data and rails now fill the zero state of the Search tab (`/explore`, `features/search/ZeroState.jsx`). Why (Rufat, 2026-10-18): Home and Discover showed the same dishes and venues; Home is the feed, Search is search plus content.

## What stays here
- `api.js` `getDiscover` (rpc `discover(p_lat, p_lng, p_cuisine)`, docs/V2-CONTRACT.md 18.2) and the mappers `mapRestaurantCard`, `mapDishCard`, `mapDiscover`.
  - `mapDiscover` merges "New places" into "Open now": a new place that is open now joins the rail with `isNew` (the "New" tag); a closed one only shows in "All places". Promos are no longer mapped (they live on Home and the restaurant page).
  - sql/67 adds `price_band` to restaurant cards and the diet flags to dish cards; the mappers read them when present (`priceBand`, `isVegan` ...).
- `discoverStore.js` one answer per viewer + location + cuisine, 5 min fresh. Used by Search (zero state, local matches while a query is in flight) and by `feed/prefetch.js` (idle prefetch from Home). Exports kept for the feed: `ensureDiscover`, `invalidateDiscover`, `patchDiscoverReview`, `discoverStore.get().cuisine`. Restaurant like / follow state is removed (like is gone from the UI, data kept; Follow lives on the restaurant page).
- `cuisine.js` `cuisineLabel(t, key)` (also used by the new-post restaurant picker and the restaurant header).
- `components/` `RestaurantRail` + `RestaurantCard` (136 px place card: cover 16:10, name, rating and distance, "New" tag), `CuisineChips` (picking a cuisine turns the Search Cuisine filter on), `Section` (+ `Rail`), `CoverImage` (cover_photo, first dish photo, logo, initials; fades in), `DiscoverSkeleton` (+ `RowSkeleton`, the 64 px row skeleton).
- `styles.css` prefix `dsc-`.

## Removed
`DiscoverTab`, `ActionsContext`, `AllRestaurantsList`, `DishRail`, `DishCard`, `PromoRail`, `ReviewList` (top reviews are `features/reviews/CompactReview` rows in the zero state).

## Check
Signed out, no GPS: Search shows Recent (if any), Popular, Cuisines, Open now (hidden when nothing is open), Trending dishes, Top reviews, All places. With the location on, the Open now heading reads "near you". All places shows 12 rows, then "Show more".
