// Route-load kick-off (docs/V2-CONTRACT.md 18.5). Imported by pages/HomePage.jsx, so it runs when the app
// boots on "/": the first page of the remembered Home tab is requested before a single Home component has
// mounted (no waiting for the lazy chunks, the sign-in profile fetch or the first render). Then, once that
// has landed and the browser is idle, the other Home tab is fetched too, so the first tab switch shows data at
// once. Home never loads discover(): that content lives in the Search tab (which loads it when it opens), and its 1.4 s
// call competed with the first photos for bandwidth (persona round 3, R3-02). Everything lands in the module-level
// stores; the components only read them.
import { supabase } from '../../lib/supabase'
import { readHomeTab } from '../social/homeTab'
import { homeFeed, friendsFeed } from './feeds'
import { startViewerLocation, locationSettled } from './useViewerLocation'

let started = false

async function sessionUserId() {
  try {
    // local read of the stored session: no network unless the access token must be refreshed
    const { data } = await supabase.auth.getSession()
    return data?.session?.user?.id || null
  } catch { return null }
}

const idle = fn => (typeof requestIdleCallback === 'function'
  ? requestIdleCallback(fn, { timeout: 2500 })
  : setTimeout(fn, 1200))

function load(tab, args) {
  if (tab === 'home') return homeFeed.ensure(args)
  return args.userId ? friendsFeed.ensure(args) : Promise.resolve()
}

async function run() {
  const first = readHomeTab()
  const [userId, coords] = await Promise.all([sessionUserId(), locationSettled()])
  const args = { userId, lat: coords?.lat ?? null, lng: coords?.lng ?? null }
  await load(first, args)
  idle(() => {
    for (const tab of ['home', 'friends']) if (tab !== first) load(tab, args)
  })
}

/** Starts the first request of the remembered tab. Only on the Home route; once per page load. */
export function prefetchHome() {
  if (started || typeof window === 'undefined') return
  started = true
  if (window.location.pathname !== '/') return
  startViewerLocation()
  run().catch(() => {})
}
