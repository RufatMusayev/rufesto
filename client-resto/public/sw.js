/* Rufesto dashboard service worker: web push only.
   No fetch handler and no caching: the dashboard always talks to the network, so this worker can never serve
   stale API data. Scope is the dashboard origin ("/"). The push payload is the JSON the send-push Edge Function
   sends: { title, body, url, tag, icon? } (V2-CONTRACT 21.3). */

self.addEventListener('install', () => { self.skipWaiting() })
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()) })

function readPayload(event) {
  if (!event.data) return {}
  try {
    return event.data.json() || {}
  } catch (e) {
    try { return { body: event.data.text() } } catch (e2) { return {} }
  }
}

// Only ever open a page of THIS origin: the function builds the url from an env origin, and a preview build
// must never be sent to the production dashboard (or the other way round) by a stale value.
function sameOriginUrl(raw) {
  try {
    const u = new URL(raw || '/', self.location.origin)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return self.location.origin + '/'
    return self.location.origin + u.pathname + u.search + u.hash
  } catch (e) {
    return self.location.origin + '/'
  }
}

self.addEventListener('push', event => {
  const d = readPayload(event)
  const title = d.title || 'Rufesto'
  const options = {
    body: d.body || '',
    icon: d.icon || '/icons/icon-192.png',
    badge: d.badge || '/icons/badge-72.png',
    data: { url: (d.data && d.data.url) || d.url || '/' },
  }
  // A tag makes the phone replace the previous notification of that group instead of stacking them.
  if (d.tag) { options.tag = d.tag; options.renotify = true }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = sameOriginUrl(event.notification.data && event.notification.data.url)

  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const open = all.find(c => c.focused) || all.find(c => c.visibilityState === 'visible') || all[0]
    if (open) {
      try {
        const focused = await open.focus()
        if (focused && 'navigate' in focused) {
          // Skip the reload when the page is already on that address.
          if (focused.url !== url) await focused.navigate(url)
          return
        }
      } catch (e) { /* fall through to a new window */ }
    }
    await self.clients.openWindow(url)
  })())
})
