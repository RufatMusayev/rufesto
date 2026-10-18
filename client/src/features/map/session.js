// The map remembers where the guest was (docs/MAP-PLAN-2026-10-18.md 4, "Session"): camera, snap, filters and the last
// answer of map_places, in sessionStorage['rufesto_map_v1'] for 30 minutes. Every access is wrapped: storage can be
// blocked, full or hold something old; the map then simply starts fresh. The venue list is kept with the uid it was
// fetched for, and the social fields (followed, friends) are only used again for the same uid.
const KEY = 'rufesto_map_v1'
const TTL_MS = 30 * 60 * 1000
const MAX_CHARS = 400000

export function readSession() {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw)
    if (!s || s.v !== 1 || typeof s.at !== 'number' || Date.now() - s.at > TTL_MS) return null
    return s
  } catch {
    return null
  }
}

let timer = 0
let pending = null

/** Debounced write of a full snapshot (the caller passes the whole thing; `at` is added here). */
export function saveSession(snapshot) {
  pending = snapshot
  clearTimeout(timer)
  timer = setTimeout(flushSession, 400)
}

export function flushSession() {
  clearTimeout(timer)
  if (!pending) return
  const snap = pending
  pending = null
  try {
    let raw = JSON.stringify({ v: 1, at: Date.now(), ...snap })
    if (raw.length > MAX_CHARS) raw = JSON.stringify({ v: 1, at: Date.now(), ...snap, places: null })
    sessionStorage.setItem(KEY, raw)
  } catch { /* blocked or full: nothing to restore next time */ }
}

export function clearSession() {
  pending = null
  clearTimeout(timer)
  try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushSession)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSession() })
}
