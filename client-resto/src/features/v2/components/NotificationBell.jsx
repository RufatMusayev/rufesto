import { useTranslation } from 'react-i18next'
import { useNotifications } from '../notifContext'
import { BellIcon } from '../notifIcons'

// The bell of the dashboard: in the sidebar head (tablet / desktop) and in the phone header. Both are rendered, CSS
// shows one. Not rendered at all until notifications_badge() answers (sql/64 not applied: no bell, no error).
export default function NotificationBell({ variant = 'side' }) {
  const { t } = useTranslation('v2')
  const { available, badge, open, openPanel } = useNotifications() || {}
  if (!available) return null
  const label = badge > 0 ? t('notifBellUnseen', { num: badge }) : t('notifBell')
  return (
    <button
      type="button"
      className={`notif-bell notif-bell--${variant}${badge > 0 ? ' has-unseen' : ''}`}
      aria-haspopup="dialog"
      aria-expanded={!!open}
      aria-label={label}
      onClick={openPanel}
    >
      <BellIcon />
      {badge > 0 && <span className="notif-badge" aria-hidden="true">{badge > 99 ? '99+' : badge}</span>}
    </button>
  )
}
