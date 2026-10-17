// Kept free of heavy imports: AppLayout mounts NotificationsHost on every page, and this is all it needs eagerly.
export const PROMPT_EVENT = 'rufesto:push-prompt'
export const SW_NAVIGATE = 'rufesto:navigate'

/**
 * A tap on a push notification makes public/sw.js ask the open tab to go to the url. Calls navigate(path) and confirms
 * on the message port, so the worker does not fall back to a full reload. Returns the unsubscribe.
 */
export function listenForSwNavigation(navigate) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return () => {}
  const onMessage = e => {
    const d = e.data
    if (!d || d.type !== SW_NAVIGATE || typeof d.url !== 'string') return
    if (!d.url.startsWith('/') || d.url.startsWith('//')) return        // same-origin paths only
    navigate(d.url)
    try { if (e.ports && e.ports[0]) e.ports[0].postMessage('ok') } catch { /* the worker falls back to navigate() */ }
  }
  navigator.serviceWorker.addEventListener('message', onMessage)
  return () => navigator.serviceWorker.removeEventListener('message', onMessage)
}
