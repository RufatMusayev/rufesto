// Remembers a table code from a /t/:code QR deep link across a sign-in round trip
// (Google/Apple OAuth and emailed magic links leave the SPA, so React state alone
// would be lost). Stored per tab in sessionStorage; never contains tokens or user data,
// only the code that was already in the URL, and it expires quickly.

const KEY = 'rufesto_pending_claim'
const TTL_MS = 10 * 60 * 1000

/** Returns a clean table code, or null if the value can't be one.
 *  Access codes look like BELLAROM-AB23XZ; scanned tokens are UUIDs. */
export function sanitizeTableCode(raw) {
  const code = String(raw ?? '').trim()
  return /^[A-Za-z0-9_-]{1,64}$/.test(code) ? code : null
}

export function rememberPendingClaim(code) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() })) } catch { /* storage unavailable */ }
}

export function readPendingClaim() {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const { code, at } = JSON.parse(raw)
    if (!at || Date.now() - at > TTL_MS) { sessionStorage.removeItem(KEY); return null }
    return sanitizeTableCode(code)
  } catch {
    return null
  }
}

export function clearPendingClaim() {
  try { sessionStorage.removeItem(KEY) } catch { /* storage unavailable */ }
}
