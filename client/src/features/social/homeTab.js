// Remembers which Home tab (For you | Friends) the guest used last. Per-viewer convenience only: every access is
// wrapped because storage can be blocked or empty. Stored names: 'home' (shown as "For you") and 'friends'. The old
// two-tab build stored 'feed' for what is now Friends, so a remembered 'feed' is read as 'friends'. Discover moved
// into the Search tab (docs/UX-PLAN-2026-10-18.md D1): a remembered 'discover' reads as 'home' and
// isLegacyDiscover() lets HomeTabs send the guest to /explore once. Default: 'home'.
const KEY = 'rufesto_home_tab'
export const HOME_TABS = ['home', 'friends']

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

/** True while the remembered tab is the retired Discover tab (a pure read: HomeTabs resets it with rememberHomeTab('home')). */
export function isLegacyDiscover() {
  try { return localStorage.getItem(KEY) === 'discover' } catch { return false }
}
