'use strict'
// Table bookings through the consumer app's calls (get_available_slots, create_group_booking, invite_to_booking,
// join_group_booking, cancel_booking) and the dashboard's (confirm = PATCH bookings.status, reschedule = PATCH times).
// A booking that ends in a visit is brought into its arrival window by the manager, because the host can only claim the
// table from 30 minutes before the start and the sim cannot wait for the evening.
const { count, fail, ready, manager, bookingActor, loadTables, ymdBaku, addDays } = require('./world')

/**
 * A bookable slot. With `leadMin`: the first one starting at least that many minutes from now (a booking made in the afternoon
 * for the evening, once the time shift has moved it); without: the earliest evening slot (18:00 or later), today first, then
 * tomorrow. Falls back to the first bookable slot there is.
 */
async function findSlot(host, v, party, { leadMin = null, dayOffsets = [0, 1, 2] } = {}) {
  let fallback = null
  for (const off of dayOffsets) {
    const date = addDays(ymdBaku(), off)
    const r = await host.rpc('get_available_slots', { p_restaurant_id: v.id, p_date: date, p_party_size: party })
    if (!r.ok) { fail('get_available_slots', r); continue }
    const open = (Array.isArray(r.data) ? r.data : []).filter(s => s.available)
    if (!open.length) continue
    const slot = s => ({ date, time: String(s.slot_time).slice(0, 5) })
    fallback = fallback || slot(open[0])
    if (leadMin != null) {
      const far = open.filter(s => Date.parse(s.starts_at) >= Date.now() + leadMin * 60_000)
      if (far.length) return slot(far[0])
    } else {
      const evening = open.filter(s => String(s.slot_time) >= '18:00')
      return slot(evening.length ? evening[0] : open[0])
    }
  }
  return fallback
}

async function createBooking(host, v, slot, { party, invites, note }) {
  const r = await host.rpc('create_group_booking', {
    p_restaurant_id: v.id, p_date: slot.date, p_time: slot.time, p_party_size: party, p_note: note || null,
    p_host_name: host.name, p_host_phone: host.acct.phone || null, p_consent: true, p_invites: !!invites,
  })
  if (!r.ok) { fail('create_group_booking', r); return null }
  count('booking_created')
  return { id: r.data.booking_id, code: r.data.invite_code || r.data.code, tableId: r.data.table_id, v, host, party }
}

/** The host invites accepted friends and each of them joins with the invite code (the /b/<code> page's join). */
async function addMembers(w, bk, names) {
  for (const n of names) {
    const f = w.diners[n]
    if (!f || !(await ready(f))) continue
    const inv = await bk.host.rpc('invite_to_booking', { p_booking_id: bk.id, p_user_id: f.uid })
    if (inv.ok) count('booking_invite'); else fail('invite_to_booking', inv)
    const join = await f.rpc('join_group_booking', { p_code: bk.code, p_consent: true, p_name: f.name, p_phone: f.acct.phone || null })
    if (join.ok) count('booking_joined'); else fail('join_group_booking', join)
  }
}

/** The restaurant confirms (host role if the venue has one, else the manager): BookingsPage updateStatus. */
async function confirmBooking(bk) {
  const staff = bookingActor(bk.v)
  let r = await staff.patch(`bookings?id=eq.${bk.id}`, { status: 'confirmed' })
  if ((!r.ok || !r.data || !r.data.length) && staff !== manager(bk.v)) r = await manager(bk.v).patch(`bookings?id=eq.${bk.id}`, { status: 'confirmed' })
  if (r.ok && r.data && r.data.length) { count('booking_confirmed'); return true }
  fail('booking confirm', r.ok ? { code: 'no_row' } : r)
  return false
}

/**
 * The manager moves the booking to start in 20 minutes: 105 minutes long, shorter when the restaurant closes sooner (the
 * database refuses a booking that ends after closing time), on another table when this one is taken for that time.
 */
async function moveIntoWindow(bk) {
  const m = manager(bk.v)
  const from = new Date(Math.floor((Date.now() + 20 * 60_000) / 60_000) * 60_000)
  let r
  for (const minutes of [105, 75, 45]) {
    const times = { reserved_from: from.toISOString(), reserved_until: new Date(from.getTime() + minutes * 60_000).toISOString() }
    r = await m.patch(`bookings?id=eq.${bk.id}`, times)
    if (!r.ok && r.code === '23P01') {
      const tables = (await loadTables(bk.v)).filter(t => t.capacity >= bk.party && t.min <= bk.party && t.id !== bk.tableId && ['free', 'cleared'].includes(t.state))
      for (const t of tables.sort((a, b) => a.capacity - b.capacity)) {
        r = await m.patch(`bookings?id=eq.${bk.id}`, { ...times, table_id: t.id })
        if (r.ok) break
      }
    }
    if (r.ok || !/operating hours/i.test(r.msg || '')) break
  }
  if (r.ok && r.data && r.data.length) { bk.tableId = r.data[0].table_id || bk.tableId; count('booking_rescheduled'); return true }
  fail('booking reschedule', r.ok ? { code: 'no_row' } : r)
  return false
}

const cancelBooking = async bk => {
  const r = await bk.host.rpc('cancel_booking', { p_booking_id: bk.id })
  if (r.ok) count('booking_cancelled'); else fail('cancel_booking', r)
  return r.ok
}

/**
 * Everything up to the arrival of a booked party: slot, booking, invited friends join, restaurant confirms, window.
 * Resolves { id, tableId } or null (the caller then lets the party walk in; a half-made booking is cancelled).
 */
async function prepareBooking(w, party) {
  const b = party.booking
  const v = w.venues[party.venue]
  const host = w.diners[party.diners[0]]
  if (!host) { fail('booking', { code: 'no_account' }); return null }
  const slot = await findSlot(host, v, b.party)
  if (!slot) { fail('booking', { code: 'no_slot' }); return null }
  const bk = await createBooking(host, v, slot, b)
  if (!bk) return null
  if (b.invites && b.invited.length) await addMembers(w, bk, b.invited)
  if (!(await confirmBooking(bk)) || !(await moveIntoWindow(bk))) { await cancelBooking(bk); return null }
  return { id: bk.id, tableId: bk.tableId }
}

/** A guest books for the evening and cancels again (the restaurant had confirmed it half of the time). */
async function cancelledBooking(w, e, rng) {
  const v = w.venues[e.venue], host = w.diners[e.host]
  if (!host) return
  const slot = await findSlot(host, v, e.party, { leadMin: rng.int(150, 240) })
  const bk = slot && await createBooking(host, v, slot, { party: e.party, invites: false, note: null })
  if (!bk) return
  if (rng.chance(0.5)) await confirmBooking(bk)
  await cancelBooking(bk)
}

/** A confirmed booking nobody turns up for; once its time has passed (after the time shift) the cron marks it no_show. */
async function noShowBooking(w, e, rng) {
  const v = w.venues[e.venue], host = w.diners[e.host]
  if (!host) return
  const slot = await findSlot(host, v, e.party, { leadMin: rng.int(150, 240) })
  const bk = slot && await createBooking(host, v, slot, { party: e.party, invites: false, note: null })
  if (bk && await confirmBooking(bk)) count('booking_left_for_no_show')
}

module.exports = { prepareBooking, cancelledBooking, noShowBooking }
