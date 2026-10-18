// Staff notifications (V2-CONTRACT 21.5): pure helpers, no React and no Supabase. The bell, the panel and the
// provider share them: item normalisation, what an item says (title, detail), where a tap goes, the inline action,
// "Needs you" / "Earlier" sections (rolling windows, not calendar days), rows folded by table, the short time.
//
// CONTRACT 21.2: my_notifications('staff') -> { items, next_cursor, unread }; an item is
//   { id, ids, type, category, group_key, count, actors, latest_at, read, payload (jsonb), target { kind, id, slug } }.
// Payload keys read here come from the live producers (sql/34, 42, 41b, 49, 66): waiter_called { request_id, table_id,
// table_number, restaurant_id, kind }, bill_requested { table_id, restaurant_id, bill_id, amount_due, people },
// bill_paid { table_id, table_number, restaurant_id, bill_id, intent_id, amount (card charge: food + tip), food, tip,
// method, payer }, booking_created { booking_id, starts_at, party_size, host }, join_request { table_id, name }.
// review_received and stock_alert (sql/64) are read defensively (dish_name / rating, ingredient_name): a missing key
// just drops that part of the detail line.

import { formatPrice } from '../../lib/format'
import { bakuDateString } from './dates'
import { bakuTimeLabel } from '../../lib/time'

/** Types that make the optional chime play while the dashboard is open. bill_paid (sql/66) took over the card payments that used to arrive as bill_requested, so it keeps the chime they had. */
export const CHIME_TYPES = ['waiter_called', 'bill_requested', 'bill_paid']

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The payload as an object, whether it arrived as jsonb or as the text the older producers store. */
export function parsePayload(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const v = JSON.parse(raw)
      if (v && typeof v === 'object' && !Array.isArray(v)) return v
    } catch { /* not JSON: no payload */ }
  }
  return {}
}

const uuidList = list => [...new Set(list.filter(v => typeof v === 'string' && UUID.test(v)))]

/** One inbox item in the shape the screens use (camelCase, payload parsed, ids never empty). */
export function normaliseItem(raw) {
  const ids = Array.isArray(raw?.ids) && raw.ids.length ? raw.ids : [raw?.id].filter(Boolean)
  const payload = parsePayload(raw?.payload)
  return {
    id: raw?.id,
    ids,
    type: String(raw?.type || ''),
    category: raw?.category || null,
    groupKey: raw?.group_key || null,
    count: Math.max(1, Number(raw?.count) || 1),
    latestAt: raw?.latest_at || null,
    read: !!raw?.read,
    payload,
    payloads: [payload], // every payload of the row; collapseItems adds those of the rows it folds in
    requestIds: uuidList([payload.request_id]),
    target: raw?.target && typeof raw.target === 'object' ? raw.target : null,
  }
}

/** The RPC answers one jsonb object; a table-returning variant would wrap it in an array. */
export function firstRow(data) {
  return Array.isArray(data) ? data[0] ?? null : data
}

/** Icon / wording family of a notification type. */
export function itemKind(type) {
  const ty = String(type || '')
  if (ty === 'bill_requested') return 'bill'
  if (ty === 'bill_paid') return 'paid'
  if (ty === 'waiter_called') return 'waiter'
  if (ty.startsWith('join_request')) return 'join'
  if (ty === 'booking_created') return 'booking'
  if (ty === 'review_received') return 'review'
  if (ty === 'stock_alert') return 'stock'
  return 'generic'
}

/** The table an item is about (payload first, then a table target), or null. */
export function itemTableId(item) {
  const id = item.payload.table_id || (item.target?.kind === 'table' ? item.target.id : null)
  return typeof id === 'string' && UUID.test(id) ? id : null
}

/** restaurant_id of the item (payload), or null. */
export function itemRestaurantId(item) {
  const id = item.payload.restaurant_id
  return typeof id === 'string' && UUID.test(id) ? id : null
}

