import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { cuisineBackground, cuisineEmoji, getTodayHours, isRestaurantOpen } from '../../lib/helpers'
import { cuisineLabel } from '../discover/cuisine'
import { pickText } from '../../lib/lang'
import { thumb } from '../discover/thumb'
import { ReserveButton } from '../bookings/mounts'

function Stat({ label, value, onClick }) {
  const body = (
    <>
      <span className="rst-stat-n">{value}</span>
      <span className="rst-stat-l">{label}</span>
    </>
  )
  return onClick
    ? <button type="button" className="rst-stat rst-stat--tap" onClick={onClick}>{body}</button>
    : <div className="rst-stat">{body}</div>
}

/**
 * Profile header of the restaurant page: cover, logo, live stats, name, cuisine + open state, address and the
 * three actions (Reserve, Tables, Follow). Presentation only: the shell owns the data.
 *  stats   { reviews: number|null, followers, seatsFree, seatsTotal }: followers, reviews (tap = the reviews sheet) and
 *          the free seats, which only show while the place is open (UX plan 1.6: no "24 dishes")
 *  follow  { isFollowing, busy, toggle } from useFollow
 *  descriptionI18n  restaurants.description_i18n { az, en, ru } from restaurant_menu (sql/69), null before it: the description in the app language
 */
export default function RestaurantHeader({ restaurant, descriptionI18n = null, stats, follow, onBack, onFloor, onReviews }) {
  const { t, i18n } = useTranslation(['restaurant', 'common'])
  const { t: ts } = useTranslation('social')
  const about = pickText(descriptionI18n, i18n.language, null, restaurant.description)
  const open = isRestaurantOpen(restaurant.operating_hours)
  const today = getTodayHours(restaurant.operating_hours)
  const emoji = cuisineEmoji(restaurant.cuisine_type)
  const bg = cuisineBackground(restaurant.cuisine_type)
  const dash = '–'
  const addressBody = (
    <>
      <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M11.536 3.464a5 5 0 0 1 0 7.072l-3.536 3.536a.5.5 0 0 1-.707 0l-3.536-3.536a5 5 0 1 1 7.07-7.072zM8 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" clipRule="evenodd" />
      </svg>
      {restaurant.address}
    </>
  )

  return (
    <header className="rst-head">
      <div className="rst-cover" style={{ background: bg }}>
        {restaurant.cover_photo
          ? <img src={restaurant.cover_photo} alt="" className="rst-cover-img" />
          : <span className="rst-cover-emoji" aria-hidden="true">{emoji}</span>}
        <div className="rst-cover-fade" />
        <button type="button" className="rst-back" onClick={onBack} aria-label={t('common:back')}>
          <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      <div className="rst-col">
        <div className="rst-id">
          <div className="rst-logo" style={{ background: bg }}>
            {restaurant.logo
              ? <img src={thumb(restaurant.logo, 88)} alt={restaurant.name} />
              : <span aria-hidden="true">{emoji}</span>}
          </div>
          <div className="rst-stats">
            <Stat label={t('restaurant:statFollowers')} value={stats.followers} />
            <Stat label={t('restaurant:statReviews')} value={stats.reviews ?? dash} onClick={stats.reviews ? onReviews : undefined} />
            {open && stats.seatsTotal > 0 && <Stat label={t('restaurant:statFree')} value={stats.seatsFree} />}
          </div>
        </div>

        <h1 className="rst-name">{restaurant.name}</h1>

        <div className="rst-meta">
          <span className="rst-cuisine">{cuisineLabel(ts, restaurant.cuisine_type)}</span>
          <span className="rst-dot" aria-hidden="true">{'·'}</span>
          <span className={`rst-open${open ? ' is-open' : ' is-closed'}`}>
            {open ? <span className="open-indicator" /> : <span className="rst-closed-dot" />}
            {open ? t('common:open') : t('common:closed')}
            {today && (
              <span className="rst-hours">
                {open ? t('common:untilClose', { time: today.close }) : t('common:opensAt', { time: today.open })}
              </span>
            )}
          </span>
        </div>

        {about && <p className="rst-about">{about}</p>}

        {restaurant.address && (
          <p className="rst-address">
            {restaurant.slug
              ? <Link to={`/map?place=${encodeURIComponent(restaurant.slug)}`} className="rst-address-link">{addressBody}</Link>
              : addressBody}
          </p>
        )}

        <div className="rst-actions">
          <ReserveButton restaurant={restaurant} />
          <button
            type="button"
            className="btn btn-ghost rst-floor"
            onClick={onFloor}
            aria-label={t('restaurant:floorPlan')}
            title={t('restaurant:floorPlan')}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="3" y1="12" x2="12" y2="12" />
              <line x1="12" y1="3" x2="12" y2="21" />
              <circle cx="7.5" cy="7.5" r="1.6" />
              <circle cx="17" cy="16" r="2.2" />
            </svg>
            <span>{t('restaurant:tables')}</span>
          </button>
          <button
            type="button"
            className={`rst-follow${follow.isFollowing ? ' is-on' : ''}`}
            onClick={follow.toggle}
            aria-pressed={follow.isFollowing}
            aria-busy={follow.busy}
          >
            {follow.isFollowing ? t('restaurant:following') : t('restaurant:follow')}
          </button>
        </div>
      </div>
    </header>
  )
}
