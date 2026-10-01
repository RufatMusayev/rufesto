// Remembers which Home tab (Discover | Feed) the guest used last. Per-viewer convenience only:
// every access is wrapped because storage can be blocked or empty.
const KEY = 'rufesto_home_tab'

export function readHomeTab() {
  try { return localStorage.getItem(KEY) === 'feed' ? 'feed' : 'discover' } catch { return 'discover' }
}

export function rememberHomeTab(tab) {
  try { localStorage.setItem(KEY, tab === 'feed' ? 'feed' : 'discover') } catch { /* storage blocked */ }
}
