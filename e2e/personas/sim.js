'use strict'
// The demo world simulator: one simulated day per run, through the same Supabase calls the apps make. PREVIEW ONLY.
//   node personas/sim.js --day <daysBack> [--dry-run] [--parties N] [--pace S] [--seed N] [--init|--no-init] [--no-extras]
// DEMO_ACCOUNTS = path of the accounts JSON; Supabase URL + anon key come from client/.env. See personas/README.md.
// The run is cut into time segments (segments.js) so shift-sql.js can move every block to its intended time of day.
const path = require('path')
const {
  log, clock, measureClock, stats, fail, loadConfig, loadAccounts, buildWorld, readJson, writeJson,
} = require('./world')
const { DINERS } = require('./roster')
const { makeRng } = require('./rng')
const { planDay, describe } = require('./plan')
const { runParty } = require('./dinein')
const { prepareBooking, cancelledBooking, noShowBooking } = require('./bookings')
const { afterVisit, engage, engageVenuePosts } = require('./social')
const { checkDemoPayments, venuePost, createPromo, restoreSoldOut, soldOutToday } = require('./manager')
const { sweep } = require('./staff')
const { initWorld, isInitialised } = require('./init')
const { createRecorder, SEGMENTS_FILE } = require('./segments')

const STATE_FILE = path.join(__dirname, '.sim-state.json')

function parseArgs(argv) {
  const a = { day: null, dry: false, init: false, noInit: false, noExtras: false, pace: 0, seed: null, parties: null }
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i]
    if (k === '--day') a.day = Number(argv[++i])
    else if (k === '--dry-run') a.dry = true
    else if (k === '--init') a.init = true
    else if (k === '--no-init') a.noInit = true
    else if (k === '--no-extras') a.noExtras = true
    else if (k === '--pace') a.pace = Number(argv[++i])
    else if (k === '--seed') a.seed = Number(argv[++i])
    else if (k === '--parties') a.parties = Number(argv[++i])
    else throw new Error(`unknown argument ${k}`)
  }
  if (!Number.isInteger(a.day) || a.day < 0) throw new Error('usage: node personas/sim.js --day <daysBack >= 0> [--dry-run] [--parties N] [--pace S] [--seed N] [--init|--no-init] [--no-extras]')
  return a
}

/** Runs one piece of the day; an unexpected exception is recorded and the day goes on. */
async function safe(label, fn) {
  try { return await fn() } catch (e) { if (!e.recorded) fail(label, e); return undefined }
}

const fmt = obj => Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'

function summary(plan, w, report, startedAt, segments) {
  const ok = stats.ok
  const g = k => ok[k] || 0
  const errs = Object.values(stats.errors).reduce((s, n) => s + n, 0)
  const off = Object.values(w.venues).filter(v => v.demoOn === false).map(v => v.key)
  const lines = [
    '', `===== DAY SUMMARY: day ${plan.day} (${plan.date} ${plan.weekday}) =====`,
    `parties: planned ${plan.parties.length}, seated ${g('party_seated')}, completed (bill settled) ${g('party_completed')}, failed ${plan.parties.length - g('party_completed')}`,
    `bookings: created ${g('booking_created')}, confirmed ${g('booking_confirmed')}, invites ${g('booking_invite')}, joined ${g('booking_joined')}, seated from booking ${g('claim_from_booking')}, cancelled ${g('booking_cancelled')}, left for no-show ${g('booking_left_for_no_show')}`,
    `money: card payments ${g('card_payment')} (tips ${g('tip')}), reception payments ${g('reception_settled')}, bills settled ${g('bill_settled')}, receipts ${g('receipt')}, bills closed by staff ${g('bill_closed_by_staff') + g('bill_closed_by_sweep')}`,
    `kitchen: tickets started ${g('kds_preparing')}, ready ${g('kds_ready')}, done ${g('kds_done')}, orders placed ${g('place_order')}, served ${g('order_served')}, waiter calls ${g('call_waiter')}`,
    `social: reviews ${g('review')}, photo posts ${g('post')}, venue posts ${g('venue_post')}, promos ${g('promo_active')}, likes ${g('post_like') + g('review_like') + g('venue_post_like')}, comments ${g('post_comment') + g('review_comment')}, saved dishes ${g('saved_dish')}, follows ${g('follow')}, friendships ${g('friend_accepted')}`,
    `menu: sold out ${g('dish_sold_out')}, back on ${g('dish_back_on')}`,
    `all actions: ${fmt(ok)}`,
    `errors (${errs}): ${fmt(stats.errors)}`,
  ]
  if (stats.samples.length) lines.push('first errors:', ...stats.samples.slice(0, 12).map(s => `  - ${s}`))
  lines.push(`end of day: ${report && report.tablesLeft.length ? `tables NOT free: ${report.tablesLeft.join(', ')}` : 'all tables free'}; ${report && report.billsLeft ? `${report.billsLeft} bills still active` : 'no active bill'}${report && report.unpaid ? `, ${report.unpaid} UNPAID orders` : ''}`)
  if (off.length) lines.push(`demo payments OFF at: ${off.join(', ')} (reception only there; enable with SQL)`)
  lines.push(`time segments: ${segments} in ${path.basename(SEGMENTS_FILE)}, server clock ${clock.skewMs === null ? 'not measured' : `${clock.skewMs >= 0 ? '+' : ''}${clock.skewMs} ms`} vs this machine`)
  lines.push(`took ${Math.round((Date.now() - startedAt) / 1000)} s`)
  return lines
}

