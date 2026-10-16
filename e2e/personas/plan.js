'use strict'
// The plan of one simulated day: who eats where, with whom, how they split and pay, which bookings happen. Pure and seeded
// (same day number -> same plan), no network. The runtime picks the actual dishes from each venue's live menu.
const { VENUES, SLOT_VENUES, DINERS, DINER_NAMES, friendsOf } = require('./roster')
const { makeRng } = require('./rng')
const { ymdBaku, addDays, weekdayOf, WEEKDAYS } = require('./world')
const { bookingNote } = require('./content')
const { hhmm } = require('./segments')

const SLOT_TIMES = { morning: [480, 660], lunch: [735, 885], dinner: [1140, 1335] }   // minutes since midnight

function dayInfo(day) {
  const date = addDays(ymdBaku(), -day)
  const dow = weekdayOf(date)
  return { day, date, weekday: WEEKDAYS[dow], weekend: dow === 0 || dow === 6 }
}

function planDay(day, seed = day) {
  const rng = makeRng(seed)
  const info = dayInfo(day)
  const used = {}                                     // name -> parties today (max 2 each)
  const free = n => (used[n] || 0) < 2
  const take = names => names.forEach(n => { used[n] = (used[n] || 0) + 1 })
  const likes = (name, venues) => venues.reduce((s, v) => s + ((DINERS[name].likes || {})[v] || 0), 0)

  const parties = []
  const add = p => { parties.push({ id: '', callWaiter: rng.chance(0.25), booking: null, ...p }) }

  // ---- bookings first (they hold their diners): 1-3 a day, restaurants, evening
  const nBook = info.weekend ? rng.int(2, 3) : (rng.chance(0.2) ? 3 : rng.int(1, 2))
  const templates = rng.sample(['family', 'group', 'couple'], nBook, t => (t === 'group' && info.weekend ? 2 : 1))
  while (templates.length < nBook) templates.push('couple')
  for (const template of templates) {
    const b = bookingParty(rng, template, free)
    if (!b) continue
    take(b.diners)
    add({ slot: 'dinner', venue: b.venue, kind: VENUES[b.venue].kind, diners: b.diners, headcount: b.party, rounds: 2, ...payPlan(rng, b.diners, b.venue, template === 'group' ? null : 'own'),
      booking: { template, party: b.party, invites: b.invites, invited: b.invited, note: bookingNote(rng, template) } })
  }

  // ---- walk-in parties spread over the day: coffee in the morning, quick lunches, restaurants for dinner
  const total = info.weekend ? rng.int(8, 10) : rng.int(6, 8)
  const walk = Math.max(3, total - parties.length)
  const nMorning = Math.min(2, walk - 2)
  const nLunch = Math.min(info.weekend ? 1 : 2, walk - nMorning - 1)
  const slots = [...Array(nMorning).fill('morning'), ...Array(nLunch).fill('lunch'), ...Array(walk - nMorning - nLunch).fill('dinner')]
  const seen = new Set(parties.map(p => [...p.diners].sort().join('+')))
  const venueUse = {}
  parties.forEach(p => { venueUse[p.venue] = (venueUse[p.venue] || 0) + 1 })
  const fade = n => Math.pow(0.35, used[n] || 0)                    // someone who already ate today is less likely to go again
  slots.forEach((slot, i) => {
    const venues = SLOT_VENUES[slot]
    for (let attempt = 0; attempt < 4; attempt++) {
      let host
      if (slot === 'morning' && i === 0 && attempt === 0) host = info.weekend ? 'Kamilla' : 'Lamiyə'     // her coffee ritual / weekend brunch
      if (!host || !free(host)) {
        host = rng.weighted(DINER_NAMES.filter(n => free(n) && (slot !== 'dinner' || friendsOf(n).length)), n => DINERS[n].weight * likes(n, venues) * fade(n))
      }
      if (!host) return
      const venue = slot === 'morning' && host === 'Kamilla' && info.weekend ? 'brew' : rng.weighted(venues, v => ((DINERS[host].likes || {})[v] || 0.2) * Math.pow(0.4, venueUse[v] || 0))
      const want = slot === 'morning' ? (rng.chance(info.weekend ? 0.8 : 0.25) ? 2 : 1)
        : slot === 'lunch' ? rng.weighted([1, 2, 3], s => [0.45, 0.35, 0.2][s - 1])
          : rng.weighted([2, 3, 4, 5], s => [0.35, 0.3, 0.2, 0.15][s - 2])
      const pool = friendsOf(host).filter(f => free(f) && f !== host)
      const guests = rng.sample(pool, Math.min(want - 1, pool.length), f => (0.5 + ((DINERS[f].likes || {})[venue] || 0)) * fade(f))
      if (host === 'Kamilla' && info.weekend) ['Günay', 'Lamiyə'].forEach(f => { if (free(f) && !guests.includes(f) && guests.length < 2) guests.push(f) })
      const diners = [host, ...guests]
      const key = [...diners].sort().join('+')
      if (seen.has(key) && attempt < 3) continue                      // the same people at the same table twice in a day: try someone else
      seen.add(key)
      venueUse[venue] = (venueUse[venue] || 0) + 1
      take(diners)
      // a dinner is never for one: a lone account sits with a companion who has no account (the table is for two)
      const headcount = slot === 'dinner' ? Math.max(2, diners.length) : diners.length
      add({ slot, venue, kind: VENUES[venue].kind, diners, headcount, rounds: slot === 'dinner' && rng.chance(0.55) ? 2 : 1, ...payPlan(rng, diners, venue, null) })
      return
    }
  })

  // ---- when each party starts on the simulated date (minutes since midnight Baku): coffee 08:00-11:00, quick lunch 12:15-14:45,
  // dinners and bookings 19:00-22:15. Spread evenly with a little jitter, handed out in a random order within the slot, then
  // the day runs in time order.
  const spread = (n, lo, hi) => Array.from({ length: n }, (_, i) => Math.round(lo + ((hi - lo) / n) * i + rng.next() * ((hi - lo) / n) * 0.9))
  for (const [slot, [lo, hi]] of Object.entries(SLOT_TIMES)) {
    const group = rng.shuffle(parties.filter(p => p.slot === slot))
    const times = spread(group.length, lo, hi)
    group.forEach((p, i) => { p.at = times[i] })
  }
  parties.sort((a, b) => a.at - b.at)
  parties.forEach((p, i) => { p.id = `P${i + 1}` })

  // ---- one cancelled and one no-show booking per week, a sold-out dish, venue posts and the odd new promo
  const extra = (host, at) => { const venue = rng.weighted(SLOT_VENUES.dinner, v => (DINERS[host].likes || {})[v] || 0.3); return { host, venue, party: rng.int(2, 4), at } }
  const posting = Object.keys(VENUES).filter(() => rng.chance(0.4))
  const postTimes = spread(posting.length, 660, 1020)                 // 11:00-17:00
  const extras = {
    cancel: day % 7 === 6 ? extra(rng.pick(['Aysel', 'Nərmin', 'Ceyhun', 'Zaur']), rng.int(900, 1020)) : null,      // booked 15:00-17:00 for the evening
    noShow: day % 7 === 3 ? extra(rng.pick(['Rauf', 'Zaur', 'Nərmin', 'Aysel']), rng.int(930, 1050)) : null,
    soldOutAt: Math.floor(parties.length / 3),
    restaurantPosts: posting.map((venue, i) => ({ venue, at: postTimes[i] })),
    promoVenue: rng.chance(0.15) ? { venue: rng.pick(Object.keys(VENUES)), at: rng.int(660, 1020) } : null,
  }
  // day one (when the world is empty): follows, friendships, venue posts in three batches, promos - spread 10:00-18:00
  const init = { follows: rng.int(600, 640), friends: rng.int(670, 720), posts: [rng.int(750, 790), rng.int(840, 880), rng.int(930, 970)], promos: rng.int(1010, 1060) }
  return { ...info, seed, parties, extras, init }
}

