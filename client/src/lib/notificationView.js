// How one inbox item is shown: its text, who it is from, its thumbnail, and where tapping it goes.
//
// An item is what `my_notifications()` returns (docs/V2-CONTRACT.md section 21.2 + sql/67, docs/UX-PLAN-2026-10-18.md 9.4): one
// line that may stand for a whole group of rows ("Aysel, Nicat and 3 others liked your post"):
//   { id, ids, type, category, group_key, count, actors: [{ id, name, photo }], at, read, seen, thumb, actor_relation,
//     friendship_id, payload, target }
// (features/notifications/api.js maps the RPC's snake_case into this). `payload` is the latest row's payload: an object, a
// JSON string (older rows) or ready-to-render text (legacy rows). A JSON payload is never printed raw: every known type has
// a translated template, an unknown JSON type falls back to the generic "system" line.
//
// Templates mark the actor and the venue with <b>..</b> (the inbox renders them in weight 600). Every value that goes into
// a template loses its angle brackets first, so a name or a comment can never become markup.
import { formatPrice, cleanDisplayName } from './helpers'
import { formatBakuDate, formatBakuTime } from '../features/bookings/timeFormat'

/* ------------------------------------------------------------------ categories */

// category of every type this app knows (mirrors the backfill in sql/64); anything else is shown under "All" only
const CATEGORY_OF_TYPE = {
  friend_request: 'social', friend_accepted: 'social', post_like: 'social', post_comment: 'social',
  review_like: 'social', review_reply: 'social',
  order_ready: 'dinein', order_placed: 'dinein', join_request: 'dinein', join_approved: 'dinein',
  join_declined: 'dinein', bill_settled: 'dinein',
  booking_invite: 'bookings', booking_member_joined: 'bookings', booking_seated: 'bookings', booking_confirmed: 'bookings',
  booking_cancelled: 'bookings', booking_no_show: 'bookings', booking_reminder: 'bookings',
  place_post: 'places', promotion: 'places',
  booking_created: 'staff', bill_requested: 'staff', bill_paid: 'staff', waiter_called: 'staff', review_received: 'staff', stock_alert: 'staff',
}

/** Types that belong to the restaurant's staff, never to the guest inbox (sql/64 audience 'staff'). */
export const STAFF_TYPES = Object.keys(CATEGORY_OF_TYPE).filter(k => CATEGORY_OF_TYPE[k] === 'staff')

export const categoryOfType = type => CATEGORY_OF_TYPE[type] || null

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
const clean = v => (typeof v === 'string' ? v.replace(/[<>]/g, '') : v)
const isAz = lang => String(lang || '').toLowerCase().startsWith('az')

// an order that is older than this is no longer "at the table": its row opens the receipt or the restaurant instead
const ORDER_FRESH_MS = 6 * 3600 * 1000

/* --------------------------------------------------------------------- routes */

