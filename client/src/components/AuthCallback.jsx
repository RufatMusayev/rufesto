import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

/**
 * AuthCallback — Handles OAuth redirect after Google/Apple sign-in.
 * Supabase appends tokens to the URL hash; this component lets
 * onAuthStateChange pick them up, then redirects to home.
 */
export default function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    // Supabase client auto-detects the hash fragment and exchanges it
    // for a session. We just need to wait for it, then redirect.
    supabase.auth.getSession().then(({ data: { session } }) => {
      // Give onAuthStateChange a moment to fire, then navigate
      setTimeout(() => {
        navigate(session ? '/' : '/profile', { replace: true })
      }, 100)
    }).catch(() => {
      navigate('/profile', { replace: true })
    })
  }, [navigate])

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', color: 'var(--t3)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <span className="spinner" style={{ marginBottom: '1rem', display: 'block' }} />
        <p style={{ fontSize: '0.88rem' }}>Completing sign in...</p>
      </div>
    </div>
  )
}
