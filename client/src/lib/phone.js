// Phone numbers: what the forms accept and what the database stores.
//
// users.phone has CHECK (phone ~ '^\+?[0-9]{7,15}$') (users_phone_check) and a unique key (users_phone_key); the booking
// RPCs clean numbers with the same rule (_clean_phone). So a form lets people type spaces, dashes and brackets, but
// saves and sends E.164 digits: "+994 50 123 4567" -> "+994501234567".

/** The format shown to guests (hint under the field). */
export const PHONE_FORMAT_EXAMPLE = '+994501234567'

const LOOSE = /^\+?[0-9\s\-()]{7,20}$/
const STORED = /^\+?[0-9]{7,15}$/

/** '' for an empty value, the number as E.164 digits ("+994501234567") when it is one, null when it is not a phone number.
 *  A leading 00 counts as +. */
export function normalizePhone(raw) {
  const v = String(raw ?? '').trim()
  if (!v) return ''
  if (!LOOSE.test(v)) return null
  let digits = v.replace(/[^0-9+]/g, '')
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`
  return STORED.test(digits) ? digits : null
}
