import { lazy, Suspense } from 'react'
import { Route } from 'react-router-dom'
import './i18n'
import './styles.css'
import PageFallback from './components/PageFallback'

const BookGroupPage = lazy(() => import('./pages/BookGroupPage'))
const InvitePage = lazy(() => import('./pages/InvitePage'))
const BookingDetailPage = lazy(() => import('./pages/BookingDetailPage'))

const page = el => <Suspense fallback={<PageFallback />}>{el}</Suspense>

// Drop inside <Route element={<AppLayout />}>. All three are public routes (no auth redirect); each screen
// handles the signed-out case itself (the invite page shows the preview, the others a sign-in card).
export default [
  <Route key="bk-book" path="/book/:slug" element={page(<BookGroupPage />)} />,
  <Route key="bk-invite" path="/b/:code" element={page(<InvitePage />)} />,
  <Route key="bk-detail" path="/bookings/:id" element={page(<BookingDetailPage />)} />,
]
