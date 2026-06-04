import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider }  from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'

import LoginPage       from './pages/LoginPage'
import ProtectedRoute  from './components/ProtectedRoute'
import DashboardLayout from './components/layout/DashboardLayout'
import DashboardHome   from './pages/DashboardHome'
import OrdersPage      from './pages/OrdersPage'
import KDSPage         from './pages/KDSPage'
import TablesPage      from './pages/TablesPage'
import MenuPage        from './pages/MenuPage'
import BookingsPage    from './pages/BookingsPage'

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<DashboardLayout />}>
                <Route path="/"         element={<DashboardHome />} />
                <Route path="/orders"   element={<OrdersPage />} />
                <Route path="/kds"      element={<KDSPage />} />
                <Route path="/tables"   element={<TablesPage />} />
                <Route path="/menu"     element={<MenuPage />} />
                <Route path="/bookings" element={<BookingsPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
