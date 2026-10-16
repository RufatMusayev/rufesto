'use strict'
// What the venue managers and kitchens do on the dashboard: restaurant posts (PostsPage), promos (PromosPage), the demo
// payments switch, and the menu's sold-out toggle (MenuPage).
const { log, count, fail, one, manager, kitchenActor, loadMenu } = require('./world')
const { fetchPhoto, uploadPhoto } = require('./social')
const { restaurantCaption, promoFor } = require('./content')

const NOT_FOOD = ['beverage', 'alcoholic', 'kids']

/**
 * Reads restaurant_settings.demo_payments_enabled of every venue into v.demoOn. With `enable`, a venue where it is off gets a
 * manager's write; the column is SQL-only (V2-CONTRACT section 4), so that is expected to be refused, and the venue then
 * takes reception payments only (the summary says so).
 */
async function checkDemoPayments(w, { enable = false } = {}) {
  for (const v of Object.values(w.venues)) {
    const m = manager(v)
    const row = (await m.rows(`restaurant_settings?restaurant_id=eq.${v.id}&select=demo_payments_enabled`))[0]
    v.demoOn = !!(row && row.demo_payments_enabled === true)
    if (v.demoOn || !enable) continue
    const r = row
      ? await m.patch(`restaurant_settings?restaurant_id=eq.${v.id}`, { demo_payments_enabled: true })
      : await m.post('restaurant_settings', { restaurant_id: v.id, demo_payments_enabled: true })
    if (r.ok && (!Array.isArray(r.data) || r.data.length)) { v.demoOn = true; count('demo_payments_enabled') }
    else fail('demo_payments_enabled (SQL-only column)', r.ok ? { code: 'no_row' } : r)
  }
  const off = Object.values(w.venues).filter(v => !v.demoOn).map(v => v.key)
  if (off.length) log(`demo payments are OFF at: ${off.join(', ')} - those venues take reception payments only (SQL: UPDATE restaurant_settings SET demo_payments_enabled = true WHERE restaurant_id IN (...))`)
}

/**
 * A restaurant post by the venue's manager. kind: 'dish' (photo of a dish, tagged), 'special' (caption, sometimes a photo)
 * or 'event' (caption only). The photo is the dish's own photo, uploaded to post-photos at r/<restaurant_id>/<uuid>.<ext>.
 */
async function venuePost(w, v, rng, kind = 'dish') {
  const m = manager(v)
  const menu = (await loadMenu(v)).filter(d => d.available && !NOT_FOOD.includes(d.category))
  let dish = null, objectPath = null
  if (kind === 'dish' || (kind === 'special' && rng.chance(0.5))) {
    for (const d of rng.shuffle(menu.filter(x => x.photo))) {
      const photo = await fetchPhoto(d.photo)
      if (!photo) continue
      objectPath = await uploadPhoto(m, `r/${v.id}`, photo)
      if (objectPath) { dish = d; break }
    }
  }
  if (kind === 'dish' && !dish) dish = rng.pick(menu)      // no usable photo: a caption-only post about a dish
  if (kind === 'dish' && !dish) return null
  const caption = restaurantCaption(rng, v.key, kind, dish && dish.name)
  const r = await m.rpc('create_restaurant_post', { p_restaurant_id: v.id, p_photo_url: objectPath, p_caption: caption, p_dish_id: kind === 'dish' ? dish.id : null })
  if (!r.ok) { fail('create_restaurant_post', r); return null }
  count('venue_post')
  return { id: one(r).id, venue: v.key }
}

/** An active 14-day promo like PromosPage makes it: insert as draft, then Activate. At most one active promo per venue. */
async function createPromo(w, v, rng) {
  const m = manager(v)
  const active = await m.rows(`ad_campaigns?restaurant_id=eq.${v.id}&status=eq.active&ends_at=gt.${new Date().toISOString()}&select=id`)
  if (active.length) return 'exists'
  const t = promoFor(rng, v.kind)
  const menu = (await loadMenu(v)).filter(d => d.available && !NOT_FOOD.includes(d.category))
  const dish = t.type === 'highlight' && menu.length ? rng.pick(menu) : null
  const now = new Date()
  const row = {
    name: t.name, title: t.title, description: t.description, type: t.type, dish_id: dish ? dish.id : null,
    daily_limit: rng.chance(0.5) ? rng.int(10, 30) : null, starts_at: now.toISOString(), ends_at: new Date(now.getTime() + 14 * 86_400_000).toISOString(),
    status: 'draft', budget: rng.int(5, 20) * 10, restaurant_id: v.id,
  }
  const ins = await m.post('ad_campaigns', row)
  if (!ins.ok || !one(ins)) { fail('promo create', ins.ok ? { code: 'no_row' } : ins); return null }
  const act = await m.patch(`ad_campaigns?id=eq.${one(ins).id}`, { status: 'active' })
  if (act.ok && act.data && act.data.length) { count('promo_active'); return one(ins).id }
  fail('promo activate', act.ok ? { code: 'no_row' } : act)
  return null
}

/** The menu toggle: the kitchen (else the manager) switches a dish on or off. */
async function setAvailable(v, dishId, available) {
  const body = { available, toggled_at: new Date().toISOString() }
  let r
  for (const actor of [kitchenActor(v), manager(v)]) {
    r = await actor.patch(`dishes?id=eq.${dishId}`, body)
    if (r.ok && r.data && r.data.length) { count(available ? 'dish_back_on' : 'dish_sold_out'); return true }
    if (actor === manager(v)) break
  }
  fail('dish toggle', r.ok ? { code: 'no_row' } : r)
  return false
}

/** Yesterday's sold-out dish comes back (state = the persisted sim state). */
async function restoreSoldOut(w, state) {
  const s = state.soldOut
  if (!s) return
  if (w.venues[s.venue] && await setAvailable(w.venues[s.venue], s.dishId, true)) { log(`sold-out dish is back: ${s.name} (${s.venue})`); delete state.soldOut }
}

/** Once a day one dish of one random venue is sold out until tomorrow. */
async function soldOutToday(w, rng, state, day) {
  if (state.soldOut) return      // yesterday's dish could not be switched back on: keep it on the list, do not pile up
  const v = w.venues[rng.pick(Object.keys(w.venues))]
  const menu = (await loadMenu(v)).filter(d => d.available && ['main', 'starter', 'dessert', 'side', 'salad', 'soup'].includes(d.category))
  const dish = rng.pick(menu)
  if (!dish) return
  if (await setAvailable(v, dish.id, false)) {
    state.soldOut = { venue: v.key, dishId: dish.id, name: dish.name, day }
    log(`sold out until tomorrow: ${dish.name} (${v.key})`)
  }
}

module.exports = { checkDemoPayments, venuePost, createPromo, restoreSoldOut, soldOutToday }
