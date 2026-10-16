// Tiny module-level store (docs/V2-CONTRACT.md 18.5): each Home tab keeps its data here, outside React, so
// switching tabs, leaving Home and coming back, or starting the first request before any component mounts
// never costs a refetch. Components read it with useStore (useSyncExternalStore).
import { useSyncExternalStore } from 'react'

export function createStore(initial) {
  let state = initial
  const subs = new Set()
  const emit = next => {
    if (next === state) return
    state = next
    subs.forEach(fn => fn())
  }
  return {
    get: () => state,
    /** Merge a partial state. */
    set: partial => emit({ ...state, ...partial }),
    /** Replace the state with fn(state). */
    update: fn => emit(fn(state)),
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn) },
  }
}

export const useStore = store => useSyncExternalStore(store.subscribe, store.get, store.get)
