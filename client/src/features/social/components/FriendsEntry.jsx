import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../../contexts/AuthContext'
import { useIncomingCount } from '../useFriendsData'
import { PeopleIcon } from './Icons'

/** Profile row linking to /friends, with the live count of pending incoming requests. */
export default function FriendsEntry() {
  const { t } = useTranslation('social')
  const { session } = useAuth()
  const count = useIncomingCount(session?.user?.id)
  if (!session) return null
  return (
    <Link to="/friends" className="soc-entry">
      <span className="soc-entry-icon"><PeopleIcon /></span>
      <span className="soc-entry-label">{t('navFriends')}</span>
      {count > 0 && <span className="soc-count-badge" aria-label={t('friends.pendingCount', { count })}>{count}</span>}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="soc-entry-chev">
        <path d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  )
}
