import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getMyCounts, getCredits, getOwnPosts, getMyReviews, getSavedDishes, getVisits,
} from './api'

const IDLE = { status: 'idle', data: null }

/**
 * One lazily loaded read. `status` is idle | loading | ready | error. It loads the first time
 * `enabled` is true (switching back to a tab does not refetch), starts over when `loader` changes
 * (another user) and `reload` is what the retry button calls. `setData(fn)` edits the ready data
 * in place (optimistic removals).
 */
function useResource(loader, enabled) {
  const [state, setState] = useState(IDLE)
  const seq = useRef(0)

  const load = useCallback(async () => {
    const mine = ++seq.current
    setState({ status: 'loading', data: null })
    const { data, error } = await loader()
    if (mine !== seq.current) return
    setState(error ? { status: 'error', data: null } : { status: 'ready', data })
  }, [loader])

  useEffect(() => { seq.current += 1; setState(IDLE) }, [loader])
  useEffect(() => { if (enabled && state.status === 'idle') load() }, [enabled, state.status, load])

  const setData = useCallback(
    fn => setState(s => (s.status === 'ready' ? { ...s, data: fn(s.data) } : s)),
    [],
  )
  return { status: state.status, data: state.data, reload: load, setData }
}

/** Everything the Profile screen reads: header numbers right away, each tab when it is first opened. */
export function useProfileData(userId, tab) {
  const on = !!userId
  return {
    counts: useResource(useCallback(() => getMyCounts(userId), [userId]), on),
    credits: useResource(useCallback(() => getCredits(userId), [userId]), on),
    posts: useResource(useCallback(() => getOwnPosts(userId), [userId]), on && tab === 'posts'),
    reviews: useResource(useCallback(() => getMyReviews(userId), [userId]), on && tab === 'reviews'),
    saved: useResource(useCallback(() => getSavedDishes(userId), [userId]), on && tab === 'saved'),
    visits: useResource(useCallback(() => getVisits(userId), [userId]), on && tab === 'visits'),
  }
}
