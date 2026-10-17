import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { timeAgo } from '@shared/helpers'
import { localeTag } from '../../../lib/time'
import { bakuWhen } from '../dates'
import { signPostPhoto } from '../postsApi'
import StatusPill from './StatusPill'

// One of the restaurant's posts in the Posts list: photo, caption, tagged dish with its live availability,
// like / comment counts, relative time and a Delete button (`onDelete(post)` opens the confirm dialog).
// The photo is the 640 px copy (the full photo for a post without one). Signed photo URLs last an hour; a page left
// open longer, or a copy that fails to load, gets an image error, so the card signs its one FULL path once and
// retries before it falls back to the placeholder.
export default function PostCard({ post, onDelete }) {
  const { t, i18n } = useTranslation('v2')
  const [src, setSrc] = useState(post.photoUrl)
  const [broken, setBroken] = useState(false)
  const resigned = useRef(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => { alive.current = false }
  }, [])
  useEffect(() => {
    setSrc(post.photoUrl)
    setBroken(false)
    resigned.current = false
  }, [post.photoUrl])

  async function onImageError() {
    if (resigned.current || !post.photoPath) {      // second failure, or a legacy absolute URL: nothing to re-sign
      setBroken(true)
      return
    }
    resigned.current = true
    const fresh = await signPostPhoto(post.photoPath)
    if (!alive.current) return
    if (fresh) setSrc(fresh)
    else setBroken(true)
  }

  const hasPhoto = !!(post.photoPath || post.photoUrl)
  const exact = bakuWhen(post.createdAt, localeTag(i18n.language))

  return (
    <article className="v2-post">
      {src && !broken ? (
        <img className="v2-post-photo" src={src} alt={t('postsPhotoAlt')} loading="lazy" onError={onImageError} />
      ) : hasPhoto ? (
        <div className="v2-post-photo v2-post-photo--empty" role="img" aria-label={t('postsPhotoUnavailable')}>🍽️</div>
      ) : null}

      <div className="v2-post-body">
        {post.caption && <p className="v2-post-caption">{post.caption}</p>}

        {post.dish && (
          <div className="v2-post-dish">
            <span className="v2-post-dish-name">{post.dish.name}</span>
            <StatusPill tone={post.dish.available ? 'green' : 'red'}>
              {post.dish.available ? t('postsDishAvailable') : t('postsDishSoldOut')}
            </StatusPill>
          </div>
        )}

        <div className="v2-post-foot">
          <ul className="v2-post-stats">
            <li>
              <span aria-hidden="true">🤌 {post.likeCount}</span>
              <span className="v2-sr-only">{t('postsLikes', { count: post.likeCount })}</span>
            </li>
            <li>
              <span aria-hidden="true">🍽️ {post.commentCount}</span>
              <span className="v2-sr-only">{t('postsComments', { count: post.commentCount })}</span>
            </li>
            <li>
              <time dateTime={post.createdAt} title={exact}>{timeAgo(post.createdAt, i18n.language)}</time>
            </li>
          </ul>
          <button type="button" className="btn btn-danger btn-sm" onClick={() => onDelete(post)}>
            {t('postsDelete')}
          </button>
        </div>
      </div>
    </article>
  )
}
