import { lazy, Suspense } from 'react'

// The sign-in sheet (email code, Google / Apple, new-user profile step) lives in AuthModalSheet.jsx and is its own chunk:
// ~16 kB of form code that most visits never open. This wrapper keeps the import path and props every caller already uses
// (`<AuthModal onClose onSuccess />`), and AppLayout asks for the chunk when the browser is idle, so the sheet opens at once.
const loadSheet = () => import('./AuthModalSheet')
const Sheet = lazy(loadSheet)

/** Start fetching the sign-in sheet's code (idempotent). */
export const preloadAuthModal = loadSheet

export default function AuthModal(props) {
  return (
    <Suspense fallback={null}>
      <Sheet {...props} />
    </Suspense>
  )
}
