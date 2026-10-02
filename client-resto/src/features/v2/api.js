// Every Supabase call of the v2 dashboard screens lives here (rule I-6). All
// functions return { data, error } and never throw; screens only know the
// view-models documented per section, so a contract change touches this file
// only. Realtime channels are scoped by restaurant_id / booking_id.
//
// Source of truth for names and shapes: docs/V2-CONTRACT.md (db-v2; sql/41*, 42*, 43*). Each call
// carries a `// CONTRACT:` comment naming what it relies on.

import { supabase } from '../../lib/supabase'
import { subscribeResync } from '../../lib/realtime'
import { writeError } from '../../lib/errors'
import { bakuDateString, hhmm } from './dates'

async function run(fn) {
  try {
    const res = await fn()
    return { data: res?.data ?? null, error: res?.error ?? null }
  } catch (error) {
    return { data: null, error }
  }
}

// A write that RLS filtered out reports no error and zero rows; treat it as one.
function checkWrite(res) {
  const error = writeError(res)
  return error ? { data: null, error } : { data: res.data, error: null }
}

// ───────────────────────── Group bookings ─────────────────────────
// View-models
//   GroupSummary { code, capacity, joined, expiresAt }   (null when the booking has no invite)
//   GroupDetail  { members: [{ id, name, phone, status: 'invited'|'joined'|'arrived', isHost }] }
// CONTRACT: booking_invites(booking_id, code, max_members, expires_at) and booking_members(booking_id, status)
//           are readable by staff of the booking's restaurant (sql/41 policies);
//           group_booking_detail(p_booking_id) gives staff the members with name and phone (sql/41c).

let pendingSummaries = null

/** Summary for one booking. Calls made in the same tick share two queries. */
export function fetchGroupSummary(bookingId) {
  return new Promise(resolve => {
    if (!pendingSummaries) pendingSummaries = { items: [], timer: setTimeout(flushSummaries, 30) }
    pendingSummaries.items.push({ bookingId, resolve })
  })
}

async function flushSummaries() {
  const { items } = pendingSummaries
  pendingSummaries = null
  const ids = [...new Set(items.map(i => i.bookingId))]
  const [inv, mem] = await Promise.all([
    run(() => supabase.from('booking_invites').select('booking_id, code, max_members, expires_at').in('booking_id', ids)),
    run(() => supabase.from('booking_members').select('booking_id, status').in('booking_id', ids)),
  ])
  const error = inv.error || mem.error
  const invites = new Map((inv.data || []).map(r => [r.booking_id, r]))
  const joined = new Map()
  for (const m of mem.data || []) {
    // "In the party" = joined + arrived (sql/41b).
    if (m.status === 'joined' || m.status === 'arrived') joined.set(m.booking_id, (joined.get(m.booking_id) || 0) + 1)
  }
  for (const { bookingId, resolve } of items) {
    const invite = invites.get(bookingId)
    if (error) resolve({ data: null, error })
    else if (!invite) resolve({ data: null, error: null })
    else resolve({
      data: { code: invite.code, capacity: invite.max_members, joined: joined.get(bookingId) || 0, expiresAt: invite.expires_at },
      error: null,
    })
  }
}

/** Members of one booking, host first, with phones. Phones are for display only; never log them. */
export async function fetchGroupDetail(bookingId) {
  // CONTRACT: group_booking_detail(p_booking_id) -> { members: [{ user_id, name, status, is_host, phone }] }
  const res = await run(() => supabase.rpc('group_booking_detail', { p_booking_id: bookingId }))
  if (res.error) return res
  const members = ((res.data && res.data.members) || []).map(m => ({
    id: m.user_id, name: m.name || '', phone: m.phone || '', status: m.status, isHost: !!m.is_host,
  }))
  return { data: { members }, error: null }
}

let openMemberChannels = 0
const MAX_MEMBER_CHANNELS = 5

// supabase-js hands back the existing channel for a repeated topic, and removeChannel() is async: a panel
// closed and reopened (or a remount) would get the old channel while it is still leaving, and `.on()` on it
// throws "cannot add callbacks after subscribe()". Every channel therefore gets a unique name.
let channelSeq = 0

