// Text and target of one web push, in az or en. Pure (no imports, no I/O) so it can be unit tested with
// node or deno. Wording mirrors the in-app inbox: client/src/lib/notificationView.js and
// client/src/locales/{en,az}/notifications.json. Staff types are worded for staff.
//
// Payloads are JSON text (legacy column type) or an object (jsonb); older rows can be plain text.

export type Lang = 'az' | 'en'

export interface NotifRow {
  id: string
  user_id: string
  type: string
  payload?: unknown
  audience?: string | null
  group_key?: string | null
  restaurant_id?: string | null
  actor_id?: string | null
}

export interface RenderCtx {
  lang: Lang
  consumerOrigin: string
  dashboardOrigin: string
  actorName?: string | null
  restaurantName?: string | null
  restaurantSlug?: string | null
  tableNumber?: string | null
}

export interface Rendered {
  title: string
  body: string
  url: string
  tag: string
  icon: string
  badge: string
  urgent: boolean
}

type Obj = Record<string, unknown>
type Pair = [string, string]
type Entry = { en: Pair; az: Pair }

export const ICON_PATH = '/icons/icon-192.png'
export const BADGE_PATH = '/icons/badge-72.png'
const URGENT = new Set(['order_ready', 'waiter_called', 'bill_requested', 'join_request'])

export function normalizeLang(...candidates: unknown[]): Lang {
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim().toLowerCase().startsWith('en') ? 'en' : 'az'
  }
  return 'az'
}

export function parsePayload(raw: unknown): Obj | null {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Obj
  if (typeof raw !== 'string') return null
  const s = raw.trim()
  if (!s.startsWith('{')) return null
  try {
    const o = JSON.parse(s)
    return o && typeof o === 'object' && !Array.isArray(o) ? (o as Obj) : null
  } catch {
    return null
  }
}

// ---- Wording ---------------------------------------------------------------------------------------------

