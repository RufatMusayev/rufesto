import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { readHomeTab, rememberHomeTab } from '../homeTab'
import PostSkeleton from './PostSkeleton'
import PostComposerFab from './PostComposerFab'

const FeedTab = lazy(() => import('./FeedTab'))
const TABS = ['discover', 'feed']

/**
 * Segmented "Discover | Feed" switch around Home. `children` is today's Home (Discover) and stays
 * mounted while Feed is shown so switching back is instant; Feed mounts on first visit.
 */
export default function HomeTabs({ children }) {
  const { t } = useTranslation('social')
  const [tab, setTab] = useState(readHomeTab)
  const [feedSeen, setFeedSeen] = useState(tab === 'feed')

  function choose(id) {
    setTab(id)
    rememberHomeTab(id)
    if (id === 'feed') setFeedSeen(true)
  }

  return (
    <div>
      <div className="soc-seg" role="tablist" aria-label={t('home.switch')}>
        {TABS.map(id => (
          <button
            key={id} type="button" role="tab" aria-selected={tab === id}
            className={`soc-seg-btn${tab === id ? ' active' : ''}`} onClick={() => choose(id)}
          >
            {t(`home.tab_${id}`)}
          </button>
        ))}
      </div>
      <div hidden={tab !== 'discover'}>{children}</div>
      {feedSeen && (
        <div hidden={tab !== 'feed'}>
          <Suspense fallback={<div className="soc-feed"><PostSkeleton /></div>}><FeedTab /></Suspense>
        </div>
      )}
      {tab === 'feed' && <PostComposerFab />}
    </div>
  )
}
