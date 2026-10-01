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