/** payments of a party: who pays how (card or reception), tip percent, the split mode */
function payPlan(rng, diners, venueKey, forcedSplit) {
  const kind = VENUES[venueKey].kind
  const cardShare = kind === 'quick' ? 0.35 : kind === 'coffee' ? 0.7 : 0.65
  let split = forcedSplit
  const host = DINERS[diners[0]]
  if (diners.length === 1) split = 'own'
  else if (!split) split = diners.some(n => DINERS[n].split) ? 'equal' : host.payAll && rng.chance(0.6) ? 'all' : rng.weighted(['own', 'equal', 'all'], s => ({ own: 0.55, equal: 0.25, all: 0.2 })[s])
  const pay = {}, tip = {}
  for (const n of diners) {
    const d = DINERS[n]
    pay[n] = d.pay === 'card' || rng.chance(cardShare) ? 'card' : 'reception'
    tip[n] = rng.int(d.tip[0], d.tip[1])
  }
  return { split, pay, tip }
}

/** diners / venue / party size for a booking template, or null when nobody is free */
function bookingParty(rng, template, free) {
  const venueFor = (name, venues) => rng.weighted(venues, v => (DINERS[name].likes || {})[v] || 0.2)
  if (template === 'family') {
    if (!free('Zaur')) return null
    return { diners: ['Zaur'], venue: rng.pick(['seda', 'shirvan']), party: rng.int(4, 6), invites: false, invited: [] }
  }
  if (template === 'group') {
    const mates = ['Zaur', 'Elçin'].filter(free)
    if (!free('Nərmin') || mates.length < 2) return null
    return { diners: ['Nərmin', ...mates], venue: venueFor('Nərmin', ['bella', 'sakura', 'seda', 'meze']), party: rng.int(5, 6), invites: true, invited: mates }
  }
  const pairs = rng.shuffle([['Aysel', 'Nicat', ['bella', 'sakura']], ['Könül', 'Səbinə', ['bella', 'seda']], ['Ceyhun', 'Emin', ['tiflis', 'meze']], ['Aysel', 'Könül', ['bella', 'tiflis']]])
  const pair = pairs.find(([a, b]) => free(a) && free(b))
  if (!pair) return null
  return { diners: [pair[0], pair[1]], venue: rng.pick(pair[2]), party: 2, invites: false, invited: [] }
}