const T: Record<string, Entry> = {
  friend_request: { en: ['Friend request', '{name} sent you a friend request.'], az: ['Dostluq sorğusu', '{name} sizə dostluq sorğusu göndərdi.'] },
  friend_accepted: { en: ['New friend', '{name} accepted your friend request.'], az: ['Yeni dost', '{name} dostluq sorğunuzu qəbul etdi.'] },
  post_like: { en: ['New like', '{name} liked your post.'], az: ['Yeni bəyənmə', '{name} paylaşımınızı bəyəndi.'] },
  post_comment: { en: ['New comment', '{name} commented: “{snippet}”'], az: ['Yeni şərh', '{name} şərh yazdı: “{snippet}”'] },
  post_comment_plain: { en: ['New comment', '{name} commented on your post.'], az: ['Yeni şərh', '{name} paylaşımınıza şərh yazdı.'] },
  review_like: { en: ['Review liked', '{name} liked your review of {dish}.'], az: ['Rəyiniz bəyənildi', '{name} {dish} haqqında rəyinizi bəyəndi.'] },
  review_like_plain: { en: ['Review liked', '{name} liked your review.'], az: ['Rəyiniz bəyənildi', '{name} rəyinizi bəyəndi.'] },
  review_reply: { en: ['New reply', '{name} replied to your review of {dish}.'], az: ['Rəyinizə cavab', '{name} {dish} haqqında rəyinizə cavab verdi.'] },
  review_reply_plain: { en: ['New reply', '{name} replied to your review.'], az: ['Rəyinizə cavab', '{name} rəyinizə cavab verdi.'] },
  booking_invite: { en: ['Booking invitation', '{host} invited you to {restaurant}, {when}.'], az: ['Rezervasiya dəvəti', '{host} sizi {restaurant} məkanına dəvət etdi, {when}.'] },
  booking_member_joined: { en: ['Booking update', '{name} joined your booking.'], az: ['Rezervasiya', '{name} rezervasiyanıza qoşuldu.'] },
  booking_seated: { en: ['Your table is ready', 'Your group is seated at table {number}.'], az: ['Masanız hazırdır', 'Qrupunuz {number} nömrəli masaya yerləşdirildi.'] },
  group_confirmed: { en: ['Booking confirmed', 'Your booking at {restaurant} ({when}) is confirmed.'], az: ['Rezervasiya təsdiqləndi', '{restaurant} üzrə rezervasiyanız ({when}) təsdiqləndi.'] },
  group_cancelled: { en: ['Booking cancelled', 'Your booking at {restaurant} ({when}) was cancelled.'], az: ['Rezervasiya ləğv edildi', '{restaurant} üzrə rezervasiyanız ({when}) ləğv edildi.'] },
  group_no_show: { en: ['Booking marked no-show', 'Your booking at {restaurant} ({when}) was marked as a no-show.'], az: ['Rezervasiya: gəlmədi', '{restaurant} üzrə rezervasiyanız ({when}) gəlmədi kimi qeyd olundu.'] },
  booking_reminder: { en: ['Booking in 1 hour', 'Your booking at {restaurant} starts at {time}.'], az: ['Rezervasiya 1 saat sonra', '{restaurant} üzrə rezervasiyanız 1 saat sonra başlayır ({time}).'] },
  bill_settled: { en: ['Bill paid', 'Your bill is paid ({total}). Receipt {receipt}.'], az: ['Hesab ödənildi', 'Hesabınız ödənildi ({total}). Qəbz: {receipt}.'] },
  bill_settled_at: { en: ['Bill paid', 'Your bill at {restaurant} is paid ({total}). Receipt {receipt}.'], az: ['Hesab ödənildi', '{restaurant} üzrə hesabınız ödənildi ({total}). Qəbz: {receipt}.'] },
  join_request: { en: ['Table request', '{name} wants to join your table.'], az: ['Masa sorğusu', '{name} masanıza qoşulmaq istəyir.'] },
  join_request_staff: { en: ['Join request', '{name} wants to join table {table}.'], az: ['Qoşulma sorğusu', '{name} {table} nömrəli masaya qoşulmaq istəyir.'] },
  join_request_staff_plain: { en: ['Join request', '{name} wants to join a table.'], az: ['Qoşulma sorğusu', '{name} masaya qoşulmaq istəyir.'] },
  join_approved: { en: ['You are in', 'You’ve been let in — you can start ordering!'], az: ['Masaya qoşuldunuz', 'Sizi buraxdılar — indi sifariş verə bilərsiniz!'] },
  join_declined: { en: ['Join request declined', 'Your request to join the table wasn’t approved.'], az: ['Sorğu təsdiqlənmədi', 'Masaya qoşulma sorğunuz təsdiqlənmədi.'] },
  order_ready: { en: ['Your food is ready', '{dishes}'], az: ['Yeməyiniz hazırdır', '{dishes}'] },
  order_ready_plain: { en: ['Your food is ready', 'Your order is ready!'], az: ['Yeməyiniz hazırdır', 'Sifarişiniz hazırdır!'] },
  place_post: { en: ['New post', '{restaurant} shared a new post.'], az: ['Yeni paylaşım', '{restaurant} yeni paylaşım etdi.'] },
  // staff
  bill_requested: { en: ['Bill requested', 'Table {table} asked for the bill.'], az: ['Hesab istənildi', '{table} nömrəli masa hesab istədi.'] },
  bill_requested_plain: { en: ['Bill requested', 'A table asked for the bill.'], az: ['Hesab istənildi', 'Masa hesab istədi.'] },
  waiter_called: { en: ['Waiter called', 'Table {table} {action}.'], az: ['Ofisiant çağırıldı', '{table} nömrəli masa {action}.'] },
  waiter_called_plain: { en: ['Waiter called', 'A table called the waiter.'], az: ['Ofisiant çağırıldı', 'Masa ofisiant çağırdı.'] },
  bill_paid: { en: ['Payment received', '{who} paid{amount}{method}.'], az: ['Ödəniş qəbul edildi', '{who}{amount}{method} ödədi.'] },
  booking_created: { en: ['New booking', 'New booking request.'], az: ['Yeni rezervasiya', 'Yeni rezervasiya sorğusu.'] },
  booking_created_detail: { en: ['New booking', 'New booking request: {detail}.'], az: ['Yeni rezervasiya', 'Yeni rezervasiya sorğusu: {detail}.'] },
  review_received: { en: ['New review', '{dish} got a {rating}-star review.'], az: ['Yeni rəy', '{dish} üçün {rating} ulduzlu rəy gəldi.'] },
  review_received_dish: { en: ['New review', '{dish} got a new review.'], az: ['Yeni rəy', '{dish} üçün yeni rəy gəldi.'] },
  review_received_plain: { en: ['New review', 'A guest left a new review.'], az: ['Yeni rəy', 'Qonaq yeni rəy yazdı.'] },
  stock_low: { en: ['Low stock', '{ingredient} is running low.'], az: ['Stok xəbərdarlığı', '{ingredient} azalıb.'] },
  stock_out: { en: ['Out of stock', '{ingredient} is out of stock.'], az: ['Stok bitib', '{ingredient} qurtarıb.'] },
  stock_plain: { en: ['Stock alert', 'An ingredient is running low.'], az: ['Stok xəbərdarlığı', 'Bir inqrediyent azalıb.'] },
  system: { en: ['Rufesto', 'System notification.'], az: ['Rufesto', 'Sistem bildirişi.'] },
}

