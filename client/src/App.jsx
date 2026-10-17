import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider }   from './contexts/AuthContext'
import { CartProvider }   from './contexts/CartContext'
import { ThemeProvider }  from './contexts/ThemeContext'

import AppLayout          from './components/layout/AppLayout'
import ErrorBoundary      from './components/ErrorBoundary'
import RouteFallback      from './components/layout/RouteFallback'
import PendingClaimRedirect from './components/PendingClaimRedirect'
import HomePage           from './pages/HomePage'
import NotFoundPage       from './pages/NotFoundPage'
import socialRoutes       from './features/social/routes'
import bookingsRoutes     from './features/bookings/routes'
import billsRoutes        from './features/bills/routes'
import notificationsRoutes from './features/notifications/routes'

// Home stays in the entry bundle (it is the first screen and its first request starts at module load, see
// features/feed/prefetch.js). Every other screen is its own chunk, fetched when the guest goes there; AppLayout
// shows a spinner meanwhile. The v2 feature routes (social, bookings, bills) were already lazy.
const AuthCallback      = lazy(() => import('./components/AuthCallback'))
const RestaurantPage    = lazy(() => import('./pages/RestaurantPage'))
const ExplorePage       = lazy(() => import('./pages/ExplorePage'))
const ProfilePage       = lazy(() => import('./pages/ProfilePage'))
const NotificationsPage = lazy(() => import('./features/notifications/NotificationsPage'))
const MapPage           = lazy(() => import('./pages/MapPage'))
const TablePage         = lazy(() => import('./pages/TablePage'))
const TableClaimPage    = lazy(() => import('./pages/TableClaimPage'))

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ThemeProvider>
          <AuthProvider>
            <CartProvider>
              <PendingClaimRedirect />
              <Routes>
                <Route path="/auth/callback" element={<Suspense fallback={<RouteFallback />}><AuthCallback /></Suspense>} />
                <Route element={<AppLayout />}>
                  <Route path="/"                 element={<HomePage />}          />
                  <Route path="/restaurant/:slug" element={<RestaurantPage />}    />
                  <Route path="/explore"          element={<ExplorePage />}       />
                  <Route path="/map"              element={<MapPage />}           />
                  <Route path="/profile"          element={<ProfilePage />}       />
                  <Route path="/notifications"    element={<NotificationsPage />} />
                  <Route path="/table"            element={<TablePage />}          />
                  <Route path="/t/:code"          element={<TableClaimPage />}     />
                  {/* v2: all public (each screen handles signed-out itself), inside AppLayout */}
                  {socialRoutes}
                  {bookingsRoutes}
                  {billsRoutes}
                  {notificationsRoutes}
                  <Route path="*"                 element={<NotFoundPage />}      />
                </Route>
              </Routes>
            </CartProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
