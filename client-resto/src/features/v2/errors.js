import { friendlyError } from '../../lib/errors'

// Exception text the v2 RPCs raise (message == code) and PostgREST codes for a
// feature whose tables / functions aren't deployed yet. Raw error text never
// reaches the UI: anything unknown falls through to lib/errors.js.
const BY_MESSAGE = {
  not_authenticated: 'errSession',
  forbidden:         'errNotAllowed',
  not_allowed:       'errNotAllowed',
  not_staff:         'errNotAllowed',
  invalid_range:     'errInvalidRange',
  bill_not_found:    'errNotFound',
  share_not_found:   'errNotFound',
  intent_not_found:  'errNotFound',
  booking_not_found: 'errNotFound',
  already_paid:      'errAlreadyPaid',
  intent_not_pending: 'errAlreadyHandled',
  not_staff_payable: 'errNotStaffPayable',
  bill_closed:       'errBillClosed',
  bill_settled:      'errBillClosed',
  bill_has_payments: 'errBillHasPayments',
}

// 42P01 undefined_table, 42883 undefined_function, PGRST205 table not in the
// schema cache, PGRST202 function not found.
const NOT_READY_CODES = ['42P01', '42883', 'PGRST205', 'PGRST202']

/** True when the failure means the v2 tables / functions aren't deployed here yet. */
export function isNotReady(err) {
  return NOT_READY_CODES.includes(String(err?.code || ''))
}

/** Translated, user-safe message. `t` must have the v2 + dashboard namespaces. */
export function v2Error(err, t) {
  const message = String(err?.message || '').trim().toLowerCase()
  const code = String(err?.code || '')
  if (isNotReady(err)) return t('v2:errNotReady')
  const key = BY_MESSAGE[message]
  if (key) return t(`v2:${key}`)
  if (code === '23505') return t('v2:errDuplicate')
  return friendlyError(err, t)
}
