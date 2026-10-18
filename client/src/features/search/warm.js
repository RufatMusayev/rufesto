// Warm the Search tab before it opens (QA round 3: first open of the zero state took 504 ms on the phone profile, the page
// chunk plus the discover() call). Call warmSearch() from the Search link of the bottom nav / rail on pointerdown, touchstart
// or hover: the page chunk and the discover answer are then already on their way when the route renders. Safe to call
// often (the store joins a request in flight and keeps a fresh answer); never throws; makes no request while the tab is
// hidden.
import { supabase } from '../../lib/supabase'
import { ensureDiscover } from '../discover/discoverStore'
import { locationSettled } from '../feed/useViewerLocation'

let chunk = false

async function sessionUserId() {
  try {
    const { data } = await supabase.auth.getSession()           // a local read of the stored session
    return data?.session?.user?.id || null
  } catch { return null }
}

export function warmSearch() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  if (!chunk) {
    chunk = true
    import('../../pages/ExplorePage').catch(() => { chunk = false })
  }
  Promise.all([sessionUserId(), locationSettled()])
    .then(([userId, coords]) => ensureDiscover({ userId, lat: coords?.lat ?? null, lng: coords?.lng ?? null, cuisine: null }))
    .catch(() => {})
}