/** Live members of an open panel. Past 5 open panels it polls instead of adding channels. */
export function subscribeGroupMembers(bookingId, resync) {
  const poll = () => {
    const timer = setInterval(() => { if (document.visibilityState === 'visible') resync() }, 15000)
    return () => clearInterval(timer)
  }
  if (openMemberChannels >= MAX_MEMBER_CHANNELS) return poll()
  openMemberChannels += 1
  let stop
  try {
    const channel = supabase
      .channel(`v2-booking-members-${bookingId}-${++channelSeq}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'booking_members', filter: `booking_id=eq.${bookingId}`,
      }, resync)
    stop = subscribeResync(channel, resync, { onVisible: true, pollMs: 30000 })
  } catch {
    // The slot goes back and the panel polls: a realtime failure must not take the screen down.
    openMemberChannels -= 1
    return poll()
  }
  let released = false
  return () => {
    if (released) return
    released = true
    try { stop() } finally { openMemberChannels -= 1 }
  }
}

// ───────────────────────── Bills ─────────────────────────
// View-model
//   Bill  { id, status: 'open'|'requested'|'paying'|'paid'|'void', total, collected, createdAt,
//           tableNumber, sectionName, shares: Share[], tips: [{ amount, waiterName }] }
//   Share { id, intentId, intentStatus, name, amount, paid, method: 'card'|'reception'|'cash'|null, isDemo, canMarkPaid }
// CONTRACT: restaurant_bills(p_restaurant_id, p_day, p_status) (sql/42d). Omitting p_day returns today's bills
//   (Asia/Baku) plus any bill still open / requested / paying from an earlier day. The DB calls a finished bill
//   'settled'; the screens call it 'paid'. `total` and `collected` include tips; share amounts do not.

function mapShare(s, billActive) {
  const paid = s.status === 'paid' || s.status === 'waived'
  const staffProvider = s.provider === 'reception' || s.provider === 'cash'
  const pendingIntent = s.intent_status === 'requires_action'
  return {
    id: s.share_id,
    intentId: s.intent_id || null,
    intentStatus: s.intent_status || null,
    name: s.name || '',
    amount: Number(s.amount) || 0,
    paid,
    method: ['card', 'reception', 'cash'].includes(s.method) ? s.method : null,
    isDemo: !!s.is_demo,
    // Staff can take the money when nobody is mid card payment: no pending intent yet, or a reception / cash one.
    canMarkPaid: billActive && !paid && (!pendingIntent || staffProvider),
  }
}

function mapBill(b) {
  const active = b.status === 'open' || b.status === 'requested' || b.status === 'paying'
  return {
    id: b.bill_id,
    status: b.status === 'settled' ? 'paid' : b.status,
    total: Number(b.total) || 0,
    collected: Number(b.collected) || 0,
    createdAt: b.created_at,
    tableNumber: b.table?.label ?? '',
    sectionName: b.table?.section || '',
    shares: (b.shares || []).map(s => mapShare(s, active)),
    tips: (b.tips || []).map(t => ({ amount: Number(t.amount) || 0, waiterName: t.waiter_name || '' })),
  }
}

/** Today's (Baku) bills plus any older active one, newest first. */
export async function fetchBills(restaurantId) {
  const res = await run(() => supabase.rpc('restaurant_bills', { p_restaurant_id: restaurantId, p_status: 'all' }))
  if (res.error) return res
  return { data: (res.data || []).map(mapBill), error: null }
}

/**
 * Staff take a share's money. A pending reception / cash payment is confirmed;
 * otherwise the share is settled as cash (sql/42d staff_settle_share).
 */
export async function markSharePaid(share) {
  // CONTRACT: mark_payment_paid(p_intent_id) and staff_settle_share(p_bill_share_id, p_method) (sql/42d)
  if (share.intentId && share.intentStatus === 'requires_action' && share.method !== 'card') {
    return run(() => supabase.rpc('mark_payment_paid', { p_intent_id: share.intentId }))
  }
  return run(() => supabase.rpc('staff_settle_share', { p_bill_share_id: share.id, p_method: 'cash' }))
}

/** Settles every open share of a bill as cash. */
export async function closeBill(billId) {
  // CONTRACT: close_bill(p_bill_id) (sql/42d, staff)
  return run(() => supabase.rpc('close_bill', { p_bill_id: billId }))
}

export function subscribeBills(restaurantId, resync) {
  // CONTRACT: bills and payment_intents are in supabase_realtime and carry restaurant_id (sql/42, 43);
  // a share only changes together with its intent / bill, so these two cover bill_shares.
  const channel = supabase
    .channel(`v2-bills-${restaurantId}-${++channelSeq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bills', filter: `restaurant_id=eq.${restaurantId}` }, resync)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_intents', filter: `restaurant_id=eq.${restaurantId}` }, resync)
  return subscribeResync(channel, resync, { onVisible: true, pollMs: 30000 })
}

// ───────────────────────── QR sheet ─────────────────────────
// View-model: { tables: [{ id, number, capacity, sectionId, sectionName, code|null }], sections: [{ id, name }] }
// `capacity` drives the per-chair cards (seat QR = `<table code>-S<n>`, n = 1..capacity).

export async function fetchQrData(restaurantId) {
  const [tablesRes, codesRes] = await Promise.all([
    // Explicit columns only: `tables` may carry access_code / qr_code_token, which
    // must never be selected from the client.
    run(() => supabase.from('tables').select('id, table_number, capacity, section_id, sections(name)')
      .eq('restaurant_id', restaurantId).eq('is_active', true)),
    // access_code lives in the staff-only table_access_codes.
    run(() => supabase.from('table_access_codes').select('table_id, access_code').eq('restaurant_id', restaurantId)),
  ])
  const error = tablesRes.error || codesRes.error
  if (error) return { data: null, error }

  const codes = new Map((codesRes.data || []).map(c => [c.table_id, c.access_code]))
  const tables = (tablesRes.data || [])
    .map(t => ({
      id: t.id,
      number: String(t.table_number),
      capacity: Math.max(0, Math.floor(Number(t.capacity) || 0)),
      sectionId: t.section_id || '',
      sectionName: t.sections?.name || '',
      code: codes.get(t.id) || null,
    }))
    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))

  const sections = []
  for (const t of tables) {
    if (t.sectionId && !sections.some(s => s.id === t.sectionId)) sections.push({ id: t.sectionId, name: t.sectionName })
  }
  sections.sort((a, b) => a.name.localeCompare(b.name))
  return { data: { tables, sections }, error: null }
}

