// The menu of one restaurant: ONE restaurant_menu call, cached per slug in memory while the app lives, so a tab
// switch (or coming back from a post) never refetches. A cached menu is shown at once and refreshed quietly once
// it is older than TTL_MS. Dish availability / price changes arrive live (dishes UPDATE of this restaurant only).
import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchMenu, subscribeDishes } from './api'
import { patchDish } from './mappers'

const cache = new Map()                    // slug -> { menu, at }
const TTL_MS = 60 * 1000

/**
 * status: 'loading' | 'ready' | 'error'; menu is the view-model of mappers.js (null until ready). On 'error',
 * `error.code` is 'restaurant_not_found' when restaurant_menu says the slug is unknown or inactive.
 */
export function useMenu(slug, restaurantId) {
  const [state, setState] = useState(() => {
    const hit = cache.get(slug)
    return hit ? { status: 'ready', menu: hit.menu } : { status: 'loading', menu: null }
  })
  const [attempt, setAttempt] = useState(0)
  const latest = useRef(state.menu)
  latest.current = state.menu

  useEffect(() => {
    if (!restaurantId) return undefined
    const hit = cache.get(slug)
    if (hit && attempt === 0 && Date.now() - hit.at < TTL_MS) return undefined
    let alive = true
    fetchMenu(slug, restaurantId).then(({ data, error }) => {
      if (!alive) return
      if (error) { setState(s => (s.menu ? s : { status: 'error', menu: null, error })); return }
      cache.set(slug, { menu: data, at: Date.now() })
      setState({ status: 'ready', menu: data })
    })
    return () => { alive = false }
  }, [slug, restaurantId, attempt])

  useEffect(() => {
    if (!restaurantId) return undefined
    return subscribeDishes(restaurantId, (id, patch) => {
      const prev = latest.current
      if (!prev) return
      const menu = patchDish(prev, id, patch)
      if (menu === prev) return
      cache.set(slug, { menu, at: cache.get(slug)?.at ?? Date.now() })
      setState({ status: 'ready', menu })
    })
  }, [slug, restaurantId])

  const retry = useCallback(() => { setState({ status: 'loading', menu: null }); setAttempt(a => a + 1) }, [])
  return { ...state, retry }
}
