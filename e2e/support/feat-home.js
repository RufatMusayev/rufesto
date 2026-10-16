// Home feed UI / API helpers for tests/feat-home-feed.spec.js (consumer app, client/src/features/feed/*).
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

/** "Load more" until `want()` (a locator) matches or the list is caught up. Resolves the number of clicks. */
async function pageUntil(page, want, maxClicks = 15) {
  for (let i = 0; i <= maxClicks; i++) {
    if (want && await want().count()) return i
    if (await caughtUp(page).count()) return i
    const before = await slots(page).count()
    await loadMore(page).click()
    await expect.poll(async () => (await caughtUp(page).count()) > 0 || (await slots(page).count()) > before, { message: 'a page after "Load more"' }).toBe(true)
  }
  throw new Error(`still not caught up after ${maxClicks} "Load more" clicks`)
}
async function findCard(page, text) {
  const card = S.post(page, text)
  await pageUntil(page, () => card)
  await expect(card, `post "${text}" on Home`).toHaveCount(1)
  await card.scrollIntoViewIfNeeded()
  return card
}

module.exports = {
  tab, slots, caughtUp, loadMore, bodyOf, rpcRequest, hrefsOf, commentLinks, anonRpc, asAnon, asGuest, openHome, pageUntil, findCard,
}
