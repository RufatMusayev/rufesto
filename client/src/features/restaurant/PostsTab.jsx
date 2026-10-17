import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import LoadError from '../../components/LoadError'
import { useAuth } from '../../contexts/AuthContext'
import { useNearEnd, nearEndSupported } from '../feed/useNearEnd'
import { usePosts } from './usePosts'
import { fetchIsManager, restoUrl } from './api'
import { rememberScroll } from './hooks'
import { isHex, onColor } from './menu/color'
import PostTile from './PostTile'
import PromoStrip from './PromoStrip'

const lastScope = new Map()                // restaurantId -> the chip the guest left on ('venue' | 'guests')

function EmptyPosts({ scope, restaurant }) {
  const { t } = useTranslation('restaurant')
  const { session } = useAuth()
  const [manager, setManager] = useState(false)
  const signedIn = !!session

  // A manager of this restaurant gets a way to the place where its posts are written.
  useEffect(() => {
    if (scope !== 'venue' || !signedIn) { setManager(false); return undefined }
    let alive = true
    fetchIsManager(restaurant.id).then(ok => { if (alive) setManager(ok) })
    return () => { alive = false }
  }, [scope, signedIn, restaurant.id])

  return (
    <div className="rst-empty" role="status">
      <div className="rst-empty-icon" aria-hidden="true">{scope === 'guests' ? '📷' : '🍽️'}</div>
      <p className="rst-empty-title">{scope === 'guests' ? t('posts.emptyGuestsTitle') : t('posts.emptyTitle')}</p>
      <p className="rst-empty-body">{scope === 'guests' ? t('posts.emptyGuestsBody') : t('posts.emptyBody')}</p>
      {manager && (
        <a className="btn btn-ghost" href={restoUrl('/posts')} target="_blank" rel="noopener noreferrer">
          {t('posts.postFromDashboard')}
        </a>
      )}
    </div>
  )
}

/**
 * Posts tab: the restaurant's social profile. Chips `From <restaurant>` | `Guests`, a 3-column square grid, keyset
 * paging that loads the next page before the end is reached, active promos pinned above the grid.
 */
export default function PostsTab({ restaurant, accent, onOpenDish }) {
  const { t } = useTranslation('restaurant')
  const [scope, setScope] = useState(() => lastScope.get(restaurant.id) || 'venue')
  const posts = usePosts(restaurant.id, scope)

  const pick = next => { lastScope.set(restaurant.id, next); setScope(next) }
  const watching = posts.status === 'ready' && !posts.done && !posts.more && !posts.moreError
  const sentinel = useNearEnd(posts.loadMore, watching)

  const tileVars = useMemo(() => {
    const bg = isHex(accent) ? accent : '#8B2D42'
    return { '--rst-tile-bg': bg, '--rst-tile-ink': onColor(bg) }
  }, [accent])

  return (
    <div className="rst-posts">
      <PromoStrip restaurantId={restaurant.id} onOpenDish={onOpenDish} />

      <div className="rst-seg" role="group" aria-label={t('posts.filter')}>
        <button type="button" className="rst-seg-btn" aria-pressed={scope === 'venue'} onClick={() => pick('venue')}>
          <span className="rst-seg-label">{t('posts.fromVenue', { name: restaurant.name })}</span>
        </button>
        <button type="button" className="rst-seg-btn" aria-pressed={scope === 'guests'} onClick={() => pick('guests')}>
          <span className="rst-seg-label">{t('posts.guests')}</span>
        </button>
      </div>

      {posts.status === 'loading' && (
        <div className="rst-grid" aria-busy="true">
          {Array.from({ length: 9 }, (_, i) => <div key={i} className="rst-tile skeleton" />)}
        </div>
      )}

      {posts.status === 'error' && <LoadError onRetry={posts.retry} />}

      {posts.status === 'ready' && posts.items.length === 0 && <EmptyPosts scope={scope} restaurant={restaurant} />}

      {posts.status === 'ready' && posts.items.length > 0 && (
        <>
          <div className="rst-grid" style={tileVars}>
            {posts.items.map(item => (
              <PostTile key={item.id} item={item} onOpen={() => rememberScroll(restaurant.slug)} />
            ))}
          </div>
          <div className="rst-sentinel" ref={sentinel} aria-hidden="true" />
          {posts.more && (
            <div className="rst-grid rst-grid--more" aria-busy="true">
              {[0, 1, 2].map(i => <div key={i} className="rst-tile skeleton" />)}
            </div>
          )}
          {(posts.moreError || (!nearEndSupported && !posts.done && !posts.more)) && (
            <div className="rst-more">
              <button type="button" className="btn btn-ghost" onClick={posts.loadMore}>
                {posts.moreError ? t('common:retry') : t('posts.loadMore')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
