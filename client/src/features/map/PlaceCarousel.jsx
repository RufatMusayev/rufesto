import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import PlaceCard from './PlaceCard'
import { tap as haptic } from '../../lib/haptics'
import { SLOP, FLICK, clamp, pushSample, velocity } from '../../components/ui/dragMath'

// The card carousel of a selected place (docs/MAP-PLAN-2026-10-18.md 3, 4): native scroll-snap sideways, the centred card
// is the selection, a swipe down closes it. Everything per frame is imperative (no React state while dragging).
const EXIT_EASE = 'cubic-bezier(0.2, 0.8, 0.4, 1)'
const DISMISS_RATIO = 0.3
// scrollend settles the selection; the debounce on scroll is the fallback for a browser without it (120 ms) and the safety net
// for one that is slow to send it (350 ms: longer than a finger resting mid-swipe)
const SCROLL_FALLBACK_MS = 120
const SCROLL_SAFETY_MS = 350
const HAS_SCROLLEND = typeof window !== 'undefined' && 'onscrollend' in window

/**
 * Keeps the carousel mounted through its exit: { mounted, shown } (shown flips a frame after mount, so the entry can transition).
 * `instant`: no entry motion (a card that is there because of the address: a deep link, or Back from a restaurant): the card
 * is mounted and shown in the same commit, so its first painted frame is the finished card.
 */
function useMountTransition(open, instant, ms = 340) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(open) // a screen that opens with a card (deep link, return) shows it on the first frame
  useLayoutEffect(() => {
    if (open && instant) { setMounted(true); setShown(true) }
  }, [open, instant])
  useEffect(() => {
    if (open) {
      setMounted(true)
      if (instant) return undefined
      let r2 = 0
      const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setShown(true)) })
      return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2) }
    }
    setShown(false)
    const id = setTimeout(() => setMounted(false), ms)
    return () => clearTimeout(id)
  }, [open, instant, ms])
  return { mounted, shown }
}

