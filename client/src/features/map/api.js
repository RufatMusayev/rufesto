// The one call of the map: map_places(p_bbox) -> jsonb (sql/70_map_places.sql, V2-CONTRACT 26; docs/MAP-PLAN-2026-10-18.md 5.1).
// Every venue in one answer (about 500 B each); filtering, sorting and distances happen on the phone. p_bbox is not sent
// until the venue count passes 300 (plan M4). Functions never throw: { data, error }.
import { supabase } from '../../lib/supabase'
import { normKind } from './kind'

const num = v => {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const text = v => (typeof v === 'string' && v ? v : null)

function normFriends(f) {
  if (!f || typeof f !== 'object') return null
  const top = Array.isArray(f.top) ? f.top : []
  return {
    count: Math.max(0, Math.round(num(f.count) ?? 0)),
    top: top.slice(0, 3).map(x => ({ id: text(x?.id), name: text(x?.name) || '', profile_photo: text(x?.profile_photo) })),
  }
}

function normPromo(p) {
  if (!p || typeof p !== 'object') return null
  return {
    id: p.id ?? null,
    title: text(p.title),
    discount_percent: num(p.discount_percent),
    discount_amount: num(p.discount_amount),
    ends_at: text(p.ends_at),
  }
}

/** One item of `places` -> what the UI and MapCanvas read. Venues without real coordinates are dropped (never invent a pin). */
export function normalizePlace(p) {
  if (!p || p.id == null) return null
  const lat = num(p.lat)
  const lng = num(p.lng)
  if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return {
    id: String(p.id),
    slug: text(p.slug),
    name: text(p.name) || '',
    kind: normKind(p.kind),
    cuisine_type: text(p.cuisine_type),
    lat,
    lng,
    address: text(p.address),
    rating: num(p.rating),
    review_count: Math.max(0, Math.round(num(p.review_count) ?? 0)),
    price_band: p.price_band == null ? null : Math.min(3, Math.max(1, Math.round(num(p.price_band) ?? 1))),
    cover: text(p.cover),
    open_now: !!p.open_now,
    closes_at: text(p.closes_at),
    opens_at: text(p.opens_at),
    opens_day: text(p.opens_day),
    promo: normPromo(p.promo),
    followed: p.followed == null ? null : !!p.followed,
    friends: normFriends(p.friends),
  }
}

async function request() {
  try {
    const { data, error } = await supabase.rpc('map_places', {})
    if (error) return { data: null, error }
    const list = Array.isArray(data?.places) ? data.places : []
    return {
      data: {
        places: list.map(normalizePlace).filter(Boolean),
        signedIn: !!data?.signed_in,
        generatedAt: text(data?.generated_at),
      },
      error: null,
    }
  } catch (error) {
    return { data: null, error }
  }
}

// prefetch.js starts the request when the guest shows intent on the Map tab (pointerdown / hover); the screen takes the
// answer if it is still fresh. It may have gone out before the session was restored, so the caller checks signedIn.
const WARM_MS = 10000
let warm = null

/** Called by prefetch.js (prefetchMap). */
export function prefetchPlaces() {
  if (!warm || Date.now() - warm.at > WARM_MS) warm = { at: Date.now(), promise: request() }
}

/** -> { data: { places, signedIn, generatedAt }, error: null } | { data: null, error }; { fresh: true } skips a warm answer. */
export function fetchMapPlaces({ fresh = false } = {}) {
  if (!fresh && warm && Date.now() - warm.at <= WARM_MS) {
    const p = warm.promise
    warm = null
    return p
  }
  warm = null
  return request()
}

/** The social fields belong to one person: a snapshot kept for another uid (or for nobody) loses them. */
export function withoutSocial(places) {
  return places.map(p => (p.followed == null && p.friends == null ? p : { ...p, followed: null, friends: null }))
}
