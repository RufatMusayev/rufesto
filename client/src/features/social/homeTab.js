// Remembers which Home tab (Home | Friends | Discover) the guest used last. Per-viewer convenience
// only: every access is wrapped because storage can be blocked or empty. The old two-tab build stored
// 'feed' for what is now Friends, so a remembered 'feed' is read as 'friends'. Default: 'home'.
const KEY = 'rufesto_home_tab'
export const HOME_TABS = ['home', 'friends', 'discover']

export function readHomeTab() {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'feed') return 'friends'
    return HOME_TABS.includes(v) ? v : 'home'
  } catch { return 'home' }
}

export function rememberHomeTab(tab) {
  const id = tab === 'feed' ? 'friends' : tab          // the legacy name of Friends is stored as Friends too
  try { localStorage.setItem(KEY, HOME_TABS.includes(id) ? id : 'home') } catch { /* storage blocked */ }
}
