import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import LoadError from '../../components/LoadError'
import { useAuth } from '../../contexts/AuthContext'
import PostSkeleton from '../social/components/PostSkeleton'
import { getHomeFeed, HOME_PAGE_SIZE, MAX_EXCLUDE, NEW_COUNT_CAP } from './api'
import { useViewerLocation } from './useViewerLocation'
import { useFeedEvents } from './useFeedEvents'
import { useNewPostCount } from './useNewPostCount'
import FeedItem from './components/FeedItem'
import LocationPill from './components/LocationPill'
import CaughtUp from './components/CaughtUp'
import './styles.css'

const keyOf = it => `${it.kind}-${it.id}`
const FIRST = { items: [], exclude: [], caughtUp: false, radiusKm: null, pageStart: 0, loading: true, error: null }

// `position` sent with every event is the 1-based index across the whole loaded list (page 2 starts at
// 21), not the server's per-page slot, so positions stay comparable between pages.
const numbered = (items, offset) => items.map((it, i) => ({ ...it, position: offset + i + 1 }))

/**
 * Home tab: the ranked feed (home_feed, docs/V2-CONTRACT.md 17.3). Works signed out. Pages are
 * exclusion-based ("Load more" sends back `exclude`); an empty page ends the list with
 * "You're all caught up" and, for a signed-in guest, a chronological tail. `active` is false while
 * another Home tab is shown (the new-posts poll pauses). `onDiscover` switches to the Discover tab.
 */
export default function HomeFeed({ active = true, onDiscover }) {
  const { t } = useTranslation('social')
  const { session, loading: authLoading } = useAuth()
  const userId = session?.user?.id || null
  const geo = useViewerLocation()
  const events = useFeedEvents()
  const lat = geo.coords?.lat ?? null
  const lng = geo.coords?.lng ?? null
  const [state, setState] = useState(FIRST)
  const [more, setMore] = useState({ loading: false, error: false })
  const loadedAt = useRef(new Date().toISOString())
  const seq = useRef(0)
  const getSince = useCallback(() => loadedAt.current, [])
  const ready = !authLoading && !state.loading && !state.error
  const [newCount, clearNew] = useNewPostCount({ active, ready, since: getSince, lat, lng })

  const load = useCallback(async () => {
    const mine = ++seq.current
    setState(s => ({ ...s, loading: true, error: null }))
    setMore({ loading: false, error: false })
    clearNew()
    events.reset()
    loadedAt.current = new Date().toISOString()
    const { data, error } = await getHomeFeed({ lat, lng, exclude: [], limit: HOME_PAGE_SIZE })
    if (mine !== seq.current) return
    setState(error
      ? { ...FIRST, loading: false, error }
      : { items: numbered(data.items, 0), exclude: data.exclude, caughtUp: data.caughtUp || data.exclude.length > MAX_EXCLUDE, radiusKm: data.radiusKm, pageStart: 0, loading: false, error: null })
  }, [lat, lng, userId, events, clearNew])

  // wait for the session and for a remembered location, so the first load is one request with the final inputs
  useEffect(() => {
    if (authLoading || geo.pending) return
    load()
  }, [authLoading, geo.pending, load])

  async function loadMore() {
    if (more.loading || state.caughtUp) return
    const mine = seq.current
    setMore({ loading: true, error: false })
    const { data, error } = await getHomeFeed({ lat, lng, exclude: state.exclude, limit: HOME_PAGE_SIZE })
    if (mine !== seq.current) return                       // the feed reloaded meanwhile: this page is stale
    if (error) { setMore({ loading: false, error: true }); return }
    setState(s => {
      const seen = new Set(s.items.map(keyOf))
      return {
        ...s,
        items: [...s.items, ...numbered(data.items.filter(i => !seen.has(keyOf(i))), s.items.length)],
        pageStart: s.items.length,
        exclude: data.exclude,
        // an empty page, or the server's 300-id exclusion cap reached, ends the ranked list
        caughtUp: data.caughtUp || data.exclude.length > MAX_EXCLUDE,
        radiusKm: data.radiusKm ?? s.radiusKm,
      }
    })
    setMore({ loading: false, error: false })
  }

  function removeItem(id) {
    setState(s => ({ ...s, items: s.items.filter(i => !(i.kind === 'post' && i.id === id)) }))
  }

  function showNew() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    load()
  }

  const shown = useMemo(() => new Set(state.items.filter(i => i.kind === 'post').map(i => i.id)), [state.items])
  const busy = authLoading || state.loading

  return (
    <div className="soc-feed">
      <LocationPill geo={geo} radiusKm={state.radiusKm} />
      {newCount > 0 && (
        <button type="button" className="soc-newpill" onClick={showNew}>
          {newCount >= NEW_COUNT_CAP ? t('home.newPostsMax') : t('home.newPosts', { count: newCount })}
        </button>
      )}

      {busy && <div aria-busy="true">{[1, 2].map(i => <PostSkeleton key={i} />)}</div>}
      {!busy && state.error && <LoadError onRetry={load} />}
      {!busy && !state.error && state.items.map((it, i) => (
        <FeedItem
          key={keyOf(it)} item={it} events={events} onDeleted={removeItem}
          index={Math.max(0, i - state.pageStart)}
        />
      ))}

      {!busy && !state.error && !state.caughtUp && state.items.length > 0 && (
        <div className="soc-feed-more">
          {more.error && <p className="soc-error" role="alert">{t('errors.generic')}</p>}
          <button type="button" className="btn btn-ghost" onClick={loadMore} disabled={more.loading}>
            {more.loading ? <span className="spinner" aria-hidden="true" /> : null}
            {t('feed.loadMore')}
          </button>
        </div>
      )}
      {!busy && !state.error && state.caughtUp && (
        <CaughtUp userId={userId} empty={state.items.length === 0} shown={shown} onDiscover={onDiscover} />
      )}
      <div className="soc-feed-end" />
    </div>
  )
}
