// send-push: delivers one `notifications` row as a Web Push message to every subscribed device of its
// recipient (docs/V2-CONTRACT.md section 21.3).
//
// Called by the database (AFTER INSERT trigger on notifications, pg_net) with POST { notification_id } and the
// shared secret in `x-push-secret`. verify_jwt is off (deploy with --no-verify-jwt): the secret is the gate.
// After the secret check this function always answers 200 with a small JSON summary and never echoes errors.
//
// Env: PUSH_WEBHOOK_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CONSUMER_ORIGIN,
// DASHBOARD_ORIGIN (set with `supabase secrets set`); SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected.
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { needsLookup, normalizeLang, parsePayload, render } from './render.ts'
import type { NotifRow } from './render.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TTL_SECONDS = 3600
const SEND_TIMEOUT_MS = 8000

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

/** Constant-time string compare: both sides are hashed first so length differences do not leak either. */
async function secretMatches(given: string | null, expected: string): Promise<boolean> {
  if (!given || !expected) return false
  const enc = new TextEncoder()
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(given)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ])
  const x = new Uint8Array(a)
  const y = new Uint8Array(b)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

let vapidReady = false
function setupVapid(): boolean {
  if (vapidReady) return true
  const subject = Deno.env.get('VAPID_SUBJECT')
  const pub = Deno.env.get('VAPID_PUBLIC_KEY')
  const priv = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!subject || !pub || !priv) return false
  try {
    webpush.setVapidDetails(subject, pub, priv)
  } catch {
    return false
  }
  vapidReady = true
  return true
}

const firstWord = (v: unknown) => (typeof v === 'string' ? v.trim().split(/\s+/)[0] || null : null)

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json(405, { ok: false, reason: 'method_not_allowed' })

  const expected = Deno.env.get('PUSH_WEBHOOK_SECRET') ?? ''
  if (!(await secretMatches(req.headers.get('x-push-secret'), expected))) {
    return json(401, { ok: false, reason: 'unauthorized' })
  }

  try {
    let body: { notification_id?: unknown } = {}
    try {
      body = await req.json()
    } catch {
      return json(200, { ok: false, reason: 'bad_request' })
    }
    const id = typeof body.notification_id === 'string' ? body.notification_id : ''
    if (!UUID.test(id)) return json(200, { ok: false, reason: 'bad_request' })

    if (!setupVapid()) {
      console.error('send-push: VAPID env is missing or invalid')
      return json(200, { ok: false, reason: 'not_configured' })
    }

    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !key) return json(200, { ok: false, reason: 'not_configured' })
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

    const { data: row, error: rowErr } = await db.from('notifications').select('*').eq('id', id).maybeSingle()
    if (rowErr || !row) return json(200, { ok: true, sent: 0, skipped: 'not_found' })
    const n = row as NotifRow & { audience?: string | null }
    const audience = n.audience === 'staff' ? 'staff' : 'guest'

    // Recipient settings. A switched-off device preference wins over a stale trigger decision.
    const [prefsRes, profileRes] = await Promise.all([
      db.from('notification_prefs').select('push_enabled, language').eq('user_id', n.user_id).maybeSingle(),
      db.from('customer_profiles').select('preferred_language').eq('user_id', n.user_id).maybeSingle(),
    ])
    const prefs = prefsRes.data as { push_enabled?: boolean | null; language?: string | null } | null
    if (prefs && prefs.push_enabled === false) return json(200, { ok: true, sent: 0, skipped: 'push_disabled' })
    const lang = normalizeLang(prefs?.language, (profileRes.data as { preferred_language?: string } | null)?.preferred_language)

    const { data: subs, error: subsErr } = await db
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth, fail_count')
      .eq('user_id', n.user_id)
      .eq('audience', audience)
    if (subsErr || !subs || subs.length === 0) return json(200, { ok: true, sent: 0, skipped: 'no_subscriptions' })

    // Names the inbox shows but the payload may not carry.
    const payload = parsePayload(n.payload)
    const need = needsLookup(n, payload)
    const restaurantId = n.restaurant_id ?? (typeof payload?.restaurant_id === 'string' ? payload.restaurant_id : null)
    const [tableRes, restRes, actorRes] = await Promise.all([
      need.table ? db.from('tables').select('table_number').eq('id', String(payload?.table_id)).maybeSingle() : null,
      need.restaurant && restaurantId ? db.from('restaurants').select('name, slug').eq('id', restaurantId).maybeSingle() : null,
      need.actor ? db.from('users').select('name').eq('id', String(n.actor_id)).maybeSingle() : null,
    ])

    const message = render(n, {
      lang,
      consumerOrigin: Deno.env.get('CONSUMER_ORIGIN') ?? 'https://rufat-server.com',
      dashboardOrigin: Deno.env.get('DASHBOARD_ORIGIN') ?? 'https://resto.rufat-server.com',
      tableNumber: (tableRes?.data as { table_number?: string } | null)?.table_number ?? null,
      restaurantName: (restRes?.data as { name?: string } | null)?.name ?? null,
      restaurantSlug: (restRes?.data as { slug?: string } | null)?.slug ?? null,
      actorName: firstWord((actorRes?.data as { name?: string } | null)?.name),
    })

    const data = JSON.stringify({
      title: message.title,
      body: message.body,
      url: message.url,
      tag: message.tag,
      icon: message.icon,
      badge: message.badge,
    })
    const options = { TTL: TTL_SECONDS, urgency: message.urgent ? 'high' : 'normal', timeout: SEND_TIMEOUT_MS } as const

    let sent = 0
    let removed = 0
    let failed = 0
    await Promise.all(
      subs.map(async (s: { id: string; endpoint: string; p256dh: string; auth: string; fail_count: number | null }) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, data, options)
          sent++
          await db.from('push_subscriptions').update({ last_ok_at: new Date().toISOString(), fail_count: 0 }).eq('id', s.id)
        } catch (e) {
          const status = (e as { statusCode?: number })?.statusCode
          // status and a clipped message only: never the endpoint, keys or payload
          console.error('send-push: delivery failed', status ?? 'no-status', String((e as Error)?.message ?? '').slice(0, 120))
          if (status === 404 || status === 410) {
            removed++
            await db.from('push_subscriptions').delete().eq('id', s.id)
          } else {
            failed++
            await db.from('push_subscriptions').update({ fail_count: (s.fail_count ?? 0) + 1 }).eq('id', s.id)
          }
        }
      }),
    )

    return json(200, { ok: true, sent, removed, failed })
  } catch (e) {
    // Never leak details to the caller; the platform log keeps the message for us.
    console.error('send-push: unexpected error', e instanceof Error ? e.message : 'unknown')
    return json(200, { ok: false, reason: 'internal' })
  }
})
