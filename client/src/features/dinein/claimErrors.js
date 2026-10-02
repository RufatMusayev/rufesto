// claim_table / claim_table_from_booking errors -> translated message. One mapping for the three places a guest
// claims a table (the /t/<code> link page, the /table code form, the in-app QR sheet), so a new error code is
// translated everywhere or nowhere. `t` is any i18n `t` that has the `table` and `booking` namespaces loaded.
const KEYS = [
  ['not_authenticated', 'booking:errNotAuthenticated'],
  ['table_reserved', 'booking:reservedByOther'],
  ['join_declined', 'booking:joinDeclined'],
  ['too_many_requests', 'booking:tooManyJoinRequests'],
  ['invalid_seat', 'table:errInvalidSeat'],
  ['seat_taken', 'table:errSeatTaken'],
  ['too_many_attempts', 'table:errTooManyAttempts'],
  ['table_unavailable', 'table:errTableUnavailable'],
  ['invalid_code', 'table:errInvalidCode'],
]

export function claimErrorMessage(error, t) {
  const msg = String(error?.message || '')
  const hit = KEYS.find(([code]) => msg.includes(code))
  return t(hit ? hit[1] : 'booking:errClaimFailed')
}
