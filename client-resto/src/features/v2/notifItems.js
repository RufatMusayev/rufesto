// Staff notifications (V2-CONTRACT 21.5): pure helpers, no React and no Supabase. The bell, the panel and the
// provider share them: item normalisation, what an item says (title, detail), where a tap goes, day sections.
//
// CONTRACT 21.2: my_notifications('staff') -> { items, next_cursor, unread }; an item is
//   { id, ids, type, category, group_key, count, actors, latest_at, read, payload (jsonb), target { kind, id, slug } }.
// Payload keys read here come from the live producers (sql/34, 42, 41b, 49): waiter_called { table_id,
// table_number, restaurant_id, kind }, bill_requested { table_id, restaurant_id, bill_id, amount_due, people },
// booking_created { booking_id, starts_at, party_size, host }, join_request { table_id, name }. review_received and
// stock_alert (sql/64) are read defensively (dish_name / rating, ingredient_name): a missing key just drops that
// part of the detail line.

import { formatPrice } from '@shared/helpers'
import { addDays, bakuDateString } from './dates'
import { bakuTimeLabel } from '../../lib/time'

/** Types that make the optional chime play while the dashboard is open. */
export const CHIME_TYPES = ['waiter_called', 'bill_requested']

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

/** One inbox item in the shape the screens use (camelCase, payload parsed, ids never empty). */
export function normaliseItem(raw) {
  const ids = Array.isArray(raw?.ids) && raw.ids.length ? raw.ids : [raw?.id].filter(Boolean)
  return {
    id: raw?.id,
    ids,
    type: String(raw?.type || ''),
    category: raw?.category || null,
    groupKey: raw?.group_key || null,
    count: Math.max(1, Number(raw?.count) || 1),
    latestAt: raw?.latest_at || null,
    read: !!raw?.read,
    payload: parsePayload(raw?.payload),
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
    case 'waiter':
      return {
        title: join([table, t('v2:notifWaiterCalled')]),
        detail: p.kind ? t(`v2:notifKind_${p.kind}`, { defaultValue: '' }) : '',
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

/**
 * Day sections (Baku calendar, the restaurant's clock): [{ key: 'today'|'yesterday'|'earlier', items }], newest
 * first, empty sections left out. `items` must already be newest first.
 */
export function groupByDay(items, now = new Date()) {
  const today = bakuDateString(now)
  const yesterday = addDays(today, -1)
  const sections = { today: [], yesterday: [], earlier: [] }
  for (const item of items) {
    const day = item.latestAt ? bakuDateString(new Date(item.latestAt)) : ''
    if (day === today) sections.today.push(item)
    else if (day === yesterday) sections.yesterday.push(item)
    else sections.earlier.push(item)
  }
  return ['today', 'yesterday', 'earlier'].filter(k => sections[k].length).map(key => ({ key, items: sections[key] }))
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
