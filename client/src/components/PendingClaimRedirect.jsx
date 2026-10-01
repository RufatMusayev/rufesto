import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { readPendingClaim } from '../lib/pendingClaim'

// Sends a guest back to their /t/:code claim once they are signed in. Needed because
// Google/Apple sign-in and emailed magic links reload the app on "/" (or the OAuth
// callback), so the page that started the claim is gone by the time the session exists.
export default function PendingClaimRedirect() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const userId = session?.user?.id

  useEffect(() => {
    if (loading || !userId) return
    if (pathname.startsWith('/t/') || pathname.startsWith('/auth/')) return
    const code = readPendingClaim()
    if (code) navigate(`/t/${encodeURIComponent(code)}`, { replace: true })
  }, [loading, userId, pathname, navigate])

  return null
}
