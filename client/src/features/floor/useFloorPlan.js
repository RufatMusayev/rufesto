import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchFloorPlan, subscribeFloor } from './api'

const POLL_MS = 20000      // seat changes at an already busy table do not touch the `tables` row: poll as well
const DEBOUNCE_MS = 250    // a burst of table updates is one refetch

/**
 * The live floor plan of one restaurant: loads floor_plan(), refetches whenever a `tables` row of that
 * restaurant changes (realtime), every 20 s while the page is visible, and when the tab becomes visible again.
 * Returns { plan, loading, error, live, reload }. A refetch keeps the old plan on screen (no flicker).
 */
export default function useFloorPlan(restaurantId) {
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [live, setLive] = useState(false)
  const busy = useRef(false)
  const queued = useRef(false)
  const alive = useRef(true)

  const load = useCallback(async () => {
    if (busy.current) { queued.current = true; return }
    busy.current = true
    const { data, error: err } = await fetchFloorPlan(restaurantId)
    busy.current = false
    if (!alive.current) return
    if (data) { setPlan(data); setError(null) } else setError(err || new Error('floor_plan_failed'))
    setLoading(false)
    if (queued.current) { queued.current = false; load() }
  }, [restaurantId])

  useEffect(() => {
    alive.current = true
    setLoading(true)
    setPlan(null)
    setError(null)
    load()

    let timer = null
    const soon = () => {
      clearTimeout(timer)
      timer = setTimeout(load, DEBOUNCE_MS)
    }
    const unsubscribe = subscribeFloor(restaurantId, soon, setLive)
    const poll = setInterval(() => { if (!document.hidden) load() }, POLL_MS)
    const onVisible = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      alive.current = false
      clearTimeout(timer)
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
      unsubscribe()
    }
  }, [restaurantId, load])

  const reload = useCallback(() => { setLoading(true); setError(null); load() }, [load])
  return { plan, loading, error, live, reload }
}
