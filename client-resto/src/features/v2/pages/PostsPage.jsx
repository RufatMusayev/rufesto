import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../contexts/AuthContext'
import { v2Error } from '../errors'
import { deletePost } from '../postsApi'
import usePosts from '../hooks/usePosts'
import DeletePostModal from '../components/DeletePostModal'
import EmptyBlock from '../components/EmptyBlock'
import ErrorBanner from '../components/ErrorBanner'
import LoadError from '../components/LoadError'
import PostCard from '../components/PostCard'
import PostComposer from '../components/PostComposer'
import '../styles.css'

// /posts (admin, manager): publish a post as the restaurant (it reaches the Home feed of the consumer app) and
// manage the ones already published. The list shows only this restaurant's own posts (restaurant_posts).
export default function PostsPage() {
  const { restaurantId } = useAuth()
  const { t } = useTranslation('v2')
  const posts = usePosts(restaurantId)
  const { items, error, loading, nextCursor, moreBusy, moreError } = posts

  const [target, setTarget] = useState(null)          // post waiting for the delete confirmation
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  function closeDelete() {
    setTarget(null)
    setDeleteError(null)
  }

  async function confirmDelete() {
    if (!target || deleting) return
    setDeleting(true)
    setDeleteError(null)
    const res = await deletePost(target)
    setDeleting(false)
    if (res.error) {
      setDeleteError(res.error)
      return
    }
    posts.remove(target.id)
    closeDelete()
  }

  return (
    <div className="v2-page">
      <div className="v2-page-head">
        <div>
          <h1 className="page-title">{t('postsTitle')}</h1>
          <p className="v2-page-sub">{t('postsSub')}</p>
        </div>
      </div>

      <div className="v2-posts">
        {restaurantId && <PostComposer key={restaurantId} restaurantId={restaurantId} onPublished={posts.reload} />}

        <section className="v2-posts-list" aria-labelledby="v2-posts-list-title">
          <h2 id="v2-posts-list-title" className="dash-section-title">{t('postsListTitle')}</h2>

          {loading ? (
            <div aria-hidden="true">
              {[0, 1].map(i => <div key={i} className="skeleton v2-skel-post" />)}
            </div>
          ) : !items ? (
            <LoadError message={v2Error(error, t)} onRetry={posts.retry} />
          ) : items.length === 0 ? (
            <EmptyBlock icon="📸" title={t('postsEmpty')} body={t('postsEmptyHint')} />
          ) : (
            <>
              <div className="v2-post-grid">
                {items.map(p => <PostCard key={p.id} post={p} onDelete={setTarget} />)}
              </div>
              {moreError && <ErrorBanner message={v2Error(moreError, t)} />}
              {nextCursor && (
                <button type="button" className="btn btn-ghost v2-posts-more" onClick={posts.loadMore} disabled={moreBusy}>
                  {moreBusy && <span className="spinner" aria-hidden="true" />}
                  {t('postsLoadMore')}
                </button>
              )}
            </>
          )}
        </section>
      </div>

      {target && (
        <DeletePostModal
          busy={deleting}
          error={deleteError ? v2Error(deleteError, t) : ''}
          onConfirm={confirmDelete}
          onCancel={closeDelete}
        />
      )}
    </div>
  )
}
