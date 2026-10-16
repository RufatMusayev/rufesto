// "Prefetch the next page when the viewer is 3 items from the end" (docs/V2-CONTRACT.md 18.5). The list
// renders a zero-height marker in front of the item that is 3 from the end (attach `ref` to it); when the
// marker scrolls into view, `onNear` loads the next page in the background. Without IntersectionObserver
// `supported` is false and the list keeps a plain "Load more" button.
import { useEffect, useRef, useState } from 'react'

export const nearEndSupported = typeof IntersectionObserver !== 'undefined'

export function useNearEnd(onNear, enabled) {
  const [node, setNode] = useState(null)
  const cb = useRef(onNear)
  cb.current = onNear

  useEffect(() => {
    if (!enabled || !node || !nearEndSupported) return undefined
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) cb.current()
    }, { rootMargin: '0px 0px 120px 0px' })
    io.observe(node)
    return () => io.disconnect()
  }, [node, enabled])

  return setNode
}

/** Index of the item the marker goes in front of (3 from the end, never before the first). */
export const nearEndIndex = length => Math.max(0, length - 3)
