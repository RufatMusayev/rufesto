import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Avatar, Pill } from '../../../components/ui'
import { cleanDisplayName, timeAgo } from '../../../lib/helpers'
import { togglePostLike, deletePost } from '../api'
import { useRequireAuth, useToast } from '../hooks'
import { logFeedEvent } from '../../feed/events'
import { patchFeedItem, forgetPost } from '../../feed/feeds'
import { resignPostPhoto } from '../lib/postPhotos'
import { LikeIcon, ForkKnifeIcon, ShareIcon, MoreIcon, CameraIcon } from './Icons'
import { RestaurantPostHead, DishStrip, PhotoChips, TextCard, hasPhotoChips, restaurantPath } from './RestaurantPostParts'
import ConfirmSheet from './ConfirmSheet'

const DOUBLE_TAP_MS = 300

/**
 * A post. `full` is the /post/:id variant (no "view all comments" link, the comment
 * button calls onCommentClick). Like is optimistic; double-tapping the photo only ever likes.
 * A post by a restaurant (item.author.type === 'restaurant') shows the restaurant in the header and,
 * when it carries a dish, the dish strip with "Available now" / "Sold out" and "Order this".
 * like and order_tap are logged to the feed events (pool / position are set when it came from Home).
 * `priority` (the first photos of a feed) loads the photo eagerly with high fetch priority and skips the rise-in
 * animation, so the first card is painted as soon as it is in the DOM. A photo that is still being signed
 * (item.photoPending) shows a shimmering box of the final size. A restaurant post without a photo is a text card.
 */
export default function PostCard({ item, index = 0, full = false, priority = false, onDeleted, onCommentClick }) {
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
  const [imgFailed, setImgFailed] = useState(false)   // the signed URL expired or the file is gone
  const [resignedSrc, setResignedSrc] = useState(null)  // a freshly signed URL, after the first one failed
  const resigned = useRef(false)                      // one re-sign per photo before giving up
  const busy = useRef(false)
  const lastTap = useRef(0)

  useEffect(() => {
    setLiked(item.likedByMe)
    setLikeCount(item.likeCount)
  }, [item.id, item.likedByMe, item.likeCount])

  useEffect(() => {
    setResignedSrc(null)
    setImgFailed(false)
    resigned.current = false
  }, [item.photoUrl])
  const photoSrc = resignedSrc || item.photoUrl

  // item.photoUrl is the 640px copy in a feed (the full photo on /post/:id, or where a post has no copy). When it fails
  // (expired signed URL, copy missing) the FULL path is signed again and tried once, then the placeholder shows.
  async function onPhotoError() {
    if (resigned.current || !item.photoPath) { setImgFailed(true); return }
    resigned.current = true
    const url = await resignPostPhoto(item.photoPath)
    if (url) setResignedSrc(url)
    else setImgFailed(true)
  }

  const isResto = item.author?.type === 'restaurant'
  const name = isResto ? (item.author.name || item.restaurant?.name || '') : cleanDisplayName(item.user.name)
  const authorTo = isResto ? restaurantPath(item) : `/u/${item.user.id}`
  const isMine = item.isMine || (!!session && !!item.user.id && item.user.id === session.user.id)
  const restaurant = item.restaurant
  const hasPhoto = !!(item.hasPhoto || item.photoUrl)
  const textCard = isResto && !hasPhoto && !!item.text   // words only: a designed card, not a thin strip
  const chips = hasPhoto && hasPhotoChips(item, isResto)       // restaurant / distance / availability sit on the photo
  const feedEvent = event => logFeedEvent({ type: 'post', id: item.id, event, pool: item.pool, position: item.position })

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
    patchFeedItem('post', item.id, { likedByMe: data.liked, likeCount: data.likeCount })   // the lists keep it for the next mount
    if (data.liked) feedEvent('like')
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
    forgetPost(item.id)                         // every list and tail that may hold it, and a session-long "deleted" memory
    onDeleted?.(item.id)
  }

  const commentBtn = (
    <span className="soc-act-inner">
      <ForkKnifeIcon />
      {item.commentCount > 0 && <span className="soc-act-count">{item.commentCount}</span>}
    </span>
  )

  return (
    <article
      className={`feed-post${full ? '' : ' stagger-item'}${priority ? ' soc-post-now' : ''} soc-post`}
      style={full ? { animation: 'none', opacity: 1 } : (priority ? undefined : { animationDelay: `${Math.min(index, 8) * 60}ms` })}
      data-dish-id={isResto && item.dish?.id ? item.dish.id : undefined}
    >
      <header className="soc-post-head">
        {isResto ? (
          <RestaurantPostHead item={item} when={timeAgo(item.createdAt, i18n.language)} showSub={!chips} />
        ) : (
          <>
            <Link to={authorTo} className="soc-post-author" aria-label={name}>
              <Avatar name={item.user.name} src={item.user.photo} size={36} />
            </Link>
            <div className="soc-post-who">
              <div className="soc-post-line">
                <Link to={authorTo} className="soc-post-name">{name}</Link>
                <span className="soc-post-time">· {timeAgo(item.createdAt, i18n.language)}</span>
                {item.verified && <Pill tone="green" icon="✓">{t('review.verified')}</Pill>}
              </div>
              {restaurant?.name && !chips && (
                restaurant.slug
                  ? <Link to={`/restaurant/${restaurant.slug}`} className="soc-post-where">{restaurant.name}</Link>
                  : <span className="soc-post-where">{restaurant.name}</span>
              )}
            </div>
          </>
        )}
        {isMine && (
          <button type="button" className="icon-btn" aria-label={t('post.more')} onClick={() => { setDeleteError(null); setMenu(true) }}>
            <MoreIcon />
          </button>
        )}
      </header>

      {hasPhoto && (
        <div className={`soc-photo${chips ? ' soc-photo-shaded' : ''}${item.photoPending && !photoSrc ? ' soc-photo-pending' : ''}`} onClick={onPhotoTap}>
          {photoSrc && !imgFailed
            ? (
              <img
                src={photoSrc} alt={t('post.photoAlt', { name })} decoding="async" draggable={false} onError={onPhotoError}
                loading={priority ? 'eager' : 'lazy'} {...(priority ? { fetchpriority: 'high' } : {})}
              />
            )
            : item.photoPending && !imgFailed
              ? <div className="soc-photo-wait" role="img" aria-label={t('post.photoAlt', { name })} />
              : <div className="soc-photo-missing" role="img" aria-label={t('post.photoAlt', { name })}><CameraIcon size={36} /></div>}
          {chips && <PhotoChips item={item} isResto={isResto} />}
          {burst && <span className="soc-burst" aria-hidden="true"><LikeIcon active size={84} /></span>}
        </div>
      )}

      {textCard && <TextCard item={item} />}

      {isResto && item.dish && <DishStrip item={item} showPill={!chips} onOrder={() => feedEvent('order_tap')} />}

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

      {item.text && !textCard && (
        <p className="soc-caption">
          {/* not a link: the header above already links the author (a second, inline link would be a 18px tap target) */}
          <span className="soc-post-name">{name}</span> {item.text}
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
