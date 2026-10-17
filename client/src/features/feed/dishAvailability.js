// Live "Available now" / "Sold out" of the dishes on the cards that are on screen (persona-leyla #7 and #8).
// A card shows the availability that came with the page, until this module learns something newer: every 60 s while
// the browser tab is visible, and when the window gets focus again, one REST read
// (dishes?id=in.(...)&select=id,available) covers the dishes of the cards in or near the viewport, wherever they are
// (Home, Friends or Discover: a card marks itself with data-dish-id). Failures are ignored; the next tick tries again.
import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from '../../lib/supabase'
import { createStore } from './store'

const POLL_MS = 60000
const MAX_IDS = 60                          // keeps the request URL short (60 uuids = 2.3 kB)
const store = createStore({ byId: {} })     // dish id -> available (boolean), only what was read here

/** The availability of a dish: the freshest answer read here, else `fallback` (what the card was built with). */
export function useDishAvailable(id, fallback) {
  const live = useSyncExternalStore(
    store.subscribe,
    () => (id ? store.get().byId[id] : undefined),
    () => undefined,
  )
  return live === undefined ? fallback : live
}

/** Dish ids of the cards in or near the viewport (one screen above and below). */
function visibleDishIds() {
  const vh = window.innerHeight || 800
  const ids = new Set()
  for (const el of document.querySelectorAll('[data-dish-id]')) {
    const r = el.getBoundingClientRect()
    if (r.height > 0 && r.bottom > -vh && r.top < vh * 2) ids.add(el.getAttribute('data-dish-id'))
    if (ids.size >= MAX_IDS) break
  }
  return [...ids]
}

let inflight = false

/** Reads the availability of the visible cards' dishes now. Resolves when done; never throws. */
export async function refreshDishAvailability() {
  if (inflight || document.visibilityState !== 'visible') return
  const ids = visibleDishIds()
  if (!ids.length) return
  inflight = true
  try {
    const { data, error } = await supabase.from('dishes').select('id, available').in('id', ids)
    if (error || !Array.isArray(data)) return
    store.update(s => {
      let changed = false
      const byId = { ...s.byId }
      for (const row of data) {
        const on = !!row.available
        if (byId[row.id] !== on) { byId[row.id] = on; changed = true }
      }
      return changed ? { ...s, byId } : s
    })
  } catch { /* offline or blocked: the next tick tries again */ } finally {
    inflight = false
  }
}

/** Mount once on Home: ticks every 60 s while the page is visible and again when the window gets focus. */
export function useDishAvailabilityPoll() {
  useEffect(() => {
    const id = setInterval(refreshDishAvailability, POLL_MS)
    const onFocus = () => refreshDishAvailability()
    const onVisible = () => { if (document.visibilityState === 'visible') refreshDishAvailability() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(id)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
}
