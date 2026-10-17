import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { HOME_TABS, readHomeTab, rememberHomeTab, isLegacyDiscover } from '../homeTab'
import HomeFeed from '../../feed/HomeFeed'
import { useDishAvailabilityPoll } from '../../feed/dishAvailability'
import { useViewerLocation } from '../../feed/useViewerLocation'
import { LocationButton } from '../../feed/components/LocationPill'
import { FeedSkeletons } from '../../feed/components/FeedSkeleton'
import { homeFeed, friendsFeed } from '../../feed/feeds'
import { PullToRefresh } from '../../../components/ui'

// Home is in the main bundle (it is the first thing most guests see); Friends is a separate chunk that is fetched
// in idle time right after Home mounts, so the first tab switch does not wait for it.
const loadFriends = () => import('../../feed/FriendsFeed')
const FriendsFeed = lazy(loadFriends)

const idle = fn => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 1500))

const feedSkeleton = <div className="soc-feed"><FeedSkeletons /></div>

/**
 * "For you | Friends" (docs/UX-PLAN-2026-10-18.md D1, 5.3). For you = the ranked home_feed, Friends = the ranked feed of me
 * and my friends. Discover moved into the Search tab: an old `?tab=discover` link and a remembered Discover tab go to
 * /explore. Two text tabs (44 px, an underline that slides between them) and, at the right end, the location pin
 * (outlined = off, filled = on). A tab mounts on its first visit and then stays mounted, hidden while the other shows;
 * the data of both lives in module-level stores (features/feed), so a switch never refetches. Semantics: a tablist with
 * roving tabindex and arrow keys, each tab controlling a tabpanel, and the page's one <h1> (visually hidden) naming the
 * tab that is shown. The "+" that opens the new-post screen lives in the Home top bar (components/layout), not here.
 */
export default function HomeTabs() {
  const [params] = useSearchParams()
  const [legacy] = useState(isLegacyDiscover)
  useEffect(() => { if (legacy) rememberHomeTab('home') }, [legacy])
  if (params.get('tab') === 'discover' || legacy) return <Navigate to="/explore" replace />
  return <Tabs />
}

function Tabs() {
  const { t } = useTranslation('social')
  const navigate = useNavigate()
  const geo = useViewerLocation()
  const [tab, setTab] = useState(readHomeTab)
  const [seen, setSeen] = useState(() => new Set([tab]))
  const buttons = useRef({})
  useDishAvailabilityPoll()

  useEffect(() => {
    const id = idle(() => { loadFriends() })
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
      <div className="soc-htabs">
        <div className="soc-htabs-list" role="tablist" aria-label={t('home.switch')} onKeyDown={onKeyDown}>
          {HOME_TABS.map(id => (
            <button
              key={id} type="button" role="tab" id={`home-tab-${id}`} aria-controls={`home-panel-${id}`}
              aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} ref={el => { buttons.current[id] = el }}
              className={`soc-htab${tab === id ? ' active' : ''}`} onClick={() => choose(id)}
            >
              {t(`home.tab_${id}`)}
            </button>
          ))}
          <span className="soc-htab-ind" data-i={HOME_TABS.indexOf(tab)} aria-hidden="true"><span /></span>
        </div>
        <LocationButton geo={geo} />
      </div>
      {panel('home', (
        <PullToRefresh onRefresh={() => homeFeed.reload()} enabled={tab === 'home'}>
          <HomeFeed active={tab === 'home'} onDiscover={() => navigate('/explore')} />
        </PullToRefresh>
      ))}
      {panel('friends', (
        <PullToRefresh onRefresh={() => friendsFeed.reload()} enabled={tab === 'friends'}>
          <Suspense fallback={feedSkeleton}><FriendsFeed active={tab === 'friends'} /></Suspense>
        </PullToRefresh>
      ))}
    </div>
  )
}
