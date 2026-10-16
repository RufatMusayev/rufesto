'use strict'
// The social life of the diners: follows, friendships, reviews, photo posts, saved dishes, and friends liking and
// commenting. Same calls as the consumer app (user_follows, send/respond_friend_request, reviews insert, post-photos
// upload + create_post, likes, add_post_comment, review_comments, saved_dishes).
const crypto = require('crypto')
const { sleep, log, count, fail, one, ready, loadMenu } = require('./world')
const { DINERS, FRIEND_PAIRS, friendsOf } = require('./roster')
const { pickLang, rating, reviewText, postCaption, comment } = require('./content')

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
const photoCache = new Map()

/** The bytes of a dish photo (its public URL), or null when it cannot be used (missing, not jpeg/png/webp, over 5 MB). */
async function fetchPhoto(url) {
  if (!url || !/^https?:\/\//.test(url)) return null
  if (photoCache.has(url)) return photoCache.get(url)
  let out = null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
    if (res.ok && EXT[type]) {
      const bytes = Buffer.from(await res.arrayBuffer())
      if (bytes.length > 1000 && bytes.length <= 5 * 1024 * 1024) out = { bytes, type, ext: EXT[type] }
    }
  } catch { /* unreachable photo: the post goes without it or is skipped */ }
  photoCache.set(url, out)
  return out
}

/** Upload into the private post-photos bucket at <prefix>/<uuid>.<ext> as `actor`. Resolves the object path, or null. */
async function uploadPhoto(actor, prefix, photo) {
  const objectPath = `${prefix}/${crypto.randomUUID()}.${photo.ext}`
  const r = await actor.upload('post-photos', objectPath, photo.bytes, photo.type)
  if (!r.ok) { fail('photo upload', r); return null }
  count('photo_uploaded')
  return objectPath
}

// ---- day one: follows and friendships ----------------------------------------------------------------------------------------------
async function followVenues(w, name) {
  const g = w.diners[name]
  if (!g) return fail('follow', { code: 'no_account' })
  for (const key of DINERS[name].follow) {
    const r = await g.post('user_follows', { user_id: g.uid, restaurant_id: w.venues[key].id }, 'return=minimal')
    if (r.ok) count('follow'); else if (r.code !== '23505') fail('follow', r)
  }
}

/** a asks b, b accepts. Handles "already friends" and a request that already exists in either direction. */
async function befriend(a, b) {
  if (!(await ready(a)) || !(await ready(b))) return
  const r = await a.rpc('send_friend_request', { p_user_id: b.uid })
  if (r.ok) {
    if (r.data.status === 'accepted') return count('friend_accepted')
    const acc = await b.rpc('respond_friend_request', { p_id: r.data.id, p_accept: true })
    return acc.ok ? count('friend_accepted') : fail('respond_friend_request', acc)
  }
  if (r.code === 'already_friends') return
  if (r.code === 'request_exists') {
    for (const [who, other] of [[b, a], [a, b]]) {   // the pending request is incoming for one of them
      const fr = one(await who.rpc('friend_requests'))
      const hit = fr && (fr.incoming || []).find(x => x.user_id === other.uid)
      if (hit) { const acc = await who.rpc('respond_friend_request', { p_id: hit.id, p_accept: true }); return acc.ok ? count('friend_accepted') : fail('respond_friend_request', acc) }
    }
  }
  fail('send_friend_request', r)
}

async function makeFriends(w) {
  for (const [a, b] of FRIEND_PAIRS) {
    if (w.diners[a] && w.diners[b]) await befriend(w.diners[a], w.diners[b])
    else fail('friendship', { code: 'no_account', msg: `${a} / ${b}` })
  }
}

// ---- after a visit ---------------------------------------------------------------------------------------------------------------------
async function reviewDishes(w, P, g, rng, ctx) {
  const persona = DINERS[g.first]
  if (!rng.chance(persona.review)) return
  const eaten = [...new Map((P.eaten.get(g.first) || []).map(d => [d.id, d])).values()]
  if (!eaten.length) return
  const done = new Set((await g.rows(`reviews?user_id=eq.${g.uid}&dish_id=in.(${eaten.map(d => d.id).join(',')})&select=dish_id`)).map(r => r.dish_id))
  const fresh = rng.shuffle(eaten.filter(d => !done.has(d.id)))
  for (const dish of fresh.slice(0, rng.chance(0.35) ? 2 : 1)) {
    const stars = rating(rng)
    const body = rng.chance(0.92) ? reviewText(rng, pickLang(rng, persona.lang), stars, dish.name, dish.category) : null
    const r = await g.post('reviews', { dish_id: dish.id, user_id: g.uid, rating: stars, body })
    if (!r.ok) { if (r.code !== '23505') fail('review', r); continue }
    count('review')
    ctx.reviews.push({ id: one(r).id, author: g.first, dish: dish.name })
  }
}

