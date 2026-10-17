import { Fragment, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import LoadError from '../../../components/LoadError'
import { getFeed } from '../../social/api'
import PostCard from '../../social/components/PostCard'
import ReviewCard from '../../social/components/ReviewCard'
import FeedSkeleton from './FeedSkeleton'
import DaySeparator from './DaySeparator'
import { dayOf } from '../lib/days'
import { isDeleted, onPostDeleted } from '../deleted'

const key = it => `${it.kind}-${it.id}`

/**
 * End of the ranked list: "You're all caught up". A signed-in guest gets a chronological tail below it (the
 * existing feed(): scope 'all' on Home = people, friends and followed places; scope 'friends' on the Friends
 * tab = me and my friends), newest first, minus what the ranked list already showed (`shown`: Set of
 * "kind-id"). Friends groups the tail by day like the ranked list. A signed-out guest on Home gets a way into
 * Discover. `emptyNode` replaces the default "nothing here" block when the ranked list had nothing at all.
 */
export default function CaughtUp({ scope = 'all', userId, empty, shown, onDiscover, emptyNode, byDay = false }) {
  const { t } = useTranslation('social')
  const friends = scope === 'friends'
  const [tail, setTail] = useState({ items: [], nextCursor: null, loading: !!userId, error: null })
  const [more, setMore] = useState({ loading: false, error: false })

  const load = useCallback(async () => {
    if (!userId) return
    setTail(s => ({ ...s, loading: true, error: null }))
    const { data, error } = await getFeed({ scope })
    setTail(error
      ? { items: [], nextCursor: null, loading: false, error }
      : { items: data.items.filter(i => !isDeleted(i)), nextCursor: data.nextCursor, loading: false, error: null })
  }, [userId, scope])

  useEffect(() => { load() }, [load])
  // a post deleted anywhere (this tail, the ranked list, the other tab) leaves this copy at once
  useEffect(() => onPostDeleted(id => setTail(s => ({ ...s, items: s.items.filter(x => !(x.kind === 'post' && x.id === id)) }))), [])

  async function loadMore() {
    if (!tail.nextCursor || more.loading) return
    setMore({ loading: true, error: false })
    const { data, error } = await getFeed({ scope, cursor: tail.nextCursor })
    if (error) { setMore({ loading: false, error: true }); return }
    setTail(s => {
      const seen = new Set(s.items.map(key))
      return { ...s, items: [...s.items, ...data.items.filter(i => !seen.has(key(i)) && !isDeleted(i))], nextCursor: data.nextCursor }
    })
    setMore({ loading: false, error: false })
  }

  const items = tail.items.filter(i => !shown.has(key(i)) && !isDeleted(i))
  const nothing = empty && !tail.loading && items.length === 0
  const bodyKey = userId ? (friends ? 'feed.caughtUpFriendsBody' : 'home.caughtUpBody') : 'home.caughtUpGuestBody'

  return (
    <>
      {nothing && emptyNode ? emptyNode : (
        <section className="soc-caught">
          <div className="soc-caught-mark" aria-hidden="true">✓</div>
          <h2 className="soc-caught-title">{nothing ? t('home.emptyTitle') : t('home.caughtUpTitle')}</h2>
          <p className="soc-caught-body">{nothing ? t('home.emptyBody') : t(bodyKey)}</p>
          {(!userId || nothing) && onDiscover && (
            <button type="button" className="btn btn-ghost" onClick={onDiscover}>{t('home.openDiscover')}</button>
          )}
        </section>
      )}

      {userId && tail.loading && <div aria-busy="true"><FeedSkeleton /></div>}
      {userId && tail.error && <LoadError onRetry={load} />}
      {items.map((it, i) => (
        <Fragment key={key(it)}>
          {byDay && (i === 0 || dayOf(items[i - 1]) !== dayOf(it)) && <DaySeparator day={dayOf(it)} />}
          {it.kind === 'review'
            ? <ReviewCard item={it} index={i} />
            : <PostCard item={it} index={i} />}
        </Fragment>
      ))}

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
