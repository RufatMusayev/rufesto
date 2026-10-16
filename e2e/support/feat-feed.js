// Shared by tests/feat-resto-posts.spec.js (dashboard, /posts) and tests/feat-home-feed.spec.js (consumer, Home feed):
// restaurant posts of Sakura House (never Trattoria Bella Roma) made and cleaned up over the API.
// Everything runs as a signed-in user whose session came from the Supabase auth API (support/guest.js, feat-dash.js,
// feat-social.js), never from a password field. Contract: docs/V2-CONTRACT.md section 17 (sql/58, 59, 59b).
const crypto = require('crypto')
const { tinyPng } = require('./v2')

const SAKURA_ID = '10000000-0000-0000-0000-000000000003'
const BUCKET = 'post-photos'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const parse = async res => {
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  const message = data && typeof data === 'object' && !Array.isArray(data) ? data.message || null : null
  return { ok: res.ok(), status: res.status(), data, message }
}

/**
 * REST / RPC / Storage as one signed-in user. `request` is a Playwright APIRequestContext (`page.request`,
 * `context.request`), `auth` is `{ session, supabase: { url, anonKey } }` as the sign-in helpers return it.
 * Every call resolves `{ ok, status, data, message }` (message = the exception text of a refused RPC, e.g. 'forbidden').
 */
function client(request, auth) {
  const { url, anonKey } = auth.supabase
  const headers = (extra = {}) => ({ apikey: anonKey, Authorization: `Bearer ${auth.session.access_token}`, ...extra })
  const object = p => `${url}/storage/v1/object/${BUCKET}/${p}`
  return {
    userId: auth.session.user.id,
    rpc: async (name, args = {}) => parse(await request.post(`${url}/rest/v1/rpc/${name}`, { headers: headers({ 'Content-Type': 'application/json' }), data: args })),
    get: async p => parse(await request.get(`${url}/rest/v1/${p}`, { headers: headers() })),
    /** HTTP status of an upload into post-photos (the tiny PNG unless `data` is given). */
    upload: async (p, data = tinyPng(), type = 'image/png') => (await request.post(object(p), { headers: headers({ 'Content-Type': type }), data })).status(),
    /** HTTP status of reading the object back with the user's own token (200 = it exists and this user may read it). */
    objectStatus: async p => (await request.get(`${url}/storage/v1/object/authenticated/${BUCKET}/${p}`, { headers: headers() })).status(),
    removeObject: p => request.delete(object(p), { headers: headers() }).catch(() => {}),
  }
}

/** The first page (up to 50, newest first) of a restaurant's own posts, as the 17.2 item shape. */
async function restaurantPosts(c, restaurantId = SAKURA_ID, cursor = null) {
  const r = await c.rpc('restaurant_posts', { p_restaurant_id: restaurantId, p_cursor: cursor, p_limit: 50 })
  const body = Array.isArray(r.data) ? r.data[0] : r.data
  return { ok: r.ok, items: Array.isArray(body?.items) ? body.items : [], next: body?.next_cursor || null }
}

/** Available / sold-out dishes of Sakura House (either may be null), for the dish tag. */
async function sakuraDishes(c) {
  const r = await c.get(`dishes?restaurant_id=eq.${SAKURA_ID}&select=id,name,price,available&order=name.asc`)
  const rows = Array.isArray(r.data) ? r.data : []
  return { available: rows.find(d => d.available) || null, soldOut: rows.find(d => !d.available) || null }
}

/**
 * A Sakura House post made as the manager: create_restaurant_post, optionally with a tiny photo uploaded into
 * r/<restaurant id>/ first (a refused post removes that object again). Resolves { id, path, caption }.
 */
async function seedPost(c, { caption, photo = false, dishId = null }) {
  let path = null
  if (photo) {
    path = `r/${SAKURA_ID}/${crypto.randomUUID()}.png`
    const status = await c.upload(path)
    if (status !== 200) throw new Error(`photo upload to ${path} failed: HTTP ${status}`)
  }
  const r = await c.rpc('create_restaurant_post', { p_restaurant_id: SAKURA_ID, p_photo_url: path, p_caption: caption, p_dish_id: dishId })
  if (!r.ok) {
    if (path) await c.removeObject(path)
    throw new Error(`create_restaurant_post failed: HTTP ${r.status} ${JSON.stringify(r.data)}`)
  }
  const row = Array.isArray(r.data) ? r.data[0] : r.data
  return { id: row.id, path, caption }
}

/**
 * Delete every restaurant post of Sakura House whose caption starts with `prefix` (this run and leftovers of a
 * crashed one) with delete_post, plus its photo object (the RPC does not touch storage). Never throws.
 */
async function purgePosts(c, prefix) {
  try {
    let cursor = null
    for (let i = 0; i < 4; i++) {
      const { items, next } = await restaurantPosts(c, SAKURA_ID, cursor)
      for (const it of items) {
        if (!String(it.caption || '').startsWith(prefix)) continue
        await c.rpc('delete_post', { p_id: it.id })
        if (typeof it.photo_url === 'string' && it.photo_url.startsWith(`r/${SAKURA_ID}/`)) await c.removeObject(it.photo_url)
      }
      if (!next) break
      cursor = next
    }
  } catch (err) {
    console.log(`[cleanup] purgePosts(${prefix}) failed: ${err.message}`)
  }
}

module.exports = { SAKURA_ID, UUID, client, restaurantPosts, sakuraDishes, seedPost, purgePosts }
