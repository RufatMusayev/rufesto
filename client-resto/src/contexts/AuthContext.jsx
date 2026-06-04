import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession]   = useState(null)
  const [staffRow, setStaffRow] = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState(null)

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      setSession(session)
      if (session) {
        fetchStaff(session.user.id).finally(() => {
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
        fetchStaff(session.user.id).finally(() => {
          if (mounted) setLoading(false)
        })
      } else {
        setStaffRow(null)
        setLoading(false)
      }
    })

    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  async function fetchStaff(userId) {
    setError(null)
    const { data, error: err } = await supabase
      .from('staff')
      .select('*, restaurants(id, name, slug)')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle()

    if (err) {
      console.warn('Staff fetch failed:', err.message)
      setError('Could not verify staff access')
      setStaffRow(null)
      return
    }
    if (!data) {
      setError('No active staff record found for this account')
      setStaffRow(null)
      return
    }
    setStaffRow(data)
  }

  async function signIn(email, password) {
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    return { error }
  }

  async function signOut() {
    supabase.removeAllChannels()
    await supabase.auth.signOut()
  }

  const isKitchen    = staffRow?.role === 'kitchen'
  const restaurantId = staffRow?.restaurant_id || staffRow?.restaurants?.id

  return (
    <AuthContext.Provider value={{
      session, staffRow, loading, error,
      isKitchen, restaurantId,
      signIn, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
