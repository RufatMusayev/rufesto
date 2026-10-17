import { useTranslation } from 'react-i18next'
import { Avatar } from '../../../components/ui'
import { cleanDisplayName } from '../../../lib/helpers'
import { useIncomingCount } from '../../social/useFriendsData'
import { GearIcon } from './Icons'

function Stat({ value, label, loading, onClick, badge = 0, badgeLabel }) {
  return (
    <button type="button" className="pf-stat ig-stat row-pressable" onClick={onClick} aria-label={badge > 0 ? badgeLabel : undefined}>
      {loading
        ? <div className="skeleton pf-stat-sk" aria-hidden="true" />
        : (
          <div className="ig-stat-num font-mono pf-stat-num">
            {value ?? '–'}
            {badge > 0 ? <span className="pf-stat-badge" aria-hidden="true">{badge > 9 ? '9+' : badge}</span> : null}
          </div>
        )}
      <div className="ig-stat-label">{label}</div>
    </button>
  )
}

/**
 * The Profile header (docs/UX-PLAN-2026-10-18.md 1.5): the page's own bar (name + settings gear), then the card with the
 * avatar, four tappable counters (Posts, Friends with its request badge, Visits, Credits) and Edit profile.
 */
export default function ProfileHeader({
  userId, name, photo, email, counts, countsLoading, credits, onEdit, onSettings, onCredits, onStat, onFriends,
}) {
  const { t } = useTranslation(['profile', 'social'])
  const incoming = useIncomingCount(userId)
  return (
    <>
      <div className="pf-bar">
        <h1 className="pf-bar-title">{name ? cleanDisplayName(name) : t('profile:yourProfile')}</h1>
        <button type="button" className="icon-btn pf-gear" onClick={onSettings} aria-label={t('profile:settings')}>
          <GearIcon size={22} />
        </button>
      </div>

      <section className="card pf-head" aria-label={t('profile:yourProfile')}>
        <div className="pf-cover" aria-hidden="true" />
        <div className="pf-head-body">
          <div className="pf-avatar">
            <Avatar name={name || email} src={photo} size={72} ring />
          </div>

          <div className="pf-stats">
            <Stat value={counts?.posts} label={t('profile:statPosts')} loading={countsLoading} onClick={() => onStat('posts')} />
            <Stat
              value={counts?.friends} label={t('profile:statFriends')} loading={countsLoading} onClick={onFriends}
              badge={incoming} badgeLabel={t('social:friends.pendingCount', { count: incoming })}
            />
            <Stat value={counts?.visits} label={t('profile:statVisits')} loading={countsLoading} onClick={() => onStat('visits')} />
            <Stat value={credits?.points} label={t('profile:statCredits')} loading={countsLoading} onClick={onCredits} />
          </div>

          <button type="button" className="btn btn-ghost pf-edit" onClick={onEdit}>{t('profile:editProfile')}</button>
        </div>
      </section>
    </>
  )
}
