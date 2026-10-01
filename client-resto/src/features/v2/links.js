import { consumerHost } from '../../lib/qr'

/**
 * Link a guest opens to join a group booking: <origin>/b/<code> on the consumer
 * host derived from where the dashboard is served (see lib/qr.js). Returns the
 * bare code when the dashboard host can't be mapped to a consumer host.
 */
export function inviteLink(code, loc = window.location) {
  const host = consumerHost(loc.host)
  return host ? `${loc.protocol}//${host}/b/${encodeURIComponent(code)}` : code
}

/** Copies text to the clipboard. Resolves true on success, false otherwise. */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.className = 'v2-sr-only'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}
