import { lazy, Suspense } from 'react'
import { Route } from 'react-router-dom'
import RouteFallback from '../../components/layout/RouteFallback'

const PrefsPage = lazy(() => import('./PrefsPage'))

// Drop inside <Route element={<AppLayout />}>. The inbox itself is /notifications (App.jsx); this is its settings screen:
// category switches, quiet hours, "Push notifications on this device". The signed-out card is handled by the page.
export default [
  <Route key="ntf-prefs" path="/settings/notifications" element={<Suspense fallback={<RouteFallback />}><PrefsPage /></Suspense>} />,
]
