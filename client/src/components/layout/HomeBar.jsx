import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useRequireAuth } from '../../features/social/mounts'

/**
 * The top bar of Home, the only page that has one (docs/UX-PLAN-2026-10-18.md 1.1, D10): wordmark on the left, "+"
 * (new post, sign-in first) and the bell with its unseen count on the right. EN | AZ and the theme live in Settings now.
 * The bell is hidden from 1024 px up: the rail carries it.
 */
export default function HomeBar({ unreadCount = 0 }) {
  const { t } = useTranslation(['nav', 'social'])
  const navigate = useNavigate()
  const { requireAuth, authModal } = useRequireAuth()

  return (
    <header className="app-bar">
      <span className="app-bar-logo">Rufesto</span>
      <div className="app-bar-actions">
        <button
          type="button" className="icon-btn" aria-label={t('social:home.newPost')}
          onClick={() => { if (requireAuth()) navigate('/post/new') }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
            <line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
          </svg>
        </button>
        <button
          type="button" className="icon-btn app-bar-bell" aria-label={t('nav:notifications')}
          onClick={() => navigate('/notifications')}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {unreadCount > 0 && <span className="app-bar-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
        </button>
      </div>
      {authModal}
    </header>
  )
}
