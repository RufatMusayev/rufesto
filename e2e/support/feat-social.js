// Shared helpers of the feature specs feat-social / feat-profile / feat-notifications (consumer: friends, posts,
// feed, profile, notifications). Everything signs in through the Supabase auth API (never a password field),
// talks to the DB through REST/RPC as that user, and cleans up what it creates.
//
// Account plan (docs/REVIEW-ACCOUNTS.md, preview only; the three specs run in parallel, so they use disjoint sets
// for anything they WRITE; reads of other specs' accounts are harmless):
//   feat-social         review5 + review6 (friend lifecycle, strangers), review1 + review2 (posts, feed; review1 is a friend of review2)
//   feat-profile        review1 (read only), review5 (read only, empty tabs), review4 (posts / saved / booking / name edit / sign out)
//   feat-notifications  review3 (recipient) + review2 (actor), manager.bella (confirms the booking)
const fs = require('fs')
const os = require('os')
const path = require('path')
const { expect } = require('./fixtures')
const { CONSUMER_URL } = require('./env')
const { signInGuest, bakuDate } = require('./guest')
const { tinyPng } = require('./v2')

const REVIEW_DOC = path.join(__dirname, '..', '..', 'docs', 'REVIEW-ACCOUNTS.md')
const url = p => CONSUMER_URL + p
const RUN = Date.now().toString(36)               // marks everything one run creates
const TAG = 'qa-feat'                             // caption prefix of every post / comment the feature specs create

// ------------------------------------------------------------------------------------------- accounts

/** { email, password } of a review account (n = 1..6) or of a staff row of docs/REVIEW-ACCOUNTS.md (name like 'manager.bella'). */
function account(who) {
  const isReview = /^\d$/.test(String(who))
  const email = isReview ? `review${who}@rufesto.test` : `${who}@rufesto.test`
  if (isReview) {
    const e = process.env[`QA_REVIEW${who}_EMAIL`], p = process.env[`QA_REVIEW${who}_PASSWORD`]
    if (e && p) return { email: e, password: p }
  }
  let raw
  try { raw = fs.readFileSync(REVIEW_DOC, 'utf8') } catch { return null }
  const row = raw.split(/\r?\n/).map(l => l.split('|').map(c => c.trim())).find(c => c[1] === email)
  return row && row[2] ? { email: row[1], password: row[2] } : null
}

/** True when every account in the list is available; use as `test.skip(!have(1, 2, 5, 6), ...)`. */
const have = (...whos) => whos.every(w => !!account(w))

// ---------------------------------------------------------------------------------- sessions (cached per worker)

const cache = new Map()          // email -> { session, supabase }
const fresh = a => a && a.session.expires_at * 1000 - Date.now() > 20 * 60_000   // reuse only while >= 20 min of life remain

/** Drop a cached session (after a test that signs the account out: the server ended its sessions). */
const forget = who => {
  const c = typeof who === 'object' ? who : account(who)
  if (!c) return
  cache.delete(c.email)
  try { const all = readDisk(); delete all[c.email]; fs.writeFileSync(DISK, JSON.stringify(all)) } catch { /* ignore */ }
}

const storageKey = supabase => `sb-${new URL(supabase.url).hostname.split('.')[0]}-auth-token`

/** The project's device settings, so a second context looks like the first one (see support/v2.js). */
const contextOptions = use => ({
  viewport: use.viewport, locale: use.locale, userAgent: use.userAgent,
  deviceScaleFactor: use.deviceScaleFactor, isMobile: use.isMobile, hasTouch: use.hasTouch,
})

/**
 * The session of `cred`: a cached one while >= 20 min of life remain, else a fresh token from the auth API. Once any account
 * signed in, the Supabase URL / key are known and the token call goes straight to the auth API (no page load); before that
 * the app's own traffic gives them away (support/guest.js, retried: the preview answers a 502 now and then).
 */