/** the plan as text lines (for --dry-run and the log) */
function describe(plan, world) {
  const out = []
  out.push(`Day ${plan.day} -> ${plan.date} (${plan.weekday}${plan.weekend ? ', weekend' : ''}), seed ${plan.seed}`)
  const staffOf = k => { const s = world.venues[k].staff; return `${s.waiters.length}w ${s.kitchen.length}k ${s.cashiers.length}c${s.hosts.length ? ` ${s.hosts.length}h` : ''}` }
  out.push(`Parties: ${plan.parties.length} (${plan.parties.filter(p => p.booking).length} through a booking)`)
  for (const p of plan.parties) {
    const pays = p.split === 'all' ? `${p.diners[0]} pays all` : p.diners.map(n => `${n}:${p.pay[n] === 'card' ? `card+${p.tip[n]}%` : 'reception'}`).join(' ')
    out.push(`  ${p.id.padEnd(3)} ${hhmm(p.at)} ${p.slot.padEnd(7)} ${p.venue.padEnd(8)} ${p.diners.join(' + ')}${p.headcount > p.diners.length ? ` (table for ${p.headcount})` : ''}  rounds ${p.rounds}  split ${p.split}  ${pays}  [${staffOf(p.venue)}]`)
    if (p.booking) out.push(`        booking ${p.booking.template}: party of ${p.booking.party}, invites ${p.booking.invites ? `on (${p.booking.invited.join(', ')} join)` : 'off'}${p.booking.note ? `, note "${p.booking.note}"` : ''}`)
  }
  const e = plan.extras
  out.push(`Cancelled booking: ${e.cancel ? `${e.cancel.host} at ${e.cancel.venue} (party ${e.cancel.party}), made ${hhmm(e.cancel.at)}` : 'none today'}`)
  out.push(`No-show booking:   ${e.noShow ? `${e.noShow.host} at ${e.noShow.venue} (party ${e.noShow.party}), made ${hhmm(e.noShow.at)}` : 'none today'}`)
  out.push(`Sold-out toggle after party #${e.soldOutAt} (random venue, random dish; restored on the next run)`)
  out.push(`Restaurant posts: ${e.restaurantPosts.map(p => `${p.venue} ${hhmm(p.at)}`).join(', ') || 'none'}   new promo: ${e.promoVenue ? `${e.promoVenue.venue} ${hhmm(e.promoVenue.at)}` : 'none'}`)
  out.push(`Day-one block (only on the first run): follows ${hhmm(plan.init.follows)}, friendships ${hhmm(plan.init.friends)}, venue posts ${plan.init.posts.map(hhmm).join('/')}, promos ${hhmm(plan.init.promos)}`)
  return out
}

module.exports = { planDay, describe, dayInfo }
