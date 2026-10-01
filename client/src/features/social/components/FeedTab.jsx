import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../../components/ui'
import LoadError from '../../../components/LoadError'
import { useAuth } from '../../../contexts/AuthContext'
import { getFeed, getPublicReviews, subscribePosts } from '../api'
import { useOnVisible } from '../hooks'
import PostCard from './PostCard'
import ReviewCard from './ReviewCard'
import PostSkeleton from './PostSkeleton'
import SignInCard from './SignInCard'

const key = it => `${it.kind}-${it.id}`

/**
 * Home -> Feed: posts and reviews of me, my friends and the places I follow, newest first
 * (keyset paging on created_at, scope 'all' | 'friends' decided by the server). Signed-out guests
 * see recent public reviews, read-only, with a sign-in prompt.
 */
export default function FeedTab() {
  const { t } = useTranslation('social')
  const { session, loading: authLoading } = useAuth()
  const userId = session?.user?.id || null
  const [scope, setScope] = useState('all')
  const [state, setState] = useState({ items: [], nextCursor: null, loading: true, error: null })
  const [more, setMore] = useState({ loading: false, error: false })
  const [hasNew, setHasNew] = useState(false)
  const seq = useRef(0)

  const load = useCallback(async () => {
    const mine = ++seq.current
    setState(s => ({ ...s, loading: true, error: null }))
    setMore({ loading: false, error: false })
    setHasNew(false)
    const { data, error } = userId ? await getFeed({ scope }) : await getPublicReviews()
    if (mine !== seq.current) return
    setState(error
      ? { items: [], nextCursor: null, loading: false, error }
      : { items: data.items, nextCursor: data.nextCursor, loading: false, error: null })
  }, [userId, scope])

  useEffect(() => {
    if (authLoading) return
    if (!userId && scope !== 'all') { setScope('all'); return }
    load()
  }, [authLoading, load, userId, scope])

  // "New posts" pill instead of reordering under the thumb
  useEffect(() => {
    if (!userId) return undefined
    return subscribePosts(({ userId: author }) => { if (author !== userId) setHasNew(true) })
  }, [userId])

  useOnVisible(async () => {
    if (!userId || state.loading) return
    const { data } = await getFeed({ scope, limit: 1 })
    const top = state.items[0]
    if (data?.items[0] && (!top || key(data.items[0]) !== key(top))) setHasNew(true)
  }, 30000)

  const loadMore = useCallback(async () => {
    if (!userId || !state.nextCursor || more.loading) return
    const mine = seq.current
    setMore({ loading: true, error: false })
    const { data, error } = await getFeed({ scope, cursor: state.nextCursor })
    // The scope changed (or the feed reloaded) while this page was loading: it belongs to the old list.
    if (mine !== seq.current) return
    if (error) { setMore({ loading: false, error: true }); return }
    setState(s => {
      const seen = new Set(s.items.map(key))
      return { ...s, items: [...s.items, ...data.items.filter(i => !seen.has(key(i)))], nextCursor: data.nextCursor }
    })
    setMore({ loading: false, error: false })
  }, [userId, scope, state.nextCursor, more.loading])

  function removeItem(id) {
    setState(s => ({ ...s, items: s.items.filter(i => !(i.kind === 'post' && i.id === id)) }))
  }

  function showNew() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    load()
  }

  const friendsScope = scope === 'friends'
  let body
  if (authLoading || state.loading) {
    body = <div aria-busy="true">{[1, 2].map(i => <PostSkeleton key={i} />)}</div>
  } else if (state.error) {
    body = <LoadError onRetry={load} />
  } else if (state.items.length === 0) {
    body = (
      <EmptyState
        icon={friendsScope ? '🤝' : '🍽️'}
        title={friendsScope ? t('feed.emptyFriendsTitle') : t('feed.emptyTitle')}
        body={friendsScope ? t('feed.emptyFriendsBody') : t('feed.emptyBody')}
        action={userId ? <Link to="/friends?tab=find" className="btn btn-primary">{t('feed.findFriends')}</Link> : null}
      />
    )
  } else {
    body = state.items.map((it, i) => (it.kind === 'review'
      ? <ReviewCard key={key(it)} item={it} index={i} />
      : <PostCard key={key(it)} item={it} index={i} onDeleted={removeItem} />))
  }

  return (
    <div className="soc-feed">
      {userId && (
        <div className="soc-feed-chips" role="tablist" aria-label={t('feed.filter')}>
          {['all', 'friends'].map(id => (
            <button
              key={id} type="button" role="tab" aria-selected={scope === id}
              className={`chip${scope === id ? ' active' : ''}`} onClick={() => setScope(id)}
            >
              {t(`feed.scope_${id}`)}
            </button>
          ))}
        </div>
      )}
      {!authLoading && !userId && (
        <div className="soc-feed-banner">
          <SignInCard compact title={t('feed.signInTitle')} body={t('feed.signInBody')} />
        </div>
      )}
      {hasNew && <button type="button" className="soc-newpill" onClick={showNew}>{t('feed.newPosts')}</button>}

      {body}

      {userId && state.nextCursor && !state.loading && !state.error && (
        <div className="soc-feed-more">
          {more.error && <p className="soc-error" role="alert">{t('errors.generic')}</p>}
          <button type="button" className="btn btn-ghost" onClick={loadMore} disabled={more.loading}>
            {more.loading ? <span className="spinner" aria-hidden="true" /> : null}
            {t('feed.loadMore')}
          </button>
        </div>
      )}
      <div style={{ height: 80 }} />
    </div>
  )
}