let known = null
const DISK = path.join(os.tmpdir(), 'rufesto-e2e-feat-sessions.json')   // shared by the workers of a run: the auth API rate-limits sign-ins (429)
const readDisk = () => { try { return JSON.parse(fs.readFileSync(DISK, 'utf8')) } catch { return {} } }
const saveDisk = (email, auth) => {   // access token only (no refresh token), best effort
  try { fs.writeFileSync(DISK, JSON.stringify({ ...readDisk(), [email]: { supabase: auth.supabase, session: { ...auth.session, refresh_token: '' } } })) } catch { /* ignore */ }
}
async function login(page, cred) {
  let hit = cache.get(cred.email)
  if (!fresh(hit)) { const d = readDisk()[cred.email]; if (fresh(d)) { hit = d; cache.set(cred.email, d) } }
  if (fresh(hit)) { known = known || hit.supabase; return hit }
  let auth = null, last = null
  for (let i = 0; !auth && i < 5; i++) {
    try {
      if (known) {
        const res = await page.request.post(`${known.url}/auth/v1/token?grant_type=password`, {
          headers: { apikey: known.anonKey, 'Content-Type': 'application/json' }, data: cred,
        })
        if (!res.ok()) throw new Error(`sign-in of ${cred.email} failed: HTTP ${res.status()}`)
        auth = { session: await res.json(), supabase: known }
      } else {
        auth = await signInGuest(page, cred)
      }
    } catch (err) {
      last = err
      await page.waitForTimeout(/429/.test(String(err.message)) ? 20_000 : 2_500)   // rate limited: wait, then try again
    }
  }
  if (!auth) throw last
  known = auth.supabase
  cache.set(cred.email, auth)
  saveDisk(cred.email, auth)
  return auth
}

/** Seed `context` with the session on every navigation that finds no session yet (init script; the fixture page uses this). */
const seedInit = (context, auth) => context.addInitScript(([key, value]) => {
  try { if (!localStorage.getItem(key)) localStorage.setItem(key, value) } catch { /* storage blocked */ }
}, [storageKey(auth.supabase), JSON.stringify(auth.session)])

const credOf = who => {
  const cred = typeof who === 'object' ? who : account(who)
  if (!cred) throw new Error(`account ${JSON.stringify(who)} not found (docs/REVIEW-ACCOUNTS.md / QA_REVIEW<n>_* in e2e/.env)`)
  return cred
}

/** Sign `page` in as `who` through the auth API (cached per worker). Used for the fixture page. */
async function signInPage(page, who) {
  const auth = await login(page, credOf(who))
  await seedInit(page.context(), auth)
  return auth
}

/** A new independent browser context signed in as `who` (localStorage seeded through storageState, so a later sign out sticks). */
async function openUser(browser, testInfo, who) {
  const use = testInfo.project.use
  const cred = credOf(who)
  let auth = cache.get(cred.email)
  if (!fresh(auth)) {
    const probe = await browser.newContext(contextOptions(use))
    try { auth = await login(await probe.newPage(), cred) } finally { await probe.close().catch(() => {}) }
  }
  const origin = new URL(CONSUMER_URL).origin
  const context = await browser.newContext({
    ...contextOptions(use),
    storageState: { cookies: [], origins: [{ origin, localStorage: [
      { name: 'rufesto_lang', value: 'en' },
      { name: storageKey(auth.supabase), value: JSON.stringify(auth.session) },
    ] }] },
  })
  const page = await context.newPage()
  const watch = watchPage(page)
  return { context, page, watch, auth, api: api(context.request, auth), close: () => context.close().catch(() => {}) }
}

/** A signed-out context (English, same device as the project). */
async function openSignedOut(browser, testInfo) {
  const use = testInfo.project.use
  const context = await browser.newContext({ ...contextOptions(use), storageState: use.storageState })
  const page = await context.newPage()
  return { context, page, watch: watchPage(page), close: () => context.close().catch(() => {}) }
}

// -------------------------------------------------------------------------------------------- API as a user

const parse = async res => {
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  return { ok: res.ok(), status: res.status(), data, error: data && typeof data === 'object' && !Array.isArray(data) ? data.message || null : null }
}

/** PostgREST / RPC calls as the signed-in user: { id, rpc, get, post, patch, del }; every call resolves { ok, status, data, error }. */
function api(request, auth) {
  const headers = { apikey: auth.supabase.anonKey, Authorization: `Bearer ${auth.session.access_token}`, 'Content-Type': 'application/json' }
  const base = `${auth.supabase.url}/rest/v1`
  const call = (method, p, data, extra = {}) => request.fetch(`${base}/${p}`, { method, headers: { ...headers, ...extra }, data }).then(parse)
  return {
    id: auth.session.user.id,
    rpc: (name, args = {}) => call('POST', `rpc/${name}`, args),
    get: p => call('GET', p),
    post: (p, data) => call('POST', p, data, { Prefer: 'return=representation' }),
    patch: (p, data) => call('PATCH', p, data, { Prefer: 'return=representation' }),
    del: p => call('DELETE', p, undefined, { Prefer: 'return=representation' }),
  }
}

/** Exact row count of a REST path (`posts?user_id=eq.x`), through the Content-Range header. */
async function count(request, auth, p) {
  const res = await request.fetch(`${auth.supabase.url}/rest/v1/${p}${p.includes('?') ? '&' : '?'}select=id`, {
    method: 'HEAD',
    headers: { apikey: auth.supabase.anonKey, Authorization: `Bearer ${auth.session.access_token}`, Prefer: 'count=exact' },
  })
  const range = res.headers()['content-range'] || ''
  return Number(range.split('/')[1])
}