async function dryRun(args) {
  let accounts = null
  if (process.env.DEMO_ACCOUNTS) { try { accounts = loadAccounts(process.env.DEMO_ACCOUNTS) } catch { /* fall back to the roster */ } }
  const w = buildWorld({ cfg: null, accounts, dry: true })
  const plan = planDay(args.day, args.seed == null ? args.day : args.seed)
  console.log(`DRY RUN - no network call. Staff from ${accounts ? 'DEMO_ACCOUNTS' : 'the built-in roster (no DEMO_ACCOUNTS file)'}; staff column = waiters/kitchen/cashiers/hosts; times = intended start on the simulated date.`)
  console.log(describe(plan, w).join('\n'))
  const have = Object.keys(DINERS).filter(n => w.diners[n]).length
  console.log(`Diners with an account: ${have}/${Object.keys(DINERS).length}`)
  console.log(`World init: ${isInitialised() ? 'already done' : args.noInit ? 'skipped (--no-init)' : 'WOULD RUN now (no .world-initialised flag): 16 diners follow 2-5 venues, 18 friendships, 10 venue posts, 5 promos'}${args.init ? ' (forced by --init)' : ''}`)
  const parties = plan.parties.length, visits = plan.parties.reduce((s, p) => s + p.diners.length, 0)
  console.log(`Expected: ${parties} parties, ${visits} diner visits, about ${plan.parties.reduce((s, p) => s + p.diners.length * 1.6, 0).toFixed(0)} orders`)
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.dry) return dryRun(args)
  const startedAt = Date.now()
  const cfg = loadConfig()
  if (!process.env.DEMO_ACCOUNTS) throw new Error('set DEMO_ACCOUNTS to the accounts JSON file')
  const accounts = loadAccounts(process.env.DEMO_ACCOUNTS)
  const w = buildWorld({ cfg, accounts, dry: false })
  w.pace = args.pace
  const seed = args.seed == null ? args.day : args.seed
  const plan = planDay(args.day, seed)
  const rng = makeRng(seed * 1000 + 17)
  const missing = [...new Set(plan.parties.flatMap(p => p.diners))].filter(n => !w.diners[n])
  const noManager = Object.values(w.venues).filter(v => !v.staff.manager).map(v => v.key)
  if (missing.length || noManager.length) throw new Error(`accounts missing: diners [${missing.join(', ')}], venue managers [${noManager.join(', ')}]`)
  log(`accounts: ${Object.keys(w.diners).length} diners, ${Object.values(w.venues).reduce((s, v) => s + Object.values(v.staff).flat().length, 0)} staff`)
  describe(plan, w).forEach(l => log(l))

  const state = readJson(STATE_FILE, {})
  const ctx = { posts: [], reviews: [], posted: new Set(), venuePosts: [] }
  const needInit = args.init || (!args.noInit && !isInitialised())

  // A segment = one block of the day, bracketed in server time and meant to have happened at `at` (minutes since midnight)
  // on the simulated Baku date. The first call of the run also measures the server clock.
  await measureClock(cfg)
  const rec = createRecorder({ daysBack: args.day, date: plan.date })
  const segment = (label, at, fn) => safe(`segment ${label}`, () => rec.run(label, Math.min(Math.max(0, at), 1439), fn))
  const later = (at, lo, hi) => at + rng.int(lo, hi)     // a reaction comes a while after what it reacts to

  await safe('demo payments', () => checkDemoPayments(w, { enable: needInit }))
  if (needInit) {
    const posts = (await safe('world init', () => initWorld(w, rng, args.day, { force: args.init, segment: (label, at, fn) => rec.run(label, at, fn), at: plan.init }))) || []
    ctx.venuePosts.push(...posts)
    if (!args.noExtras) {
      for (const p of posts) await segment(`followers like the ${p.venue} post`, later(p.at, 30, 180), () => safe('engage venue posts', () => engageVenuePosts(w, rng, [p])))
    }
  }
  await safe('sold-out restore', () => restoreSoldOut(w, state))

  const parties = args.parties == null ? plan.parties : plan.parties.slice(0, args.parties)
  for (let i = 0; i < parties.length; i++) {
    const party = parties[i]
    const before = { posts: ctx.posts.length, reviews: ctx.reviews.length }
    await segment(`${party.id} ${party.slot} ${party.venue}`, party.at, async () => {
      if (i === plan.extras.soldOutAt && !args.noExtras) await safe('sold-out', () => soldOutToday(w, rng, state, args.day))
      let booking = null
      if (party.booking) booking = (await safe('booking', () => prepareBooking(w, party))) || null
      const P = await safe(`party ${party.id}`, () => runParty(w, party, rng, { booking }))
      if (P) await safe(`after visit ${party.id}`, () => afterVisit(w, P, rng, ctx))
    })
    const fresh = { posts: ctx.posts.slice(before.posts), reviews: ctx.reviews.slice(before.reviews) }
    if (!args.noExtras && (fresh.posts.length || fresh.reviews.length)) {
      await segment(`friends react to ${party.id}`, later(party.at, 25, 150), () => safe('engage', () => engage(w, rng, fresh)))
    }
  }

  if (!args.noExtras) {
    const e = plan.extras
    const posted = new Set(ctx.venuePosts.map(p => p.venue))
    for (const p of e.restaurantPosts.filter(x => !posted.has(x.venue))) {
      const kind = rng.weighted(['dish', 'special', 'event'], k => ({ dish: 0.6, special: 0.2, event: 0.2 })[k])
      let post = null
      await segment(`venue post ${p.venue}`, p.at, async () => { post = await safe('venue post', () => venuePost(w, w.venues[p.venue], rng, kind)) })
      if (post) {
        ctx.venuePosts.push({ ...post, at: p.at })
        await segment(`followers like the ${p.venue} post`, later(p.at, 30, 180), () => safe('engage venue posts', () => engageVenuePosts(w, rng, [post])))
      }
    }
    if (e.promoVenue) await segment(`promo ${e.promoVenue.venue}`, e.promoVenue.at, () => safe('promo', () => createPromo(w, w.venues[e.promoVenue.venue], rng)))
    if (e.cancel) await segment('cancelled booking', e.cancel.at, () => safe('cancelled booking', () => cancelledBooking(w, e.cancel, rng)))
    if (e.noShow) await segment('no-show booking', e.noShow.at, () => safe('no-show booking', () => noShowBooking(w, e.noShow, rng)))
  }

  let report
  await segment('sweep', 1430, async () => {
    report = await safe('sweep', () => sweep(w))
    if (report && (report.tablesLeft.length || report.billsLeft || report.unpaid)) report = (await safe('sweep', () => sweep(w))) || report   // one more pass
  })
  writeJson(STATE_FILE, state)
  summary(plan, w, report, startedAt, rec.count()).forEach(l => console.log(l))
}

main().catch(e => { console.error(`FATAL: ${e.message}`); process.exit(1) })