/**
 * Where a tap goes: the first page of the role's choice it may open, or null (the tap then only marks it read).
 * `canOpen(path)` is lib/roles.js canAccess bound to the role. Bills narrows to the table (?table=<id>);
 * the others open the page that works the event: Waiter (calls, join requests), Bookings, Menu (reviews, stock).
 */
export function itemTarget(item, canOpen) {
  const tableId = itemTableId(item)
  const byKind = {
    bill: [tableId ? `/bills?table=${encodeURIComponent(tableId)}` : '/bills', '/waiter'],
    paid: [tableId ? `/bills?table=${encodeURIComponent(tableId)}` : '/bills', '/waiter'],
    waiter: ['/waiter'],
    join: ['/waiter'],
    booking: ['/bookings'],
    review: ['/menu'],
    stock: ['/menu'],
  }
  const candidates = byKind[itemKind(item.type)] || []
  return candidates.find(path => canOpen(path.split('?')[0])) || null
}

function tableLabel(item, tableNumbers, t) {
  const n = item.payload.table_number ?? tableNumbers?.[itemTableId(item)]
  return n != null && n !== '' ? t('common:tableLabel', { number: n }) : null
}

const join = parts => parts.filter(Boolean).join(' · ')

// "18.10, 19:30" on the restaurant's clock. Numeric on purpose: a browser without Azerbaijani month names prints "M10".
function bookingWhen(startsAt, lang) {
  const d = new Date(startsAt)
  if (!startsAt || Number.isNaN(d.getTime())) return null
  const [, month, day] = bakuDateString(d).split('-')
  return `${day}.${month}, ${bakuTimeLabel(d, lang)}`
}

/** What the row says: { title, detail } (translated; `detail` may be ''). `t` needs the v2, common namespaces. */
export function itemText(item, { t, lang, tableNumbers }) {
  const p = item.payload
  const table = tableLabel(item, tableNumbers, t)
  switch (itemKind(item.type)) {
    case 'bill': {
      const amount = Number(p.amount_due)
      const people = Number(p.people)
      return {
        title: join([table, t('v2:notifBillRequested')]),
        detail: join([
          Number.isFinite(amount) && p.amount_due != null ? formatPrice(amount) : null,
          people > 1 ? t('v2:notifGuests', { count: people }) : null,
        ]),
      }
    }
    case 'paid': {
      // sql/66 trg_notify_bill_paid. amount = what the card was charged (share + tip, so it already holds the tip);
      // tip is shown beside it, never added on top. A folded row (x2) adds up its payments.
      const has = v => v != null && v !== '' && Number.isFinite(Number(v))
      let total = null
      let tip = 0
      const payers = []
      for (const q of item.payloads) {
        const qTip = has(q.tip) ? Number(q.tip) : 0
        const qTotal = has(q.amount) ? Number(q.amount) : has(q.food) ? Number(q.food) + qTip : null
        if (qTotal != null) total = (total ?? 0) + qTotal
        tip += qTip
        const name = typeof q.payer === 'string' ? q.payer.trim() : ''
        if (name && !payers.includes(name)) payers.push(name)
      }
      const who = table || t('v2:notifTableFallback')
      const byCard = item.payloads.every(q => !q.method || q.method === 'card')
      const title = total == null
        ? t('v2:notifBillPaidNoAmount', { table: who })
        : t(byCard ? 'v2:notifBillPaid' : 'v2:notifBillPaidPlain', { table: who, amount: formatPrice(Math.round(total * 100) / 100) })
      return {
        title,
        detail: join([
          payers.length ? t('v2:notifPaidBy', { name: payers.join(', ') }) : null,
          tip > 0 ? t('v2:notifPaidTip', { amount: formatPrice(Math.round(tip * 100) / 100) }) : null,
        ]),
      }
    }
    case 'waiter': {
      // A folded row (x3) lists every kind asked for, oldest first: "Water · Cutlery · Cleaning".
      const kinds = [...new Set([...item.payloads].reverse().map(q => q.kind).filter(Boolean))]
      const detail = kinds.length > 1
        ? join(kinds.map(k => t(`v2:notifKindShort_${k}`, { defaultValue: '' })))
        : p.kind ? t(`v2:notifKind_${p.kind}`, { defaultValue: '' }) : ''
      return { title: join([table, t('v2:notifWaiterCalled')]), detail }
    }
    case 'join': {
      const name = typeof p.name === 'string' ? p.name.trim() : ''
      return {
        title: join([table, t('v2:notifJoinRequest')]),
        detail: name ? t('v2:notifJoinDetail', { name }) : t('v2:notifJoinDetailAnon'),
      }
    }
    case 'booking': {
      const size = Number(p.party_size)
      return {
        title: t('v2:notifBookingCreated'),
        detail: join([
          typeof p.host === 'string' ? p.host.trim() : null,
          size > 0 ? t('v2:notifGuests', { count: size }) : null,
          bookingWhen(p.starts_at, lang),
        ]),
      }
    }
    case 'review': {
      const rating = Number(p.rating)
      return {
        title: t('v2:notifReviewReceived'),
        detail: join([
          p.dish_name || p.dish || null,
          Number.isFinite(rating) && p.rating != null ? `★ ${rating}` : null,
        ]),
      }
    }
    case 'stock':
      return {
        title: t('v2:notifStockAlert'),
        detail: join([p.ingredient_name || p.ingredient || p.name || null]),
      }
    default:
      return { title: t('v2:notifGeneric'), detail: '' }
  }
}

