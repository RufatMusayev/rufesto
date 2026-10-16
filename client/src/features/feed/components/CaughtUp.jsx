import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import LoadError from '../../../components/LoadError'
import { getFeed } from '../../social/api'
import PostCard from '../../social/components/PostCard'
import ReviewCard from '../../social/components/ReviewCard'
import PostSkeleton from '../../social/components/PostSkeleton'

const key = it => `${it.kind}-${it.id}`

/**
 * End of the ranked list: "You're all caught up". A signed-in guest gets a chronological tail below it
 * (the existing feed('all'): people, friends and followed places, newest first) minus what Home just
 * showed; a signed-out guest gets a way into Discover. Also used when Home has nothing at all yet.
 */
export default function CaughtUp({ userId, empty, shown, onDiscover }) {
  const { t } = useTranslation('social')
  const [tail, setTail] = useState({ items: [], nextCursor: null, loading: !!userId, error: null })
  const [more, setMore] = useState({ loading: false, error: false })

  const load = useCallback(async () => {
    if (!userId) return
    setTail(s => ({ ...s, loading: true, error: null }))
    const { data, error } = await getFeed({ scope: 'all' })
    setTail(error
      ? { items: [], nextCursor: null, loading: false, error }
      : { items: data.items, nextCursor: data.nextCursor, loading: false, error: null })
  }, [userId])

  useEffect(() => { load() }, [load])

  async function loadMore() {
    if (!tail.nextCursor || more.loading) return
    setMore({ loading: true, error: false })
    const { data, error } = await getFeed({ scope: 'all', cursor: tail.nextCursor })
    if (error) { setMore({ loading: false, error: true }); return }
    setTail(s => {
      const seen = new Set(s.items.map(key))
      return { ...s, items: [...s.items, ...data.items.filter(i => !seen.has(key(i)))], nextCursor: data.nextCursor }
    })
    setMore({ loading: false, error: false })
  }

  function removePost(id) {
    setTail(s => ({ ...s, items: s.items.filter(x => !(x.kind === 'post' && x.id === id)) }))
  }

  const items = tail.items.filter(i => !(i.kind === 'post' && shown.has(i.id)))
  const nothing = empty && !tail.loading && items.length === 0

  return (
    <>
      <section className="soc-caught">
        <div className="soc-caught-mark" aria-hidden="true">✓</div>
        <h2 className="soc-caught-title">{nothing ? t('home.emptyTitle') : t('home.caughtUpTitle')}</h2>
        <p className="soc-caught-body">
          {nothing ? t('home.emptyBody') : t(userId ? 'home.caughtUpBody' : 'home.caughtUpGuestBody')}
        </p>
        {(!userId || nothing) && onDiscover && (
          <button type="button" className="btn btn-ghost" onClick={onDiscover}>{t('home.openDiscover')}</button>
        )}
      </section>

      {userId && tail.loading && <div aria-busy="true"><PostSkeleton /></div>}
      {userId && tail.error && <LoadError onRetry={load} />}
      {items.map((it, i) => (it.kind === 'review'
        ? <ReviewCard key={key(it)} item={it} index={i} />
        : <PostCard key={key(it)} item={it} index={i} onDeleted={removePost} />))}

      {userId && tail.nextCursor && !tail.loading && (
        <div className="soc-feed-more">
          {more.error && <p className="soc-error" role="alert">{t('errors.generic')}</p>}
          <button type="button" className="btn btn-ghost" onClick={loadMore} disabled={more.loading}>
            {more.loading ? <span className="spinner" aria-hidden="true" /> : null}
            {t('feed.loadMore')}
          </button>
        </div>
      )}
    </>
  )
}
