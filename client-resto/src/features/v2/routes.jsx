import { lazy, Suspense } from 'react'
import { Route } from 'react-router-dom'
import './styles.css'

const BillsPage = lazy(() => import('./pages/BillsPage'))
const QrSheetPage = lazy(() => import('./pages/QrSheetPage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

function Loading() {
  return (
    <div className="v2-page" aria-hidden="true">
      <div className="skeleton v2-skel-card" />
    </div>
  )
}

const page = el => <Suspense fallback={<Loading />}>{el}</Suspense>

// Dropped by the integrator inside <Route element={<DashboardLayout />}>.
// /settings keeps its tab in ?tab=hours|rules|staff (lib/roles.js matches exact paths).
export default [
  <Route key="v2-bills" path="/bills" element={page(<BillsPage />)} />,
  <Route key="v2-qr-sheet" path="/qr-sheet" element={page(<QrSheetPage />)} />,
  <Route key="v2-settings" path="/settings" element={page(<SettingsPage />)} />,
]
