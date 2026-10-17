import { Fragment, useCallback, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { useFriendCount } from '../social/useFriendsData'
import SignInCard from '../social/components/SignInCard'
import { friendsFeed } from './feeds'
import { useStore } from './store'
import { NEW_COUNT_CAP, getFriendsNewCount } from './api'
import { useViewerLocation } from './useViewerLocation'
import { useFeedEvents } from './useFeedEvents'
import { useNewPostCount } from './useNewPostCount'
import { useEagerPhotos } from './useEagerPhotos'
import { useNearEnd, nearEndIndex, nearEndSupported } from './useNearEnd'
import { dayOf } from './lib/days'
import FeedItem from './components/FeedItem'
import CaughtUp from './components/CaughtUp'
import DaySeparator from './components/DaySeparator'
import FeedStatus from './components/FeedStatus'
import MoreRow from './components/MoreRow'
import { FeedSkeletons } from './components/FeedSkeleton'
import './styles.css'
import './cards.css'

const keyOf = it => `${it.kind}-${it.id}`
const FIND_BAR_BELOW = 3             // fewer friends than this: the tab keeps a "Find friends" entry in its header

/**
 * Friends tab (docs/V2-CONTRACT.md 18.3): what me and my friends posted and reviewed, ranked by
 * friends_feed. The feed reads day by day (a small-caps separator per Baku day: Today, Yesterday, the date),
 * newest day first, and inside a day the people you interact with most come first. Same cards, exclusion
 * paging, background prefetch 3 cards from the end and impression tracking (pool 'friends') as Home. At the
 * end: "You're all caught up" and the chronological tail (feed('friends')). Signed out: the sign-in card.
 * Data lives in feeds.js (friendsFeed), so switching tabs never refetches.
 * "New posts" pill: friends_new_count polled every 60 s while this tab is the one shown (no realtime: a
 * realtime INSERT cannot tell a friend's post from anyone else's). While the viewer has fewer than 3 friends a
 * "Find friends" entry stays at the top of the tab, not only in the empty state.
 */
export default function FriendsFeed({ active = true }) {
  const { t } = useTranslation('social')
  const { session, loading: authLoading } = useAuth()
  const userId = session?.user?.id || null
  const geo = useViewerLocation()
  const events = useFeedEvents('friends')
  const s = useStore(friendsFeed.store)
  const lat = geo.coords?.lat ?? null
  const lng = geo.coords?.lng ?? null
  const friendCount = useFriendCount(userId, active)

  useEffect(() => {
    if (authLoading) return
    if (!userId) { friendsFeed.clear(); return }              // never keep one person's friends in memory for the next
    if (geo.pending) return                                   // one request with the final location (prefetch.js usually did it)
    friendsFeed.ensure({ userId, lat, lng })
  }, [authLoading, geo.pending, userId, lat, lng, active])

  const since = useRef(null)
  since.current = s.loadedIso
  const ready = s.status === 'ready'
  const loadNewCount = useCallback(() => getFriendsNewCount({ since: since.current }), [])
  const [newCount, clearNew] = useNewPostCount({ kind: 'friends', active: active && !!userId, ready, load: loadNewCount })
  useEffect(() => { clearNew() }, [s.loadedAt, clearNew])

  const loadMore = useCallback(() => friendsFeed.loadMore(), [])
  const markerRef = useNearEnd(loadMore, ready && !s.caughtUp && !s.more.loading && !s.more.error)
  const marker = nearEndIndex(s.items.length)
  const shown = useMemo(() => new Set(s.items.map(keyOf)), [s.items])
  const eager = useEagerPhotos(s.items, active)

  function showNew() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    friendsFeed.reload()
  }

  if (!authLoading && !userId) {
    return (
      <div className="soc-feed">
        <div className="soc-feed-banner">
          <SignInCard title={t('feed.signInFriendsTitle')} body={t('feed.signInFriendsBody')} />
        </div>
      </div>
    )
  }

  const findBar = friendCount !== null && friendCount < FIND_BAR_BELOW
  const busy = authLoading || s.status === 'idle' || s.status === 'loading'
  const empty = (
    <EmptyState
      icon="🤝"
      title={t('feed.emptyFriendsTitle')}
      body={t('feed.emptyFriendsBody')}
      action={findBar ? null : <Link to="/friends?tab=find" className="btn btn-primary">{t('feed.findFriends')}</Link>}
    />
  )

  return (
    <div className="soc-feed">
      {findBar && (
        <div className="soc-findbar">
          <p className="soc-findbar-text">{t('feed.findBarText')}</p>
          <Link to="/friends?tab=find" className="btn btn-primary soc-findbar-btn">{t('feed.findFriends')}</Link>
        </div>
      )}
      {newCount > 0 && (
        <button type="button" className="soc-newpill" onClick={showNew}>
          {newCount >= NEW_COUNT_CAP ? t('home.newPostsMax') : t('home.newPosts', { count: newCount })}
        </button>
      )}

      {busy && <FeedSkeletons />}
      {!authLoading && s.status === 'error' && <FeedStatus error={s.error} onRetry={() => friendsFeed.reload()} />}
      {!authLoading && ready && s.items.map((it, i) => (
        <Fragment key={keyOf(it)}>
          {(i === 0 || dayOf(s.items[i - 1]) !== dayOf(it)) && <DaySeparator day={dayOf(it)} />}
          {i === marker && <span ref={markerRef} className="soc-marker" aria-hidden="true" />}
          <FeedItem
            item={it} events={events} onDeleted={friendsFeed.remove}
            index={Math.max(0, i - s.pageStart)} priority={eager.has(keyOf(it))}
          />
        </Fragment>
      ))}

      {ready && !s.caughtUp && s.items.length > 0 && (
        <MoreRow more={s.more} onMore={loadMore} showButton={!nearEndSupported} />
      )}
      {ready && s.caughtUp && (
        <CaughtUp
          scope="friends" byDay userId={userId} empty={s.items.length === 0} shown={shown} emptyNode={empty}
        />
      )}
      <div className="soc-feed-end" />
    </div>
  )
}
