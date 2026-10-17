// Shared display helpers for the waiter page (pages/WaiterPage.jsx and the
// tab components in this folder) — request kind icons/labels and table state
// labels. Also used by TablesPage. (RPC error mapping lives in lib/errors.js.)

export const REQUEST_KIND_ICON = {
  assist:  '🙋',
  water:   '💧',
  cutlery: '🍴',
  clean:   '🧹',
}

export const REQUEST_KIND_LABEL_KEY = {
  assist:  'waiterKindAssist',
  water:   'waiterKindWater',
  cutlery: 'waiterKindCutlery',
  clean:   'waiterKindClean',
}

export function requestKindIcon(kind) {
  return REQUEST_KIND_ICON[kind] || REQUEST_KIND_ICON.assist
}

export function requestKindLabelKey(kind) {
  return REQUEST_KIND_LABEL_KEY[kind] || REQUEST_KIND_LABEL_KEY.assist
}

// table_state -> translated label (@shared/constants' TABLE_COLORS labels are
// English-only). Used by the waiter tabs and TablesPage.
export const TABLE_STATE_LABEL_KEY = {
  free: 'stateFree', reserved: 'stateReserved', occupied: 'stateOccupied',
  ordering: 'stateOrdering', awaiting_payment: 'stateAwaitingPay', cleared: 'stateCleared',
  maintenance: 'stateMaintenance',
}

/** Falls back to the raw state string for a value this dashboard has no
 *  copy for yet, instead of rendering a missing key. */
export function tableStateLabel(t, state) {
  const key = TABLE_STATE_LABEL_KEY[state]
  return key ? t(`dashboard:${key}`) : state
}

// An open call is "urgent" once it's been waiting 3+ minutes.
const URGENT_AFTER_MS = 3 * 60 * 1000

export function isUrgent(createdAt, now) {
  if (!createdAt) return false
  return now - new Date(createdAt).getTime() >= URGENT_AFTER_MS
}

// ── Order facts per table (All Tables / My Tables cards) ──
// waiter_overview() knows guests, calls and the amount due but not what the kitchen is doing, so the page also reads
// the live orders (not paid / cancelled / refunded) and boils them down per table.

/** Which order state a waiter should see first: food waiting to be picked up beats food still cooking, and so on. */
const ORDER_STATE_PRIORITY = ['ready', 'preparing', 'submitted', 'open', 'served']

const rank = status => {
  const i = ORDER_STATE_PRIORITY.indexOf(status)
  return i === -1 ? ORDER_STATE_PRIORITY.length : i
}

/**
 * { [tableId]: { status, oldest } } from live orders ({ table_id, status, placed_at }).
 * `status` = the most pressing order state at the table, `oldest` = when its first live order was placed (the age of
 * the visit as far as the kitchen knows it).
 */
export function summariseTableOrders(orders) {
  const byTable = {}
  for (const o of orders || []) {
    if (!o.table_id) continue
    const cur = byTable[o.table_id] || { status: o.status, oldest: o.placed_at }
    if (rank(o.status) < rank(cur.status)) cur.status = o.status
    if (o.placed_at && (!cur.oldest || o.placed_at < cur.oldest)) cur.oldest = o.placed_at
    byTable[o.table_id] = cur
  }
  return byTable
}

/** { [tableId]: order[] } - the live orders of each table, the oldest first (the order a kitchen cooks them in). */
export function groupOrdersByTable(orders) {
  const byTable = {}
  for (const o of orders || []) {
    if (!o.table_id) continue
    ;(byTable[o.table_id] = byTable[o.table_id] || []).push(o)
  }
  for (const list of Object.values(byTable)) list.sort((a, b) => String(a.placed_at).localeCompare(String(b.placed_at)))
  return byTable
}

/** A table whose party has paid and left; it stays "cleared" until a floor role resets it to free. */
export const CLEARED_STATE = 'cleared'
