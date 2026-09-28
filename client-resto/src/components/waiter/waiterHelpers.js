// Shared display helpers for the waiter page (pages/WaiterPage.jsx and the
// tab components in this folder) — request kind icons/labels, table state
// labels, and RPC error -> i18n key mapping.

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

// Mirrors TablesPage's local state->label map (not shared via
// @shared/constants, whose TABLE_COLORS labels are English-only).
export const TABLE_STATE_LABEL_KEY = {
  free: 'stateFree', reserved: 'stateReserved', occupied: 'stateOccupied',
  ordering: 'stateOrdering', awaiting_payment: 'stateAwaitingPay', cleared: 'stateCleared',
}

/** Falls back to the raw state string for a value this dashboard has no
 *  copy for yet (e.g. 'maintenance'), instead of rendering a missing key. */
export function tableStateLabel(t, state) {
  const key = TABLE_STATE_LABEL_KEY[state]
  return key ? t(`dashboard:${key}`) : state
}

// error.message on a failed supabase.rpc() call is the DB exception code
// (see sql/34_waiter_service.sql). Maps it to a `dashboard` namespace key;
// unrecognised codes fall back to the generic actionFailed message.
const RPC_ERROR_KEY = {
  not_open:    'waiterErrNotOpen',
  not_found:   'waiterErrNotFound',
  not_allowed: 'waiterErrNotAllowed',
}

export function rpcErrorKey(message) {
  return RPC_ERROR_KEY[message] || 'actionFailed'
}

// An open call is "urgent" once it's been waiting 3+ minutes.
const URGENT_AFTER_MS = 3 * 60 * 1000

export function isUrgent(createdAt, now) {
  if (!createdAt) return false
  return now - new Date(createdAt).getTime() >= URGENT_AFTER_MS
}
