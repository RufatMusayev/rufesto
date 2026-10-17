// Every database call of the notifications feature (docs/V2-CONTRACT.md section 21.2 / 21.3), in one place.
//
// The SQL (sql/64, sql/64b) may not be applied on a given stack yet. Each RPC remembers once per page load that it
// answered PGRST202 ("function not found") and from then on the feature runs the pre-v2 way: the inbox reads the
// `notifications` table (grouping likes and comments itself), the bell counts unread rows, "read" updates the table.
// Nothing here throws: every call resolves { data, error }.
import { supabase } from '../../lib/supabase'
import { STAFF_TYPES, categoryOfType, parsePayload } from '../../lib/notificationView'

const MISSING_CODES = new Set(['PGRST202', '42883', 'PGRST205', '42P01'])
export const isMissing = e => !!e && (MISSING_CODES.has(e.code) || e.missing === true || /could not find the function|schema cache/i.test(e.message || ''))

// per RPC: null = not tried yet, true = works, false = does not exist on this stack
const avail = { list: null, badge: null, mark: null, prefs: null, setPrefs: null, push: null, unpush: null }

async function rpc(key, name, args) {
  if (avail[key] === false) return { data: null, error: { code: 'PGRST202', missing: true, message: `${name} is not available` } }
  try {
    const { data, error } = await supabase.rpc(name, args)
    if (error) {
      if (isMissing(error)) { avail[key] = false; return { data: null, error: { ...error, missing: true } } }
      return { data: null, error }
    }
    avail[key] = true
    return { data, error: null }
  } catch (e) {
    return { data: null, error: { code: 'network', message: e?.message || 'network error' } }
  }
}

/** True while the v2 inbox RPC is known to be missing (the page shows today's behaviour). */
export const inboxIsLegacy = () => avail.list === false

const one = d => (Array.isArray(d) ? d[0] : d)

// the signed-in user's id (from the local session, no request): the pre-v2 paths filter on it like they always did
async function myId() {
  try { return (await supabase.auth.getSession()).data.session?.user?.id || null } catch { return null }
}

/* --------------------------------------------------------------------- inbox */

function mapActor(a) {
  if (!a || typeof a !== 'object') return null
  return { id: a.id || null, name: a.name || null, photo: a.profile_photo || a.photo || null }
}

const RELATIONS = new Set(['friends', 'incoming', 'outgoing', 'none'])
const FRIEND_STATES = new Set(['accepted', 'declined', 'cancelled'])

/**
 * Where a friend request stands, from what the row says: sql/67 sends `actor_relation` ('friends' | 'incoming' | 'outgoing' |
 * 'none') and `friendship_id` (the pending incoming request); an answered request also carries payload.status. Result:
 * 'pending' (Confirm / Delete), 'accepted', 'gone' (declined or cancelled: the row is hidden) or null (not a request, or
 * unknown: before sql/67 the row stays a plain line).
 */
function friendStatusOf(r) {
  if (r.type !== 'friend_request') return null
  const p = parsePayload(r.payload)
  const s = p && FRIEND_STATES.has(p.status) ? p.status : null
  if (s === 'declined' || s === 'cancelled') return 'gone'
  if (s === 'accepted' || r.actor_relation === 'friends') return 'accepted'
  if (r.actor_relation === 'incoming' && r.friendship_id) return 'pending'
  return null
}

function mapItem(r) {
  const ids = Array.isArray(r.ids) && r.ids.length ? r.ids : [r.id]
  return {
    id: r.id,
    ids,
    type: r.type,
    category: r.category || categoryOfType(r.type),
    groupKey: r.group_key || null,
    count: Math.max(Number(r.count) || 1, 1),
    actors: (Array.isArray(r.actors) ? r.actors : []).map(mapActor).filter(Boolean),
    at: r.latest_at || r.sent_at,
    read: !!r.read,
    // sql/67: every row of the group is seen. Before it, unread stands in for unseen, so "New" still means "since you last looked".
    seen: r.seen == null ? !!r.read : !!r.seen,
    thumb: typeof r.thumb === 'string' && r.thumb ? r.thumb : null,
    actorRelation: RELATIONS.has(r.actor_relation) ? r.actor_relation : null,
    friendshipId: r.friendship_id || null,
    friendStatus: friendStatusOf(r),
    payload: r.payload,
    target: r.target && typeof r.target === 'object' ? r.target : null,
  }
}

