// Home / Friends feed UI and API helpers for tests/feat-home-feed.spec.js and tests/feat-friends-feed.spec.js
// (consumer app, client/src/features/feed/*).
// Texts come from client/src/locales/en/social.json. Sign-in goes through the Supabase auth API (support/feat-social.js).
const { expect } = require('./fixtures')
const S = require('./feat-social')
const F = require('./feat-dash')   // contextOptions / watchPage only
const { creds } = require('./env')

const { url } = S
const tab = (page, name) => page.getByRole('tab', { name, exact: true })
const slots = page => page.locator('.soc-feed-slot')
const caughtUp = page => page.getByRole('heading', { name: "You're all caught up" })
const loadMore = page => page.getByRole('button', { name: 'Load more' })
const bodyOf = req => { try { return JSON.parse(req.postData() || 'null') || {} } catch { return {} } }
/** The next POST to rpc/<name> whose JSON body passes `pred`. Safe to leave unawaited (a timeout then stays silent). */
function rpcRequest(page, name, pred = () => true, timeout = 25_000) {
  const p = page.waitForRequest(r => r.method() === 'POST' && new RegExp(`/rest/v1/rpc/${name}(\\?|$)`).test(r.url()) && pred(bodyOf(r)), { timeout })
  p.catch(() => {})
  return p
}
/** Friends tab: the day separators ("Today", "Yesterday", "Monday, 12 October") and its cards (only the tab on screen counts). */
const daySeps = page => page.locator('.soc-feed:visible h3.soc-day')
const friendsSlots = page => page.locator('.soc-feed:visible .soc-feed-slot')
const hrefsOf = loc => loc.evaluateAll(as => as.map(a => a.getAttribute('href')))
const commentLinks = page => page.locator('.soc-feed-slot a[aria-label="Comments"]')

async function anonRpc(request, supa, name, args = {}) {
  const res = await request.post(`${supa.url}/rest/v1/rpc/${name}`, { headers: { apikey: supa.anonKey, 'Content-Type': 'application/json' }, data: args })
  const text = await res.text()
  let data = text
  try { data = JSON.parse(text) } catch { /* plain text */ }
  return { ok: res.ok(), status: res.status(), data, message: data && data.message }
}

async function asAnon(browser, testInfo, fn, extra = {}) {
  const context = await browser.newContext({ ...F.contextOptions(testInfo.project.use), ...extra })
  try {
    const page = await context.newPage()
    return await fn({ context, page, watch: F.watchPage(page) })
  } finally { await context.close().catch(() => {}) }
}
async function asGuest(browser, testInfo, fn) {
  const g = await S.openUser(browser, testInfo, creds.guest)
  try { return await fn(g) } finally { await g.close() }
}

/** Open Home and wait for the first ranked item; resolves the first home_feed request body and the Supabase URL / anon key. */
async function openHome(page) {
  const first = rpcRequest(page, 'home_feed')
  await page.goto(url('/'))
  const req = await first
  await expect(slots(page).first()).toBeVisible()
  return { body: bodyOf(req), supa: { url: new URL(req.url()).origin, anonKey: req.headers().apikey } }
}

/**
 * Scroll from where the page is to its (growing) end in steps smaller than the screen, like a thumb does. The next page loads when a
 * zero-height marker 3 cards from the end passes through the screen, so one jump to the last card would skip over it.
 */
const scrollDown = page => page.evaluate(async () => {
  const step = Math.max(200, Math.round(innerHeight * 0.6))
  for (let i = 0, y = scrollY; i < 150; i++, y += step) {
    scrollTo({ top: y, behavior: 'instant' })
    await new Promise(r => setTimeout(r, 100))
    if (y + innerHeight >= document.documentElement.scrollHeight - 2) break
  }
})

/**
 * Scroll a ranked feed until `want()` (a locator) matches or the list ends in "You're all caught up". Paging is automatic: a
 * zero-height marker 3 cards from the end loads the next page when it scrolls into view, and the ranked list has no "Load more"
 * button (only the chronological tail under the caught-up block has one), so this scrolls down through the end and waits for
 * the list to grow or end. `items` = the locator of the cards (Home: .soc-feed-slot; Friends: friendsSlots). Resolves the rounds used.
 */
async function pageUntil(page, want, { maxRounds = 40, items = slots } = {}) {
  for (let i = 0; i <= maxRounds; i++) {
    if (want && await want().count()) return i
    if (await caughtUp(page).count()) return i
    expect(await loadMore(page).count(), 'no "Load more" button while the ranked list pages by itself').toBe(0)
    const before = await items(page).count()
    await scrollDown(page)
    const grew = async () => (await caughtUp(page).count()) > 0 || (await items(page).count()) > before
    // The next page loads when the marker 3 cards from the end passes through the screen. A page that arrives while the thumb is already at the
    // bottom has its marker above the screen: scroll back up one and a half screens and down again (what a guest does), once, before failing.
    if (!(await expect.poll(grew, { timeout: 4_000 }).toBe(true).then(() => true, () => false))) {
      await page.evaluate(() => scrollBy({ top: -innerHeight * 1.5, behavior: 'instant' }))
      await scrollDown(page)
    }
    await expect.poll(grew, { message: 'the next page after scrolling to the end' }).toBe(true)
  }
  throw new Error(`still not caught up after ${maxRounds} scroll rounds`)
}
async function findCard(page, text) {
  const card = S.post(page, text)
  await pageUntil(page, () => card)
  await expect(card, `post "${text}" on Home`).toHaveCount(1)
  await card.scrollIntoViewIfNeeded()
  return card
}

/**
 * Open the Friends tab as the signed-in page: the remembered tab is set to Friends before the page loads (so only Friends mounts and
 * its prefetched friends_feed answer is the first request) and the helper waits for the first answer and for a card or the empty
 * state. Resolves { body, answer } = the request body and the parsed { items, exclude, caught_up }.
 */
async function openFriends(page) {
  await page.addInitScript(() => { try { localStorage.setItem('rufesto_home_tab', 'friends') } catch { /* storage blocked */ } })
  const first = rpcRequest(page, 'friends_feed')
  await page.goto(url('/'))
  const req = await first
  await expect(tab(page, 'Friends')).toHaveAttribute('aria-selected', 'true')
  const answer = await (await req.response()).json()
  const friends = page.locator('.soc-feed:visible')
  await expect(friends.locator('article').or(page.getByText('No posts from friends')).first()).toBeVisible()
  return { body: bodyOf(req), answer }
}

module.exports = {
  tab, slots, caughtUp, loadMore, bodyOf, rpcRequest, hrefsOf, commentLinks, anonRpc, asAnon, asGuest, openHome, openFriends, pageUntil, findCard,
  daySeps, friendsSlots,
}
