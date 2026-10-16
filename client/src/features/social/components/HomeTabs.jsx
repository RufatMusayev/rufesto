import { lazy, Suspense, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HOME_TABS, readHomeTab, rememberHomeTab } from '../homeTab'
import HomeFeed from '../../feed/HomeFeed'
import { FeedSkeletons } from '../../feed/components/FeedSkeleton'
import { DiscoverFallback } from '../../discover/components/DiscoverSkeleton'
import PostComposerFab from './PostComposerFab'

// Home is in the main bundle (it is the first thing most guests see); Friends and Discover are separate
// chunks that are fetched in idle time right after Home mounts, so the first tab switch does not wait for them.
const loadFriends = () => import('../../feed/FriendsFeed')
const loadDiscover = () => import('../../discover/DiscoverTab')
const FriendsFeed = lazy(loadFriends)
const DiscoverTab = lazy(loadDiscover)

const idle = fn => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 1500))

const feedSkeleton = <div className="soc-feed"><FeedSkeletons /></div>

/**
 * Segmented "Home | Friends | Discover" switch (docs/V2-CONTRACT.md 17.5 / 18.3). Home = the ranked feed,
 * Friends = the ranked feed of me and my friends, Discover = the server-ranked discovery answer. A tab
 * mounts on its first visit and then stays mounted, hidden while another shows; the data of all three lives
 * in module-level stores (features/feed, features/discover), so a switch never refetches.
 */
export default function HomeTabs() {
  const { t } = useTranslation('social')
  const [tab, setTab] = useState(readHomeTab)
  const [seen, setSeen] = useState(() => new Set([tab]))

  useEffect(() => {
    const id = idle(() => { loadFriends(); loadDiscover() })
    return () => { if (typeof cancelIdleCallback === 'function' && typeof id === 'number') cancelIdleCallback(id) }
  }, [])

  function choose(id) {
    setTab(id)
    rememberHomeTab(id)
    setSeen(s => (s.has(id) ? s : new Set(s).add(id)))
  }

  return (
    <div>
      <div className="soc-seg" role="tablist" aria-label={t('home.switch')}>
        {HOME_TABS.map(id => (
          <button
            key={id} type="button" role="tab" aria-selected={tab === id}
            className={`soc-seg-btn${tab === id ? ' active' : ''}`} onClick={() => choose(id)}
          >
            {t(`home.tab_${id}`)}
          </button>
        ))}
      </div>
      {seen.has('home') && (
        <div hidden={tab !== 'home'}>
          <HomeFeed active={tab === 'home'} onDiscover={() => choose('discover')} />
        </div>
      )}
      {seen.has('friends') && (
        <div hidden={tab !== 'friends'}>
          <Suspense fallback={feedSkeleton}><FriendsFeed /></Suspense>
        </div>
      )}
      {seen.has('discover') && (
        <div hidden={tab !== 'discover'}>
          <Suspense fallback={<DiscoverFallback />}><DiscoverTab /></Suspense>
        </div>
      )}
      {tab !== 'discover' && <PostComposerFab />}
    </div>
  )
}
