import { Fragment, useCallback, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../contexts/AuthContext'
import { homeFeed } from './feeds'
import { useStore } from './store'
import { NEW_COUNT_CAP, getHomeFeedNewCount } from './api'
import { useViewerLocation } from './useViewerLocation'
import { useFeedEvents } from './useFeedEvents'
import { useNewPostCount } from './useNewPostCount'
import { useNearEnd, nearEndIndex, nearEndSupported } from './useNearEnd'
import { useEagerPhotos } from './useEagerPhotos'
import FeedItem from './components/FeedItem'
import LocationPill from './components/LocationPill'
import CaughtUp from './components/CaughtUp'
import FeedStatus from './components/FeedStatus'
import MoreRow from './components/MoreRow'
import { FeedSkeletons } from './components/FeedSkeleton'
import './styles.css'
import './cards.css'

const keyOf = it => `${it.kind}-${it.id}`

/**
 * Home tab: the ranked feed (home_feed, docs/V2-CONTRACT.md 17.3). Works signed out. The data lives in
 * feeds.js (homeFeed), not here: it is requested on route load (prefetch.js), kept while the tab is hidden or
 * unmounted, and the next page loads in the background when the viewer is 3 cards from the end. An empty
 * page ends the list with "You're all caught up" and, for a signed-in guest, a chronological tail.
 * `active` is false while another Home tab is shown (the new-posts poll pauses); becoming active again asks
 * the store to make sure its list is fresh (a no-op, or a quiet refetch after a follow / friend change).
 * `onDiscover` switches to the Discover tab.
 */
export default function HomeFeed({ active = true, onDiscover }) {
  const { t } = useTranslation('social')
  const { session, loading: authLoading } = useAuth()
  const userId = session?.user?.id || null
  const geo = useViewerLocation()
  const events = useFeedEvents('home')
  const s = useStore(homeFeed.store)
  const lat = geo.coords?.lat ?? null
  const lng = geo.coords?.lng ?? null

  // wait for the session and for a remembered location, so the first load is one request with the final inputs
  // (prefetch.js usually started it already: then this is a no-op)
  useEffect(() => {
    if (authLoading || geo.pending) return
    homeFeed.ensure({ userId, lat, lng })
  }, [authLoading, geo.pending, userId, lat, lng, active])

  const since = useRef(null)
  since.current = s.loadedIso
  const getSince = useCallback(() => since.current, [])
  const ready = s.status === 'ready'
  const loadNewCount = useCallback(() => getHomeFeedNewCount({ since: getSince(), lat, lng }), [getSince, lat, lng])
  const [newCount, clearNew] = useNewPostCount({ kind: 'home', active, ready, load: loadNewCount })
  useEffect(() => { clearNew() }, [s.loadedAt, clearNew])

  const loadMore = useCallback(() => homeFeed.loadMore(), [])
  const markerRef = useNearEnd(loadMore, ready && !s.caughtUp && !s.more.loading && !s.more.error)
  const marker = nearEndIndex(s.items.length)

  function showNew() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    homeFeed.reload()
  }

  const shown = useMemo(() => new Set(s.items.map(keyOf)), [s.items])
  const eager = useEagerPhotos(s.items, active)
  const busy = s.status === 'idle' || s.status === 'loading'

  return (
    <div className="soc-feed">
      <LocationPill geo={geo} radiusKm={s.radiusKm} />
      {newCount > 0 && (
        <button type="button" className="soc-newpill" onClick={showNew}>
          {newCount >= NEW_COUNT_CAP ? t('home.newPostsMax') : t('home.newPosts', { count: newCount })}
        </button>
      )}

      {busy && <FeedSkeletons />}
      {s.status === 'error' && <FeedStatus error={s.error} onRetry={() => homeFeed.reload()} />}
      {ready && s.items.map((it, i) => (
        <Fragment key={keyOf(it)}>
          {i === marker && <span ref={markerRef} className="soc-marker" aria-hidden="true" />}
          <FeedItem
            item={it} events={events} onDeleted={homeFeed.remove}
            index={Math.max(0, i - s.pageStart)} priority={eager.has(keyOf(it))}
          />
        </Fragment>
      ))}

      {ready && !s.caughtUp && s.items.length > 0 && (
        <MoreRow more={s.more} onMore={loadMore} showButton={!nearEndSupported} />
      )}
      {ready && s.caughtUp && (
        <CaughtUp userId={userId} empty={s.items.length === 0} shown={shown} onDiscover={onDiscover} />
      )}
      <div className="soc-feed-end" />
    </div>
  )
}
