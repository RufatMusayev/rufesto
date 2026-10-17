import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../components/ui'
import { useAuth } from '../../contexts/AuthContext'
import { useRequireAuth, useToast } from '../social/hooks'
import { useStore } from '../feed/store'
import { useViewerLocation } from '../feed/useViewerLocation'
import { useFeedEvents } from '../feed/useFeedEvents'
import LocationPill from '../feed/components/LocationPill'
import FeedStatus from '../feed/components/FeedStatus'
import '../feed/styles.css'
import '../feed/cards.css'
import {
  discoverStore, discoverKey, ensureDiscover, reloadDiscover, setCuisine, toggleFollow, toggleLike, currentViewer,
} from './discoverStore'
import { ActionsContext } from './ActionsContext'
import CuisineChips from './components/CuisineChips'
import RestaurantRail from './components/RestaurantRail'
import DishRail from './components/DishRail'
import PromoRail from './components/PromoRail'
import ReviewList from './components/ReviewList'
import AllRestaurantsList from './components/AllRestaurantsList'
import DiscoverSkeleton from './components/DiscoverSkeleton'
import './styles.css'

/**
 * Discover tab (docs/V2-CONTRACT.md 18.3): one discover() call renders every section, in this order: cuisine
 * chips, Open now near you, Trending dishes, New places, Promos, Top reviews, All restaurants. A section with
 * nothing to show is hidden. The answer is kept in discoverStore (one per viewer + location + cuisine), so
 * the tab never refetches on a switch (coming back asks the store to make sure the answer is fresh: a no-op, or a
 * quiet refetch after a follow / friend change, during which the old answer stays on screen and unchanged sections
 * are not re-rendered); the first request is made on route load (feed/prefetch.js). Follow and like work as on the
 * old Home list (user_follows / likes), shared by every card.
 */
export default function DiscoverTab({ active = true }) {
  const { t } = useTranslation('social')
  const { session, loading: authLoading } = useAuth()
  const { requireAuth, authModal } = useRequireAuth()
  const { toast, showToast } = useToast()
  const geo = useViewerLocation()
  const events = useFeedEvents('discover')
  const s = useStore(discoverStore)
  const userId = session?.user?.id || null
  const lat = geo.coords?.lat ?? null
  const lng = geo.coords?.lng ?? null
  const cuisine = s.cuisine
  const busyIds = useRef(new Set())                 // restaurant ids with a follow / like request in flight

  useEffect(() => {
    if (authLoading || geo.pending) return
    ensureDiscover({ userId, lat, lng, cuisine })
  }, [authLoading, geo.pending, userId, lat, lng, cuisine, active])

  // until the session is read, the answer prefetched for the stored session is the right one
  const args = { userId: authLoading ? currentViewer() : userId, lat, lng, cuisine }
  const entry = s.entries[discoverKey(args)]
  const data = entry?.status === 'ready' ? entry.data : null

  const actions = useMemo(() => {
    const on = r => s.follows[r.id] ?? r.isFollowed
    async function guarded(kind, r, run) {
      if (!requireAuth()) return
      const id = `${kind}:${r.id}`
      if (busyIds.current.has(id)) return
      busyIds.current.add(id)
      const ok = await run()
      busyIds.current.delete(id)
      if (!ok) showToast('social:errors.generic')
    }
    return {
      signedIn: !!userId,
      isFollowed: on,
      followers: r => Math.max(0, r.followerCount + (on(r) ? 1 : 0) - (r.isFollowed ? 1 : 0)),
      toggleFollow: r => guarded('follow', r, () => toggleFollow(r.id, userId, on(r))),
      liked: r => !!s.likes.mine[r.id],
      likeCount: r => s.likes.counts[r.id] || 0,
      toggleLike: r => guarded('like', r, () => toggleLike(r.id, userId, !!s.likes.mine[r.id])),
    }
  }, [s.follows, s.likes, userId, requireAuth, showToast])

  let body
  if (entry?.status === 'error') {
    body = <FeedStatus error={entry.error} onRetry={() => reloadDiscover(args)} />
  } else if (!data) {
    body = <DiscoverSkeleton withChips={s.chips.length === 0} />
  } else if (!data.openNow.length && !data.allRestaurants.length && !data.trendingDishes.length
      && !data.newPlaces.length && !data.promos.length && !data.topReviews.length) {
    body = (
      <EmptyState
        icon="🍽️" title={t('discover.emptyTitle')} body={t(cuisine ? 'discover.emptyCuisine' : 'discover.emptyBody')}
        action={cuisine ? <button type="button" className="btn btn-ghost" onClick={() => setCuisine(null)}>{t('discover.all')}</button> : null}
      />
    )
  } else {
    body = (
      <>
        <RestaurantRail title={t(data.radiusKm != null ? 'discover.openNowNear' : 'discover.openNow')} items={data.openNow} />
        <DishRail title={t('discover.trendingDishes')} items={data.trendingDishes} />
        <RestaurantRail title={t('discover.newPlaces')} items={data.newPlaces} />
        <PromoRail title={t('discover.promos')} items={data.promos} events={events} />
        <ReviewList title={t('discover.topReviews')} items={data.topReviews} />
        <AllRestaurantsList title={t('discover.allRestaurants')} items={data.allRestaurants} />
      </>
    )
  }

  return (
    <ActionsContext.Provider value={actions}>
      <div className="dsc soc-feed">
        <LocationPill geo={geo} radiusKm={data?.radiusKm ?? null} />
        <CuisineChips chips={s.chips} value={cuisine} onChange={setCuisine} />
        {body}
        <div className="soc-feed-end" />
        {toast}
        {authModal}
      </div>
    </ActionsContext.Provider>
  )
}
