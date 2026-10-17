import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HOME_TABS, readHomeTab, rememberHomeTab } from '../homeTab'
import HomeFeed from '../../feed/HomeFeed'
import { useDishAvailabilityPoll } from '../../feed/dishAvailability'
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
 * in module-level stores (features/feed, features/discover), so a switch never refetches (a tab that comes
 * back asks its store to make sure it is fresh: a no-op, or a quiet refetch after a follow / friend change).
 * Semantics: a tablist with roving tabindex and arrow keys, each tab controlling a tabpanel, and the page's
 * one <h1> (visually hidden) naming the tab that is shown.
 */
export default function HomeTabs() {
  const { t } = useTranslation('social')
  const [tab, setTab] = useState(readHomeTab)
  const [seen, setSeen] = useState(() => new Set([tab]))
  const buttons = useRef({})
  useDishAvailabilityPoll()

  useEffect(() => {
    const id = idle(() => { loadFriends(); loadDiscover() })
    return () => { if (typeof cancelIdleCallback === 'function' && typeof id === 'number') cancelIdleCallback(id) }
  }, [])

  function choose(id) {
    setTab(id)
    rememberHomeTab(id)
    setSeen(s => (s.has(id) ? s : new Set(s).add(id)))
  }

  function onKeyDown(e) {
    const at = HOME_TABS.indexOf(tab)
    let next = null
    if (e.key === 'ArrowRight') next = HOME_TABS[(at + 1) % HOME_TABS.length]
    else if (e.key === 'ArrowLeft') next = HOME_TABS[(at - 1 + HOME_TABS.length) % HOME_TABS.length]
    else if (e.key === 'Home') next = HOME_TABS[0]
    else if (e.key === 'End') next = HOME_TABS[HOME_TABS.length - 1]
    if (!next) return
    e.preventDefault()
    choose(next)
    buttons.current[next]?.focus()
  }

  const panel = (id, children) => (
    <div
      role="tabpanel" id={`home-panel-${id}`} aria-labelledby={`home-tab-${id}`}
      className="soc-tabpanel" hidden={tab !== id}
    >
      {seen.has(id) ? children : null}
    </div>
  )

  return (
    <div>
      <h1 className="sr-only">{t(`home.pageTitle_${tab}`)}</h1>
      <div className="soc-seg" role="tablist" aria-label={t('home.switch')} onKeyDown={onKeyDown}>
        {HOME_TABS.map(id => (
          <button
            key={id} type="button" role="tab" id={`home-tab-${id}`} aria-controls={`home-panel-${id}`}
            aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} ref={el => { buttons.current[id] = el }}
            className={`soc-seg-btn${tab === id ? ' active' : ''}`} onClick={() => choose(id)}
          >
            {t(`home.tab_${id}`)}
          </button>
        ))}
      </div>
      {panel('home', <HomeFeed active={tab === 'home'} onDiscover={() => choose('discover')} />)}
      {panel('friends', <Suspense fallback={feedSkeleton}><FriendsFeed active={tab === 'friends'} /></Suspense>)}
      {panel('discover', <Suspense fallback={<DiscoverFallback />}><DiscoverTab active={tab === 'discover'} /></Suspense>)}
      {tab !== 'discover' && <PostComposerFab />}
    </div>
  )
}