/* The pre-v2 path: rows of the table, collapsed here the way sql/64 collapses them (same post, within 48 h). */
const GROUPED_LEGACY = { post_like: 'post_id', post_comment: 'post_id' }
const WINDOW_MS = 48 * 3600 * 1000

function rowActor(row) {
  const p = parsePayload(row.payload)
  if (!p || !(p.name || p.user_id)) return null
  return { id: p.user_id || null, name: p.name || null, photo: null }
}

function groupLegacy(rows) {
  const items = []
  const open = new Map()                       // type + entity -> the item still collecting
  for (const r of rows) {                      // newest first
    const p = parsePayload(r.payload)
    const field = GROUPED_LEGACY[r.type]
    const entity = field && p && p[field]
    const key = entity ? `${r.type}:${entity}` : null
    const head = key ? open.get(key) : null
    const actor = rowActor(r)
    if (head && new Date(head.at) - new Date(r.sent_at) <= WINDOW_MS) {
      head.ids.push(r.id)
      head.count += 1
      head.read = head.read && !!r.read
      if (actor && head.actors.length < 3 && !head.actors.some(a => a.id && a.id === actor.id)) head.actors.push(actor)
      continue
    }
    const item = {
      id: r.id, ids: [r.id], type: r.type, category: categoryOfType(r.type), groupKey: key, count: 1,
      actors: actor ? [actor] : [], at: r.sent_at, read: !!r.read, seen: !!r.read, thumb: null, actorRelation: null,
      friendshipId: null, friendStatus: null, payload: r.payload, target: null,
    }
    items.push(item)
    if (key) open.set(key, item)
  }
  return items
}

async function fetchLegacyInbox({ cursor, limit }) {
  const uid = await myId()
  if (!uid) return { data: { items: [], nextCursor: null, unread: 0 }, error: null }
  let q = supabase.from('notifications').select('id, type, payload, read, sent_at')
    .eq('user_id', uid).order('sent_at', { ascending: false }).limit(limit)
  q = q.not('type', 'in', `(${STAFF_TYPES.join(',')})`)
  if (cursor) q = q.lt('sent_at', cursor)
  const { data, error } = await q
  if (error) return { data: null, error }
  const rows = data || []
  const items = groupLegacy(rows)
  return {
    data: {
      items,
      nextCursor: rows.length >= limit ? rows[rows.length - 1].sent_at : null,
      unread: items.filter(i => !i.read).length,
    },
    error: null,
  }
}

/**
 * One page of the guest inbox: { items, nextCursor, unread } (items grouped, newest first). The inbox has no category chips
 * any more, so p_category is never sent. `cursor` is the previous page's nextCursor.
 */
export async function fetchInbox({ cursor = null, limit = 30 } = {}) {
  const res = await rpc('list', 'my_notifications', {
    p_audience: 'guest', p_cursor: cursor, p_limit: limit,
  })
  if (!res.error) {
    const d = one(res.data) || {}
    return {
      data: {
        items: (Array.isArray(d.items) ? d.items : []).map(mapItem),
        nextCursor: d.next_cursor || null,
        unread: Number(d.unread) || 0,
      },
      error: null,
    }
  }
  if (res.error.missing) return fetchLegacyInbox({ cursor, limit })
  return res
}

/* ----------------------------------------------------------------- bell badge */

