import { useTranslation } from 'react-i18next'
import { Avatar } from '../../../components/ui'
import { cleanDisplayName } from '../../../lib/helpers'
import { FriendsEntry } from '../../social/mounts'
import { GearIcon, ChevronIcon } from './Icons'

function Stat({ value, label, loading, onClick }) {
  return (
    <button type="button" className="pf-stat ig-stat" onClick={onClick}>
      {loading
        ? <div className="skeleton pf-stat-sk" aria-hidden="true" />
        : <div className="ig-stat-num font-mono pf-stat-num">{value ?? '–'}</div>}
      <div className="ig-stat-label">{label}</div>
    </button>
  )
}

/** Avatar + name + Resto-Credits pill, the three counters and the Edit / Friends / Settings row. */
export default function ProfileHeader({
  name, email, photo, counts, countsLoading, credits, onEdit, onSettings, onCredits, onStat, onFriends,
}) {
  const { t } = useTranslation('profile')
  return (
    <section className="card pf-head" aria-label={t('yourProfile')}>
      <div className="pf-cover" aria-hidden="true" />
      <div className="pf-head-body">
        <div className="pf-avatar">
          <Avatar name={name || email} src={photo} size={72} ring />
        </div>
        <h1 className="pf-name">{name ? cleanDisplayName(name) : t('yourProfile')}</h1>

        {credits ? (
          <button
            type="button" className="pf-credits"
            onClick={onCredits} aria-label={t('creditsOpen', { count: credits.points })}
          >
            <span aria-hidden="true">★</span>
            <span className="font-mono">{t('creditsBadge', { count: credits.points })}</span>
            <ChevronIcon size={12} />
          </button>
        ) : null}

        <div className="pf-stats">
          <Stat value={counts?.posts} label={t('statPosts')} loading={countsLoading} onClick={() => onStat('posts')} />
          <Stat value={counts?.friends} label={t('statFriends')} loading={countsLoading} onClick={onFriends} />
          <Stat value={counts?.visits} label={t('statVisits')} loading={countsLoading} onClick={() => onStat('visits')} />
        </div>

        <div className="pf-actions">
          <button type="button" className="btn btn-ghost pf-action" onClick={onEdit}>
            {t('editProfile')}
          </button>
          <div className="pf-friends-slot"><FriendsEntry /></div>
          <button type="button" className="btn btn-ghost pf-gear" onClick={onSettings} aria-label={t('settings')}>
            <GearIcon size={20} />
          </button>
        </div>
      </div>
    </section>
  )
}