/** The in-app route a server `target { kind, id, slug }` stands for, or null. `ctx.hasTable`: the guest has a live table session. */
function targetRoute(target, p, ctx) {
  if (!target || typeof target !== 'object') return null
  const { kind, id, slug } = target
  switch (kind) {
    case 'post': return id ? `/post/${enc(id)}` : null
    case 'user': case 'profile': return id ? `/u/${enc(id)}` : null
    case 'friends': case 'friend_request': return '/friends?tab=requests'
    case 'booking': return id ? `/bookings/${enc(id)}` : null
    case 'invite': return slug || id ? `/b/${enc(slug || id)}` : null
    case 'bill': case 'receipt': return id ? `/receipt/${enc(id)}` : null
    case 'table': case 'order': return ctx.hasTable ? '/table' : null          // "No active table" is a dead end
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

const realName = n => {
  if (!n) return ''
  const c = cleanDisplayName(n)
  return c === 'Anonymous' ? '' : c
}

/** "Aysel", "Aysel and Nicat", "Aysel, Nicat and Leyla", "Aysel, Nicat and 3 others" (first names once grouped). */
function whoLine(item, p, t) {
  const someone = t('notifications:someone')
  const actors = Array.isArray(item.actors) ? item.actors : []
  let names = actors.map(a => realName(a && a.name)).filter(Boolean)
  if (!names.length) {
    const single = str(p && (p.name || p.host || p.user_name))
    names = [realName(single) || someone]
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

const toThumb = v => (/^(https?:|data:|blob:|\/)/i.test(v) ? { src: v } : { path: v })

/** { src } (a ready URL) or { path } (a post-photos object path, signed by the page); null when the payload has none. */
function thumbOf(p) {
  if (!p) return null
  for (const k of THUMB_KEYS) {
    const v = str(p[k])
    if (v) return toThumb(v)
  }
  return null
}

/**
 * The thumbnail an item would show ({ src } | { path } | null). The server's `thumb` (sql/67) wins; before it, the photo the
 * payload happens to carry. The page signs the paths before it renders.
 */
export const thumbOfItem = item => {
  const own = str(item.thumb)
  return own ? toThumb(own) : thumbOf(parsePayload(item.payload))
}

const dishOf = (p, lang) => {
  const az = isAz(lang) ? str(p.dish_name_az) : ''
  return az || str(p.dish_name || p.dish_title || (typeof p.dish === 'string' ? p.dish : p.dish && p.dish.name))
}

const dishNames = (p, lang) => {
  const raw = (isAz(lang) && Array.isArray(p.dishes_az) && p.dishes_az.length ? p.dishes_az : null) || p.dishes || p.dish_names || p.items
  if (!Array.isArray(raw)) return ''
  return raw.map(d => (typeof d === 'string' ? d : d && d.name)).filter(Boolean).slice(0, 3).join(', ')
}

/* ------------------------------------------------------------------ templates */

// type -> ({ p, item, who, lang, ctx }) => { key, vars, to }. `key` is a notifications-namespace i18n key; a route taken from
// the payload wins over the server's `target` (the payload keys are the documented contract).
const venueOf = p => str(p.restaurant_name) || undefined
const bookingTo = p => (p.booking_id ? `/bookings/${enc(p.booking_id)}` : null)
const postTo = p => (p.post_id ? `/post/${enc(p.post_id)}` : null)
const restTo = p => (p.restaurant_slug ? `/restaurant/${enc(p.restaurant_slug)}` : null)

const V2 = {
  friend_request:  ({ item, who }) => (item.friendStatus === 'accepted'
    ? { key: 'friend_now', vars: { who }, to: item.actors[0]?.id ? `/u/${enc(item.actors[0].id)}` : '/friends' }
    : { key: 'friend_request', vars: { who }, to: '/friends?tab=requests' }),
  friend_accepted: ({ p, who }) => ({ key: 'friend_now', vars: { who }, to: p.user_id ? `/u/${enc(p.user_id)}` : '/friends' }),
  post_like:       ({ p, who }) => ({ key: 'post_like', vars: { who }, to: postTo(p) }),
  post_comment:    ({ p, who, item }) => ({
    key: p.snippet && (item.count || 1) <= 1 ? 'post_comment' : 'post_comment_plain',
    vars: { who, snippet: p.snippet },
    to: postTo(p),
  }),
  review_like:     ({ p, who, lang }) => ({ key: dishOf(p, lang) ? 'review_like' : 'review_like_plain', vars: { who, dish: dishOf(p, lang) }, to: null }),
  review_reply:    ({ p, who, item, lang }) => {
    const dish = dishOf(p, lang)
    const snippet = str(p.snippet) && (item.count || 1) <= 1 ? str(p.snippet) : ''
    return { key: dish ? (snippet ? 'review_reply' : 'review_reply_dish') : 'review_reply_plain', vars: { who, dish, snippet }, to: null }
  },
  order_ready:     ({ p, item, lang, ctx }) => {
    const dishes = dishNames(p, lang)
    const fresh = ctx.now - new Date(item.at).getTime() < ORDER_FRESH_MS
    // an old "food is ready" must not open a dead "No active table" page: the receipt, else the restaurant
    const to = fresh && ctx.hasTable ? '/table' : (p.bill_id ? `/receipt/${enc(p.bill_id)}` : restTo(p))
    return { key: dishes ? 'order_ready_dishes' : 'order_ready', vars: { venue: venueOf(p), dishes }, to }
  },
  booking_reminder: ({ p }) => {
    const guests = Number(p.party_size || p.guests)
    return {
      key: guests > 0 ? 'booking_reminder' : 'booking_reminder_plain',
      vars: { venue: venueOf(p), time: p.starts_at ? formatBakuTime(p.starts_at) : '', count: guests > 0 ? guests : 1 },
      to: bookingTo(p),
    }
  },
  booking_invite:  ({ p, lang }) => ({
    key: 'booking_invite',
    vars: { host: str(p.host), venue: venueOf(p), when: when(p.starts_at, lang) },
    to: p.code ? `/b/${enc(p.code)}` : bookingTo(p),
  }),
  booking_member_joined: ({ p, who }) => ({ key: 'booking_member_joined', vars: { who }, to: bookingTo(p) }),
  booking_seated:  ({ p, ctx }) => ({
    key: 'booking_seated', vars: { number: p.table_number }, to: p.booking_id ? `/bookings/${enc(p.booking_id)}` : (ctx.hasTable ? '/table' : null),
  }),
  booking_confirmed: ({ p, lang }) => ({ key: 'group_confirmed', vars: { venue: venueOf(p), when: when(p.starts_at, lang) }, to: bookingTo(p) }),
  booking_cancelled: ({ p, lang }) => ({ key: 'group_cancelled', vars: { venue: venueOf(p), when: when(p.starts_at, lang) }, to: bookingTo(p) }),
  booking_no_show:   ({ p, lang }) => ({ key: 'group_no_show', vars: { venue: venueOf(p), when: when(p.starts_at, lang) }, to: bookingTo(p) }),
  // payload.restaurant_name / restaurant_slug come with the bill-settled notification (older rows lack them): without a
  // name the line keeps its former text; the tap opens the receipt, else the restaurant when it is known.
  bill_settled: ({ p }) => ({
    key: p.restaurant_name ? 'bill_settled_at' : 'bill_settled',
    vars: { total: formatPrice(p.total), receipt: p.receipt || '', venue: p.restaurant_name },
    to: p.bill_id ? `/receipt/${enc(p.bill_id)}` : restTo(p),
  }),
  place_post: ({ p, item }) => ({
    key: 'place_post', vars: { venue: venueOf(p), count: Math.max(item.count || 1, 1) },
    to: p.post_id && (item.count || 1) <= 1 ? `/post/${enc(p.post_id)}` : restTo(p),
  }),
  promotion: ({ p }) => (str(p.title)
    ? { key: 'promotion_new', vars: { venue: venueOf(p), title: str(p.title) }, to: restTo(p) }
    : { key: 'promotion', vars: {}, to: restTo(p) }),
  // staff-facing: never listed for a guest, but a text exists so nothing prints raw if one ever shows up
  booking_created: () => ({ key: 'booking_created', vars: {}, to: null }),
  bill_requested:  () => ({ key: 'bill_requested', vars: {}, to: null }),
  bill_paid:       () => ({ key: 'bill_paid', vars: {}, to: null }),
  waiter_called:   () => ({ key: 'waiter_called', vars: {}, to: null }),
  review_received: ({ p, lang }) => ({ key: dishOf(p, lang) ? 'review_received' : 'review_received_plain', vars: { dish: dishOf(p, lang) }, to: null }),
  stock_alert:     ({ p }) => ({ key: str(p.ingredient || p.ingredient_name) ? 'stock_alert' : 'stock_alert_plain', vars: { ingredient: str(p.ingredient || p.ingredient_name) }, to: null }),
}

// Pre-v2 types whose payload is JSON (table join flow).
const LEGACY_JSON = new Set(['join_request', 'join_approved', 'join_declined'])

// the line icon of a row that has no face (features/notifications/Icons.jsx LineIcon names)
const ICON = {
  order_ready: 'plate', order_placed: 'receipt', booking_confirmed: 'calendar', booking_cancelled: 'calendar', booking_no_show: 'calendar',
  booking_invite: 'mail', booking_member_joined: 'users', booking_seated: 'plate', booking_reminder: 'clock', booking_created: 'calendar',
  join_request: 'users', join_approved: 'check', join_declined: 'x', bill_settled: 'receipt', bill_requested: 'receipt', bill_paid: 'receipt',
  place_post: 'pin', promotion: 'tag', waiter_called: 'bell', review_received: 'plate', stock_alert: 'box',
  friend_request: 'users', friend_accepted: 'users', post_like: 'plate', post_comment: 'plate', review_like: 'plate', review_reply: 'plate',
  system: 'bell',
}

// rows led by the restaurant's own avatar (they have a place behind them and no person)
const VENUE_TYPES = new Set([
  'place_post', 'promotion', 'order_ready', 'order_placed', 'booking_confirmed', 'booking_cancelled', 'booking_no_show',
  'booking_reminder', 'booking_seated', 'bill_settled',
])
// the server's `thumb` of these is the venue's logo (sql/67 9.4): it is the avatar of the row, not a trailing picture
const LOGO_THUMB = /^(booking_|bill_|join_)/

const plain = rich => rich.replace(/<\/?b>/g, '')

/**
 * What to render for one inbox item: { rich, text, to, icon, lead, venue, thumb }.
 *  rich: the line with <b>..</b> around the actor and the venue; text: the same without tags.
 *  lead: 'actors' (avatars of the people), 'venue' (the restaurant's own avatar) or 'icon' (a line icon in a circle).
 *  thumb: { src } | { path } | null, the trailing 44 px picture.
 * `t` is the i18next function, `lang` the UI language, `ctx` { hasTable, now }: dead targets are decided here.
 */
export function describeItem(item, t, lang, ctx = {}) {
  const c = { hasTable: !!ctx.hasTable, now: ctx.now || Date.now() }
  const type = item.type
  const p = parsePayload(item.payload)
  const icon = ICON[type] || ICON.system
  const hasActors = Array.isArray(item.actors) && item.actors.length > 0
  const own = thumbOfItem(item)
  const logoThumb = LOGO_THUMB.test(type)
  const base = { icon, lead: hasActors ? 'actors' : 'icon', venue: null, thumb: logoThumb ? null : own }
  const done = (rich, to) => ({ ...base, rich, text: plain(rich), to })

  if (LEGACY_JSON.has(type)) {
    const name = clean(str(p && p.name)) || t('notifications:someone')
    const rich = type === 'join_request'
      ? t('notifications:join_request', { name })
      : t(`notifications:${type}`)
    return done(rich, type === 'join_declined' ? targetRoute(item.target, p, c) : (c.hasTable ? '/table' : null))
  }

  const make = V2[type]
  if (p && make) {
    const who = clean(whoLine(item, p, t))
    const { key, vars, to } = make({ p, item, who, lang, ctx: c })
    const safe = {}
    for (const k of Object.keys(vars)) safe[k] = clean(vars[k])
    if ('host' in safe && !safe.host) safe.host = t('notifications:someone')
    if ('venue' in safe && !safe.venue) safe.venue = t('notifications:aRestaurant')
    if ('count' in safe) safe.count = Number(safe.count) || 1
    safe.name = who
    const name = str(p.restaurant_name)
    if (!hasActors && name && VENUE_TYPES.has(type)) {
      base.lead = 'venue'
      base.venue = { name, logo: str(p.restaurant_logo || p.logo_url || p.logo) || (logoThumb && own && own.src) || null }
    }
    return done(t(`notifications:${key}`, safe), to || targetRoute(item.target, p, c))
  }

  // JSON we have no template for: never print it
  if (p) return done(t('notifications:system'), targetRoute(item.target, p, c))

  // Legacy rows: the payload is already text, else the type's generic line
  const text = clean((typeof item.payload === 'string' && item.payload.trim()) || t(`notifications:${type}`, { defaultValue: t('notifications:system') }))
  return done(text, targetRoute(item.target, null, c))
}

/** A `rich` line as parts for rendering: [{ b: boolean, s: string }]. */
export function richParts(rich) {
  const out = []
  const re = /<b>([\s\S]*?)<\/b>/g
  let last = 0
  let m
  while ((m = re.exec(rich))) {
    if (m.index > last) out.push({ b: false, s: rich.slice(last, m.index) })
    out.push({ b: true, s: m[1] })
    last = m.index + m[0].length
  }
  if (last < rich.length) out.push({ b: false, s: rich.slice(last) })
  return out
}