// ───────────────────────── Settings: hours ─────────────────────────
// View-model: { days: [7 x { dow, isClosed, open, close }] indexed by DB day_of_week (0 = Sunday),
//               closures: [{ id, date, reason }] (today and later) }
// CONTRACT: operating_hours(restaurant_id, day_of_week, open_time, close_time, is_closed) unique per day and
//           special_closures(id, restaurant_id, closed_date, reason); manager writes via is_manager_of (sql/43)

const DEFAULT_OPEN = '09:00'
const DEFAULT_CLOSE = '23:00'

export async function fetchHours(restaurantId) {
  const [hoursRes, closuresRes] = await Promise.all([
    run(() => supabase.from('operating_hours').select('day_of_week, open_time, close_time, is_closed')
      .eq('restaurant_id', restaurantId)),
    run(() => supabase.from('special_closures').select('id, closed_date, reason')
      .eq('restaurant_id', restaurantId).gte('closed_date', bakuDateString()).order('closed_date')),
  ])
  const error = hoursRes.error || closuresRes.error
  if (error) return { data: null, error }

  const byDow = new Map((hoursRes.data || []).map(r => [r.day_of_week, r]))
  // A weekday without a row is closed (the booking functions treat it that way).
  const days = Array.from({ length: 7 }, (_, dow) => {
    const r = byDow.get(dow)
    return r
      ? { dow, isClosed: !!r.is_closed, open: hhmm(r.open_time) || DEFAULT_OPEN, close: hhmm(r.close_time) || DEFAULT_CLOSE }
      : { dow, isClosed: true, open: DEFAULT_OPEN, close: DEFAULT_CLOSE }
  })
  const closures = (closuresRes.data || []).map(c => ({ id: c.id, date: c.closed_date, reason: c.reason || '' }))
  return { data: { days, closures }, error: null }
}

