// "New posts" pill (docs/V2-CONTRACT.md 17.5): polls home_feed_new_count every 60 s while the tab is
// in the foreground and Home is the shown tab. No realtime. `since` is a stable getter, read on every
// poll, that returns the ISO time the current feed load started.
import { useCallback, useEffect, useState } from 'react'
import { getHomeFeedNewCount } from './api'

const POLL_MS = 60000

export function useNewPostCount({ active, ready, since, lat, lng }) {
  const [count, setCount] = useState(0)
  const reset = useCallback(() => setCount(0), [])

  useEffect(() => {
    if (!active || !ready) return undefined
    let alive = true
    let stop = false
    const tick = async () => {
      if (stop || document.visibilityState !== 'visible') return
      const { data, error } = await getHomeFeedNewCount({ since: since(), lat, lng })
      if (!alive) return
      if (error?.code === 'unavailable') { stop = true; return }   // not deployed on this database yet
      if (typeof data === 'number') setCount(data)
    }
    const id = setInterval(tick, POLL_MS)
    return () => { alive = false; clearInterval(id) }
  }, [active, ready, since, lat, lng])

  return [count, reset]
}
