// "New posts" pill (docs/V2-CONTRACT.md 17.5): polls a count RPC every 60 s while the tab is in the foreground and its
// Home tab is the shown one. No realtime. Home polls home_feed_new_count, Friends polls friends_new_count: the caller
// passes `load` ({ data: number, error }), a closure that reads the ISO time the current feed load started.
// An RPC that is not deployed on this database (error code 'unavailable', PGRST202) is not asked again this session
// and its pill stays hidden.
import { useCallback, useEffect, useRef, useState } from 'react'

const POLL_MS = 60000
const unavailable = new Set()               // kinds whose RPC answered "not found"

export function useNewPostCount({ kind, active, ready, load }) {
  const [count, setCount] = useState(0)
  const reset = useCallback(() => setCount(0), [])
  const loadRef = useRef(load)
  loadRef.current = load

  useEffect(() => {
    if (!active || !ready || unavailable.has(kind)) return undefined
    let alive = true
    const tick = async () => {
      if (unavailable.has(kind) || document.visibilityState !== 'visible') return
      const { data, error } = await loadRef.current()
      if (!alive) return
      if (error?.code === 'unavailable') { unavailable.add(kind); setCount(0); return }
      if (typeof data === 'number') setCount(data)
    }
    const id = setInterval(tick, POLL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [kind, active, ready])

  return [count, reset]
}
