import { useCallback, useEffect, useRef, useState } from 'react'
import { getAvailableSlots } from './api'

const LOADING = { loading: true, error: null, slots: [] }

/**
 * Slots for one restaurant, date and party. Requests get_available_slots once per change (and on retry);
 * a stale answer never overwrites a newer one, and an answer for another date or party is never shown.
 * `enabled` lets the wizard fetch only while the time step shows.
 */
export function useSlots(restaurantId, date, partySize, enabled) {
  const key = `${restaurantId}|${date}|${partySize}`
  const [state, setState] = useState({ key: null, ...LOADING })
  const [attempt, setAttempt] = useState(0)
  const seq = useRef(0)

  useEffect(() => {
    if (!enabled || !restaurantId || !date) return undefined
    const mine = ++seq.current
    setState({ key: null, ...LOADING })
    getAvailableSlots({ restaurantId, date, partySize }).then(({ data, error }) => {
      if (mine !== seq.current) return
      if (error) setState({ key, loading: false, error, slots: [] })
      else setState({ key, loading: false, error: null, slots: data || [] })
    })
    return () => { seq.current += 1 }
  }, [restaurantId, date, partySize, enabled, attempt, key])

  const reload = useCallback(() => setAttempt(a => a + 1), [])
  const current = state.key === key ? state : LOADING
  return [current, reload]
}
