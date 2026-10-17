// State hooks of the restaurant page shell: the restaurant row, free seats and the Follow button.
// The menu and the posts have their own hooks (useMenu.js, usePosts.js).
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import {
  fetchRestaurant, fetchSeats, subscribeTables, fetchFollowerCount, fetchIsFollowing, setFollowing,
} from './api'

const restaurantCache = new Map()          // slug -> { restaurant, at }: a back-navigation paints the header at once
const TTL_MS = 60 * 1000

/** The active restaurant of `slug`. status: 'loading' | 'ready' | 'missing' | 'error'. */
export function useRestaurant(slug) {
  const [state, setState] = useState(() => {
    const hit = restaurantCache.get(slug)
    return hit ? { status: 'ready', restaurant: hit.restaurant } : { status: 'loading', restaurant: null }
  })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const hit = restaurantCache.get(slug)
    if (hit && attempt === 0 && Date.now() - hit.at < TTL_MS) return undefined
    let alive = true
    fetchRestaurant(slug).then(({ data, error }) => {
      if (!alive) return
      if (error) { setState(s => (s.restaurant ? s : { status: 'error', restaurant: null })); return }
      if (!data) { setState({ status: 'missing', restaurant: null }); return }
      restaurantCache.set(slug, { restaurant: data, at: Date.now() })
      setState({ status: 'ready', restaurant: data })
    })
    return () => { alive = false }
  }, [slug, attempt])

  const retry = useCallback(() => { setState({ status: 'loading', restaurant: null }); setAttempt(a => a + 1) }, [])
  return { ...state, retry }
}

/** { free, total } seats of the restaurant, kept live (tables UPDATE events of this restaurant only). */
export function useSeats(restaurantId) {
  const [seats, setSeats] = useState({ free: 0, total: 0 })
  useEffect(() => {
    if (!restaurantId) return undefined
    let alive = true
    const load = () => fetchSeats(restaurantId).then(({ data }) => { if (alive && data) setSeats(data) })
    load()
    const off = subscribeTables(restaurantId, load)
    return () => { alive = false; off() }
  }, [restaurantId])
  return seats
}

/**
 * Follow button state. A signed-out tap asks for sign-in (`askAuth`) and finishes the follow once the session
 * appears. Optimistic: the count and the flag flip at once and roll back if the write fails.
 */
export function useFollow(restaurantId) {
  const { session } = useAuth()
  const userId = session?.user?.id || null
  const [isFollowing, setIsFollowing] = useState(false)
  const [count, setCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [askAuth, setAskAuth] = useState(false)
  const pending = useRef(false)

  useEffect(() => {
    if (!restaurantId) return undefined
    let alive = true
    fetchFollowerCount(restaurantId).then(({ data }) => { if (alive && data != null) setCount(data) })
    return () => { alive = false }
  }, [restaurantId])

  useEffect(() => {
    if (!restaurantId || !userId) { setIsFollowing(false); return undefined }
    let alive = true
    fetchIsFollowing(userId, restaurantId).then(({ data }) => { if (alive && data != null) setIsFollowing(data) })
    return () => { alive = false }
  }, [restaurantId, userId])

  const apply = useCallback(async next => {
    setBusy(true)
    setIsFollowing(next)
    setCount(c => Math.max(0, c + (next ? 1 : -1)))
    const { error } = await setFollowing(userId, restaurantId, next)
    if (error) {
      setIsFollowing(!next)
      setCount(c => Math.max(0, c + (next ? -1 : 1)))
    }
    setBusy(false)
  }, [userId, restaurantId])

  const toggle = useCallback(() => {
    if (!restaurantId || busy) return
    if (!userId) { pending.current = true; setAskAuth(true); return }
    apply(!isFollowing)
  }, [restaurantId, busy, userId, isFollowing, apply])

  // Signed in from the sign-in modal: finish the follow the guest asked for (unless they already follow).
  useEffect(() => {
    if (!userId || !pending.current || !restaurantId) return
    pending.current = false
    setAskAuth(false)
    fetchIsFollowing(userId, restaurantId).then(({ data }) => {
      if (data) setIsFollowing(true)
      else apply(true)
    })
  }, [userId, restaurantId, apply])

  const cancelAuth = useCallback(() => { pending.current = false; setAskAuth(false) }, [])
  return { isFollowing, count, busy, askAuth, toggle, cancelAuth, closeAuth: () => setAskAuth(false) }
}

// Scroll position to come back to after a post was opened from the grid (a post is its own page, so the
// restaurant page unmounts). Remembered on tap, taken once on the next mount of the same restaurant.
const scrollMemory = new Map()
export const rememberScroll = key => { scrollMemory.set(key, window.scrollY) }
export function takeScroll(key) {
  const y = scrollMemory.get(key)
  scrollMemory.delete(key)
  return y || 0
}
