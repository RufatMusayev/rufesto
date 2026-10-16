import { useTranslation } from 'react-i18next'
import { FeedSkeletons } from './FeedSkeleton'

/**
 * Under the last loaded card: a skeleton card while the next page is on its way, a retry after a failure,
 * and (only without IntersectionObserver, when nothing prefetches) a plain "Load more" button.
 */
export default function MoreRow({ more, onMore, showButton }) {
  const { t } = useTranslation('social')
  if (more.loading) return <FeedSkeletons count={1} />
  if (!more.error && !showButton) return null
  return (
    <div className="soc-feed-more">
      {more.error && <p className="soc-error" role="alert">{t('errors.generic')}</p>}
      <button type="button" className="btn btn-ghost" onClick={onMore}>
        {t(more.error ? 'feed.retry' : 'feed.loadMore')}
      </button>
    </div>
  )
}
