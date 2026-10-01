import { useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '../../../components/ui'
import LoadError from '../../../components/LoadError'
import { useAuth } from '../../../contexts/AuthContext'
import { useRequireAuth } from '../hooks'
import { usePostThread } from '../usePostThread'
import TopBar from '../components/TopBar'
import PostCard from '../components/PostCard'
import PostSkeleton from '../components/PostSkeleton'
import CommentRow, { CommentSkeletons } from '../components/CommentRow'
import CommentComposer from '../components/CommentComposer'
import ConfirmSheet from '../components/ConfirmSheet'

export default function PostPage() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { t } = useTranslation('social')
  const { session, profile, loading: authLoading } = useAuth()
  const { requireAuth, authModal } = useRequireAuth()
  const seed = location.state?.item?.id === id ? location.state.item : null
  const userId = session?.user?.id || null
  const me = session ? { name: profile?.name || null, photo: profile?.profile_photo || null } : null
  const thread = usePostThread({ id, userId, seed, authLoading, me })
  const input = useRef(null)
  const [target, setTarget] = useState(null)
  const [removing, setRemoving] = useState(false)
  const [removeError, setRemoveError] = useState(null)

  const { post, postState, comments, commentState } = thread
  const frame = children => (
    <div className="soc-page soc-page-thread">
      <TopBar title={t('post.title')} />
      {children}
      {authModal}
    </div>
  )

  if (postState === 'loading' || authLoading) {
    return frame(<div className="soc-post-wrap" aria-busy="true"><PostSkeleton /><CommentSkeletons /></div>)
  }
  if (postState === 'error') return frame(<LoadError onRetry={thread.retryPost} />)
  if (postState === 'missing' || !post) {
    return frame(
      <EmptyState
        icon="🍽️" title={t('post.unavailableTitle')} body={t('post.unavailableBody')}
        action={<Link to="/" className="btn btn-ghost">{t('post.goHome')}</Link>}
      />,
    )
  }

  const isPostOwner = !!userId && post.user.id === userId

  async function confirmRemove() {
    setRemoving(true)
    setRemoveError(null)
    const { error } = await thread.remove(target)
    setRemoving(false)
    if (error) { setRemoveError(error.key); return }
    setTarget(null)
  }

  return frame(
    <>
      <div className="soc-post-wrap">
        <PostCard item={post} full onDeleted={() => navigate('/', { replace: true })} onCommentClick={() => input.current?.focus()} />

        <section className="soc-comments" aria-label={t('comment.title')}>
          {commentState.loading ? (
            <CommentSkeletons />
          ) : commentState.error && comments.length === 0 ? (
            <LoadError onRetry={thread.retryComments} />
          ) : (
            <>
              {commentState.nextCursor && (
                <div className="soc-feed-more">
                  <button type="button" className="btn btn-ghost soc-btn-sm" onClick={thread.loadEarlier} disabled={commentState.loadingMore}>
                    {commentState.loadingMore ? <span className="spinner" aria-hidden="true" /> : null}
                    {t('comment.loadEarlier')}
                  </button>
                </div>
              )}
              {comments.length === 0
                ? <p className="soc-hint soc-comments-empty">{t('comment.empty')}</p>
                : comments.map(c => (
                  <CommentRow
                    key={c.id} comment={c} canDelete={c.mine || isPostOwner}
                    onDelete={x => { setRemoveError(null); setTarget(x) }}
                  />
                ))}
            </>
          )}
        </section>
      </div>

      <CommentComposer me={me} guard={requireAuth} inputRef={input} onSend={thread.send} />

      <ConfirmSheet
        open={!!target}
        title={t('comment.deleteTitle')}
        body={t('comment.deleteBody')}
        confirmLabel={t('comment.deleteConfirm')}
        pending={removing}
        error={removeError}
        onConfirm={confirmRemove}
        onClose={() => setTarget(null)}
      />
    </>,
  )
}
