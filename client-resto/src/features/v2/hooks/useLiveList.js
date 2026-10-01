import { useCallback, useEffect, useRef, useState } from 'react'
import { debounce } from '../../../lib/debounce'

/**
 * Fetch + realtime resync for a list screen.
 *   load       () => Promise<{ data, error }>   (api.js function, never throws)
 *   subscribe  (resync) => cleanup              (api.js subscription helper)
 *   key        primitive that restarts everything when it changes (restaurantId)
 * Events trigger a 400ms-debounced reload; stale responses are dropped. A failed
 * background refresh keeps the data already on screen (`error` is set, but
 * pages only show LoadError while `data` is still null).
 * Returns { data, setData, error, loading, retry (shows the skeleton), reload (silent) }.
 */
export default function useLiveList(load, subscribe, key) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const seq = useRef(0)
  const loadRef = useRef(load)
  const subscribeRef = useRef(subscribe)
  loadRef.current = load
  subscribeRef.current = subscribe

  const reload = useCallback(async () => {
    const id = ++seq.current
    const res = await loadRef.current()
    if (id !== seq.current) return
    if (res.error) {
      setError(res.error)
    } else {
      setData(res.data)
      setError(null)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!key) return undefined
    setData(null)
    setError(null)
    setLoading(true)
    reload()
    const debounced = debounce(reload, 400)
    const stop = subscribeRef.current ? subscribeRef.current(debounced) : null
    return () => {
      debounced.cancel()
      if (stop) stop()
      seq.current += 1
    }
  }, [key, reload])

  const retry = useCallback(() => {
    setLoading(true)
    setError(null)
    reload()
  }, [reload])

  return { data, setData, error, loading, retry, reload }
}
