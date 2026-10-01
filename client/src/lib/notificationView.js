// How one `notifications` row is shown: the text and where tapping it goes.
//
// `payload` is either ready-to-render text (legacy rows) or a JSON string written by the v2 RPCs
// (docs/V2-CONTRACT.md section 6). A JSON payload is never shown raw: every known type has a
// translated template, and an unknown JSON type falls back to the generic "system" line.
import { formatPrice } from './helpers'
import { formatBakuDate, formatBakuTime } from '../features/bookings/timeFormat'

export function parsePayload(raw) {
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (!s.startsWith('{')) return null
  try {
    const obj = JSON.parse(s)
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null
  } catch { return null }
}

const enc = encodeURIComponent
const when = (iso, lang) => (iso ? `${formatBakuDate(iso, lang)}, ${formatBakuTime(iso)}` : '')

// type -> (payload, t, lang) => { key, vars, to }. `key` is a notifications-namespace i18n key.
const V2 = {
  friend_request:        p => ({ key: 'friend_request', vars: { name: p.name }, to: '/friends' }),
  friend_accepted:       p => ({ key: 'friend_accepted', vars: { name: p.name }, to: p.user_id ? `/u/${enc(p.user_id)}` : '/friends' }),
  post_like:             p => ({ key: 'post_like', vars: { name: p.name }, to: p.post_id ? `/post/${enc(p.post_id)}` : null }),
  post_comment:          p => ({
    key: p.snippet ? 'post_comment' : 'post_comment_plain',
    vars: { name: p.name, snippet: p.snippet },
    to: p.post_id ? `/post/${enc(p.post_id)}` : null,
  }),
  booking_invite:        (p, lang) => ({
    key: 'booking_invite',
    vars: { host: p.host, restaurant: p.restaurant_name, when: when(p.starts_at, lang) },
    to: p.code ? `/b/${enc(p.code)}` : (p.booking_id ? `/bookings/${enc(p.booking_id)}` : null),
  }),
  booking_member_joined: p => ({ key: 'booking_member_joined', vars: { name: p.name }, to: p.booking_id ? `/bookings/${enc(p.booking_id)}` : null }),
  booking_seated:        p => ({ key: 'booking_seated', vars: { number: p.table_number }, to: p.booking_id ? `/bookings/${enc(p.booking_id)}` : '/table' }),
  booking_confirmed:     (p, lang) => ({ key: 'group_confirmed', vars: { restaurant: p.restaurant_name, when: when(p.starts_at, lang) }, to: p.booking_id ? `/bookings/${enc(p.booking_id)}` : null }),
  booking_cancelled:     (p, lang) => ({ key: 'group_cancelled', vars: { restaurant: p.restaurant_name, when: when(p.starts_at, lang) }, to: p.booking_id ? `/bookings/${enc(p.booking_id)}` : null }),
  booking_no_show:       (p, lang) => ({ key: 'group_no_show', vars: { restaurant: p.restaurant_name, when: when(p.starts_at, lang) }, to: p.booking_id ? `/bookings/${enc(p.booking_id)}` : null }),
  bill_settled:          p => ({
    key: 'bill_settled',
    vars: { total: formatPrice(p.total), receipt: p.receipt || '' },
    to: p.bill_id ? `/receipt/${enc(p.bill_id)}` : null,
  }),
  // staff-facing types: a staff member who is also a guest may see them here
  booking_created:       () => ({ key: 'booking_created', vars: {}, to: null }),
  bill_requested:        () => ({ key: 'bill_requested', vars: {}, to: null }),
}

// Pre-v2 types whose payload is JSON (table join flow).
const LEGACY_JSON = new Set(['join_request', 'join_approved', 'join_declined'])

/** { text, to } for one notification row. `t` is the i18next function, `lang` the UI language. */
export function describeNotification(n, t, lang) {
  const payload = parsePayload(n.payload)

  if (LEGACY_JSON.has(n.type)) {
    const text = n.type === 'join_request'
      ? t('notifications:join_request', { name: payload?.name || t('notifications:someone') })
      : t(`notifications:${n.type}`)
    return { text, to: n.type === 'join_approved' ? '/table' : null }
  }

  const make = V2[n.type]
  if (payload && make) {
    const { key, vars, to } = make(payload, lang)
    const safe = { ...vars }
    if ('name' in safe && !safe.name) safe.name = t('notifications:someone')
    if ('host' in safe && !safe.host) safe.host = t('notifications:someone')
    if ('restaurant' in safe && !safe.restaurant) safe.restaurant = t('notifications:aRestaurant')
    return { text: t(`notifications:${key}`, safe), to }
  }

  // JSON we have no template for: never print it
  if (payload) return { text: t('notifications:system'), to: null }

  // Legacy rows: the payload is already text, else the type's generic line
  return { text: n.payload || t(`notifications:${n.type}`, { defaultValue: n.type }), to: null }
}
