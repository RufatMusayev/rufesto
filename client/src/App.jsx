import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider }   from './contexts/AuthContext'
import { CartProvider }   from './contexts/CartContext'
import { ThemeProvider }  from './contexts/ThemeContext'

import AppLayout          from './components/layout/AppLayout'
import AuthCallback       from './components/AuthCallback'
import HomePage           from './pages/HomePage'
import RestaurantPage     from './pages/RestaurantPage'
import ExplorePage        from './pages/ExplorePage'
import ProfilePage        from './pages/ProfilePage'
import NotificationsPage  from './pages/NotificationsPage'
import MapPage            from './pages/MapPage'
import TablePage          from './pages/TablePage'

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <CartProvider>
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
              </Route>
            </Routes>
          </CartProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
