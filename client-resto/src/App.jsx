import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider }  from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'

import LoginPage       from './pages/LoginPage'
import ProtectedRoute  from './components/ProtectedRoute'
import RoleGate        from './components/RoleGate'
import DashboardLayout from './components/layout/DashboardLayout'
import DashboardHome   from './pages/DashboardHome'
import OrdersPage      from './pages/OrdersPage'
import KDSPage         from './pages/KDSPage'
import TablesPage      from './pages/TablesPage'
import MenuPage        from './pages/MenuPage'
import PromosPage      from './pages/PromosPage'
import BookingsPage    from './pages/BookingsPage'
import WaiterPage      from './pages/WaiterPage'
import v2Routes        from './features/v2/routes'

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<RoleGate />}>
                <Route element={<DashboardLayout />}>
                  <Route path="/"         element={<DashboardHome />} />
                  <Route path="/orders"   element={<OrdersPage />} />
                  <Route path="/kds"      element={<KDSPage />} />
                  <Route path="/tables"   element={<TablesPage />} />
                  <Route path="/menu"     element={<MenuPage />} />
                  <Route path="/promos"   element={<PromosPage />} />
                  <Route path="/bookings" element={<BookingsPage />} />
                  <Route path="/waiter"   element={<WaiterPage />} />
                  {v2Routes /* /bills, /qr-sheet, /settings: role-gated by lib/roles.js */}
                </Route>
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