/** Saves all seven weekdays. The DB needs close_time > open_time, so a 00:00 close is stored as 23:59. */
export async function saveHours(restaurantId, days) {
  const rows = days.map(d => ({
    restaurant_id: restaurantId,
    day_of_week: d.dow,
    open_time: d.open,
    close_time: d.close === '00:00' ? '23:59' : d.close,
    is_closed: d.isClosed,
  }))
  const res = await run(() => supabase.from('operating_hours')
    .upsert(rows, { onConflict: 'restaurant_id,day_of_week' }).select('day_of_week'))
  return res.error ? res : checkWrite(res)
}

export async function addClosure(restaurantId, date, reason) {
  const res = await run(() => supabase.from('special_closures')
    .insert({ restaurant_id: restaurantId, closed_date: date, reason: reason || null })
    .select('id, closed_date, reason'))
  if (res.error) return res
  const row = (res.data || [])[0]
  return row
    ? { data: { id: row.id, date: row.closed_date, reason: row.reason || '' }, error: null }
    : checkWrite(res)
}

export async function removeClosure(id) {
  const res = await run(() => supabase.from('special_closures').delete().eq('id', id).select('id'))
  return res.error ? res : checkWrite(res)
}

// ───────────────────────── Settings: booking rules ─────────────────────────
// View-model: { slotStep, turn12, turn34, turn56, turn7, buffer, maxCovers (number|null), maxParty, minNotice,
//               autoCancel, allowWalkIn, groupEnabled, onlineSectionIds (string[]|null = every section),
//               sections: [{ id, name }] }
// CONTRACT: availability_rules(slot_step_minutes, turn_minutes_1_2 / _3_4 / _5_6 / _7_plus, buffer_minutes,
//           max_covers_per_slot, online_section_ids) (sql/41) and restaurant_settings(max_party_size,
//           min_booking_notice, auto_cancel_minutes, allow_walk_in, group_booking_enabled); staff read,
//           manager write (sql/41, 43). Defaults mirror the column defaults.

const RULE_DEFAULTS = {
  slotStep: 30, turn12: 75, turn34: 90, turn56: 105, turn7: 120, buffer: 10, maxCovers: null,
  maxParty: 20, minNotice: 30, autoCancel: 15, allowWalkIn: true, groupEnabled: true, onlineSectionIds: null,
}

