import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Avatar, Pill } from '../../../components/ui'
import { cleanDisplayName, timeAgo } from '../../../lib/helpers'
import { togglePostLike, deletePost } from '../api'
import { useRequireAuth, useToast } from '../hooks'
import { LikeIcon, ForkKnifeIcon, ShareIcon, MoreIcon } from './Icons'
import ConfirmSheet from './ConfirmSheet'

const DOUBLE_TAP_MS = 300

/**
 * A user post. `full` is the /post/:id variant (no "view all comments" link, the comment
 * button calls onCommentClick). Like is optimistic; double-tapping the photo only ever likes.
 */
export default function PostCard({ item, index = 0, full = false, onDeleted, onCommentClick }) {
  const { t, i18n } = useTranslation('social')
  const { session, requireAuth, authModal } = useRequireAuth()
  const { toast, showToast } = useToast()
  const [liked, setLiked] = useState(item.likedByMe)
  const [likeCount, setLikeCount] = useState(item.likeCount)
  const [pop, setPop] = useState(false)
  const [burst, setBurst] = useState(false)
  const [menu, setMenu] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const busy = useRef(false)
  const lastTap = useRef(0)

  useEffect(() => {
    setLiked(item.likedByMe)
    setLikeCount(item.likeCount)
  }, [item.id, item.likedByMe, item.likeCount])

  const name = cleanDisplayName(item.user.name)
  const isMine = item.isMine || (!!session && !!item.user.id && item.user.id === session.user.id)
  const restaurant = item.restaurant

  async function like({ onlyLike = false } = {}) {
    if (!requireAuth() || busy.current) return
    if (onlyLike && liked) return
    busy.current = true
    const next = !liked
    setLiked(next)
    setLikeCount(c => Math.max(0, c + (next ? 1 : -1)))
    if (next) { setPop(true); setTimeout(() => setPop(false), 360) }
    const { data, error } = await togglePostLike(item.id)
    busy.current = false
    if (error) {
      setLiked(!next)
      setLikeCount(c => Math.max(0, c + (next ? -1 : 1)))
      showToast(error.key)
      return
    }
    setLiked(data.liked)
    setLikeCount(data.likeCount)
  }

  function onPhotoTap() {
    const now = Date.now()
    if (now - lastTap.current < DOUBLE_TAP_MS) {
      lastTap.current = 0
      if (session) { setBurst(true); setTimeout(() => setBurst(false), 700) }
      like({ onlyLike: true })
    } else {
      lastTap.current = now
    }
  }

  async function share() {
    const url = `${window.location.origin}/post/${item.id}`
    try {
      if (navigator.share) {
        await navigator.share({ url, title: name, text: item.text || undefined })
        return
      }
    } catch (err) {
      if (err?.name === 'AbortError') return
    }
    try {
      await navigator.clipboard.writeText(url)
      showToast('social:post.linkCopied', 'info')
    } catch {
      showToast('social:errors.generic')
    }
  }

  async function confirmDelete() {
    setDeleting(true)
    setDeleteError(null)
    const { error } = await deletePost(item.id)
    setDeleting(false)
    if (error) { setDeleteError(error.key); return }
    setMenu(false)
    onDeleted?.(item.id)
  }

  const commentBtn = (
    <span className="soc-act-inner">
      <ForkKnifeIcon />
      {item.commentCount > 0 && <span className="soc-act-count">{item.commentCount}</span>}
    </span>
  )

  return (
    <article className={`feed-post${full ? '' : ' stagger-item'} soc-post`} style={full ? { animation: 'none', opacity: 1 } : { animationDelay: `${Math.min(index, 8) * 60}ms` }}>
      <header className="soc-post-head">
        <Link to={`/u/${item.user.id}`} className="soc-post-author" aria-label={name}>
          <Avatar name={item.user.name} src={item.user.photo} size={36} />
        </Link>
        <div className="soc-post-who">
          <div className="soc-post-line">
            <Link to={`/u/${item.user.id}`} className="soc-post-name">{name}</Link>
            <span className="soc-post-time">· {timeAgo(item.createdAt, i18n.language)}</span>
            {item.verified && <Pill tone="green" icon="✓">{t('review.verified')}</Pill>}
          </div>
          {restaurant?.name && (
            restaurant.slug
              ? <Link to={`/restaurant/${restaurant.slug}`} className="soc-post-where">{restaurant.name}</Link>
              : <span className="soc-post-where">{restaurant.name}</span>
          )}
        </div>
        {isMine && (
          <button type="button" className="icon-btn" aria-label={t('post.more')} onClick={() => { setDeleteError(null); setMenu(true) }}>
            <MoreIcon />
          </button>
        )}
      </header>

      {item.photoUrl && (
        <div className="soc-photo" onClick={onPhotoTap}>
          <img src={item.photoUrl} alt={item.text || t('post.photoAlt', { name })} loading="lazy" draggable={false} />
          {burst && <span className="soc-burst" aria-hidden="true"><LikeIcon active size={84} /></span>}
        </div>
      )}

      <div className="soc-actions">
        <button
          type="button" className="icon-btn soc-act" aria-pressed={liked}
          aria-label={liked ? t('post.unlike') : t('post.like')} onClick={() => like()}
        >
          <LikeIcon active={liked} className={pop ? 'like-btn-active' : ''} />
        </button>
        {full
          ? <button type="button" className="icon-btn soc-act soc-act-wide" aria-label={t('post.comment')} onClick={onCommentClick}>{commentBtn}</button>
          : <Link to={`/post/${item.id}`} state={{ item }} className="icon-btn soc-act soc-act-wide" aria-label={t('post.comment')}>{commentBtn}</Link>}
        <button type="button" className="icon-btn soc-act" aria-label={t('post.share')} onClick={share}>
          <ShareIcon />
        </button>
        {likeCount > 0 && <span className="soc-act-likes">{t('post.likes', { count: likeCount })}</span>}
      </div>

      {item.text && (
        <p className="soc-caption">
          <Link to={`/u/${item.user.id}`} className="soc-post-name">{name}</Link> {item.text}
        </p>
      )}
      {!full && item.commentCount > 0 && (
        <Link to={`/post/${item.id}`} state={{ item }} className="soc-viewall">
          {t('post.viewAll', { count: item.commentCount })}
        </Link>
      )}

      {toast}
      {authModal}
      <ConfirmSheet
        open={menu}
        title={t('post.deleteTitle')}
        body={t('post.deleteBody')}
        confirmLabel={t('post.deleteConfirm')}
        pending={deleting}
        error={deleteError}
        onConfirm={confirmDelete}
        onClose={() => setMenu(false)}
      />
    </article>
  )
}