const WAITER_ACTION: Record<string, { en: string; az: string }> = {
  assist: { en: 'needs assistance', az: 'kömək istəyir' },
  water: { en: 'asked for water', az: 'su istəyir' },
  cutlery: { en: 'asked for cutlery', az: 'çəngəl-bıçaq istəyir' },
  clean: { en: 'asks to have the table cleaned', az: 'təmizlik istəyir' },
}

// bill_paid: how the table paid, as it follows the amount in each language (unknown methods add nothing)
const PAY_METHOD: Record<string, { en: string; az: string }> = {
  card: { en: ' by card', az: ' kartla' },
  cash: { en: ' in cash', az: ' nağd' },
}

const WORDS = {
  someone: { en: 'Someone', az: 'Kimsə' },
  aRestaurant: { en: 'the restaurant', az: 'restoran' },
  guests: { en: 'guests', az: 'nəfər' },
  more: { en: 'and {n} more', az: 'və daha {n} ədəd' },
}

// ---- Small helpers ---------------------------------------------------------------------------------------

const MONTHS = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  az: ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avq', 'sen', 'okt', 'noy', 'dek'],
}
// Sunday first, like Date#getDay
const DAYS = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  az: ['baz', 'b.e.', 'ç.a.', 'çər', 'c.a.', 'cümə', 'şən'],
}
const BAKU_OFFSET_MS = 4 * 3600 * 1000 // Asia/Baku is UTC+4 all year (no DST since 2016)

const pad2 = (n: number) => String(n).padStart(2, '0')

/** 'HH:MM' on the Baku clock; '' for an invalid instant. */
export function bakuTime(iso: unknown): string {
  const d = new Date(String(iso ?? ''))
  if (Number.isNaN(d.getTime())) return ''
  const b = new Date(d.getTime() + BAKU_OFFSET_MS)
  return `${pad2(b.getUTCHours())}:${pad2(b.getUTCMinutes())}`
}

/** "Fri 2 Oct, 19:30" / "cümə, 2 okt, 19:30" (same shape as the in-app inbox); '' for an invalid instant. */
export function bakuWhen(iso: unknown, lang: Lang): string {
  const d = new Date(String(iso ?? ''))
  if (Number.isNaN(d.getTime())) return ''
  const b = new Date(d.getTime() + BAKU_OFFSET_MS)
  const wd = DAYS[lang][b.getUTCDay()]
  const date = `${b.getUTCDate()} ${MONTHS[lang][b.getUTCMonth()]}`
  return `${lang === 'az' ? `${wd}, ${date}` : `${wd} ${date}`}, ${bakuTime(iso)}`
}

const str = (v: unknown, max = 80): string => {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v !== 'string') return ''
  // drop control characters, collapse whitespace, cap length
  // deno-lint-ignore no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s
}

const fmt = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_m, k) => vars[k] ?? '')
const enc = (v: unknown) => encodeURIComponent(String(v))
const price = (v: unknown) => (v == null || v === '' || Number.isNaN(Number(v)) ? '' : `₼${Number(v).toFixed(2)}`)
const idOf = (v: unknown) => (typeof v === 'string' && /^[0-9a-zA-Z_-]{1,64}$/.test(v) ? v : '')

function dishNames(p: Obj): string[] {
  const out: string[] = []
  const take = (v: unknown) => {
    if (typeof v === 'string') out.push(str(v, 60))
    else if (v && typeof v === 'object') {
      const o = v as Obj
      out.push(str(o.name ?? o.dish_name ?? o.dish ?? '', 60))
    }
  }
  for (const key of ['dishes', 'dish_names', 'items']) {
    if (Array.isArray(p[key])) (p[key] as unknown[]).forEach(take)
  }
  return out.filter(Boolean)
}

/**
 * False for rows that must never reach a phone. A friend_request that already carries a `status`
 * (accepted | declined | cancelled) is history: the request was answered or withdrawn and the row is read.
 */
