import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { bakuMinutes } from '../../lib/openState'
import { mapStore } from './store'

/** A slice of the map store; `select` must return a value that is stable while nothing it reads changed. */
export const useMapState = select => useSyncExternalStore(mapStore.subscribe, () => select(mapStore.get()), () => select(mapStore.get()))

const subscribeMedia = query => cb => {
  const mq = window.matchMedia(query)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

/** True while the media query matches. */
export function useMedia(query) {
  return useSyncExternalStore(subscribeMedia(query), () => window.matchMedia(query).matches, () => false)
}

export const useReducedMotion = () => useMedia('(prefers-reduced-motion: reduce)')

/** Minutes since midnight on the Baku clock, refreshed every minute while the page is visible. */
export function useBakuMinute() {
  const [min, setMin] = useState(() => bakuMinutes())
  useEffect(() => {
    const tick = () => setMin(bakuMinutes())
    const id = setInterval(() => { if (document.visibilityState === 'visible') tick() }, 60000)
    const onVis = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [])
  return min
}

/** true `ms` after mount (a state that must not start at once: a history entry that waits for a page change to settle). */
export function useAfterMount(ms) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setOn(true), ms)
    return () => clearTimeout(id)
  }, [ms])
  return on
}

/** { w, h } of an element's box (ResizeObserver), measured before the first paint. */
export function useBoxSize(ref) {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: Math.max(320, window.innerHeight - 64) }))
  const last = useRef(size)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const read = () => {
      const w = Math.round(el.clientWidth)
      const h = Math.round(el.clientHeight)
      if (w && h && (w !== last.current.w || h !== last.current.h)) {
        last.current = { w, h }
        setSize(last.current)
      }
    }
    read()
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(read) : null
    ro?.observe(el)
    window.addEventListener('resize', read)
    return () => { ro?.disconnect(); window.removeEventListener('resize', read) }
  }, [ref])
  return size
}
