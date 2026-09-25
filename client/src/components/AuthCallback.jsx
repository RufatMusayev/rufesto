import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'

/**
 * AuthCallback — Handles OAuth redirect after Google/Apple sign-in.
 * Supabase appends tokens to the URL hash; the client's `detectSessionInUrl` picks
 * them up during initialization. `getSession()` awaits that exchange internally, so
 * we can navigate off its result directly — no arbitrary timeout needed.
 */
export default function AuthCallback() {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (cancelled) return
        navigate(session ? '/' : '/profile', { replace: true })
      })
      .catch(() => {
        if (!cancelled) navigate('/profile', { replace: true })
      })
    return () => { cancelled = true }
  }, [navigate])

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', color: 'var(--t3)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <span className="spinner" style={{ marginBottom: '1rem', display: 'block' }} />
        <p style={{ fontSize: '0.88rem' }}>{t('completingSignIn')}</p>
      </div>
    </div>
  )
}
