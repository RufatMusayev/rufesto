import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider }   from './contexts/AuthContext'
import { CartProvider }   from './contexts/CartContext'
import { ThemeProvider }  from './contexts/ThemeContext'

import AppLayout          from './components/layout/AppLayout'
import HomePage           from './pages/HomePage'
import RestaurantPage     from './pages/RestaurantPage'
import ExplorePage        from './pages/ExplorePage'
import ProfilePage        from './pages/ProfilePage'
import NotificationsPage  from './pages/NotificationsPage'
import TablePage          from './pages/TablePage'
import DashboardLayout    from './pages/dashboard/DashboardLayout'
import DashboardHome      from './pages/dashboard/DashboardHome'
import KDSPage            from './pages/dashboard/KDSPage'
import MenuTogglePage     from './pages/dashboard/MenuTogglePage'
import BookingsPage       from './pages/dashboard/BookingsPage'

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <CartProvider>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/"                 element={<HomePage />}          />
                <Route path="/restaurant/:slug" element={<RestaurantPage />}    />
                <Route path="/explore"          element={<ExplorePage />}       />
                <Route path="/profile"          element={<ProfilePage />}       />
                <Route path="/notifications"    element={<NotificationsPage />} />
                <Route path="/table"            element={<TablePage />}          />
              </Route>

              <Route path="/dashboard" element={<DashboardLayout />}>
                <Route index              element={<DashboardHome />}  />
                <Route path="kds"         element={<KDSPage />}        />
                <Route path="menu"        element={<MenuTogglePage />} />
                <Route path="bookings"    element={<BookingsPage />}   />
              </Route>
            </Routes>
          </CartProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
