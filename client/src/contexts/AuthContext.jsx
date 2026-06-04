import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

const VALID_OAUTH_PROVIDERS = ['google', 'apple']

export function AuthProvider({ children }) {
  const [session, setSession]   = useState(null)
  const [profile, setProfile]   = useState(null)
  const [loading, setLoading]   = useState(true)
  const [authError, setAuthError] = useState(null)

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      setSession(session)
      if (session) {
        fetchProfile(session.user.id).finally(() => {
          if (mounted) setLoading(false)
        })
      } else {
        setLoading(false)
      }
    }).catch(() => {
      if (mounted) setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!mounted) return
      setSession(session)
      if (session) {
        fetchProfile(session.user.id).finally(() => {
          if (mounted) setLoading(false)
        })
      } else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  async function fetchProfile(userId) {
    setAuthError(null)
    try {
      const { data, error } = await supabase
        .from('users').select('*').eq('id', userId).maybeSingle()

      if (error) {
        console.warn('Could not fetch user profile:', error.message)
        setProfile(null)
      } else {
        setProfile(data)
      }
    } catch (err) {
      console.warn('Profile fetch failed:', err.message)
      setAuthError('Could not load profile data')
      setProfile(null)
    }
  }

  /** Send a magic-link / OTP code to the user's email */
  async function sendOtp(email) {
    return supabase.auth.signInWithOtp({ email })
  }

  /** Verify the 6-digit OTP code the user received via email */
  async function verifyOtp(email, token) {
    return supabase.auth.verifyOtp({ email, token, type: 'email' })
  }

  /** Dev-only email + password sign-in (testing without live OTP email). Gated in UI by import.meta.env.DEV. */
  async function signInWithPassword(email, password) {
    return supabase.auth.signInWithPassword({ email, password })
  }

  /** OAuth sign-in (Google or Apple) — redirects to provider */
  async function signInWithOAuth(provider) {
    if (!VALID_OAUTH_PROVIDERS.includes(provider)) {
      return { error: { message: `Unsupported OAuth provider: ${provider}. Use 'google' or 'apple'.` } }
    }
    return supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  /** Update user metadata (name, phone, age) after first sign-in */
  async function updateUserMeta(meta) {
    return supabase.auth.updateUser({ data: meta })
  }

  async function signOut() {
    // Clean up sessionStorage (cart, table session data)
    sessionStorage.removeItem('rufesto_table_session')
    sessionStorage.removeItem('rufesto_cart')

    // Remove all realtime subscriptions
    supabase.removeAllChannels()

    await supabase.auth.signOut()
  }

  async function updateProfile(updates) {
    if (!session) return
    const { error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', session.user.id)
    if (!error) setProfile(p => ({ ...p, ...updates }))
    return { error }
  }

  return (
    <AuthContext.Provider value={{
      session, profile, loading, authError,
      sendOtp, verifyOtp, signInWithOAuth, signInWithPassword, updateUserMeta,
      signOut, updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
