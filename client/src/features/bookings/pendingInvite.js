// Remembers an invite code from a /b/:code link across a sign-in round trip (Google/Apple OAuth and
// emailed magic links leave the SPA, so React state alone would be lost). Same idea and shape as
// lib/pendingClaim.js: per tab in sessionStorage, only the code that was already in the URL, 10-minute TTL.

const KEY = 'rufesto_pending_invite'
const TTL_MS = 10 * 60 * 1000

/** A clean upper-case invite code (8 chars from the server alphabet, loosely checked), or null. */
export function sanitizeInviteCode(raw) {
  const code = String(raw ?? '').trim().toUpperCase()
  return /^[A-Z0-9]{4,16}$/.test(code) ? code : null
}

export function rememberPendingInvite(code) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() })) } catch { /* storage unavailable */ }
}

export function readPendingInvite() {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const { code, at } = JSON.parse(raw)
    if (!at || Date.now() - at > TTL_MS) { sessionStorage.removeItem(KEY); return null }
    return sanitizeInviteCode(code)
  } catch {
    return null
  }
}

export function clearPendingInvite() {
  try { sessionStorage.removeItem(KEY) } catch { /* storage unavailable */ }
}
