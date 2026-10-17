import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Avatar, Pill } from '../../../components/ui'
import { useAuth } from '../../../contexts/AuthContext'
import { categoryEmoji, cleanDisplayName, timeAgo } from '../../../lib/helpers'
import { patchFeedItem } from '../../feed/feeds'
import { setReviewLike } from '../api'
import { useRequireAuth, useToast } from '../hooks'
import { LikeIcon, ForkKnifeIcon } from './Icons'
import ReviewReplies from './ReviewReplies'

/**
 * Read-only embed of a review inside the feed / a profile: the visual twin of ReviewPostCard on Home (stars, dish
 * chip, optional photo, like) plus its reply thread: the fork-and-knife button (and "View N replies") expands the
 * replies inside the card, with a reply box for signed-in guests. Likes and the reply count are also written to the
 * feed lists (patchFeedItem), so the card is right when it mounts again. The venue stays readable on a long dish name:
 * the dish is cut first (see .soc-where).
 */
export default function ReviewCard({ item, index = 0, showActions = true }) {
  const { t, i18n } = useTranslation('social')
  const { session, profile } = useAuth()
  const { requireAuth, authModal } = useRequireAuth()
  const { toast, showToast } = useToast()
  const [liked, setLiked] = useState(item.likedByMe)
  const [likeCount, setLikeCount] = useState(item.likeCount)
  const [replyCount, setReplyCount] = useState(item.commentCount)
  const [open, setOpen] = useState(false)
  const [pop, setPop] = useState(false)
  const busy = useRef(false)
  const panelId = 'replies-' + item.id
  const userId = session?.user?.id || null
  const me = session ? { name: profile?.name || null, photo: profile?.profile_photo || null } : null

  useEffect(() => {
    setLiked(item.likedByMe)
    setLikeCount(item.likeCount)
    setReplyCount(item.commentCount)
  }, [item.id, item.likedByMe, item.likeCount, item.commentCount])

  const name = cleanDisplayName(item.user.name)
  const rating = Math.max(0, Math.min(5, Math.round(item.rating || 0)))
  const place = item.restaurant
  const dish = item.dish?.name ? categoryEmoji(item.dish.category) + ' ' + item.dish.name : null
  const where = (dish || place?.name) ? (
    <>
      {dish && <span className="soc-where-dish">{dish}</span>}
      {dish && place?.name && <span className="soc-where-sep" aria-hidden="true"> · </span>}
      {place?.name && <span className="soc-where-place">{place.name}</span>}
    </>
  ) : null

  async function like() {
    if (!requireAuth() || busy.current) return
    busy.current = true
    const next = !liked
    const nextCount = Math.max(0, likeCount + (next ? 1 : -1))
    setLiked(next)
    setLikeCount(nextCount)
    if (next) { setPop(true); setTimeout(() => setPop(false), 360) }
    const { error } = await setReviewLike(item.id, session.user.id, next)
    busy.current = false
    if (error) {
      setLiked(!next)
      setLikeCount(c => Math.max(0, c + (next ? -1 : 1)))
      showToast(error.key)
      return
    }
    patchFeedItem('review', item.id, { likedByMe: next, likeCount: nextCount })
  }

  // the thread reports the real number of replies after a load, an add or a delete
  const onCount = useCallback(n => {
    setReplyCount(n)
    patchFeedItem('review', item.id, { commentCount: n })
  }, [item.id])

  const hasBody = !!item.text || item.verified || !!item.photoUrl

  return (
    <article className="feed-post stagger-item soc-review" style={{ animationDelay: Math.min(index, 8) * 60 + 'ms' }}>
      <header className="soc-post-head soc-review-head">
        <Link to={'/u/' + item.user.id} className="soc-post-author" aria-label={name}><Avatar name={item.user.name} src={item.user.photo} size={36} /></Link>
        <div className="soc-post-who">
          <div className="soc-post-line">
            <Link to={'/u/' + item.user.id} className="soc-post-name">{name}</Link>
            <span className="soc-post-time">· {timeAgo(item.createdAt, i18n.language)}</span>
          </div>
          {where && (place?.slug
            ? <Link to={'/restaurant/' + place.slug} className="soc-post-where soc-where">{where}</Link>
            : <span className="soc-post-where soc-where">{where}</span>)}
        </div>
        <span className="soc-stars" role="img" aria-label={t('review.rating', { rating })}>
          {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
        </span>
      </header>

      {hasBody && (
        <div className="soc-review-body">
          {item.text && <p className="soc-review-text">{item.text}</p>}
          {item.verified && <div className="soc-review-pill"><Pill tone="green" icon="✓">{t('review.verified')}</Pill></div>}
          {item.photoUrl && <img className="soc-review-photo" src={item.photoUrl} alt={t('review.photoAlt')} loading="lazy" decoding="async" />}
        </div>
      )}

      {showActions && (
        <div className="soc-actions soc-review-actions">
          <button type="button" className="icon-btn soc-act" aria-pressed={liked} aria-label={liked ? t('post.unlike') : t('post.like')} onClick={like}>
            <LikeIcon active={liked} className={pop ? 'like-btn-active' : ''} />
          </button>
          <button
            type="button" className="icon-btn soc-act soc-act-wide" aria-label={t('review.reply')}
            aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(o => !o)}
          >
            <span className="soc-act-inner">
              <ForkKnifeIcon />
              {replyCount > 0 && <span className="soc-act-count">{replyCount}</span>}
            </span>
          </button>
          {likeCount > 0 && <span className="soc-act-likes">{t('post.likes', { count: likeCount })}</span>}
        </div>
      )}
      {showActions && (replyCount > 0 || open) && (
        <button
          type="button" className="soc-viewall soc-viewall-btn" aria-expanded={open} aria-controls={panelId}
          onClick={() => setOpen(o => !o)}
        >
          {open ? t('review.hideReplies') : t('review.viewReplies', { count: replyCount })}
        </button>
      )}
      {showActions && open && (
        <ReviewReplies
          reviewId={item.id} userId={userId} me={me} guard={requireAuth} onCount={onCount} panelId={panelId}
        />
      )}
      {toast}
      {authModal}
    </article>
  )
}
