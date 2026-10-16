import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import PostMenu from '../../../components/PostMenu'
import { LikeIcon } from '../../social/components/Icons'
import CoverImage, { restaurantSources } from './CoverImage'
import { useActions } from '../ActionsContext'

const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '')

function StatusPill({ r }) {
  const { t } = useTranslation('social')
  if (!r.openNow) return <span className="dsc-pill">{t('discover.closed')}</span>
  return (
    <span className="dsc-pill dsc-pill-open">
      {r.closesAt ? t('discover.openUntil', { time: r.closesAt }) : t('post.openNow')}
    </span>
  )
}

function FollowButton({ r }) {
  const { t } = useTranslation('social')
  const act = useActions()
  const on = act.isFollowed(r)
  return (
    <button
      type="button" className={`btn dsc-follow ${on ? 'btn-ghost' : 'btn-follow'}`} aria-pressed={on}
      aria-label={t(on ? 'discover.unfollowAria' : 'discover.followAria', { name: r.name })}
      onClick={() => act.toggleFollow(r)}
    >
      {t(on ? 'discover.following' : 'discover.follow')}
    </button>
  )
}

/**
 * A restaurant: photo (cover_photo, else the first dish photo, else the logo, else initials) with a soft
 * bottom gradient, the open / closes-at pill and the cuisine chip over it; name in the serif face; cuisine and
 * distance; rating and followers. variant 'rail' = the compact card of the horizontal rails (Follow only for
 * signed-in guests); variant 'list' = the "All restaurants" card with like, menu link, share and Follow
 * (a signed-out tap asks to sign in, as the old Home list did).
 */
export default function RestaurantCard({ r, variant = 'rail' }) {
  const { t } = useTranslation('social')
  const act = useActions()
  const list = variant === 'list'
  const to = r.slug ? `/restaurant/${r.slug}` : null
  const meta = [cap(r.cuisine), r.km != null ? t('post.kmAway', { km: r.km }) : null].filter(Boolean).join(' · ')
  const liked = act.liked(r)
  const likes = act.likeCount(r)
  const photo = (
    <>
      <CoverImage sources={restaurantSources(r)} name={r.name} />
      <span className="dsc-shade" aria-hidden="true" />
      <span className="dsc-over dsc-over-top">
        <StatusPill r={r} />
        {r.trending && <span className="dsc-pill dsc-pill-gold">{t('discover.trending')}</span>}
      </span>
    </>
  )

  return (
    <article className={`dsc-rc dsc-rc-${variant}`}>
      {to
        ? <Link to={to} className="dsc-photo" tabIndex={-1} aria-hidden="true">{photo}</Link>
        : <div className="dsc-photo" aria-hidden="true">{photo}</div>}

      <div className="dsc-rc-body">
        <div className="dsc-rc-titlerow">
          <h3 className="dsc-rc-name">{to ? <Link to={to}>{r.name}</Link> : r.name}</h3>
          {list && to && <PostMenu path={to} title={r.name} />}
        </div>
        {meta && <p className="dsc-rc-meta">{meta}</p>}
        {list && r.address && <p className="dsc-rc-meta dsc-rc-addr">{r.address}</p>}

        <p className="dsc-rc-stats">
          {r.rating != null && (
            <span className="dsc-rating" role="img" aria-label={t('discover.ratingAria', { rating: r.rating })}>
              ★ {r.rating.toFixed(1)}{r.reviewCount > 0 && <span className="dsc-rating-n"> ({r.reviewCount})</span>}
            </span>
          )}
          <span>{t('discover.followers', { count: act.followers(r) })}</span>
          {list && r.openNow && r.freeSeats > 0 && <span>{t('discover.freeSeats', { count: r.freeSeats })}</span>}
        </p>

        <div className="dsc-rc-actions">
          {list && (
            <>
              <button
                type="button" className="icon-btn dsc-like" aria-pressed={liked}
                aria-label={t(liked ? 'discover.unlikeAria' : 'discover.likeAria', { name: r.name })}
                onClick={() => act.toggleLike(r)}
              >
                <LikeIcon active={liked} size={24} />
                {likes > 0 && <span className="dsc-like-n">{likes}</span>}
              </button>
              {to && <Link to={to} className="dsc-menu-link">{t('discover.viewMenu')}</Link>}
            </>
          )}
          {(list || act.signedIn) && <FollowButton r={r} />}
        </div>
      </div>
    </article>
  )
}
