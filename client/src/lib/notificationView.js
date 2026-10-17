// How one inbox item is shown: its text, icon, who it is from, and where tapping it goes.
//
// An item is what `my_notifications()` returns (docs/V2-CONTRACT.md section 21.2): one line that may stand for a
// whole group of rows ("Aysel, Nicat and 3 others liked your post"):
//   { id, ids, type, category, group_key, count, actors: [{ id, name, photo }], at, read, payload, target }
// (features/notifications/api.js maps the RPC's snake_case into this). `payload` is the latest row's payload: an
// object, a JSON string (older rows) or ready-to-render text (legacy rows). A JSON payload is never printed raw: every
// known type has a translated template, an unknown JSON type falls back to the generic "system" line.
import { formatPrice, cleanDisplayName } from './helpers'
import { formatBakuDate, formatBakuTime } from '../features/bookings/timeFormat'

/* ------------------------------------------------------------------ categories */

export const CATEGORIES = ['social', 'dinein', 'bookings', 'places']

// category of every type this app knows (mirrors the backfill in sql/64); anything else is shown under "All" only
const CATEGORY_OF_TYPE = {
  friend_request: 'social', friend_accepted: 'social', post_like: 'social', post_comment: 'social',
  review_like: 'social', review_reply: 'social',
  order_ready: 'dinein', order_placed: 'dinein', join_request: 'dinein', join_approved: 'dinein',
  join_declined: 'dinein', bill_settled: 'dinein',
  booking_invite: 'bookings', booking_member_joined: 'bookings', booking_seated: 'bookings', booking_confirmed: 'bookings',
  booking_cancelled: 'bookings', booking_no_show: 'bookings', booking_reminder: 'bookings',
  place_post: 'places', promotion: 'places',
  booking_created: 'staff', bill_requested: 'staff', waiter_called: 'staff', review_received: 'staff', stock_alert: 'staff',
}

/** Types that belong to the restaurant's staff, never to the guest inbox (sql/64 audience 'staff'). */
export const STAFF_TYPES = Object.keys(CATEGORY_OF_TYPE).filter(k => CATEGORY_OF_TYPE[k] === 'staff')

export const categoryOfType = type => CATEGORY_OF_TYPE[type] || null
export const typesOfCategory = cat => Object.keys(CATEGORY_OF_TYPE).filter(k => CATEGORY_OF_TYPE[k] === cat)

/* ------------------------------------------------------------------- payloads */

