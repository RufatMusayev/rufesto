// Backend error codes (RAISE EXCEPTION 'code' in sql/42*.sql and the legacy bill RPCs) -> i18n keys in
// the `bills` namespace. Raw error messages never reach the UI: every failure ends up as { code, key }.
const KNOWN = [
  'not_authenticated', 'no_session', 'nothing_due', 'table_not_found', 'bill_not_found', 'bill_closed',
  'invalid_mode', 'invalid_method', 'invalid_tip', 'invalid_waiter', 'invalid_assignment', 'split_locked',
  'no_share', 'already_paid', 'intent_not_found', 'not_demo', 'intent_not_pending', 'no_pending_payment',
  'share_not_found', 'forbidden', 'demo_disabled',
]

// Codes that share one message with another code.
const ALIAS = {
  table_not_found: 'no_session',
  forbidden: 'not_allowed',
  invalid_assignment: 'split_locked',
  intent_not_found: 'intent_failed',
  not_demo: 'intent_failed',
  intent_not_pending: 'intent_failed',
  no_pending_payment: 'intent_failed',
  share_not_found: 'intent_failed',
}

const make = code => ({ code, key: `bills:errors.${ALIAS[code] || code}` })

/** Map anything thrown or returned by supabase-js to { code, key }. `fallback` is the code used when the
 *  failure is not recognised (the pay flow passes 'intent_failed'). */
export function toError(err, fallback = 'generic') {
  if (!err) return make(fallback)
  const message = String(err.message || '').trim()

  if (KNOWN.includes(message)) return make(message)
  for (const code of KNOWN) {
    if (new RegExp(`(^|[^a-z_])${code}($|[^a-z_])`).test(message)) return make(code)
  }

  // reviews has UNIQUE (dish_id, user_id): the dish was reviewed before
  if (err.code === '23505' && fallback === 'review_failed') return make('review_exists')

  const text = `${message} ${err.details || ''} ${err.hint || ''}`
  // RPC / table not deployed on this database (PostgREST 404 / PGRST202 / undefined function)
  if (['PGRST202', 'PGRST205', '42883', '42P01'].includes(err.code) || err.status === 404
      || /could not find the (function|table)|schema cache/i.test(text)) {
    return make('unavailable')
  }
  if (err.code === '42501' || /permission denied|row-level security|jwt/i.test(text)) return make('not_allowed')
  if (err.name === 'TypeError' || /failed to fetch|networkerror|network request|load failed|timeout/i.test(text)) {
    return make('network')
  }
  return make(fallback)
}

export const errorKey = code => make(code).key
