// Rufesto consumer service worker: web push only. No fetch handler and no cache: API data and the app shell are
// never served from here, so a deploy is never held back by this file (nginx sends it with Cache-Control: no-cache).
//
// push              -> showNotification (title, body, tag, icon, badge, data.url)
// notificationclick -> focus an open Rufesto tab and send it to the url (the SPA navigates without a reload), else
//                      open a new window at the url.
//
// Push body (JSON, written by supabase/functions/send-push):
//   { title, body, url, tag?, icon?, badge?, image?, urgency?, id? }
// `url` may be absolute (the function builds it from CONSUMER_ORIGIN) or a path; only its path, query and hash are used,
// always on THIS origin, so the same build works on preview and prod and a url can never send the guest elsewhere.
// A push that cannot be parsed still shows a generic notification (iOS / Safari revoke a subscription that goes silent).

const ICON = '/icons/icon-192.png'
const BADGE = '/icons/badge-72.png'
const NAVIGATE = 'rufesto:navigate'

self.addEventListener('install', () => { self.skipWaiting() })
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()) })

function readPush(event) {
  if (!event.data) return {}
  try { return event.data.json() || {} } catch (e) { /* not JSON */ }
  try { return { body: event.data.text() } } catch (e) { return {} }
}

/** Path + query + hash on this origin; '/' for anything that is not an http(s) url. */
function localUrl(raw) {
  try {
    const u = new URL(raw || '/', self.location.origin)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '/'
    return (u.pathname || '/') + u.search + u.hash
  } catch (e) { return '/' }
}

self.addEventListener('push', event => {
  const d = readPush(event)
  const nested = d.data && typeof d.data === 'object' ? d.data : {}
  const tag = typeof d.tag === 'string' && d.tag ? d.tag : undefined
  const options = {
    body: typeof d.body === 'string' ? d.body : '',
    icon: typeof d.icon === 'string' && d.icon ? d.icon : ICON,
    badge: typeof d.badge === 'string' && d.badge ? d.badge : BADGE,
    tag,
    // a replaced notification (same tag) still alerts: the phone shows the newest wording instead of stacking
    renotify: !!tag,
    timestamp: Date.now(),
    data: { url: localUrl(d.url || nested.url), id: d.id || nested.id || null },
  }
  if (typeof d.image === 'string' && d.image) options.image = d.image
  event.waitUntil(self.registration.showNotification(String(d.title || 'Rufesto'), options))
})

// Ask a page to navigate itself (router, no reload). Resolves true when the page confirmed within `ms`.
function askToNavigate(client, url, ms) {
  return new Promise(resolve => {
    let done = false
    const finish = ok => { if (!done) { done = true; resolve(ok) } }
    try {
      const ch = new MessageChannel()
      ch.port1.onmessage = () => finish(true)
      client.postMessage({ type: NAVIGATE, url }, [ch.port2])
      setTimeout(() => finish(false), ms)
    } catch (e) { finish(false) }
  })
}

async function openOrFocus(url) {
  const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const mine = all.filter(c => { try { return new URL(c.url).origin === self.location.origin } catch (e) { return false } })
  // the tab the guest is most likely looking at: focused, else visible, else any
  const client = mine.find(c => c.focused) || mine.find(c => c.visibilityState === 'visible') || mine[0]
  if (client) {
    try { await client.focus() } catch (e) { /* needs a real click: ignore, the navigation below still runs */ }
    if (await askToNavigate(client, url, 800)) return
    // an old tab without the listener: a plain navigation
    try { await client.navigate(url); return } catch (e) { /* fall through to a new window */ }
  }
  if (self.clients.openWindow) await self.clients.openWindow(url)
}

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = localUrl(event.notification.data && event.notification.data.url)
  event.waitUntil(openOrFocus(url))
})
