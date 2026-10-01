// Table QR codes encode a link into the consumer app, not a bare code:
//   https://<consumer host>/t/<table_code>
// The consumer route passes <table_code> to the claim_table(p_code) RPC, which
// accepts a row's `access_code` (case-insensitive) from table_access_codes.
//
// Both SPAs ship in one image and are told apart by host, so the consumer host
// is derived from where the dashboard itself is served instead of being
// hardcoded (one build must work for preview and prod):
//   resto.rufat-server.com -> rufat-server.com
//   resto.rufesto.com      -> rufesto.com
//   localhost:5174         -> localhost:5173   (Vite dev servers)
// Any other host (an IP, a bare domain, a Docker/LAN name) can't be mapped to
// the consumer app, and a QR that points nowhere is worse than none, so no link
// is produced for it.

const RESTO_PREFIX = 'resto.'
const DEV_RESTO_PORT = ':5174'
const DEV_CONSUMER_PORT = ':5173'
const LOCAL_HOSTNAMES = ['localhost', '127.0.0.1']

/**
 * Consumer-app host for a dashboard host (e.g. 'resto.rufesto.com' ->
 * 'rufesto.com'), or null when the dashboard isn't on a resto.* / localhost host.
 */
export function consumerHost(host) {
  let h = String(host || '').toLowerCase()
  const hostname = h.replace(/:\d+$/, '')
  const isResto = hostname.startsWith(RESTO_PREFIX) && hostname.length > RESTO_PREFIX.length
  const isLocal = LOCAL_HOSTNAMES.includes(hostname)
  if (!isResto && !isLocal) return null
  if (isResto) h = h.slice(RESTO_PREFIX.length)
  if (h.endsWith(DEV_RESTO_PORT)) h = h.slice(0, -DEV_RESTO_PORT.length) + DEV_CONSUMER_PORT
  return h
}

/**
 * Absolute link a table's QR code should open: <origin>/t/<code>, or null when
 * this dashboard host can't be mapped to a consumer host (see consumerHost).
 */
export function tableQrUrl(code, loc = window.location) {
  const host = consumerHost(loc.host)
  return host ? `${loc.protocol}//${host}/t/${encodeURIComponent(code)}` : null
}
