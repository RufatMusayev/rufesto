import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { HOME_TABS, readHomeTab, rememberHomeTab } from '../homeTab'
import PostSkeleton from './PostSkeleton'
import PostComposerFab from './PostComposerFab'

const HomeFeed = lazy(() => import('../../feed/HomeFeed'))
const FeedTab = lazy(() => import('./FeedTab'))

const skeleton = <div className="soc-feed"><PostSkeleton /></div>

/**
 * Segmented "Home | Friends | Discover" switch. Home = the ranked feed, Friends = the chronological
 * feed of me and my friends, Discover = today's Home page (`children`, always mounted so switching back
 * is instant). Home and Friends mount on first visit and then stay mounted, hidden while another shows.
 */
export default function HomeTabs({ children }) {
  const { t } = useTranslation('social')
  const [tab, setTab] = useState(readHomeTab)
  const [seen, setSeen] = useState(() => new Set([tab]))

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
          <Suspense fallback={skeleton}><HomeFeed active={tab === 'home'} onDiscover={() => choose('discover')} /></Suspense>
        </div>
      )}
      {seen.has('friends') && (
        <div hidden={tab !== 'friends'}>
          <Suspense fallback={skeleton}><FeedTab /></Suspense>
        </div>
      )}
      <div hidden={tab !== 'discover'}>{children}</div>
      {tab !== 'discover' && <PostComposerFab />}
    </div>
  )
}
