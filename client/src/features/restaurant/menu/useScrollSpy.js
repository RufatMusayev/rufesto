// Scroll-spy for the section navigator: the active section is the last one whose top has passed the sticky stack
// (the offset is the CSS scroll-margin-top of the sections, so JS and CSS agree). A tap on a chip scrolls to the
// section and freezes the spy for a moment so the chip does not flicker through the sections it passes.
import { useCallback, useEffect, useRef, useState } from 'react'

export const sectionDomId = key => `mn-sec-${key}`
const LOCK_MS = 750

export function useScrollSpy(keys, enabled) {
  const [active, setActive] = useState(keys[0] || null)
  const lockUntil = useRef(0)
  const signature = keys.join('|')

  useEffect(() => {
    if (!enabled || !keys.length) return undefined
    let raf = 0
    const run = () => {
      raf = 0
      if (Date.now() < lockUntil.current) return
      let current = keys[0]
      let offset = null
      for (const k of keys) {
        const el = document.getElementById(sectionDomId(k))
        if (!el) continue
        if (offset === null) offset = parseFloat(getComputedStyle(el).scrollMarginTop) || 0
        if (el.getBoundingClientRect().top - offset <= 2) current = k
        else break
      }
      setActive(current)
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(run) }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    run()
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, enabled])

  // the active key can disappear (a search removed its section): fall back to the first one that is left
  useEffect(() => {
    if (!keys.includes(active)) setActive(keys[0] || null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])

  const jump = useCallback(key => {
    const el = document.getElementById(sectionDomId(key))
    if (!el) return
    lockUntil.current = Date.now() + LOCK_MS
    setActive(key)
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  return { active, jump }
}
