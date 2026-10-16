import { HomeTabs } from '../features/social/mounts'
import { prefetchHome } from '../features/feed/prefetch'

// Route-load kick-off (docs/V2-CONTRACT.md 18.5): this module is evaluated when the app boots, so the first
// request of the remembered Home tab is on its way before HomeTabs has rendered anything.
prefetchHome()

/**
 * Home: the shell around the three tabs (Home, Friends, Discover). Each tab lives in features/feed or
 * features/discover and keeps its own data in a module-level store.
 */
export default function HomePage() {
  return <HomeTabs />
}
