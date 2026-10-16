// Feed event queue (docs/V2-CONTRACT.md 17.4/17.5). A module-level singleton, so any card can log
// without prop drilling: impressions come from useFeedEvents, like / comment / order_tap from the
// post card and the comment thread. Batched: flushed 10 s after the first queued event, when the
// tab is hidden, and before unload; at most 50 events per call. Plain RPC (no beacon). Fire and
// forget: a failed batch is dropped, never retried, never shown.
import { supabase } from '../../lib/supabase'
import { logFeedEvents } from './api'

const FLUSH_MS = 10000
const MAX_BATCH = 50
const ANON_KEY = 'rufesto_feed_anon'        // random per-device id for signed-out viewers (>= 8 chars [A-Za-z0-9_-])
const KEY_OK = /^[A-Za-z0-9_-]{8,64}$/
const EVENTS = ['impression', 'open', 'like', 'comment', 'save', 'order_tap', 'hide']

let queue = []
let timer = null
let disabled = false                         // log_feed_events is not deployed on this database yet
let signedIn = null                          // null = not known yet: the key is then sent (a signed-in answer ignores it)
let wired = false
let memKey = null

function newKey() {
  try {
    const b = crypto.getRandomValues(new Uint8Array(16))
    return Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
  } catch {
    return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
  }
}

function anonKey() {
  try {
    const stored = localStorage.getItem(ANON_KEY)
    if (stored && KEY_OK.test(stored)) return stored
    const fresh = newKey()
    localStorage.setItem(ANON_KEY, fresh)
    return fresh
  } catch {
    memKey = memKey || newKey()               // storage blocked: one key per page load
    return memKey
  }
}

function wire() {
  if (wired || typeof document === 'undefined') return
  wired = true
  const hidden = () => { if (document.visibilityState === 'hidden') flushFeedEvents() }
  document.addEventListener('visibilitychange', hidden)
  window.addEventListener('pagehide', flushFeedEvents)
  window.addEventListener('beforeunload', flushFeedEvents)
  try {
    supabase.auth.onAuthStateChange((_event, session) => { signedIn = !!session })
  } catch { /* auth not available: keep sending the key */ }
}

function schedule(ms) {
  if (timer === null) timer = setTimeout(flushFeedEvents, ms)
}

/** Sends up to 50 queued events now. Safe to call any time (empty queue = no-op). */
export async function flushFeedEvents() {
  clearTimeout(timer)
  timer = null
  if (disabled) { queue = []; return }
  if (queue.length === 0) return
  const batch = queue.splice(0, MAX_BATCH)
  const payload = signedIn ? batch : batch.map(e => ({ ...e, anon_key: anonKey() }))
  const { error } = await logFeedEvents(payload)
  if (error?.code === 'unavailable') disabled = true
  if (queue.length) schedule(queue.length >= MAX_BATCH ? 0 : FLUSH_MS)
}

/**
 * Queue one event. `type` 'post' | 'promo'; `event` one of EVENTS; `pool` / `position` are optional
 * (posts opened outside Home carry none).
 */
export function logFeedEvent({ type, id, event, pool = null, position = null }) {
  if (disabled || !id || !EVENTS.includes(event) || (type !== 'post' && type !== 'promo')) return
  wire()
  const row = { item_type: type, item_id: id, event }
  if (pool) row.pool = pool
  if (Number.isInteger(position) && position > 0 && position < 32768) row.position = position
  queue.push(row)
  if (queue.length >= MAX_BATCH) flushFeedEvents()
  else schedule(FLUSH_MS)
}