export default function PlaceCarousel({
  open, instant = false, places, selectedId, onSelect, onDismiss, onDirections, onShowDetail, nowMin, kmFor, float, onHeight, reduced,
}) {
  const { t } = useTranslation('map')
  const { mounted, shown } = useMountTransition(open, instant)
  const wrap = useRef(null)
  const scroller = useRef(null)
  const live = useRef({})
  live.current = { places, selectedId, onSelect, onDismiss, reduced }
  const sync = useRef({ programmatic: false, timer: 0, first: true })
  const tall = places.some(p => p.friends && p.friends.count > 0)

  // ---- selection -> scroll position ----
  const targetLeft = useCallback(id => {
    const sc = scroller.current
    const el = sc?.querySelector(`[data-id="${CSS.escape(String(id))}"]`)
    if (!sc || !el) return null
    return el.offsetLeft - (sc.clientWidth - el.offsetWidth) / 2
  }, [])

  useLayoutEffect(() => {
    if (!mounted || selectedId == null) return
    const sc = scroller.current
    const left = targetLeft(selectedId)
    if (!sc || left == null) return
    if (Math.abs(sc.scrollLeft - left) < 2) return
    const instant = sync.current.first || live.current.reduced
    sync.current.first = false
    sync.current.programmatic = true
    clearTimeout(sync.current.timer)
    sync.current.timer = setTimeout(() => { sync.current.programmatic = false }, 500)
    sc.scrollTo({ left, behavior: instant ? 'auto' : 'smooth' })
  }, [mounted, selectedId, targetLeft])
  useEffect(() => { if (!mounted) sync.current.first = true }, [mounted])

  // ---- scroll -> selection: the card nearest the centre when the scroll settles ----
  useEffect(() => {
    const sc = scroller.current
    if (!mounted || !sc) return undefined
    let debounce = 0
    const settle = () => {
      if (sync.current.programmatic) { sync.current.programmatic = false; return }
      const mid = sc.scrollLeft + sc.clientWidth / 2
      let best = null
      let bestD = Infinity
      for (const el of sc.children) {
        const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - mid)
        if (d < bestD) { bestD = d; best = el }
      }
      const id = best?.getAttribute('data-id')
      const place = id && live.current.places.find(p => p.id === id)
      if (place && place.id !== live.current.selectedId) live.current.onSelect(place)
    }
    const onScroll = () => { clearTimeout(debounce); debounce = setTimeout(settle, HAS_SCROLLEND ? SCROLL_SAFETY_MS : SCROLL_FALLBACK_MS) }
    const onTouch = () => { sync.current.programmatic = false }
    if (HAS_SCROLLEND) sc.addEventListener('scrollend', settle)
    sc.addEventListener('scroll', onScroll, { passive: true })
    sc.addEventListener('pointerdown', onTouch, { passive: true })
    return () => {
      clearTimeout(debounce)
      sc.removeEventListener('scrollend', settle)
      sc.removeEventListener('scroll', onScroll)
      sc.removeEventListener('pointerdown', onTouch)
    }
  }, [mounted])

  // ---- swipe down closes ----
  // A finger is followed with Touch Events (preventDefault on the first vertical move); Pointer Events alone left the browser
  // believing a pan had started and swallowed the next tap (QA MAP-01). A mouse uses Pointer Events.
  useEffect(() => {
    const el = wrap.current
    if (!mounted || !el) return undefined
    const s = { mode: 'idle', pid: null, x0: 0, y0: 0, h: 1, crossed: false, samples: [] }
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')

    const begin = (x, y, t) => {
      s.mode = 'pending'; s.x0 = x; s.y0 = y
      s.h = el.offsetHeight || 1; s.crossed = false; s.samples = [{ y, t }]
    }
    // classified on the first move past the slop: sideways or up is the carousel's own scroll, down is the swipe
    const classify = (x, y) => {
      const dx = x - s.x0
      const dy = y - s.y0
      if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return 'wait'
      if (Math.abs(dx) > Math.abs(dy) || dy < 0) return 'other'
      return 'drag'
    }
    const drag = (y, t) => {
      pushSample(s.samples, y, t)
      const dy = Math.max(0, y - s.y0)
      el.style.transform = `translate3d(0, ${dy}px, 0)`
      if (!s.crossed && dy > DISMISS_RATIO * s.h) { s.crossed = true; haptic(8) }
    }
    const finish = (y, t) => {
      const wasDrag = s.mode === 'drag'
      s.mode = 'idle'; s.pid = null
      if (!wasDrag) return
      const dy = Math.max(0, y - s.y0)
      const v = velocity(s.samples, t)
      if (dy > DISMISS_RATIO * s.h || (v > FLICK && dy > 24)) {
        const dur = media.matches ? 0 : clamp((s.h - dy) / Math.max(v, 1), 160, 260)
        el.style.transition = dur ? `transform ${dur}ms ${EXIT_EASE}` : 'none'
        el.style.transform = 'translate3d(0, 110%, 0)'
        setTimeout(() => live.current.onDismiss(), dur)
      } else {
        el.style.transition = media.matches ? 'none' : 'transform 300ms var(--ease-drawer)'
        el.style.transform = ''
        setTimeout(() => { el.style.transition = '' }, 320)
      }
    }

    // ---- finger ----
    let lastY = 0
    const tStart = e => {
      if (e.touches.length !== 1) { s.mode = 'idle'; return }
      begin(e.touches[0].clientX, e.touches[0].clientY, e.timeStamp)
      lastY = e.touches[0].clientY
    }
    const tMove = e => {
      if (s.mode !== 'pending' && s.mode !== 'drag') return
      if (e.touches.length !== 1) { if (s.mode === 'drag') finish(lastY, e.timeStamp); s.mode = 'native'; return }
      const t = e.touches[0]
      lastY = t.clientY
      if (s.mode === 'pending') {
        const c = classify(t.clientX, t.clientY)
        if (c === 'wait') return
        if (c === 'other') { s.mode = 'native'; return }
        s.mode = 'drag'
        el.style.transition = 'none'
      }
      if (e.cancelable) e.preventDefault()
      drag(t.clientY, e.timeStamp)
    }
    const tEnd = e => { finish(lastY, e.timeStamp); s.mode = 'idle' }

    // ---- mouse / pen: a mouse has no implicit capture, so it is followed on the window from the press to the release ----
    const track = on => {
      const f = on ? window.addEventListener : window.removeEventListener
      f.call(window, 'pointermove', pMove)
      f.call(window, 'pointerup', pUp)
      f.call(window, 'pointercancel', pUp)
    }
    const pDown = e => {
      if (e.pointerType === 'touch' || s.mode === 'drag' || (e.pointerType === 'mouse' && e.button !== 0)) return
      begin(e.clientX, e.clientY, e.timeStamp)
      s.pid = e.pointerId
      track(true)
    }
    const pMove = e => {
      if (e.pointerId !== s.pid) return
      if (s.mode === 'pending') {
        const c = classify(e.clientX, e.clientY)
        if (c === 'wait') return
        if (c === 'other') { s.mode = 'idle'; s.pid = null; track(false); return }
        try { el.setPointerCapture(e.pointerId) } catch { /* not supported */ }
        s.mode = 'drag'
        el.style.transition = 'none'
      }
      if (s.mode === 'drag') drag(e.clientY, e.timeStamp)
    }
    const pUp = e => {
      if (e.pointerId !== s.pid) return
      track(false)
      finish(e.clientY, e.timeStamp)
    }

    el.addEventListener('touchstart', tStart, { passive: true })
    el.addEventListener('touchmove', tMove, { passive: false })
    el.addEventListener('touchend', tEnd)
    el.addEventListener('touchcancel', tEnd)
    el.addEventListener('pointerdown', pDown)
    return () => {
      el.removeEventListener('touchstart', tStart)
      el.removeEventListener('touchmove', tMove)
      el.removeEventListener('touchend', tEnd)
      el.removeEventListener('touchcancel', tEnd)
      el.removeEventListener('pointerdown', pDown)
      track(false)
      el.style.transform = ''
      el.style.transition = ''
    }
  }, [mounted])

  // the owner moves the map's insets with the carousel
  useEffect(() => {
    const el = wrap.current
    if (!mounted || !el || !onHeight) return undefined
    const report = () => onHeight(el.offsetHeight)
    report()
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(report) : null
    ro?.observe(el)
    return () => ro?.disconnect()
  }, [mounted, onHeight, tall])

  if (!mounted) return null
  return (
    <div ref={wrap} className="mp-car-wrap" data-open={shown && open ? '' : undefined}>
      {float ? <div className="mp-car-float">{float}</div> : null}
      <ul ref={scroller} className="mp-car no-scrollbar" role="list" aria-label={t('listLabel')}>
        {places.map(p => (
          <li key={p.id} className="mp-slide" data-id={p.id}>
            <PlaceCard place={p} nowMin={nowMin} km={kmFor(p)} onDirections={onDirections} onShowDetail={onShowDetail} tall={tall} />
          </li>
        ))}
      </ul>
    </div>
  )
}
