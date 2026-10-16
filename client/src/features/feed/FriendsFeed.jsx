import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { subscribePosts, getFeed } from '../social/api'
import { useOnVisible } from '../social/hooks'
import SignInCard from '../social/components/SignInCard'
import { friendsFeed } from './feeds'
import { useStore } from './store'
import { useViewerLocation } from './useViewerLocation'
import { useFeedEvents } from './useFeedEvents'
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

/**
 * Friends tab (docs/V2-CONTRACT.md 18.3): what me and my friends posted and reviewed, ranked by
 * friends_feed. The feed reads day by day (a small-caps separator per Baku day: Today, Yesterday, the date),
 * newest day first, and inside a day the people you interact with most come first. Same cards, exclusion
 * paging, background prefetch 3 cards from the end and impression tracking (pool 'friends') as Home. At the
 * end: "You're all caught up" and the chronological tail (feed('friends')). Signed out: the sign-in card.
 * Data lives in feeds.js (friendsFeed), so switching tabs never refetches.
 */
export default function FriendsFeed() {
  const { t } = useTranslation('social')
  const { session, loading: authLoading } = useAuth()
  const userId = session?.user?.id || null
  const geo = useViewerLocation()
  const events = useFeedEvents('friends')
  const s = useStore(friendsFeed.store)
  const lat = geo.coords?.lat ?? null
  const lng = geo.coords?.lng ?? null
  const [hasNew, setHasNew] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (!userId) { friendsFeed.clear(); return }              // never keep one person's friends in memory for the next
    if (geo.pending) return                                   // one request with the final location (prefetch.js usually did it)
    friendsFeed.ensure({ userId, lat, lng })
  }, [authLoading, geo.pending, userId, lat, lng])

  // "New posts" pill instead of reordering under the thumb: a post of someone else arrived while this was open
  useEffect(() => {
    if (!userId) return undefined
    return subscribePosts(({ userId: author }) => { if (author !== userId) setHasNew(true) })
  }, [userId])
  useEffect(() => { setHasNew(false) }, [s.loadedAt])

  const loadedAt = useRef(0)
  loadedAt.current = s.loadedAt
  useOnVisible(async () => {
    if (!userId || s.status !== 'ready') return
    const { data } = await getFeed({ scope: 'friends', limit: 1 })
    const top = data?.items[0]
    if (top && !top.isMine && new Date(top.createdAt).getTime() > loadedAt.current) setHasNew(true)
  }, 30000)

  const ready = s.status === 'ready'
  const loadMore = useCallback(() => friendsFeed.loadMore(), [])
  const markerRef = useNearEnd(loadMore, ready && !s.caughtUp && !s.more.loading && !s.more.error)
  const marker = nearEndIndex(s.items.length)
  const shown = useMemo(() => new Set(s.items.map(keyOf)), [s.items])

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

  const busy = authLoading || s.status === 'idle' || s.status === 'loading'
  const empty = (
    <EmptyState
      icon="🤝"
      title={t('feed.emptyFriendsTitle')}
      body={t('feed.emptyFriendsBody')}
      action={<Link to="/friends?tab=find" className="btn btn-primary">{t('feed.findFriends')}</Link>}
    />
  )

  return (
    <div className="soc-feed">
      {hasNew && <button type="button" className="soc-newpill" onClick={showNew}>{t('feed.newPosts')}</button>}

      {busy && <FeedSkeletons />}
      {!authLoading && s.status === 'error' && <FeedStatus error={s.error} onRetry={() => friendsFeed.reload()} />}
      {!authLoading && ready && s.items.map((it, i) => (
        <Fragment key={keyOf(it)}>
          {(i === 0 || dayOf(s.items[i - 1]) !== dayOf(it)) && <DaySeparator day={dayOf(it)} />}
          {i === marker && <span ref={markerRef} className="soc-marker" aria-hidden="true" />}
          <FeedItem
            item={it} events={events} onDeleted={friendsFeed.remove}
            index={Math.max(0, i - s.pageStart)}
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