/** Number for the bell: rows not yet seen (v2), else unread rows of guest types (pre-v2). 0 on any error. */
export async function fetchBadge() {
  const res = await rpc('badge', 'notifications_badge', {})
  if (!res.error) return Number(one(res.data)?.guest_unseen) || 0
  if (!res.error.missing) return null          // keep the number on screen when a read fails
  const uid = await myId()
  if (!uid) return 0
  const { count, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true })
    .eq('user_id', uid).eq('read', false).not('type', 'in', `(${STAFF_TYPES.join(',')})`)
  return error ? null : (count || 0)
}

/** True when the badge counts "unseen" (opening the inbox clears it), false in the pre-v2 mode (it counts unread). */
export const badgeIsSeenBased = () => avail.badge !== false

/** Opening the bell: clears the badge without marking the items read. A no-op before sql/64. */
export async function markAllSeen() {
  if (avail.badge === false) return { data: null, error: null }
  return rpc('mark', 'mark_notifications', { p_seen_only: true, p_audience: 'guest' })
}

/* ------------------------------------------------------------------ mark read */

/** Mark these row ids read (a tapped group passes all of its ids). */
export async function markRead(ids) {
  if (!ids || !ids.length) return { data: null, error: null }
  const res = await rpc('mark', 'mark_notifications', { p_ids: ids, p_read: true, p_seen_only: false, p_audience: 'guest' })
  if (res.error?.missing) {
    const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', (await myId()) || '').in('id', ids)
    return { data: null, error }
  }
  return res
}

/** "Mark all read" for the guest audience (every row, not only the loaded page). */
export async function markAllRead() {
  const res = await rpc('mark', 'mark_notifications', { p_read: true, p_seen_only: false, p_audience: 'guest' })
  if (res.error?.missing) {
    const { error } = await supabase.from('notifications').update({ read: true }).eq('user_id', (await myId()) || '').eq('read', false)
      .not('type', 'in', `(${STAFF_TYPES.join(',')})`)
    return { data: null, error }
  }
  return res
}

/* ---------------------------------------------------------------- preferences */

export const PREF_DEFAULTS = {
  social: true, dinein: true, bookings: true, places: true, staff: true,
  push_enabled: false, quiet_from: null, quiet_to: null, language: null,
}

const hhmm = v => (typeof v === 'string' && /^\d{2}:\d{2}/.test(v) ? v.slice(0, 5) : null)

/** { data: prefs, error }; `error.missing` while sql/64 is not applied. A user without a row gets the defaults. */
export async function getPrefs() {
  const res = await rpc('prefs', 'get_notification_prefs', {})
  if (res.error) return res
  const d = one(res.data) || {}
  return {
    data: { ...PREF_DEFAULTS, ...d, quiet_from: hhmm(d.quiet_from), quiet_to: hhmm(d.quiet_to) },
    error: null,
  }
}

/** Save some of the prefs ({ social: false } / { quiet_from: '22:00', quiet_to: '08:00' } / both null). Unknown keys are ignored server side. */
export async function setPrefs(patch) {
  return rpc('setPrefs', 'set_notification_prefs', { p: patch })
}

/* ------------------------------------------------------------ push subscriptions */

/** save_push_subscription: upserts by endpoint and re-owns it to the caller. */
export async function savePushSubscription({ endpoint, p256dh, auth, userAgent }) {
  return rpc('push', 'save_push_subscription', {
    p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth, p_audience: 'guest', p_user_agent: userAgent || null,
  })
}

export async function deletePushSubscription(endpoint) {
  return rpc('unpush', 'delete_push_subscription', { p_endpoint: endpoint })
}

/** Does the server hold this endpoint for the signed-in guest? null when it cannot tell (table missing, offline). */
export async function hasSavedSubscription(endpoint) {
  try {
    const { data, error } = await supabase.from('push_subscriptions').select('id').eq('endpoint', endpoint).maybeSingle()
    if (error) return null
    return !!data
  } catch { return null }
}

/** How many push subscriptions the signed-in guest still has (any device). null when it cannot tell. */
export async function countSavedSubscriptions() {
  try {
    const { count, error } = await supabase.from('push_subscriptions').select('id', { count: 'exact', head: true })
    return error ? null : (count || 0)
  } catch { return null }
}
