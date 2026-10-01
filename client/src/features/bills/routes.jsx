import { lazy, Suspense } from 'react'
import { Route } from 'react-router-dom'
import './i18n'
import './styles.css'
import PageFallback from './components/PageFallback'

const BillPage = lazy(() => import('./pages/BillPage'))
const ReceiptPage = lazy(() => import('./pages/ReceiptPage'))

const page = el => <Suspense fallback={<PageFallback />}>{el}</Suspense>

// Drop inside <Route element={<AppLayout />}>. Every screen handles the signed-out case itself (a sign-in
// card), so the routes themselves are public. /pay/:billId is the deep link (shared pay-for-the-table link,
// notification) and renders the same page as /bill/:billId.
export default [
  <Route key="bl-bill" path="/bill" element={page(<BillPage />)} />,
  <Route key="bl-bill-id" path="/bill/:billId" element={page(<BillPage />)} />,
  <Route key="bl-pay" path="/pay/:billId" element={page(<BillPage />)} />,
  <Route key="bl-receipt" path="/receipt/:billId" element={page(<ReceiptPage />)} />,
]
