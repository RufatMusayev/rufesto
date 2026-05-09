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

  async function signUp(email, password, name, phone, age) {
    return supabase.auth.signUp({
      email, password,
      options: { data: { name, phone: phone || null, age: age ? Number(age) : null } },
    })
  }

  async function signIn(email, password) {
    return supabase.auth.signInWithPassword({ email, password })
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
      signUp, signIn, signOut, updateProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
