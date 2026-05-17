import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession]   = useState(null)
  const [profile, setProfile]   = useState(null)
  const [staffRow, setStaffRow] = useState(null)
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else { setProfile(null); setStaffRow(null); setLoading(false) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const [{ data: user }, { data: staff }] = await Promise.all([
      supabase.from('users').select('*').eq('id', userId).maybeSingle(),
      supabase.from('staff').select('*, restaurants(id,name,slug)').eq('user_id', userId).eq('is_active', true).maybeSingle(),
    ])
    setProfile(user)
    setStaffRow(staff)
    setLoading(false)
  }

  /** Send a magic-link / OTP code to the user's email */
  async function sendOtp(email) {
    return supabase.auth.signInWithOtp({ email })
  }

  /** Verify the 6-digit OTP code the user received via email */
  async function verifyOtp(email, token) {
    return supabase.auth.verifyOtp({ email, token, type: 'email' })
  }

  /** OAuth sign-in (Google or Apple) — redirects to provider */
  async function signInWithOAuth(provider) {
    return supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    })
  }

  /** Update user metadata (name, phone, age) after first sign-in */
  async function updateUserMeta(meta) {
    return supabase.auth.updateUser({ data: meta })
  }

  async function signOut() {
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

  const isStaff = !!staffRow
  const isKitchen = staffRow?.role === 'kitchen'
  const restaurantId = staffRow?.restaurant_id || staffRow?.restaurants?.id

  return (
    <AuthContext.Provider value={{
      session, profile, staffRow, loading,
      isStaff, isKitchen, restaurantId,
      sendOtp, verifyOtp, signInWithOAuth, updateUserMeta,
      signOut, updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
