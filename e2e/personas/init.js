'use strict'
// Day one of the demo world, once: follows, friendships, one post per venue, five active promos. Every step is remembered in
// the flag file (e2e/personas/.world-initialised, git-ignored), so a half-done start is finished by the next run and nothing
// is posted twice. The demo payments switch is not a step here: it is SQL-only and checked on every run (manager.js).
const path = require('path')
const { log, fail, stats, readJson, writeJson } = require('./world')
const { DINER_NAMES, VENUE_KEYS } = require('./roster')
const { followVenues, makeFriends } = require('./social')
const { venuePost, createPromo } = require('./manager')

const FLAG = path.join(__dirname, '.world-initialised')
const errorCount = () => Object.values(stats.errors).reduce((s, n) => s + n, 0)

const isInitialised = () => { const f = readJson(FLAG, null); return !!(f && f.complete) }

/**
 * Runs the missing steps, each phase as its own time segment (opts.segment(label, minutes, fn), targets from the plan's `init`).
 * Returns the venue posts made, { id, venue, at } with the minute they are meant to have been posted (for the followers' likes).
 */
async function initWorld(w, rng, day, { force = false, segment = null, at = {} } = {}) {
  const seg = (label, minutes, fn) => (segment ? segment(label, minutes, fn) : fn())
  let st = readJson(FLAG, null)
  if (force || !st) st = { done: {} }
  if (st.complete && !force) return []
  const venuePosts = []
  const step = async (key, fn, byResult = false) => {
    if (st.done[key]) return
    const before = errorCount()
    const out = await fn()
    if (out !== null && (byResult ? !!out : errorCount() === before)) { st.done[key] = true; writeJson(FLAG, st) }
    return out
  }
  log('world init: follows, friendships, venue posts, promos')
  await seg('init: follows', at.follows, async () => { for (const name of DINER_NAMES) await step(`follow:${name}`, () => followVenues(w, name)) })
  await seg('init: friendships', at.friends, () => step('friends', () => makeFriends(w)))
  const batches = [VENUE_KEYS.slice(0, 4), VENUE_KEYS.slice(4, 7), VENUE_KEYS.slice(7)]
  for (const [i, keys] of batches.entries()) {
    await seg(`init: venue posts ${keys.join(',')}`, at.posts && at.posts[i], async () => {
      for (const key of keys) {
        const post = await step(`post:${key}`, () => venuePost(w, w.venues[key], rng, 'dish'), true)
        if (post) venuePosts.push({ ...post, at: at.posts && at.posts[i] })
      }
    })
  }
  if (!st.promoVenues) st.promoVenues = rng.sample(VENUE_KEYS, 5)
  await seg('init: promos', at.promos, async () => { for (const key of st.promoVenues) await step(`promo:${key}`, () => createPromo(w, w.venues[key], rng), true) })
  const missing = [...DINER_NAMES.map(n => `follow:${n}`), 'friends', ...VENUE_KEYS.map(k => `post:${k}`), ...st.promoVenues.map(k => `promo:${k}`)].filter(k => !st.done[k])
  if (missing.length) { fail('world init', { code: 'incomplete', msg: `${missing.length} steps left: ${missing.join(', ')}` }) }
  else { st.complete = true; st.at = new Date().toISOString(); st.day = day; writeJson(FLAG, st); log('world init complete') }
  return venuePosts
}

module.exports = { initWorld, isInitialised, FLAG }