export function isPushable(row: NotifRow, p: Obj | null): boolean {
  if (row.type === 'friend_request' && p && p.status != null && p.status !== '') return false
  return true
}

/** Which lookups the caller should do before render() so the text carries the names the inbox shows. */
export function needsLookup(row: NotifRow, p: Obj | null) {
  const t = row.type
  const payload = p ?? {}
  return {
    table: ['bill_requested', 'bill_paid', 'waiter_called', 'join_request'].includes(t) && !payload.table_number && !!payload.table_id,
    restaurant:
      ['booking_invite', 'booking_confirmed', 'booking_cancelled', 'booking_no_show', 'booking_reminder', 'bill_settled', 'place_post', 'review_like', 'review_reply'].includes(t) &&
      !!(row.restaurant_id || payload.restaurant_id) &&
      !(payload.restaurant_name && payload.restaurant_slug),
    actor:
      ['friend_request', 'friend_accepted', 'post_like', 'post_comment', 'review_like', 'review_reply', 'booking_member_joined', 'join_request'].includes(t) &&
      !payload.name &&
      !!row.actor_id,
  }
}

// ---- Render ----------------------------------------------------------------------------------------------

export function render(row: NotifRow, ctx: RenderCtx): Rendered {
  const lang = ctx.lang
  const staff = row.audience === 'staff'
  const p = parsePayload(row.payload)
  const origin = (staff ? ctx.dashboardOrigin : ctx.consumerOrigin).replace(/\/+$/, '')

  const someone = WORDS.someone[lang]
  const name = str(p?.name, 40) || str(ctx.actorName, 40) || someone
  const restaurantName = str(p?.restaurant_name) || str(ctx.restaurantName) || WORDS.aRestaurant[lang]
  const slug = idOf(p?.restaurant_slug) || idOf(ctx.restaurantSlug)
  const table = str(p?.table_number, 16) || str(ctx.tableNumber, 16)
  const when = bakuWhen(p?.starts_at, lang)
  const bookingTo = p?.booking_id ? `/bookings/${enc(p.booking_id)}` : null
  const restaurantTo = slug ? `/restaurant/${enc(slug)}` : null

  let key = 'system'
  let vars: Record<string, string> = {}
  let to: string | null = null

  switch (row.type) {
    case 'friend_request':
      key = 'friend_request'; vars = { name }; to = '/friends?tab=requests'; break
    case 'friend_accepted':
      key = 'friend_accepted'; vars = { name }; to = p?.user_id ? `/u/${enc(p.user_id)}` : '/friends'; break
    case 'post_like':
      key = 'post_like'; vars = { name }; to = p?.post_id ? `/post/${enc(p.post_id)}` : null; break
    case 'post_comment': {
      const snippet = str(p?.snippet, 100)
      key = snippet ? 'post_comment' : 'post_comment_plain'; vars = { name, snippet }
      to = p?.post_id ? `/post/${enc(p.post_id)}` : null; break
    }
    case 'review_like':
    case 'review_reply': {
      const dish = str(p?.dish_name ?? p?.dish, 60)
      key = dish ? row.type : `${row.type}_plain`; vars = { name, dish }
      to = restaurantTo ? (p?.dish_id ? `${restaurantTo}?dish=${enc(p.dish_id)}` : restaurantTo) : null; break
    }
    case 'booking_invite':
      key = 'booking_invite'; vars = { host: str(p?.host, 40) || someone, restaurant: restaurantName, when }
      to = p?.code ? `/b/${enc(p.code)}` : bookingTo; break
    case 'booking_member_joined':
      key = 'booking_member_joined'; vars = { name }; to = bookingTo; break
    case 'booking_seated':
      key = 'booking_seated'; vars = { number: str(p?.table_number, 16) }; to = bookingTo ?? '/table'; break
    case 'booking_confirmed':
      key = 'group_confirmed'; vars = { restaurant: restaurantName, when }; to = bookingTo; break
    case 'booking_cancelled':
      key = 'group_cancelled'; vars = { restaurant: restaurantName, when }; to = bookingTo; break
    case 'booking_no_show':
      key = 'group_no_show'; vars = { restaurant: restaurantName, when }; to = bookingTo; break
    case 'booking_reminder':
      key = 'booking_reminder'; vars = { restaurant: restaurantName, time: bakuTime(p?.starts_at) }; to = bookingTo; break
    case 'bill_settled':
      key = p?.restaurant_name || ctx.restaurantName ? 'bill_settled_at' : 'bill_settled'
      vars = { total: price(p?.total), receipt: str(p?.receipt, 40), restaurant: restaurantName }
      to = p?.bill_id ? `/receipt/${enc(p.bill_id)}` : restaurantTo; break
    case 'join_request':
      if (staff) {
        key = table ? 'join_request_staff' : 'join_request_staff_plain'; vars = { name, table }; to = '/tables'
      } else {
        key = 'join_request'; vars = { name }; to = '/table'
      }
      break
    case 'join_approved':
      key = 'join_approved'; to = '/table'; break
    case 'join_declined':
      key = 'join_declined'; break
    case 'order_ready': {
      const names = dishNames(p ?? {})
      const shown = names.slice(0, 3).join(', ')
      const extra = names.length > 3 ? ` ${fmt(WORDS.more[lang], { n: String(names.length - 3) })}` : ''
      key = names.length ? 'order_ready' : 'order_ready_plain'; vars = { dishes: `${shown}${extra}` }; to = '/table'; break
    }
    case 'place_post':
      key = 'place_post'; vars = { restaurant: restaurantName }
      to = p?.post_id ? `/post/${enc(p.post_id)}` : restaurantTo; break
    // ---- staff
    case 'bill_requested':
      key = table ? 'bill_requested' : 'bill_requested_plain'; vars = { table }
      to = p?.table_id ? `/bills?table=${enc(p.table_id)}` : '/bills'; break
    case 'bill_paid': {
      const amount = price(p?.amount ?? p?.total)
      key = 'bill_paid'
      vars = {
        who: table ? (lang === 'en' ? `Table ${table}` : `${table} nömrəli masa`) : (lang === 'en' ? 'A table' : 'Masa'),
        amount: amount ? ` ${amount}` : '',
        method: PAY_METHOD[str(p?.method, 20).toLowerCase()]?.[lang] ?? '',
      }
      to = p?.table_id ? `/bills?table=${enc(p.table_id)}` : '/bills'; break
    }
    case 'waiter_called': {
      const action = WAITER_ACTION[str(p?.kind, 20)] ?? WAITER_ACTION.assist
      key = table ? 'waiter_called' : 'waiter_called_plain'; vars = { table, action: action[lang] }
      to = '/waiter'; break
    }
    case 'booking_created': {
      const size = Number(p?.party_size)
      const parts = [str(p?.host, 40), size > 0 ? `${size} ${WORDS.guests[lang]}` : '', when].filter(Boolean)
      key = parts.length ? 'booking_created_detail' : 'booking_created'; vars = { detail: parts.join(', ') }
      to = '/bookings'; break
    }
    case 'review_received': {
      const dish = str(p?.dish_name ?? p?.dish, 60)
      const rating = Number(p?.rating)
      const rated = p?.rating != null && Number.isFinite(rating) && rating >= 1 && rating <= 5
      key = dish ? (rated ? 'review_received' : 'review_received_dish') : 'review_received_plain'
      vars = { dish, rating: rated ? String(Math.round(rating * 10) / 10) : '' }
      to = '/menu'; break
    }
    case 'stock_alert': {
      const ingredient = str(p?.ingredient_name ?? p?.ingredient ?? p?.name, 60)
      const out = /out|empty|zero|depleted/i.test(str(p?.alert_type, 30))
      key = ingredient ? (out ? 'stock_out' : 'stock_low') : 'stock_plain'; vars = { ingredient }
      to = '/menu'; break
    }
    default: {
      // Unknown type: plain text payloads (legacy rows) are shown as they are; JSON is never printed.
      const text = !p && typeof row.payload === 'string' ? str(row.payload, 160) : ''
      if (text) return finish(row, origin, T.system[lang][0], text, null)
    }
  }

  const pair = (T[key] ?? T.system)[lang]
  return finish(row, origin, fmt(pair[0], vars), fmt(pair[1], vars).replace(/\s+/g, ' ').trim(), to)
}

function finish(row: NotifRow, origin: string, title: string, body: string, to: string | null): Rendered {
  // The target always starts with '/', so a payload can never point the push at another site.
  const path = to && to.startsWith('/') ? to : row.audience === 'staff' ? '/' : '/notifications'
  return {
    title,
    body: body.length > 200 ? `${body.slice(0, 199).trimEnd()}…` : body,
    url: `${origin}${path}`,
    tag: row.group_key || row.type,
    icon: `${origin}${ICON_PATH}`,
    badge: `${origin}${BADGE_PATH}`,
    urgent: URGENT.has(row.type),
  }
}
