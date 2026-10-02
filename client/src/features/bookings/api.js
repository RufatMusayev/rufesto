// Every Supabase call of the bookings feature (tables, RPCs, channels) lives here.
// Functions return { data, error } and never throw; `error` is { code, key } (see errors.js).
// Names and shapes follow sql/41_v2_bookings.sql, 41b_v2_group_bookings.sql and 41c_v2_booking_seating.sql;
// each call carries a `// CONTRACT:` note so a rename in docs/V2-CONTRACT.md is a one-line change.
import { supabase } from '../../lib/supabase'
import { rsrc, RESTAURANT_COLS } from '../../lib/publicSource'
import { toError } from './errors'
import {
  mapRestaurantRow, mapSlot, mapCreated, mapPreview, mapJoined, mapClaim, mapDetail, mapListRow,
} from './mappers'

async function call(fn) {
  try {
    const { data, error } = await fn()
    if (error) return { data: null, error: toError(error) }
    return { data, error: null }
  } catch (err) {
    return { data: null, error: toError(err) }
  }
}
const rpc = (name, args) => call(() => supabase.rpc(name, args))
const mapped = (res, map) => (res.error ? res : { data: map(res.data), error: null })

/* --------------------------------------------------------------- restaurant */

/** One active restaurant by slug (public columns only, never select('*')). data = null when it does not exist. */
export async function getRestaurantBySlug(slug) {
  const { data, error } = await call(() => supabase
    .from(rsrc()).select(RESTAURANT_COLS).eq('slug', slug).maybeSingle())
  if (error) return { data: null, error }
  return { data: data ? mapRestaurantRow(data) : null, error: null }
}

/* ------------------------------------------------------------- availability */

/** CONTRACT: get_available_slots(p_restaurant_id, p_date 'YYYY-MM-DD' (Baku), p_party_size)
 *  -> [{ slot_time 'HH:MM', available, reason, tables_free }]; [] = closed that day. Anon may call. */
export async function getAvailableSlots({ restaurantId, date, partySize }) {
  const res = await rpc('get_available_slots', {
    p_restaurant_id: restaurantId, p_date: date, p_party_size: partySize,
  })
  return mapped(res, d => (d || []).map(mapSlot))
}

/* ------------------------------------------------------------ create / join */

/** CONTRACT: create_group_booking(p_restaurant_id, p_date, p_time 'HH:MM', p_party_size, p_note, p_host_name,
 *  p_host_phone, p_consent, p_invites boolean default true) -> { booking_id, invite_code, status, starts_at, ends_at,
 *  party_size, ... }. `invites` = the wizard's invite switch (false when it is off or the party is 1). */
export async function createGroupBooking({ restaurantId, date, time, partySize, note, name, phone, consent, invites = true }) {
  const res = await rpc('create_group_booking', {
    p_restaurant_id: restaurantId, p_date: date, p_time: time, p_party_size: partySize,
    p_note: note || null, p_host_name: name || null, p_host_phone: phone || null, p_consent: !!consent,
    p_invites: !!invites,
  })
  return mapped(res, mapCreated)
}

/** CONTRACT: get_group_booking_preview(p_code) -> { restaurant, starts_at, party_size, joined_count, host_first_name,
 *  status, is_full, is_expired, joinable, already_member, booking_id }. Anon may call; no PII beyond a first name.
 *  Raises `invites_disabled` when the host has turned the invite link off. */
export async function getInvitePreview(code) {
  const res = await rpc('get_group_booking_preview', { p_code: code })
  return mapped(res, mapPreview)
}

/** CONTRACT: join_group_booking(p_code, p_consent, p_name, p_phone) -> { booking_id, member_id, status, seated, table_id }.
 *  Idempotent. The name defaults to the profile on the server; the invite page sends the phone (profile or typed, E.164
 *  digits) so the restaurant always gets the number the consent text promises (booking_contacts).
 *  Raises `invites_disabled` when the host has turned the invite link off. */
export async function joinGroupBooking({ code, consent, name = null, phone = null }) {
  const res = await rpc('join_group_booking', { p_code: code, p_consent: !!consent, p_name: name, p_phone: phone })
  return mapped(res, mapJoined)
}

/** CONTRACT: set_booking_invites(p_booking_id, p_enabled boolean) (host only) turns the invite link on or off for a
 *  live booking. Errors: not_authenticated, not_host, booking_not_found, booking_not_active. */
