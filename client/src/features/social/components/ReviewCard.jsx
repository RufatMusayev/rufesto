import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Avatar, Pill } from '../../../components/ui'
import { categoryEmoji, cleanDisplayName, timeAgo } from '../../../lib/helpers'
import { setReviewLike } from '../api'
import { useRequireAuth, useToast } from '../hooks'
import { LikeIcon } from './Icons'

/**
 * Read-only embed of a review inside the feed / a profile: the visual twin of ReviewPostCard on
 * Home (stars, dish chip, optional photo, like) without the reply thread.
 */
export default function ReviewCard({ item, index = 0, showActions = true }) {
  const { t, i18n } = useTranslation('social')
  const { session, requireAuth, authModal } = useRequireAuth()
  const { toast, showToast } = useToast()
  const [liked, setLiked] = useState(item.likedByMe)
  const [likeCount, setLikeCount] = useState(item.likeCount)
  const [pop, setPop] = useState(false)
  const busy = useRef(false)

  useEffect(() => {
    setLiked(item.likedByMe)
    setLikeCount(item.likeCount)
  }, [item.id, item.likedByMe, item.likeCount])

  const name = cleanDisplayName(item.user.name)
  const rating = Math.max(0, Math.min(5, Math.round(item.rating || 0)))
  const place = item.restaurant
  const chip = item.dish
    ? `${categoryEmoji(item.dish.category)} ${item.dish.name}${place?.name ? ` · ${place.name}` : ''}`
    : (place?.name || null)

  async function like() {
    if (!requireAuth() || busy.current) return
    busy.current = true
    const next = !liked
    setLiked(next)
    setLikeCount(c => Math.max(0, c + (next ? 1 : -1)))
    if (next) { setPop(true); setTimeout(() => setPop(false), 360) }
    const { error } = await setReviewLike(item.id, session.user.id, next)
    busy.current = false
    if (error) {
      setLiked(!next)
      setLikeCount(c => Math.max(0, c + (next ? -1 : 1)))
      showToast(error.key)
    }
  }

  return (
    <article className="feed-post stagger-item soc-review" style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}>
      <header className="soc-post-head soc-review-head">
        <Link to={`/u/${item.user.id}`} className="soc-post-author" aria-label={name}><Avatar name={item.user.name} src={item.user.photo} size={36} /></Link>
        <div className="soc-post-who">
          <div className="soc-post-line">
            <Link to={`/u/${item.user.id}`} className="soc-post-name">{name}</Link>
            <span className="soc-post-time">· {timeAgo(item.createdAt, i18n.language)}</span>
          </div>
          {chip && (place?.slug
            ? <Link to={`/restaurant/${place.slug}`} className="soc-post-where">{chip}</Link>
            : <span className="soc-post-where">{chip}</span>)}
        </div>
        <span className="soc-stars" role="img" aria-label={t('review.rating', { rating })}>
          {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
        </span>
      </header>

      <div className="soc-review-body">
        <p className="soc-review-text">
          {item.text || t('review.rated', { dish: item.dish?.name || t('review.thisDish'), rating })}
        </p>
        {item.verified && <div className="soc-review-pill"><Pill tone="green" icon="✓">{t('review.verified')}</Pill></div>}
        {item.photoUrl && <img className="soc-review-photo" src={item.photoUrl} alt={t('review.photoAlt')} loading="lazy" />}
      </div>

      {showActions && (
        <div className="soc-actions soc-review-actions">
          <button type="button" className="icon-btn soc-act" aria-pressed={liked} aria-label={liked ? t('post.unlike') : t('post.like')} onClick={like}>
            <LikeIcon active={liked} className={pop ? 'like-btn-active' : ''} />
          </button>
          {likeCount > 0 && <span className="soc-act-likes">{t('post.likes', { count: likeCount })}</span>}
          {item.commentCount > 0 && <span className="soc-act-likes">{t('review.replies', { count: item.commentCount })}</span>}
        </div>
      )}
      {toast}
      {authModal}
    </article>
  )
}
