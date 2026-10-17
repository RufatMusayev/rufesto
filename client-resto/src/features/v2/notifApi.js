// Supabase calls of the staff notifications (V2-CONTRACT 21.2, 21.3, 21.5). Same shape as api.js: every function
// returns { data, error } and never throws. Kept apart from api.js (past its size budget).
//
// CONTRACT (sql/64, sql/64b; not applied yet, PGRST202 / 42883 / PGRST205 = "not deployed", see errors.js isNotReady):
//   notifications_badge() -> { guest_unseen, staff_unseen }
//   my_notifications(p_audience, p_category, p_cursor, p_limit) -> { items, next_cursor, unread }
//   mark_notifications(p_ids, p_read, p_seen_only, p_audience)
//   get_notification_prefs() / set_notification_prefs(p jsonb)
//   push_subscriptions (owner-only select), save_push_subscription(p_endpoint, p_p256dh, p_auth, p_audience,
//   p_user_agent), delete_push_subscription(p_endpoint)

import { supabase } from '../../lib/supabase'
import { firstRow, normaliseItem } from './notifItems'

export const INBOX_PAGE = 30

async function run(fn) {
  try {
    const res = await fn()
    return { data: res?.data ?? null, error: res?.error ?? null }
  } catch (error) {
    return { data: null, error }
  }
}

/** Number of staff notifications whose bell badge was not opened yet. */
export async function fetchStaffBadge() {
  const { data, error } = await run(() => supabase.rpc('notifications_badge'))
  if (error) return { data: null, error }
  const n = Number(firstRow(data)?.staff_unseen)
  return { data: Number.isFinite(n) && n > 0 ? n : 0, error: null }
}

/** One page of the grouped staff inbox: { items, nextCursor, unread }. `cursor` = the previous page's next_cursor. */
export async function fetchStaffInbox({ cursor = null, limit = INBOX_PAGE } = {}) {
  const args = { p_audience: 'staff', p_limit: limit }
  if (cursor) args.p_cursor = cursor
  const { data, error } = await run(() => supabase.rpc('my_notifications', args))
  if (error) return { data: null, error }
  const row = firstRow(data) || {}
  return {
    data: {
      items: (Array.isArray(row.items) ? row.items : []).map(normaliseItem),
      nextCursor: row.next_cursor || null,
      unread: Math.max(0, Number(row.unread) || 0),
    },
    error: null,
  }
}

/**
 * Writes through mark_notifications for the staff audience. { seenOnly: true } clears the bell badge only (opening
 * the panel); { ids: [...] } marks those rows read; ids null (the default) = every staff row read.
 */
export function markStaffNotifications({ ids = null, seenOnly = false } = {}) {
  const args = { p_audience: 'staff' }
  if (seenOnly) args.p_seen_only = true
  else args.p_read = true
  if (Array.isArray(ids)) {
    if (!ids.length) return Promise.resolve({ data: null, error: null }) // nothing to mark; never "all" by accident
    args.p_ids = ids
  }
  return run(() => supabase.rpc('mark_notifications', args))
}

/** { [table id]: table number } of the given restaurants (the payload of bill / join events has only the id). */
export async function fetchTableNumbers(restaurantIds) {
  const ids = [...new Set((restaurantIds || []).filter(Boolean))]
  if (!ids.length) return { data: {}, error: null }
  const { data, error } = await run(() => supabase.from('tables').select('id, table_number').in('restaurant_id', ids))
  if (error) return { data: null, error }
  const map = {}
  for (const row of data || []) map[row.id] = row.table_number
  return { data: map, error: null }
}

/** Whether the caller owns a saved subscription for this endpoint (RLS: own rows only). */
export async function fetchOwnsPushEndpoint(endpoint) {
  const { data, error } = await run(() => supabase.from('push_subscriptions').select('id').eq('endpoint', endpoint).limit(1))
  if (error) return { data: null, error }
  return { data: Array.isArray(data) && data.length > 0, error: null }
}

/** Saves (upserts by endpoint, re-owning it to the caller) this device's subscription for the staff audience. */
export function saveStaffPushSubscription({ endpoint, p256dh, auth }) {
  return run(() => supabase.rpc('save_push_subscription', {
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_audience: 'staff',
    p_user_agent: String(navigator.userAgent || '').slice(0, 300),
  }))
}

export function deletePushSubscription(endpoint) {
  return run(() => supabase.rpc('delete_push_subscription', { p_endpoint: endpoint }))
}

/**
 * The delivery trigger sends only when the recipient's notification_prefs.push_enabled is true (21.3), so turning a
 * device on also turns the flag on. Best effort: the subscription is already saved, so a failure here is ignored
 * by the caller (the flag may already be true, or set_notification_prefs may not be deployed).
 */
export async function ensurePushEnabled() {
  const prefs = await run(() => supabase.rpc('get_notification_prefs'))
  if (prefs.error) return prefs
  if (firstRow(prefs.data)?.push_enabled === true) return { data: true, error: null }
  return run(() => supabase.rpc('set_notification_prefs', { p: { push_enabled: true } }))
}