/** A payload as an object: objects pass, JSON text is parsed, anything else (plain text, null) is null. */
export function parsePayload(raw) {
  if (raw && typeof raw === 'object') return Array.isArray(raw) ? null : raw
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
const str = v => (typeof v === 'string' && v.trim() ? v.trim() : '')

/* --------------------------------------------------------------------- routes */

/** The in-app route a server `target { kind, id, slug }` stands for, or null. */
function targetRoute(target, p) {
  if (!target || typeof target !== 'object') return null
  const { kind, id, slug } = target
  switch (kind) {
    case 'post': return id ? `/post/${enc(id)}` : null
    case 'user': case 'profile': return id ? `/u/${enc(id)}` : null
    case 'friends': case 'friend_request': return '/friends?tab=requests'
    case 'booking': return id ? `/bookings/${enc(id)}` : null
    case 'invite': return slug || id ? `/b/${enc(slug || id)}` : null
    case 'bill': case 'receipt': return id ? `/receipt/${enc(id)}` : null
    case 'table': case 'order': return '/table'
    case 'restaurant': return slug ? `/restaurant/${enc(slug)}` : null
    case 'dish': return slug ? `/restaurant/${enc(slug)}${id ? `?dish=${enc(id)}` : ''}` : null
    case 'review': {
      const dish = p && (p.dish_id || p.dishId)
      return slug ? `/restaurant/${enc(slug)}${dish ? `?dish=${enc(dish)}` : ''}` : null
    }
    default: return slug ? `/restaurant/${enc(slug)}` : null
  }
}

/* ------------------------------------------------------------- who, thumbnails */

/** "Aysel", "Aysel and Nicat", "Aysel, Nicat and Leyla", "Aysel, Nicat and 3 others" (first names once grouped). */
function whoLine(item, p, t) {
  const someone = t('notifications:someone')
  const actors = Array.isArray(item.actors) ? item.actors : []
  let names = actors.map(a => (a && a.name ? cleanDisplayName(a.name) : '')).filter(Boolean)
  if (!names.length) {
    const single = str(p && (p.name || p.host || p.user_name))
    names = [single ? cleanDisplayName(single) : someone]
  }
  const n = Math.max(item.count || 1, names.length)
  if (n === 1) return names[0]
  const first = names.map(x => x.split(/\s+/)[0] || x)
  if (n === 2 && first.length >= 2) return t('notifications:who_two', { a: first[0], b: first[1] })
  if (n === 3 && first.length >= 3) return t('notifications:who_three', { a: first[0], b: first[1], c: first[2] })
  if (first.length >= 2) return t('notifications:who_more', { count: n - 2, a: first[0], b: first[1] })
  return t('notifications:who_more1', { count: n - 1, a: first[0] })
}

const THUMB_KEYS = ['thumbnail', 'thumb', 'photo_url', 'photo', 'post_photo', 'dish_photo', 'dish_image', 'image_url', 'image']

/** { src } (a ready URL) or { path } (a post-photos object path, signed by the page); null when the payload has none. */
function thumbOf(p) {
  if (!p) return null
  for (const k of THUMB_KEYS) {
    const v = str(p[k])
    if (!v) continue
    return /^(https?:|data:|blob:|\/)/i.test(v) ? { src: v } : { path: v }
  }
  return null
}

// the dish a review / reply is about, whichever key the producer used
/** The thumbnail an item would show ({ src } | { path } | null): the page signs the paths before it renders. */
export const thumbOfItem = item => thumbOf(parsePayload(item.payload))

const dishOf = p => str(p.dish_name || p.dish_title || (typeof p.dish === 'string' ? p.dish : p.dish && p.dish.name))

const dishNames = p => {
  const raw = p.dishes || p.dish_names || p.items
  if (!Array.isArray(raw)) return ''
  return raw.map(d => (typeof d === 'string' ? d : d && d.name)).filter(Boolean).slice(0, 3).join(', ')
}

/* ------------------------------------------------------------------ templates */

// type -> ({ p, item, who, lang, target }) => { key, vars, to }. `key` is a notifications-namespace i18n key; a
// route taken from the payload wins over the server's `target` (the payload keys are the documented contract).
const rest = (p, key = 'restaurant_name') => str(p[key]) || undefined
const bookingTo = p => (p.booking_id ? `/bookings/${enc(p.booking_id)}` : null)
const postTo = p => (p.post_id ? `/post/${enc(p.post_id)}` : null)

const V2 = {
  friend_request:  ({ who }) => ({ key: 'friend_request', vars: { who }, to: '/friends?tab=requests' }),
  friend_accepted: ({ p, who }) => ({ key: 'friend_accepted', vars: { who }, to: p.user_id ? `/u/${enc(p.user_id)}` : '/friends' }),
  post_like:       ({ p, who }) => ({ key: 'post_like', vars: { who }, to: postTo(p) }),
  post_comment:    ({ p, who, item }) => ({
    key: p.snippet && (item.count || 1) <= 1 ? 'post_comment' : 'post_comment_plain',
    vars: { who, snippet: p.snippet },
    to: postTo(p),
  }),
  review_like:     ({ p, who }) => ({ key: dishOf(p) ? 'review_like' : 'review_like_plain', vars: { who, dish: dishOf(p) }, to: null }),
  review_reply:    ({ p, who }) => ({ key: dishOf(p) ? 'review_reply' : 'review_reply_plain', vars: { who, dish: dishOf(p) }, to: null }),
  order_ready:     ({ p }) => {
    const dishes = dishNames(p)
    return { key: dishes ? 'order_ready_dishes' : 'order_ready', vars: { dishes }, to: '/table' }
  },
  booking_reminder: ({ p }) => ({
    key: 'booking_reminder', vars: { restaurant: rest(p), time: p.starts_at ? formatBakuTime(p.starts_at) : '' }, to: bookingTo(p),
  }),
  booking_invite:  ({ p, lang }) => ({
    key: 'booking_invite',
    vars: { host: str(p.host), restaurant: rest(p), when: when(p.starts_at, lang) },
    to: p.code ? `/b/${enc(p.code)}` : bookingTo(p),
  }),
  booking_member_joined: ({ p, who }) => ({ key: 'booking_member_joined', vars: { who }, to: bookingTo(p) }),
  booking_seated:  ({ p }) => ({ key: 'booking_seated', vars: { number: p.table_number }, to: p.booking_id ? `/bookings/${enc(p.booking_id)}` : '/table' }),
  booking_confirmed: ({ p, lang }) => ({ key: 'group_confirmed', vars: { restaurant: rest(p), when: when(p.starts_at, lang) }, to: bookingTo(p) }),
  booking_cancelled: ({ p, lang }) => ({ key: 'group_cancelled', vars: { restaurant: rest(p), when: when(p.starts_at, lang) }, to: bookingTo(p) }),
  booking_no_show:   ({ p, lang }) => ({ key: 'group_no_show', vars: { restaurant: rest(p), when: when(p.starts_at, lang) }, to: bookingTo(p) }),
  // payload.restaurant_name / restaurant_slug come with the bill-settled notification (older rows lack them): without a
  // name the line keeps its former text; the tap opens the receipt, else the restaurant when it is known.
  bill_settled: ({ p }) => ({
    key: p.restaurant_name ? 'bill_settled_at' : 'bill_settled',
    vars: { total: formatPrice(p.total), receipt: p.receipt || '', restaurant: p.restaurant_name },
    to: p.bill_id ? `/receipt/${enc(p.bill_id)}` : (p.restaurant_slug ? `/restaurant/${enc(p.restaurant_slug)}` : null),
  }),
  place_post: ({ p, item }) => ({
    key: 'place_post', vars: { restaurant: rest(p), count: Math.max(item.count || 1, 1) },
    to: p.post_id && (item.count || 1) <= 1 ? `/post/${enc(p.post_id)}` : (p.restaurant_slug ? `/restaurant/${enc(p.restaurant_slug)}` : null),
  }),
  promotion: ({ p }) => (str(p.title)
    ? { key: 'promotion_new', vars: { restaurant: rest(p), title: str(p.title) }, to: p.restaurant_slug ? `/restaurant/${enc(p.restaurant_slug)}` : null }
    : { key: 'promotion', vars: {}, to: p.restaurant_slug ? `/restaurant/${enc(p.restaurant_slug)}` : null }),
  // staff-facing: never listed for a guest, but a text exists so nothing prints raw if one ever shows up
  booking_created: () => ({ key: 'booking_created', vars: {}, to: null }),
  bill_requested:  () => ({ key: 'bill_requested', vars: {}, to: null }),
  waiter_called:   () => ({ key: 'waiter_called', vars: {}, to: null }),
  review_received: ({ p }) => ({ key: dishOf(p) ? 'review_received' : 'review_received_plain', vars: { dish: dishOf(p) }, to: null }),
  stock_alert:     ({ p }) => ({ key: str(p.ingredient || p.ingredient_name) ? 'stock_alert' : 'stock_alert_plain', vars: { ingredient: str(p.ingredient || p.ingredient_name) }, to: null }),
}

// Pre-v2 types whose payload is JSON (table join flow).
const LEGACY_JSON = new Set(['join_request', 'join_approved', 'join_declined'])

// icon + tone class (features/notifications/styles.css .ntf-tone-*). The like is the 🤌, the comment a plate (never a heart or a bubble).
const META = {
  friend_request: ['👥', 'gold'], friend_accepted: ['🤝', 'sage'],
  post_like: ['🤌', 'accent'], post_comment: ['🍽️', 'accent'],
  review_like: ['🤌', 'accent'], review_reply: ['🍽️', 'accent'],
  order_ready: ['🍽️', 'sage'], order_placed: ['🧾', 'blue'],
  booking_confirmed: ['📋', 'sage'], booking_cancelled: ['✕', 'red'], booking_no_show: ['✕', 'red'],
  booking_invite: ['💌', 'gold'], booking_member_joined: ['👥', 'sage'], booking_seated: ['🪑', 'sage'],
  booking_reminder: ['⏰', 'gold'], booking_created: ['📋', 'gold'],
  join_request: ['🙋', 'gold'], join_approved: ['✅', 'sage'], join_declined: ['🚫', 'red'],
  bill_settled: ['🧾', 'sage'], bill_requested: ['🧾', 'blue'],
  place_post: ['📍', 'accent'], promotion: ['🎉', 'gold'],
  waiter_called: ['🛎️', 'gold'], review_received: ['🍽️', 'accent'], stock_alert: ['📦', 'red'],
  system: ['🔔', 'muted'],
}
const VENUE_TYPES = new Set(['place_post', 'promotion'])

/**
 * What to render for one inbox item: { text, to, icon, tone, lead, venue, thumb }.
 *  lead: 'actors' (avatars of the people), 'venue' (the restaurant's own avatar) or 'icon' (the type's glyph).
 * `t` is the i18next function, `lang` the UI language.
 */
export function describeItem(item, t, lang) {
  const type = item.type
  const p = parsePayload(item.payload)
  const [icon, tone] = META[type] || META.system
  const base = { icon, tone, lead: 'icon', venue: null, thumb: thumbOf(p) }
  if (Array.isArray(item.actors) && item.actors.length) base.lead = 'actors'

  if (LEGACY_JSON.has(type)) {
    const text = type === 'join_request'
      ? t('notifications:join_request', { name: str(p && p.name) || t('notifications:someone') })
      : t(`notifications:${type}`)
    return { ...base, text, to: type === 'join_approved' ? '/table' : targetRoute(item.target, p) }
  }

  const make = V2[type]
  if (p && make) {
    const who = whoLine(item, p, t)
    const { key, vars, to } = make({ p, item, who, lang })
    const safe = { ...vars, name: who }
    if ('host' in safe && !safe.host) safe.host = t('notifications:someone')
    if ('restaurant' in safe && !safe.restaurant) safe.restaurant = t('notifications:aRestaurant')
    if ('count' in safe) safe.count = Number(safe.count) || 1
    if (VENUE_TYPES.has(type) && str(p.restaurant_name)) {
      base.lead = 'venue'
      base.venue = { name: str(p.restaurant_name), logo: str(p.restaurant_logo || p.logo_url || p.logo) || null }
    }
    return { ...base, text: t(`notifications:${key}`, safe), to: to || targetRoute(item.target, p) }
  }

  // JSON we have no template for: never print it
  if (p) return { ...base, text: t('notifications:system'), to: targetRoute(item.target, p) }

  // Legacy rows: the payload is already text, else the type's generic line
  const text = (typeof item.payload === 'string' && item.payload.trim()) || t(`notifications:${type}`, { defaultValue: t('notifications:system') })
  return { ...base, text, to: targetRoute(item.target, null) }
}
