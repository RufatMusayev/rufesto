# Restaurant page: Posts + a designed Menu (docs/V2-CONTRACT.md 19.2)

Why (Rufat, 2026-10-17): restaurants post like accounts, so the page opens on their posts; "the menu should look like a menu, not Insta postings", so the photo grid / list toggle is gone and the menu is a typographic card in the restaurant's own theme.

## Structure
`pages/RestaurantPage.jsx` (167 lines) is a shell: `RestaurantView` keyed by slug, tab + `?dish=` state, sheets. Everything else is here.

| File | What |
|---|---|
| `api.js` | every Supabase call (`fetchRestaurant`, `fetchMenu` with the PGRST202 fallback, `fetchRestaurantPosts`, seats, follow, promos, staff role, realtime subscribe helpers, `restoUrl`) |
| `mappers.js` | RPC / legacy rows -> view-model (`mapMenu`, `mapLegacyMenu`, `patchDish`, `findDish`, `toSheetDish`, `dishText`); dishes keep DB key names because `DishDetailSheet` and `CartContext.addDish` read them |
| `hooks.js` | `useRestaurant`, `useSeats`, `useFollow`, scroll memory for "back from a post" |
| `useMenu.js` / `usePosts.js` | one RPC per tab, cached per slug / restaurant+scope in memory (60 s / 90 s), keyset paging, dishes realtime (this restaurant only) |
| `RestaurantHeader.jsx`, `RestaurantTabs.jsx`, `CartErrorBanner.jsx`, `PageSkeleton.jsx` | page chrome. Sticky tab bar docks at `--sticky-top` |
| `PostsTab.jsx`, `PostTile.jsx`, `PromoStrip.jsx` | Posts: chips `From <venue>` / `Guests`, 3-column square grid, text tiles in the accent colour, promos from `ad_campaigns`, manager link to the dashboard |
| `menu/MenuTab.jsx` (+ `MenuSection`, `MenuRow`, `SectionNav`, `MenuSearch`) | the printed menu; scroll-spy in `useScrollSpy.js`, search folding in `search.js`, contrast maths in `color.js`, cafe section icons in `icons.js` |
| `restaurant.css`, `menu/menu.css`, `menu/themes/{classic,bistro,modern,cafe}.css` | prefixes `rst-` / `mn-`. Themes only set `--mn-*` tokens under `.mn-wrap[data-menu="..."]` plus a few overrides; dark is the default and `[data-theme="light"]` overrides, like `index.css` |

Behaviour kept: Reserve, floor plan, Follow (sign-in then follow), stats, open state, `DishDetailSheet` (reviews, Add to order), cart errors, dish availability live. New: `?tab=posts|menu` (replace, no history spam); default tab = Menu for `?dish=` and for a guest seated here (decided once, waits for the cart's `tableReady`, max 1.5 s), else Posts; both tabs mount on first visit and stay mounted (no refetch, no re-render on switch).

## RPC shapes used (all verified on preview 2026-10-17 against the 10 seeded restaurants)
- `restaurant_menu(p_slug)` -> `{ restaurant{id,name,slug,logo,cuisine_type}, design{theme,accent,show_photos,note}, sections[{id|null,name,name_az,sort_order,dishes[{id,name,name_az,description,description_az,price,photo,available,is_vegan,is_vegetarian,is_gluten_free,is_spicy,spice_level,is_featured,avg_rating,review_count,prep_time_min,calories}]}], updated_at }`. Missing RPC (PGRST202 / 404) -> legacy `menu_sections` + `dishes` query, classic theme. Empty sections are not printed.
- `restaurant_posts(p_restaurant_id,p_cursor,p_limit)` and `restaurant_guest_posts(...)` -> `{ items[post 17.2], next_cursor }`; page size 21; `p_cursor` = previous `next_cursor`. A missing guests RPC shows the empty state. Photos are storage paths signed per page by `social/lib/postPhotos.js`.
- Also: `staff_role_at(p_restaurant_id)` (only to show "Post from the dashboard" to admin / manager, link built by `restoUrl('/posts')` = `resto.` + current host, no domain hardcoded), `ad_campaigns` select (active promos, RLS), `track_campaign`.

## Theme rules
Accent: `design.accent`, else classic `#8B2E1F`, bistro `#E0A100`, modern `#B23A3A`, cafe `#6B4A2B` (same as the dashboard preview). `color.js` derives a light-mode and a dark-mode accent per theme by pushing it to contrast >= 4.5 against that theme's paper (a dark red on the chalkboard becomes pink-red), set as `--mn-accent-l/-d`. Text on tinted fills uses ink, never the accent. Paper colours are duplicated in `color.js` (`PAPER`) and the theme CSS: change both.
Fonts: classic Playfair Display (+ small caps names, italic descriptions), bistro Barlow Condensed titles + DM Sans, modern DM Sans, cafe Nunito. `client/index.html` now also loads Barlow Condensed, Nunito and Playfair 400/500 + italics.

## PM checklist
1. Preview already has sql/62 (`restaurant_menu`, `restaurant_guest_posts`, seeded themes). Deploy `client/` to preview (`/deploy-rufesto`), nothing else is needed. Prod: apply sql/62 first; the page also works without it (fallback).
2. Phone check (360-430 px, then 1280): `/restaurant/bella-roma` (classic), `sakura-house` / `meze-istanbul` (modern), `fincan-coffee` / `brew-and-books` (cafe), `burger-qala` / `tiflis-dvor` (bistro), `seda-ocagi` / `shirvan-metbexi` (classic), light and dark (theme toggle), language EN and AZ.
3. Posts tab opens first; Guests chip; tap a tile -> post page -> back returns to the same scroll; a restaurant with no posts shows "No posts yet"; as a manager of that restaurant the "Post from the dashboard" button appears.
4. Menu tab: sticky navigator follows the scroll and jumps on tap, search + dietary tags filter, sold-out dish is struck through and still opens its sheet, Chef's pick / rating tags, `menu_note` under the title.
5. Seated guest (scan a table QR, open the restaurant): page opens on Menu, "+" on every available row adds to the cart; sold-out rows have no "+". Cross-restaurant add still shows the red banner.
6. "Order this" from a Home post (`?dish=<id>`) opens Menu with that dish's sheet. Reserve, floor plan and Follow (signed out -> sign-in -> follows) work from the header.
7. e2e: specs that wait for `.menu-card` on `/restaurant/<slug>` (`e2e/personas/ui/05-soldout.js`, `e2e/support/feat-table.js` line ~382 and any spec reading the dish grid) must open `?tab=menu` and use `.mn-row` (each row has `data-dish-id`). They were not touched (outside `client/`).
8. Index.html font URL grew (3 families); confirm the nginx CSP still allows fonts.googleapis.com / fonts.gstatic.com on both stacks.
