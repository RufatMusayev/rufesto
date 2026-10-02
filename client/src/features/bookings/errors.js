// Backend error codes (RAISE EXCEPTION 'code' in sql/41, 41b, 41c) -> i18n keys in the `bookings`
// namespace. Raw error messages never reach the UI: every failure ends up as { code, key }.
const KNOWN = [
  'not_authenticated', 'consent_required', 'restaurant_not_found', 'bookings_disabled',
  'invalid_party_size', 'invalid_name', 'invalid_phone', 'phone_required', 'note_too_long',
  'too_soon', 'too_far', 'restaurant_closed', 'outside_hours', 'too_many_bookings',
  'booking_exists', 'no_table_available', 'invalid_date', 'date_in_past', 'date_too_far',
  'invalid_code', 'invite_expired', 'booking_closed', 'booking_full', 'booking_not_found',
  'host_cannot_leave', 'not_host', 'booking_not_active', 'too_early', 'booking_expired',
  'booking_not_cancellable', 'not_member', 'not_seated', 'outside_window', 'invites_disabled',
  // raised by this feature itself
  'no_session',
]

const make = code => ({ code, key: `bookings:errors.${code}` })

/** Map anything thrown or returned by supabase-js to { code, key }. */
export function toError(err) {
  if (!err) return make('generic')
  const message = String(err.message || '').trim()

  if (KNOWN.includes(message)) return make(message)
  for (const code of KNOWN) {
    if (new RegExp(`(^|[^a-z_])${code}($|[^a-z_])`).test(message)) return make(code)
  }

  const text = `${message} ${err.details || ''} ${err.hint || ''}`
  // RPC / table not deployed yet (PostgREST 404 / PGRST202 / undefined function or table)
  if (['PGRST202', 'PGRST205', '42883', '42P01'].includes(err.code) || err.status === 404
      || /could not find the (function|table)|schema cache/i.test(text)) {
    return make('unavailable')
  }
  if (err.code === '42501' || /permission denied|row-level security|jwt/i.test(text)) return make('not_allowed')
  if (err.name === 'TypeError' || /failed to fetch|networkerror|network request|load failed|timeout/i.test(text)) {
    return make('network')
  }
  return make('generic')
}

export const isUnavailable = e => e?.code === 'unavailable'

/** Errors after which the slot the guest picked is no longer good: send them back to pick a time. */
export const SLOT_ERRORS = ['no_table_available', 'too_soon', 'restaurant_closed', 'outside_hours', 'too_far', 'booking_exists']