export async function setBookingInvites(bookingId, enabled) {
  return rpc('set_booking_invites', { p_booking_id: bookingId, p_enabled: !!enabled })
}

/** CONTRACT: leave_group_booking(p_booking_id) -> { booking_id, status 'left' | 'declined' } (not the host) */
export async function leaveGroupBooking(bookingId) {
  return rpc('leave_group_booking', { p_booking_id: bookingId })
}

/** CONTRACT: cancel_booking(p_booking_id) -> { booking_id, status 'cancelled' } (the host; solo bookings too) */
export async function cancelBooking(bookingId) {
  return rpc('cancel_booking', { p_booking_id: bookingId })
}

/** CONTRACT: claim_table_from_booking(p_booking_id, p_code) -> { booking_id, table_id, table_number, restaurant_id,
 *  session_status, is_host, moved, ... }. HOST only, inside the window (30 min before start .. end). `code` is what the
 *  guest scanned: the table's access code or a seat code `<code>-S<n>`; the host is seated at THAT physical table and the
 *  booking is linked to it (no remote seating). Errors: the claim_table ones (invalid_code, invalid_seat, seat_taken,
 *  table_reserved, ...) plus not_host, outside_window, booking_not_active. Members have no booking RPC: they scan the
 *  table QR like any guest (CartContext.claimTable). */
export async function claimTableFromBooking(bookingId, code) {
  const res = await rpc('claim_table_from_booking', { p_booking_id: bookingId, p_code: code })
  return mapped(res, mapClaim)
}

/* -------------------------------------------------------------------- reads */

/** CONTRACT: group_booking_detail(p_booking_id) -> { booking_id, status, restaurant, starts_at, ends_at, party_size,
 *  table_number, is_host, my_role, my_status, invite, invites_enabled, member_count, spots_left, members[] }
 *  (phones: host/staff only) */
export async function getBookingDetail(bookingId) {
  const res = await rpc('group_booking_detail', { p_booking_id: bookingId })
  return mapped(res, mapDetail)
}

/** CONTRACT: list_my_bookings() -> [{ booking_id, status, restaurant, starts_at, ends_at, party_size, my_role,
 *  my_status, is_group, member_count, invite_code, invites_enabled, table_number }] newest first, max 100 */
export async function listMyBookings() {
  const res = await rpc('list_my_bookings')
  return mapped(res, d => (d || []).map(mapListRow))
}

/* ----------------------------------------------------------------- realtime */

let channelSeq = 0

/** One booking: `bookings` row (status, table, seated) and its `booking_members` (list, joined counter).
 *  Scoped by id, RLS decides what each guest receives. `onStatus` gets the channel status so the caller can
 *  fall back to polling when it is 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED'. Returns an unsubscribe. */
export function subscribeBooking(bookingId, onChange, onStatus) {
  try {
    const ch = supabase.channel(`bk-detail-${bookingId}-${++channelSeq}`)
      .on('postgres_changes', { schema: 'public', event: '*', table: 'bookings', filter: `id=eq.${bookingId}` }, onChange)
      .on('postgres_changes', { schema: 'public', event: '*', table: 'booking_members', filter: `booking_id=eq.${bookingId}` }, onChange)
      .subscribe(status => onStatus?.(status))
    return () => { try { supabase.removeChannel(ch) } catch { /* already gone */ } }
  } catch {
    onStatus?.('CHANNEL_ERROR')
    return () => {}
  }
}

/** The signed-in guest's own bookings (as host) and memberships (as guest): the Profile list refetches on any change. */
export function subscribeMyBookings(userId, onChange, onStatus) {
  try {
    const ch = supabase.channel(`bk-mine-${userId}-${++channelSeq}`)
      .on('postgres_changes', { schema: 'public', event: '*', table: 'bookings', filter: `user_id=eq.${userId}` }, onChange)
      .on('postgres_changes', { schema: 'public', event: '*', table: 'booking_members', filter: `user_id=eq.${userId}` }, onChange)
      .subscribe(status => onStatus?.(status))
    return () => { try { supabase.removeChannel(ch) } catch { /* already gone */ } }
  } catch {
    onStatus?.('CHANNEL_ERROR')
    return () => {}
  }
}
