import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PeopleIcon } from './Icons'

/** Secondary button beside "Reserve a table" on the restaurant page: opens the group booking wizard. */
export default function BookWithFriendsButton({ restaurant }) {
  const { t } = useTranslation('bookings')
  if (!restaurant?.slug) return null
  return (
    <Link to={`/book/${restaurant.slug}`} className="btn btn-ghost bk-friends-btn" aria-label={t('bookWithFriends')}>
      <PeopleIcon size={16} />
      {t('withFriends')}
    </Link>
  )
}