export async function fetchBookingRules(restaurantId) {
  const [settingsRes, rulesRes, sectionsRes] = await Promise.all([
    run(() => supabase.from('restaurant_settings')
      .select('max_party_size, min_booking_notice, auto_cancel_minutes, allow_walk_in, group_booking_enabled')
      .eq('restaurant_id', restaurantId).maybeSingle()),
    run(() => supabase.from('availability_rules')
      .select('slot_step_minutes, turn_minutes_1_2, turn_minutes_3_4, turn_minutes_5_6, turn_minutes_7_plus, buffer_minutes, max_covers_per_slot, online_section_ids')
      .eq('restaurant_id', restaurantId).maybeSingle()),
    run(() => supabase.from('sections').select('id, name').eq('restaurant_id', restaurantId).order('name')),
  ])
  const error = settingsRes.error || rulesRes.error || sectionsRes.error
  if (error) return { data: null, error }

  const s = settingsRes.data || {}
  const r = rulesRes.data || {}
  const pick = (v, d) => (v === null || v === undefined ? d : v)
  return {
    data: {
      slotStep: pick(r.slot_step_minutes, RULE_DEFAULTS.slotStep),
      turn12: pick(r.turn_minutes_1_2, RULE_DEFAULTS.turn12),
      turn34: pick(r.turn_minutes_3_4, RULE_DEFAULTS.turn34),
      turn56: pick(r.turn_minutes_5_6, RULE_DEFAULTS.turn56),
      turn7: pick(r.turn_minutes_7_plus, RULE_DEFAULTS.turn7),
      buffer: pick(r.buffer_minutes, RULE_DEFAULTS.buffer),
      maxCovers: pick(r.max_covers_per_slot, RULE_DEFAULTS.maxCovers),
      onlineSectionIds: pick(r.online_section_ids, RULE_DEFAULTS.onlineSectionIds),
      maxParty: pick(s.max_party_size, RULE_DEFAULTS.maxParty),
      minNotice: pick(s.min_booking_notice, RULE_DEFAULTS.minNotice),
      autoCancel: pick(s.auto_cancel_minutes, RULE_DEFAULTS.autoCancel),
      allowWalkIn: pick(s.allow_walk_in, RULE_DEFAULTS.allowWalkIn),
      groupEnabled: pick(s.group_booking_enabled, RULE_DEFAULTS.groupEnabled),
      sections: sectionsRes.data || [],
    },
    error: null,
  }
}

/**
 * Two writes, no transaction: restaurant_settings first, then availability_rules. When the second one fails the
 * first is already stored, so the result carries `data: { partial: true }` next to the error; the screen then
 * reloads what the server holds and says so, instead of showing a plain failure.
 */
export async function saveBookingRules(restaurantId, v) {
  // Only the granted columns are updated: a PostgREST upsert would also rewrite restaurant_id, which managers
  // may not UPDATE (sql/43 column grants), and fail with 42501. The row normally exists (created with the
  // restaurant); insert one when it does not.
  const cols = {
    max_party_size: v.maxParty,
    min_booking_notice: v.minNotice,
    auto_cancel_minutes: v.autoCancel,
    allow_walk_in: v.allowWalkIn,
    group_booking_enabled: v.groupEnabled,
  }
  let settings = await run(() => supabase.from('restaurant_settings')
    .update(cols).eq('restaurant_id', restaurantId).select('restaurant_id'))
  if (!settings.error && (settings.data || []).length === 0) {
    settings = await run(() => supabase.from('restaurant_settings')
      .insert({ restaurant_id: restaurantId, ...cols }).select('restaurant_id'))
  }
  if (settings.error) return settings
  const settingsCheck = checkWrite(settings)
  if (settingsCheck.error) return settingsCheck

  const rules = await run(() => supabase.from('availability_rules').upsert({
    restaurant_id: restaurantId,
    slot_step_minutes: v.slotStep,
    turn_minutes_1_2: v.turn12,
    turn_minutes_3_4: v.turn34,
    turn_minutes_5_6: v.turn56,
    turn_minutes_7_plus: v.turn7,
    buffer_minutes: v.buffer,
    max_covers_per_slot: v.maxCovers,
    online_section_ids: v.onlineSectionIds,
  }, { onConflict: 'restaurant_id' }).select('restaurant_id'))
  const rulesCheck = rules.error ? rules : checkWrite(rules)
  return rulesCheck.error ? { data: { partial: true }, error: rulesCheck.error } : rulesCheck
}

// ───────────────────────── Settings: staff (read-only) ─────────────────────────
// View-model: [{ id, name, role, active }]
// CONTRACT: list_staff(p_restaurant_id) -> jsonb [{ staff_id, user_id, display_name, role, active, created_at }]
// (managers / admins only; raises not_allowed otherwise).

export async function fetchStaffList(restaurantId) {
  const res = await run(() => supabase.rpc('list_staff', { p_restaurant_id: restaurantId }))
  if (res.error) return res
  const rows = Array.isArray(res.data) ? res.data : []
  return {
    data: rows
      .slice()
      .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
      .map(s => ({ id: s.staff_id, name: s.display_name || '', role: s.role, active: !!s.active })),
    error: null,
  }
}
