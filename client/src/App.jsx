import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider }   from './contexts/AuthContext'
import { CartProvider }   from './contexts/CartContext'
import { ThemeProvider }  from './contexts/ThemeContext'

import AppLayout          from './components/layout/AppLayout'
import AuthCallback       from './components/AuthCallback'
import PendingClaimRedirect from './components/PendingClaimRedirect'
import HomePage           from './pages/HomePage'
import RestaurantPage     from './pages/RestaurantPage'
import ExplorePage        from './pages/ExplorePage'
import ProfilePage        from './pages/ProfilePage'
import NotificationsPage  from './pages/NotificationsPage'
import MapPage            from './pages/MapPage'
import TablePage          from './pages/TablePage'
import TableClaimPage     from './pages/TableClaimPage'
import NotFoundPage       from './pages/NotFoundPage'
import socialRoutes       from './features/social/routes'
import bookingsRoutes     from './features/bookings/routes'
import billsRoutes        from './features/bills/routes'

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <CartProvider>
            <PendingClaimRedirect />
            <Routes>
              <Route path="/auth/callback" element={<AuthCallback />} />
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
                <Route path="*"                 element={<NotFoundPage />}      />
              </Route>
            </Routes>
          </CartProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