// -------------------------------------------------------------------------------- console / network watcher

const SUPABASE_URL = /supabase|\/(rest|auth|storage|realtime)\/v1\//i
const EDGE_NOISE = /static\.cloudflareinsights\.com/i
function watchPage(page) {
  const consoleErrors = [], failed = []
  page.on('console', msg => {
    if (msg.type() !== 'error') return
    const u = msg.location()?.url || ''
    if (EDGE_NOISE.test(msg.text()) || EDGE_NOISE.test(u)) return
    if (/status of 401/.test(msg.text()) && SUPABASE_URL.test(u)) return
    consoleErrors.push(`${msg.text()} [${u}]`)
  })
  page.on('pageerror', err => consoleErrors.push(`uncaught: ${err.message}`))
  page.on('response', res => { if (res.status() >= 400) failed.push(`${res.status()} ${res.request().method()} ${res.url()}`) })
  return { consoleErrors, failed }
}

// ------------------------------------------------------------------------------------------------- cleanup

/** Both directions: unfriend / cancel an outgoing request / lift a block, so the pair has no friendship row at all. */
async function resetPair(a, b) {
  await a.api.rpc('remove_friend', { p_user_id: b.api.id })
  await b.api.rpc('remove_friend', { p_user_id: a.api.id })
}

/** a sends b a friend request and b accepts it (both are users as returned by openUser / asUser). */
async function befriend(a, b) {
  const r = await a.api.rpc('send_friend_request', { p_user_id: b.api.id })
  await b.api.rpc('respond_friend_request', { p_id: r.data.id, p_accept: true })
}

/** Delete every post of `user` whose caption starts with the TAG (comments and likes go with it) and its photo object. */
async function purgePosts(user) {
  const rows = await user.api.get(`posts?user_id=eq.${user.api.id}&caption=like.${TAG}*&select=id,photo_url`)
  for (const r of Array.isArray(rows.data) ? rows.data : []) {
    await user.api.rpc('delete_post', { p_id: r.id })
    await deletePhoto(user, r.photo_url)
  }
}

/** Mark the given notification ids read (best effort) so the bell goes back to what it was. */
async function markRead(user, ids) {
  if (ids.length) await user.api.patch(`notifications?id=in.(${ids.join(',')})`, { read: true })
}

/** Mark read the social notifications (friend / like / comment) of the last `hours` h that the feature specs caused, so the accounts' bells do not pile up. */
async function tidySocialNotifications(user, hours = 3) {
  const since = new Date(Date.now() - hours * 3_600_000).toISOString()
  const r = await user.api.get(`notifications?user_id=eq.${user.api.id}&read=eq.false&type=in.(friend_request,friend_accepted,post_like,post_comment)&sent_at=gte.${since}&select=id`)
  await markRead(user, Array.isArray(r.data) ? r.data.map(x => x.id) : [])
}

/** Ids of the unread notifications of `user`. */
async function unreadIds(user) {
  const r = await user.api.get(`notifications?user_id=eq.${user.api.id}&read=eq.false&select=id`)
  return Array.isArray(r.data) ? r.data.map(x => x.id) : []
}

/** { page, context, auth, api } for the fixture page signed in as `who` (same shape as openUser, so helpers take either). */
async function asUser(page, who) {
  const auth = await signInPage(page, who)
  return { page, context: page.context(), auth, api: api(page.context().request, auth) }
}

// ---------------------------------------------------------------------------------------------- UI helpers

const isPhone = page => (page.viewportSize()?.width ?? 1280) <= 768

/** Home -> Feed tab (the guest's last tab is remembered in localStorage, so click explicitly). */
async function openFeed(page, scope = 'all') {
  await page.goto(url('/'))
  await page.getByRole('tab', { name: 'Feed', exact: true }).click()
  await expect(page.getByRole('tab', { name: 'Feed', exact: true })).toHaveAttribute('aria-selected', 'true')
  if (scope === 'friends') await page.getByRole('tab', { name: 'Friends', exact: true }).click()
  await expect(page.getByRole('tab', { name: scope === 'friends' ? 'Friends' : 'All', exact: true })).toHaveAttribute('aria-selected', 'true')
}

const post = (page, text) => page.locator('article.soc-post').filter({ hasText: text })

/** Give a realtime channel time to be SUBSCRIBED after a page load before the other side triggers an event. */
const channelsReady = async (page, ms = 1500) => { await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(ms) }

/** Bell badge number of the page's navigation (mobile header bell or the desktop sidebar item); 0 when none. */
async function bellCount(page) {
  const bell = isPhone(page) ? page.getByRole('button', { name: 'Notifications' }) : page.locator('aside a[href="/notifications"]')
  const text = (await bell.first().innerText().catch(() => '')).trim()
  if (!text) return 0
  return text === '9+' ? 10 : Number(text) || 0
}

