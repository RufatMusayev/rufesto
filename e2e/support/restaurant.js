// Restaurant page helpers (docs/V2-CONTRACT.md 19.2, client/src/features/restaurant/README.int.md).
// /restaurant/<slug> opens on a Posts tab (chips "From <venue>" / "Guests", a grid of `.rst-tile`); the menu is the Menu tab
// (`?tab=menu`): a printed menu of rows `li.mn-row[data-dish-id]` (button `.mn-row-btn` opens the dish sheet, `.mn-add` is the inline "+"
// of a seated guest) in sections `section.mn-sec`, themed by `.mn-wrap[data-menu="classic|bistro|modern|cafe"]`. A guest seated at the
// restaurant, and a link with `?dish=<id>`, land on the Menu. The old photo grid / list toggle (`.menu-card`) is gone.
const { expect } = require('./fixtures')
const { CONSUMER_URL } = require('./env')

const tabBtn = (page, name) => page.getByRole('tab', { name, exact: true })
/** Every dish row of the printed menu. */
const rows = page => page.locator('.mn-row')
/** The table page's link to the restaurant: "Browse the menu" while the table has no orders, "Add More Items" after the first one. */
const menuLink = page => page.getByRole('link', { name: /^(Add More Items|Browse the menu)$/ })
/** The row(s) of the dish called `name`. */
const dishRow = (page, name) => rows(page).filter({ hasText: name })
/** The row of one dish by its id (exact: a name can also appear in another row's description). */
const byId = (page, id) => page.locator('.mn-row[data-dish-id="' + id + '"]')
/** The button of a row that opens its dish sheet. */
const rowOpen = row => row.locator('.mn-row-btn')
/** The open-sheet buttons of every row, in menu order (what the old `.menu-card` tiles were for "click the n-th dish"). */
const rowButtons = page => rows(page).locator('.mn-row-btn')

/**
 * On /restaurant/<slug>: make sure the Menu tab is showing (a seated guest lands on it, anyone else on Posts) and wait for the printed
 * menu. Waits for the tab bar first: the page shows a skeleton while it decides which tab to open.
 */
async function showMenu(page) {
  const tab = tabBtn(page, 'Menu')
  await expect(tab).toBeVisible()
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click()
  await expect(tab).toHaveAttribute('aria-selected', 'true')
  await expect(rows(page).first()).toBeVisible()
}

/** Open the Menu tab of a restaurant directly (`?tab=menu`, `extra` = more query like `&dish=<id>`) and wait for the rows. */
async function gotoMenu(page, slug, extra = '') {
  await page.goto(`${CONSUMER_URL}/restaurant/${slug}?tab=menu${extra}`)
  await expect(rows(page).first()).toBeVisible()
}

module.exports = { tabBtn, menuLink, rows, dishRow, byId, rowOpen, rowButtons, showMenu, gotoMenu }