const MIN = 60 * 1000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/** How long an unread alert stays under "Needs you". */
export const NEEDS_WINDOW_MS = 2 * HOUR
/** Rows of the same type for the same table closer together than this fold into one row (x2). */
export const GROUP_WINDOW_MS = 10 * MIN

const NEEDS_KINDS = new Set(['waiter', 'bill', 'paid', 'join'])

const msOf = value => {
  const ms = value ? new Date(value).getTime() : NaN
  return Number.isFinite(ms) ? ms : null
}

/**
 * Folds rows of the same type for the same table that arrived within 10 minutes of each other into one (the newest
 * leads; counts add up; every id and request id is kept, so one tap marks or acknowledges them all). Rows without a
 * table, and rows further apart, stay as they are. `items` must be newest first.
 */
export function collapseItems(items, windowMs = GROUP_WINDOW_MS) {
  const out = []
  const lead = new Map() // `${type}|${table id}` -> the row a later one may still join
  for (const item of items) {
    const tableId = itemTableId(item)
    const key = tableId ? `${item.type}|${tableId}` : null
    const group = key ? lead.get(key) : null
    const at = msOf(item.latestAt)
    const groupAt = group ? msOf(group.latestAt) : null
    if (group && at != null && groupAt != null && groupAt - at <= windowMs) {
      group.count += item.count
      group.ids = [...group.ids, ...item.ids.filter(id => !group.ids.includes(id))]
      group.payloads = [...group.payloads, ...item.payloads]
      group.requestIds = [...group.requestIds, ...item.requestIds.filter(id => !group.requestIds.includes(id))]
      group.read = group.read && item.read
      continue
    }
    const next = { ...item }
    out.push(next)
    if (key) lead.set(key, next)
  }
  return out
}

/**
 * What a waiter_called row knows about its request(s). `requests` is { [request id]: { status, by } } read by the
 * provider (by = 'me' | 'other' | null). -> { state: 'none' | 'unknown' | 'open' | 'acked' | 'done' | 'cancelled', by }.
 * A folded row stays 'open' while any of its requests is, so "On my way" can still take the rest.
 */
export function requestState(item, requests) {
  const ids = item.requestIds || []
  if (!ids.length) return { state: 'none', by: null }
  const found = ids.map(id => requests?.[id]).filter(Boolean)
  if (found.length < ids.length) return { state: 'unknown', by: null }
  if (found.some(r => r.status === 'open')) return { state: 'open', by: null }
  const acked = found.filter(r => r.status === 'acknowledged')
  if (acked.length) return { state: 'acked', by: acked.every(r => r.by === 'me') ? 'me' : acked.find(r => r.by !== 'me').by }
  return { state: found.every(r => r.status === 'cancelled') ? 'cancelled' : 'done', by: null }
}