/** Take a screenshot into the report (and the test-results folder). */
async function shot(page, testInfo, label) {
  const file = testInfo.outputPath(`${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png`)
  await page.screenshot({ path: file }).catch(() => {})
  await testInfo.attach(label, { path: file, contentType: 'image/png' }).catch(() => {})
  return file
}

/** Upload a tiny generated PNG into the new-post photo picker. */
async function pickPhoto(page) {
  await page.locator('input[type=file]').setInputFiles({ name: 'qa.png', mimeType: 'image/png', buffer: tinyPng() })
  await expect(page.getByAltText('Your photo')).toBeVisible()
}

/** Create a post as `user` over the API (caption-only: the RPC accepts it). Returns the post id. */
async function newPost(user, caption, visibility = 'public') {
  const r = await user.api.rpc('create_post', { p_photo_url: null, p_caption: caption, p_visibility: visibility })
  if (!r.ok) throw new Error(`create_post failed: ${r.status} ${JSON.stringify(r.data)}`)
  return r.data.id
}

/** Upload the tiny PNG into the user's own folder of the private post-photos bucket; resolves the object path. */
async function uploadPhoto(user) {
  const file = `${user.api.id}/${TAG}-${RUN}-${Math.random().toString(36).slice(2, 8)}.png`
  const res = await user.context.request.post(`${user.auth.supabase.url}/storage/v1/object/post-photos/${file}`, {
    headers: { apikey: user.auth.supabase.anonKey, Authorization: `Bearer ${user.auth.session.access_token}`, 'Content-Type': 'image/png' },
    data: tinyPng(),
  })
  if (!res.ok()) throw new Error(`photo upload failed: ${res.status()} ${await res.text()}`)
  return file
}

/** Remove one object of the post-photos bucket (own folder only), best effort. */
const deletePhoto = (user, file) => file
  ? user.context.request.delete(`${user.auth.supabase.url}/storage/v1/object/post-photos/${file}`, {
    headers: { apikey: user.auth.supabase.anonKey, Authorization: `Bearer ${user.auth.session.access_token}` },
  }).catch(() => {})
  : Promise.resolve()

/** A post WITH a photo, made over the API (upload + create_post): the double-tap target. Resolves { id, file }. */
async function newPhotoPost(user, caption) {
  const file = await uploadPhoto(user)
  const r = await user.api.rpc('create_post', { p_photo_url: file, p_caption: caption, p_visibility: 'public' })
  if (!r.ok) throw new Error(`create_post failed: ${r.status} ${JSON.stringify(r.data)}`)
  return { id: r.data.id, file }
}

/** First free slot of restaurant `slug` for a party of 2 from `from` days ahead (a middle one, away from other people's tests). */
async function findSlot(user, slug, from = 4) {
  const r = (await user.api.get(`restaurants?slug=eq.${slug}&select=id,name`)).data[0]
  for (let i = from; i < from + 8; i++) {
    const date = bakuDate(i)
    const slots = await user.api.rpc('get_available_slots', { p_restaurant_id: r.id, p_date: date, p_party_size: 2 })
    const free = (slots.data || []).filter(x => x.available)
    if (free.length) return { restaurant: r, date, time: free[Math.min(8, free.length - 1)].slot_time }
  }
  throw new Error(`no free slot at ${slug}`)
}

/** A group booking hosted by `host` (invites on) over the API. Resolves { id, code, slot }. */
async function newBooking(host, slug, from = 4) {
  const slot = await findSlot(host, slug, from)
  const b = await host.api.rpc('create_group_booking', {
    p_restaurant_id: slot.restaurant.id, p_date: slot.date, p_time: slot.time, p_party_size: 2, p_note: `${TAG} ${RUN}`,
    p_host_name: 'QA Host', p_host_phone: '+994501234567', p_consent: true, p_invites: true,
  })
  if (!b.ok) throw new Error(`create_group_booking failed: ${b.status} ${JSON.stringify(b.data)}`)
  return { id: b.data.booking_id, code: b.data.code, slot }
}

/** Elapsed ms until `fn` (an awaited assertion) passes. */
async function timed(fn) { const t = Date.now(); await fn(); return Date.now() - t }

module.exports = {
  CONSUMER_URL, url, RUN, TAG, account, have, signInPage, asUser, forget, openUser, openSignedOut, api, count, watchPage,
  resetPair, befriend, purgePosts, markRead, tidySocialNotifications, unreadIds, isPhone, openFeed, post, channelsReady, bellCount, shot, pickPhoto, newPost,
  newPhotoPost, deletePhoto, findSlot, newBooking, timed,
}