/** A poster shares a photo of a dish she ate: upload the dish photo, create_post tagged with the venue, dish and visit. */
async function personaPost(w, P, g, rng, ctx) {
  const eaten = P.eaten.get(g.first) || []
  const menu = eaten.some(d => d.photo) ? eaten : await loadMenu(P.v)
  const withPhoto = rng.shuffle(menu.filter(d => d.photo))
  if (DINERS[g.first].dessert) withPhoto.sort((a, b) => (a.category === 'dessert' ? 0 : 1) - (b.category === 'dessert' ? 0 : 1))   // her desserts
  for (const dish of withPhoto) {
    const photo = await fetchPhoto(dish.photo)
    if (!photo) continue
    const objectPath = await uploadPhoto(g, g.uid, photo)
    if (!objectPath) return
    const visit = (await g.rows(`visits?user_id=eq.${g.uid}&restaurant_id=eq.${P.v.id}&order=created_at.desc&limit=1&select=id`))[0]
    const caption = postCaption(rng, g.first, pickLang(rng, DINERS[g.first].lang), P.v.name, dish.name)
    const args = { p_photo_url: objectPath, p_caption: caption, p_restaurant_id: P.v.id, p_dish_id: dish.id, p_visit_id: visit ? visit.id : null, p_visibility: 'public' }
    let r = await g.rpc('create_post', args)
    if (!r.ok && r.code === 'visit_not_found') r = await g.rpc('create_post', { ...args, p_visit_id: null })
    if (!r.ok) { fail('create_post', r); return }
    count('post')
    ctx.posted.add(g.first)
    ctx.posts.push({ id: one(r).id, author: g.first, venue: P.v.key })
    return
  }
  log(`  (${g.first}: no usable dish photo at ${P.v.key}, no post)`)
}

/** Günay saves a dish or two she would like to come back for (vegetarian ones first). */
async function saveDishes(w, P, g, rng) {
  const menu = (await loadMenu(P.v)).filter(d => d.available && !['beverage', 'alcoholic', 'kids'].includes(d.category))
  const veg = menu.filter(d => d.is_vegetarian || d.is_vegan)
  for (const dish of rng.sample(veg.length >= 2 ? veg : menu, rng.int(1, 2))) {
    const r = await g.post('saved_dishes?on_conflict=user_id,dish_id', { user_id: g.uid, dish_id: dish.id }, 'resolution=merge-duplicates,return=minimal')
    if (r.ok) count('saved_dish'); else fail('saved_dish', r)
  }
}

/** Reviews, photo posts and saved dishes of everybody who just paid at this venue. */
async function afterVisit(w, P, rng, ctx) {
  if (!P.settled) return
  for (const g of P.seated) {
    const persona = DINERS[g.first]
    await reviewDishes(w, P, g, rng, ctx)
    if (persona.poster && !ctx.posted.has(g.first) && rng.chance(0.85)) await personaPost(w, P, g, rng, ctx)
    if (persona.saves && rng.chance(0.8)) await saveDishes(w, P, g, rng)
  }
}

// ---- friends react ----------------------------------------------------------------------------------------------------------------------
/** A write that the per-minute comment limit may refuse: wait out the minute once and try again. */
async function patient(fn) {
  let r = await fn()
  if (!r.ok && r.code === 'too_many_comments') { await sleep(62_000); r = await fn() }
  return r
}

/** Friends like and comment on 30-60 % of their friends' posts and reviews of the day. */
async function engage(w, rng, ctx) {
  const items = [...ctx.posts.map(p => ({ ...p, kind: 'post' })), ...ctx.reviews.map(r => ({ ...r, kind: 'review' }))]
  for (const item of items) {
    const p = 0.3 + rng.next() * 0.3
    for (const name of friendsOf(item.author)) {
      const f = w.diners[name]
      if (!f || !rng.chance(p)) continue
      const like = await f.post('likes', { user_id: f.uid, target_type: item.kind, target_id: item.id }, 'return=minimal')
      if (like.ok) count(`${item.kind}_like`); else if (like.code !== '23505') fail(`${item.kind} like`, like)
      if (!rng.chance(0.6)) continue
      const body = comment(rng, pickLang(rng, DINERS[name].lang), item.kind)
      const c = await patient(() => (item.kind === 'post'
        ? f.rpc('add_post_comment', { p_post_id: item.id, p_body: body })
        : f.post('review_comments', { review_id: item.id, user_id: f.uid, body })))
      if (c.ok) count(`${item.kind}_comment`); else fail(`${item.kind} comment`, c)
    }
  }
}

/** Followers of a venue like its new posts now and then. */
async function engageVenuePosts(w, rng, venuePosts) {
  for (const vp of venuePosts) {
    for (const [name, persona] of Object.entries(DINERS)) {
      const f = w.diners[name]
      if (!f || !persona.follow.includes(vp.venue) || !rng.chance(0.3)) continue
      const like = await f.post('likes', { user_id: f.uid, target_type: 'post', target_id: vp.id }, 'return=minimal')
      if (like.ok) count('venue_post_like'); else if (like.code !== '23505') fail('venue post like', like)
    }
  }
}

module.exports = { fetchPhoto, uploadPhoto, followVenues, makeFriends, afterVisit, engage, engageVenuePosts }
