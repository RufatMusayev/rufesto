// Paged posts of one restaurant for one scope ('venue' = its own posts, 'guests' = guests' public posts tagged to it).
// Keyset paging on created_at (next_cursor of the RPC). Pages are cached per restaurant + scope in memory, so a tab
// switch or coming back from a post detail shows the grid at once without a request.
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchRestaurantPosts } from './api'

const cache = new Map()                    // `${restaurantId}:${scope}` -> { items, cursor, done, at }
const TTL_MS = 90 * 1000

const empty = { items: [], cursor: null, done: false, status: 'loading', more: false, moreError: false }
const isUnavailable = err => err?.key === 'social:errors.unavailable'

function initial(key) {
  const hit = cache.get(key)
  return hit && Date.now() - hit.at < TTL_MS ? { ...empty, ...hit, status: 'ready' } : empty
}

/** status: 'loading' | 'ready' | 'error'. A RPC that is not deployed yet is an empty 'ready' list. */
export function usePosts(restaurantId, scope) {
  const key = `${restaurantId}:${scope}`
  const [state, setState] = useState(() => initial(key))
  const [attempt, setAttempt] = useState(0)
  const live = useRef({ key, state })
  live.current = { key, state }

  useEffect(() => {
    if (!restaurantId) return undefined
    const hit = initial(key)
    if (hit.status === 'ready' && attempt === 0) { setState(hit); return undefined }
    let alive = true
    setState(empty)
    fetchRestaurantPosts({ restaurantId, scope }).then(({ data, error }) => {
      if (!alive) return
      if (error && !isUnavailable(error)) { setState({ ...empty, status: 'error' }); return }
      const items = data?.items || []
      const next = { items, cursor: data?.nextCursor || null, done: !data?.nextCursor }
      cache.set(key, { ...next, at: Date.now() })
      setState({ ...empty, ...next, status: 'ready' })
    })
    return () => { alive = false }
  }, [key, restaurantId, scope, attempt])

  const loadMore = useCallback(async () => {
    const s = live.current.state
    if (s.status !== 'ready' || s.done || s.more || !s.cursor) return
    const at = live.current.key
    setState(x => ({ ...x, more: true, moreError: false }))
    const { data, error } = await fetchRestaurantPosts({ restaurantId, scope, cursor: s.cursor })
    if (live.current.key !== at) return                       // the chip changed while this page was loading
    if (error) { setState(x => ({ ...x, more: false, moreError: !isUnavailable(error), done: isUnavailable(error) })); return }
    setState(x => {
      const seen = new Set(x.items.map(i => i.id))
      const items = x.items.concat((data?.items || []).filter(i => !seen.has(i.id)))
      const next = { items, cursor: data?.nextCursor || null, done: !data?.nextCursor }
      cache.set(at, { ...next, at: Date.now() })
      return { ...x, ...next, more: false, moreError: false }
    })
  }, [restaurantId, scope])

  const retry = useCallback(() => setAttempt(a => a + 1), [])
  return { ...state, loadMore, retry }
}
