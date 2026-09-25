import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

const ACTIVE_STAFF_KEY = 'rufesto_resto_staff_id'

export function AuthProvider({ children }) {
  const [session, setSession]         = useState(null)
  const [staffRows, setStaffRows]     = useState([])
  const [activeStaffId, setActiveStaffIdState] = useState(null)
  const [loading, setLoading]         = useState(true)      // initial session bootstrap
  const [staffLoading, setStaffLoading] = useState(true)    // staff row(s) fetch in flight
  const [error, setError]             = useState(null)

  // Tracks which user id we last fetched staff for, so TOKEN_REFRESHED (and
  // the duplicate INITIAL_SESSION event) don't trigger a redundant re-fetch.
  const lastUserIdRef = useRef(null)

  useEffect(() => {
    let mounted = true

    function handleSessionResult(session) {
      if (!mounted) return
      setSession(session)
      if (session) {
        const uid = session.user.id
        if (uid !== lastUserIdRef.current) {
          lastUserIdRef.current = uid
          setStaffLoading(true)
          fetchStaff(uid).finally(() => { if (mounted) setStaffLoading(false) })
        }
      } else {
        lastUserIdRef.current = null
        setStaffRows([])
        setActiveStaffIdState(null)
        setStaffLoading(false)
      }
      setLoading(false)
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSessionResult(session)
    }).catch(() => {
      if (mounted) { setLoading(false); setStaffLoading(false) }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      handleSessionResult(session)
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
      .order('joined_at', { ascending: true })

    if (err) {
      console.warn('Staff fetch failed:', err.message)
      setError('Could not verify staff access')
      setStaffRows([])
      setActiveStaffIdState(null)
      return
    }
    if (!data || data.length === 0) {
      setError('No active staff record found for this account')
      setStaffRows([])
      setActiveStaffIdState(null)
      return
    }

    setStaffRows(data)

    let chosen = data[0]
    try {
      const savedId = localStorage.getItem(ACTIVE_STAFF_KEY)
      if (savedId) {
        const match = data.find(s => s.id === savedId)
        if (match) chosen = match
      }
    } catch {
      // localStorage unavailable (private mode, etc.) — fall back to first row
    }
    setActiveStaffIdState(chosen.id)
  }

  function setActiveStaffId(id) {
    setActiveStaffIdState(id)
    try {
      localStorage.setItem(ACTIVE_STAFF_KEY, id)
    } catch {
      // ignore — selection just won't persist across reloads
    }
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

  const staffRow = staffRows.find(s => s.id === activeStaffId) || staffRows[0] || null
  const isKitchen = staffRow?.role === 'kitchen'
  const restaurantId = staffRow?.restaurant_id || staffRow?.restaurants?.id
  const hasMultipleRestaurants = staffRows.length > 1

  return (
    <AuthContext.Provider value={{
      session, staffRow, staffRows, loading, staffLoading, error,
      isKitchen, restaurantId, hasMultipleRestaurants,
      signIn, signOut, setActiveStaffId,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
