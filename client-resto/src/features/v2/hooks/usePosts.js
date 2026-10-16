import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchRestaurantPosts } from '../postsApi'

/**
 * The restaurant's own posts, newest first, loaded a page at a time (keyset cursor).
 *   items      null until the first page arrives, then PostItem[]
 *   error      the first-page failure (the page shows it only while `items` is still null)
 *   loadMore   appends the next page; moreBusy / moreError describe that call
 *   reload     silent first-page refresh (after a publish): keeps what is on screen until the answer arrives
 *   retry      first load again, with the skeleton
 *   remove     drops one post from the list (after a delete)
 * A response that arrives after the restaurant changed or a reload started is dropped.
 */
export default function usePosts(restaurantId) {
  const [items, setItems] = useState(null)
  const [nextCursor, setNextCursor] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [moreBusy, setMoreBusy] = useState(false)
  const [moreError, setMoreError] = useState(null)
  const seq = useRef(0)
  const cursorRef = useRef(null)
  cursorRef.current = nextCursor

  const reload = useCallback(async () => {
    if (!restaurantId) return
    const id = ++seq.current
    const res = await fetchRestaurantPosts(restaurantId, null)
    if (id !== seq.current) return
    setMoreBusy(false)
    setMoreError(null)
    setLoading(false)
    if (res.error) {
      setError(res.error)
      return
    }
    setError(null)
    setItems(res.data.items)
    setNextCursor(res.data.nextCursor)
  }, [restaurantId])

  useEffect(() => {
    setItems(null)
    setNextCursor(null)
    setError(null)
    setMoreBusy(false)
    setMoreError(null)
    setLoading(true)
    reload()
    return () => { seq.current += 1 }
  }, [reload])

  const retry = useCallback(() => {
    setLoading(true)
    setError(null)
    reload()
  }, [reload])

  const loadMore = useCallback(async () => {
    const cursor = cursorRef.current
    if (!restaurantId || !cursor || moreBusy) return
    const id = seq.current
    setMoreBusy(true)
    setMoreError(null)
    const res = await fetchRestaurantPosts(restaurantId, cursor)
    if (id !== seq.current) return
    setMoreBusy(false)
    if (res.error) {
      setMoreError(res.error)
      return
    }
    setItems(prev => {
      const seen = new Set((prev || []).map(p => p.id))
      return [...(prev || []), ...res.data.items.filter(p => !seen.has(p.id))]
    })
    setNextCursor(res.data.nextCursor)
  }, [restaurantId, moreBusy])

  const remove = useCallback(id => {
    setItems(prev => (prev ? prev.filter(p => p.id !== id) : prev))
  }, [])

  return { items, nextCursor, error, loading, moreBusy, moreError, loadMore, reload, retry, remove }
}
