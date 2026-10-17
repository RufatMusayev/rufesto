import { lazy, Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import CartFab from './CartFab'
import RouteFallback from './RouteFallback'
import ErrorBoundary from '../ErrorBoundary'
import LanguageSwitcher from '../LanguageSwitcher'
import { useTheme } from '../../contexts/ThemeContext'
import { useCart } from '../../contexts/CartContext'
import NotificationsHost from '../../features/notifications/NotificationsHost'
import { useNotificationBadge } from '../../features/notifications/badge'

// The cart drawer exists only at a table: its chunk is fetched when a table session starts, and mounted while open.
const loadCartSheet = () => import('../CartSheet')
const CartSheet = lazy(loadCartSheet)

export default function AppLayout() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768)
  const { theme, toggle } = useTheme()
  const { tableId, open: cartOpen } = useCart()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { t } = useTranslation(['nav', 'common'])

  useEffect(() => { if (tableId) loadCartSheet() }, [tableId])

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth <= 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // Single source of truth for the bell badge (rows not yet seen, live over one realtime channel): passed down to the
  // Sidebar on desktop so it doesn't subscribe too. features/notifications/badge.js owns the number and the channel.
  const unreadCount = useNotificationBadge()

  const headerBg = theme === 'dark'
    ? 'rgba(26,18,16,0.88)'
    : 'rgba(245,240,232,0.92)'

  return (
    <div className="app-layout">
      {!isMobile && <Sidebar unreadCount={unreadCount} />}
      <div className="main-content">
        {isMobile && (
          <header style={{
            position: 'sticky', top: 0, zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 16px',
            height: 'var(--nav-h)',
            background: headerBg,
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderBottom: '1px solid var(--border)',
            transition: 'background-color 200ms ease',
          }}>
            <span style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '1.4rem', fontWeight: 700,
              fontStyle: 'italic', letterSpacing: -0.5,
              background: 'linear-gradient(135deg, var(--t1) 0%, var(--gold) 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>Rufesto</span>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={() => navigate('/notifications')}
                aria-label={t('nav:notifications')}
                className="icon-btn"
                style={{ color: 'var(--t1)', position: 'relative' }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute', top: 6, right: 6,
                    minWidth: 16, height: 16, borderRadius: 100,
                    background: 'var(--accent)', color: '#F5F0E8',
                    fontSize: '0.6rem', fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    padding: '0 4px',
                    border: '2px solid var(--bg)',
                  }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              <LanguageSwitcher className="lang-switcher-bar" />

              <button
                onClick={toggle}
                aria-label={t('nav:toggleTheme')}
                className="icon-btn"
                style={{ color: 'var(--t1)' }}
              >
                {theme === 'dark' ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <circle cx="12" cy="12" r="4" />
                    <line x1="12" y1="2" x2="12" y2="4" /><line x1="12" y1="20" x2="12" y2="22" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="2" y1="12" x2="4" y2="12" /><line x1="20" y1="12" x2="22" y2="12" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
                  </svg>
                )}
              </button>
            </div>
          </header>
        )}
        {/* a page that crashes shows the friendly screen but keeps the nav; leaving it clears the error */}
        <ErrorBoundary resetKey={pathname}>
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </div>
      {isMobile && <BottomNav />}
      <CartFab />
      <NotificationsHost />
      {cartOpen && <Suspense fallback={null}><CartSheet /></Suspense>}
    </div>
  )
}
