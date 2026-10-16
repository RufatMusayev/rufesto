// Impression tracker for the Home tabs (docs/V2-CONTRACT.md 17.5 / 18.3): a card counts as seen when at
// least 50 % of it (or half of the viewport, for a card taller than the screen) stays visible for
// 1 s while the tab is in the foreground, once per card per feed load. Everything else (open, like,
// comment, order_tap) is logged straight through logFeedEvent. The returned object is stable.
// The "already counted" set lives per scope ('home' | 'friends' | 'discover') outside the component, so a
// tab that is mounted again (the guest went to a restaurant and came back) does not count its cards twice;
// the scope's store calls resetImpressions when it loads a fresh first page.
import { useEffect, useRef } from 'react'
import { logFeedEvent } from './events'

const DWELL_MS = 1000
const THRESHOLDS = Array.from({ length: 21 }, (_, i) => i / 20)

const viewable = e => e.intersectionRatio >= 0.5
  || (!!e.rootBounds && e.intersectionRect.height >= e.rootBounds.height * 0.5)

const loggedByScope = new Map()             // scope -> Set of "type:id" already counted in this load
const loggedFor = scope => {
  if (!loggedByScope.has(scope)) loggedByScope.set(scope, new Set())
  return loggedByScope.get(scope)
}

/** A new feed load of this scope starts: its cards may be counted again. */
export function resetImpressions(scope) { loggedFor(scope).clear() }

function createTracker(scope) {
  const cards = new Map()                   // element -> { meta, visible, timer }
  const logged = loggedFor(scope)
  let io = null

  function arm(el) {
    const st = cards.get(el)
    if (!st || st.timer || !st.visible || document.visibilityState !== 'visible') return
    st.timer = setTimeout(() => {
      st.timer = null
      if (!st.visible || document.visibilityState !== 'visible') return
      io?.unobserve(el)
      cards.delete(el)
      const { type, id, pool, position, onImpression } = st.meta
      const key = `${type}:${id}`
      if (logged.has(key)) return
      logged.add(key)
      logFeedEvent({ type, id, event: 'impression', pool, position })
      onImpression?.()
    }, DWELL_MS)
  }

  function disarm(st) {
    clearTimeout(st.timer)
    st.timer = null
  }

  function onIntersect(list) {
    for (const e of list) {
      const st = cards.get(e.target)
      if (!st) continue
      st.visible = viewable(e)
      if (st.visible) arm(e.target)
      else disarm(st)
    }
  }

  function onVisibility() {
    for (const [el, st] of cards) {
      if (document.visibilityState === 'visible') arm(el)
      else disarm(st)
    }
  }

  return {
    /** Watch one card. meta: { type 'post'|'promo', id, pool, position, onImpression? }. Returns the cleanup. */
    observe(el, meta) {
      if (!el || typeof IntersectionObserver === 'undefined') return () => {}
      if (!io) {
        io = new IntersectionObserver(onIntersect, { threshold: THRESHOLDS })
        document.addEventListener('visibilitychange', onVisibility)
      }
      cards.set(el, { meta, visible: false, timer: null })
      io.observe(el)
      return () => {
        const st = cards.get(el)
        if (st) disarm(st)
        cards.delete(el)
        io?.unobserve(el)
      }
    },
    destroy() {
      for (const st of cards.values()) disarm(st)
      cards.clear()
      io?.disconnect()
      io = null
      document.removeEventListener('visibilitychange', onVisibility)
    },
  }
}

export function useFeedEvents(scope = 'home') {
  const ref = useRef(null)
  if (!ref.current) ref.current = createTracker(scope)
  useEffect(() => () => ref.current.destroy(), [])
  return ref.current
}
