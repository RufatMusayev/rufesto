import { useEffect, useRef } from 'react'
import { isLocked } from './scrollLock'
import { tap as haptic } from './haptics'

// Pull to refresh (docs/UX-PLAN-2026-10-18.md 6.6). Touch screens only ((pointer: coarse)), and only when the page is at
// scrollY 0 at touchstart and nothing modal is open. Resistance 0.5: a spinner fades in and turns with the distance, the
// trigger is 64 px, release -> onRefresh() -> the spinner spins until the promise settles (at least 400 ms), then the
// content slides back in 200 ms. Native pull-to-reload is switched off by `html { overscroll-behavior-y: contain }`.
//
// The hook writes straight to the DOM (no React state per touchmove). Use it through <PullToRefresh> (components/ui)
// or wire the three refs yourself:
//   const { rootRef, bodyRef, indicatorRef } = usePullToRefresh({ onRefresh, enabled })
//   rootRef = the wrapper (the gesture must start inside it), bodyRef = the content that slides down,
//   indicatorRef = the absolutely positioned spinner at the top of the wrapper.
const THRESHOLD = 64
const RESISTANCE = 0.5
const MAX_PULL = 110
const MIN_SPIN_MS = 400
const SLOP = 6

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

export default function usePullToRefresh({ onRefresh, enabled = true } = {}) {
  const rootRef = useRef(null)
  const bodyRef = useRef(null)
  const indicatorRef = useRef(null)
  const refresh = useRef(onRefresh)
  refresh.current = onRefresh

  useEffect(() => {
    const root = rootRef.current
    const body = bodyRef.current
    const ind = indicatorRef.current
    if (!enabled || !root || !body || typeof window.matchMedia !== 'function') return undefined
    const coarse = window.matchMedia('(pointer: coarse)')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (!coarse.matches) return undefined

    const s = { mode: 'idle', x0: 0, y0: 0, pulled: 0, armed: false, busy: false }

    function paint(px, animate) {
      const p = clamp(px, 0, MAX_PULL)
      const ratio = clamp(p / THRESHOLD, 0, 1)
      body.style.transition = animate ? 'transform 200ms var(--ease-out)' : 'none'
      body.style.transform = p && !reduced.matches ? `translate3d(0, ${p}px, 0)` : ''
      if (ind) {
        ind.style.transition = animate ? 'opacity 200ms var(--ease-out), transform 200ms var(--ease-out)' : 'none'
        ind.style.opacity = String(ratio)
        ind.style.transform = reduced.matches ? '' : `translate3d(0, ${p / 2 - 22}px, 0) rotate(${ratio * 270}deg)`
      }
    }

    function reset() {
      s.mode = 'idle'
      s.pulled = 0
      s.armed = false
      paint(0, true)
      setTimeout(() => { if (!s.busy && s.mode === 'idle') { body.style.transition = ''; body.style.transform = '' } }, 220)
    }

    async function run() {
      s.busy = true
      s.mode = 'busy'
      root.setAttribute('aria-busy', 'true')
      root.classList.add('is-refreshing')
      paint(THRESHOLD, true)
      const started = Date.now()
      try { await refresh.current?.() } catch { /* the owner shows its own error state */ }
      const rest = MIN_SPIN_MS - (Date.now() - started)
      if (rest > 0) await new Promise(r => setTimeout(r, rest))
      s.busy = false
      root.removeAttribute('aria-busy')
      root.classList.remove('is-refreshing')
      reset()
    }

    function onTouchStart(e) {
      if (s.busy || e.touches.length !== 1) { s.mode = s.busy ? 'busy' : 'idle'; return }
      s.mode = 'idle'
      if (window.scrollY > 0 || isLocked() || !(e.target instanceof Node) || !root.contains(e.target)) return
      s.mode = 'pending'
      s.x0 = e.touches[0].clientX
      s.y0 = e.touches[0].clientY
      s.pulled = 0
      s.armed = false
    }

    function onTouchMove(e) {
      if (s.mode !== 'pending' && s.mode !== 'pull') return
      if (e.touches.length !== 1) { reset(); return }
      const dx = e.touches[0].clientX - s.x0
      const dy = e.touches[0].clientY - s.y0
      if (s.mode === 'pending') {
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || window.scrollY > 0) { s.mode = 'idle'; return }
        s.mode = 'pull'
      }
      if (e.cancelable) e.preventDefault()
      s.pulled = Math.max(0, dy) * RESISTANCE
      paint(s.pulled, false)
      if (!s.armed && s.pulled >= THRESHOLD) { s.armed = true; haptic(8) }
      else if (s.armed && s.pulled < THRESHOLD) s.armed = false
    }

    function onTouchEnd() {
      if (s.mode !== 'pull') { if (s.mode === 'pending') s.mode = 'idle'; return }
      if (s.pulled >= THRESHOLD) run()
      else reset()
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd)
    document.addEventListener('touchcancel', onTouchEnd)
    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('touchcancel', onTouchEnd)
      body.style.transition = ''
      body.style.transform = ''
      if (ind) { ind.style.transition = ''; ind.style.opacity = ''; ind.style.transform = '' }
    }
  }, [enabled])

  return { rootRef, bodyRef, indicatorRef }
}