const SETTLED = new Set(['acked', 'done', 'cancelled'])

/**
 * "Needs you" = unread waiter calls, bill requests, join requests and card payments younger than 2 hours, minus
 * calls somebody already took. Everything else is "Earlier". Rolling windows, so a row never says "Yesterday" a few
 * minutes after midnight. -> [{ key: 'needs' | 'earlier', items }], empty sections left out, order kept.
 */
export function splitSections(items, { now = Date.now(), requests = {} } = {}) {
  const needs = []
  const earlier = []
  for (const item of items) {
    const at = msOf(item.latestAt)
    const kind = itemKind(item.type)
    const attention = !item.read && at != null && now - at < NEEDS_WINDOW_MS && NEEDS_KINDS.has(kind)
    const taken = kind === 'waiter' && SETTLED.has(requestState(item, requests).state)
    if (attention && !taken) needs.push(item)
    else earlier.push(item)
  }
  return [{ key: 'needs', items: needs }, { key: 'earlier', items: earlier }].filter(s => s.items.length)
}

/**
 * The one inline action of a row, or null: waiter_called -> 'ack' (On my way), bill_requested / bill_paid -> 'bill'
 * (Open bill), booking_created -> 'view'. `canOpen(path)` is lib/roles.js canAccess bound to the role: a role that
 * cannot open the target page gets no button (the row tap still goes where itemTarget says).
 */
export function itemAction(item, canOpen) {
  switch (itemKind(item.type)) {
    case 'waiter': return item.requestIds.length && canOpen('/waiter') ? 'ack' : null
    case 'bill':
    case 'paid': return canOpen('/bills') ? 'bill' : null
    case 'booking': return canOpen('/bookings') ? 'view' : null
    default: return null
  }
}

/**
 * Short relative time for the right edge of a row: now, 5m, 3h, 2d, 3w, then 12 Oct (plus the year when it is not
 * this year). Words and month names come from the v2 locale files (`t` needs the v2 namespace).
 */
export function shortTime(value, { t, now = Date.now() }) {
  const at = msOf(value)
  if (at == null) return ''
  const diff = Math.max(0, now - at)
  if (diff < MIN) return t('v2:notifTimeNow')
  if (diff < HOUR) return t('v2:notifTimeMin', { n: Math.floor(diff / MIN) })
  if (diff < DAY) return t('v2:notifTimeHour', { n: Math.floor(diff / HOUR) })
  if (diff < 7 * DAY) return t('v2:notifTimeDay', { n: Math.floor(diff / DAY) })
  if (diff < 28 * DAY) return t('v2:notifTimeWeek', { n: Math.floor(diff / (7 * DAY)) })
  const [year, month, day] = bakuDateString(new Date(at)).split('-').map(Number)
  const thisYear = Number(bakuDateString(new Date(now)).slice(0, 4))
  const params = { day, month: t(`v2:notifMonth_${month}`), year }
  return t(year === thisYear ? 'v2:notifTimeDate' : 'v2:notifTimeDateYear', params)
}

/**
 * Folds a freshly loaded first page into the list on screen (live events while the panel is open, or a refresh)
 * without dropping pages the user already scrolled to. A group's id is its latest row's id, so a group that got a
 * new row shows up under a new id: anything on screen at least as new as the oldest fresh item is superseded.
 */
export function mergeFirstPage(current, fresh) {
  if (!current.items.length || !fresh.nextCursor) return fresh
  const oldest = fresh.items[fresh.items.length - 1]?.latestAt
  const ids = new Set(fresh.items.map(i => i.id))
  const older = current.items.filter(i => !ids.has(i.id) && oldest && i.latestAt && i.latestAt < oldest)
  const extended = older.length > 0
  return {
    items: [...fresh.items, ...older],
    nextCursor: extended ? current.nextCursor : fresh.nextCursor,
    unread: fresh.unread,
  }
}
