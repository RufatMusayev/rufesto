import { lazy, Suspense, useEffect, useRef } from 'react'
import { Outlet, useLocation, useNavigationType } from 'react-router-dom'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'
import CartFab from './CartFab'
import HomeBar from './HomeBar'
import RouteFallback from './RouteFallback'
import useRail from './useRail'
import ErrorBoundary from '../ErrorBoundary'
import { useCart } from '../../contexts/CartContext'
import NotificationsHost from '../../features/notifications/NotificationsHost'
import { useNotificationBadge } from '../../features/notifications/badge'
import { useSheetGhostSkip } from '../../lib/useSheetHistory'
import { preloadAuthModal } from '../AuthModal'
import './layout.css'

// The cart drawer exists only at a table: its chunk is fetched when a table session starts, and mounted while open.
const loadCartSheet = () => import('../CartSheet')
const CartSheet = lazy(loadCartSheet)

// Bottom-nav / rail destinations swap instantly; every other route is a push and fades in (docs/UX-PLAN-2026-10-18.md 6.4).
const TAB_PATHS = new Set(['/', '/explore', '/map', '/profile', '/notifications', '/table'])

export default function AppLayout() {
  const rail = useRail()
  const { tableId, open: cartOpen } = useCart()
  const { pathname } = useLocation()
  const navType = useNavigationType()
  useSheetGhostSkip()

  useEffect(() => { if (tableId) loadCartSheet() }, [tableId])

  // the sign-in sheet is a chunk of its own: fetched in idle time so that opening it is instant
  useEffect(() => {
    const id = typeof requestIdleCallback === 'function' ? requestIdleCallback(preloadAuthModal, { timeout: 4000 }) : setTimeout(preloadAuthModal, 2500)
    return () => { if (typeof cancelIdleCallback === 'function' && typeof id === 'number') cancelIdleCallback(id) }
  }, [])

  // Single source of truth for the bell badge (rows not yet seen, live over one realtime channel): passed down to the
  // Sidebar and the Home bar so they don't subscribe too. features/notifications/badge.js owns the number and the channel.
  const unreadCount = useNotificationBadge()

  // no entrance animation for the page the guest lands on, only for navigations after it
  const landing = useRef(pathname)
  const motion = pathname === landing.current || TAB_PATHS.has(pathname) ? '' : navType === 'POP' ? ' page-back' : ' page-push'

  const home = pathname === '/'
  return (
    <div className={`app-layout${home ? ' has-topbar' : ''}`}>
      {rail && <Sidebar unreadCount={unreadCount} />}
      <div className="main-content">
        {home && <HomeBar unreadCount={unreadCount} />}
        {/* a page that crashes shows the friendly screen but keeps the nav; leaving it clears the error */}
        <div key={pathname} className={`page${motion}`}>
          <ErrorBoundary resetKey={pathname}>
            <Suspense fallback={<RouteFallback />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </div>
      </div>
      {!rail && <BottomNav />}
      <CartFab />
      <NotificationsHost />
      {cartOpen && <Suspense fallback={null}><CartSheet /></Suspense>}
    </div>
  )
}
