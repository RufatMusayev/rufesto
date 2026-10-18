import { useEffect } from 'react'
import { tap as haptic } from '../../lib/haptics'
import { SLOP, FLICK, clamp, rubberBand, pushSample, velocity } from './dragMath'

// Drag between snap points for SnapSheet (docs/MAP-PLAN-2026-10-18.md 4, "Sheet drag" / "Sheet release"). No React
// state while dragging: the transform is written straight to the panel on every move.
//  - the head (handle, count, chips) is dragged with Pointer Events (touch-action:none; the pointer is captured lazily,
//    after the slop, so a tap on a chip still clicks);
//  - the body (the list) is dragged with Touch Events, decided on the first move past 6 px: at a snap where the list
//    does not scroll (every snap but the last) any vertical gesture moves the sheet; at the scrolling snap only a pull
//    down with the list at scrollTop 0 does, everything else is a native scroll for the whole gesture;
//  - release: projected = y + v * 200 ms, nearest snap to the projection; a flick (> 0.5 px/ms) moves at least one snap and
//    a drag of a third of the way to the next snap commits to it; settle in clamp(|dy| / max(|v|, 0.8), 220, 420) ms.
// Positions are translateY of the panel: y = 0 is the highest snap, y = full - snap[i] the others.
const PROJECT_MS = 200
const COMMIT_RATIO = 0.33
const NO_DRAG = 'input, textarea, select, [data-bs-nodrag]'

/**
 * api (all functions read live values, the hook is attached once):
 *   ys()            -> number[]  translateY of every snap, ascending index = rising sheet
 *   index()         -> settled snap index
 *   enabled()       -> false while the sheet is hidden
 *   scrolls()       -> true at the snap where the body scrolls
 *   currentY()      -> where the panel is right now (mid-animation included)
 *   setY(y)         -> write y with no transition
 *   settle(i, y, dur, userMoved) -> animate to snap i
 */
export default function useSnapDrag({ rootRef, headRef, bodyRef, api }) {
  useEffect(() => {
    const root = rootRef.current
    const head = headRef.current
    const body = bodyRef.current
    if (!root || !body) return undefined

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const s = { mode: 'idle', pid: null, x0: 0, y0: 0, startY: 0, startIndex: 0, samples: [], scrollTop0: 0, canScroll: false }

    function begin(x, y, t) {
      s.x0 = x; s.y0 = y
      s.startY = api.currentY()
      s.startIndex = api.index()
      s.samples = [{ y, t }]
      s.canScroll = api.scrolls()
    }

    function startDrag() {
      s.mode = 'drag'
      root.setAttribute('data-dragging', '')
      api.setY(api.currentY()) // freeze a running settle where it is
    }

    function move(y, t) {
      pushSample(s.samples, y, t)
      const ys = api.ys()
      const top = ys[ys.length - 1]
      const bottom = ys[0]
      let ny = s.startY + (y - s.y0)
      if (reduced.matches) ny = clamp(ny, top, bottom)
      else if (ny < top) ny = top + rubberBand(ny - top)
      else if (ny > bottom) ny = bottom - rubberBand(bottom - ny)
      api.setY(ny)
    }

    function release(endT) {
      const ys = api.ys()
      const y = api.currentY()
      const v = velocity(s.samples, endT) // px/ms, positive = down
      s.mode = 'idle'
      s.pid = null
      root.removeAttribute('data-dragging')

      const last = ys.length - 1
      // ys[0] is the lowest sheet (peek), the highest index is the highest sheet: "up" means a higher index
      const projected = reduced.matches ? y : y + v * PROJECT_MS
      let target = 0
      for (let i = 1; i <= last; i += 1) if (Math.abs(ys[i] - projected) < Math.abs(ys[target] - projected)) target = i

      const start = s.startIndex
      const movedUp = y < s.startY
      const neighbour = clamp(start + (movedUp ? 1 : -1), 0, last)
      if (target === start && neighbour !== start) {
        const gap = Math.abs(ys[neighbour] - ys[start])
        if (gap > 0 && Math.abs(y - s.startY) >= COMMIT_RATIO * gap) target = neighbour
      }
      if (Math.abs(v) > FLICK) {
        if (v < 0 && target <= start) target = clamp(start + 1, 0, last)
        else if (v > 0 && target >= start) target = clamp(start - 1, 0, last)
      }
      const dur = reduced.matches ? 0 : clamp(Math.abs(ys[target] - y) / Math.max(Math.abs(v), 0.8), 220, 420)
      api.settle(target, ys[target], dur, true)
      if (target !== start) setTimeout(() => haptic(8), dur)
    }

    // ---- head: Pointer Events ----
    // a mouse has no implicit capture: once the button is down, moves and the release are followed on the window, or a
    // fast drag that leaves the head would never end
    function track(on) {
      const f = on ? window.addEventListener : window.removeEventListener
      f.call(window, 'pointermove', onPointerMove)
      f.call(window, 'pointerup', onPointerEnd)
      f.call(window, 'pointercancel', onPointerEnd)
    }
    function onPointerDown(e) {
      if (!api.enabled() || s.mode === 'drag') return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (e.target instanceof Element && e.target.closest(NO_DRAG)) return
      s.mode = 'pending'
      s.pid = e.pointerId
      begin(e.clientX, e.clientY, e.timeStamp)
      track(true)
    }
    function onPointerMove(e) {
      if (e.pointerId !== s.pid) return
      if (s.mode === 'pending') {
        const dx = e.clientX - s.x0
        const dy = e.clientY - s.y0
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return
        if (Math.abs(dx) > Math.abs(dy)) { s.mode = 'idle'; s.pid = null; track(false); return }
        try { head.setPointerCapture(e.pointerId) } catch { /* not supported */ }
        startDrag()
      }
      if (s.mode === 'drag') move(e.clientY, e.timeStamp)
    }
    function onPointerEnd(e) {
      if (e.pointerId !== s.pid) return
      track(false)
      if (s.mode === 'drag') release(e.timeStamp)
      else { s.mode = 'idle'; s.pid = null }
    }

    // ---- body: Touch Events ----
    function insideScrolled(target) {
      let el = target instanceof Element ? target : null
      while (el && el !== body) {
        if (el.scrollTop > 0 && el.scrollHeight > el.clientHeight) {
          const oy = getComputedStyle(el).overflowY
          if (oy === 'auto' || oy === 'scroll') return true
        }
        el = el.parentElement
      }
      return false
    }
    function onTouchStart(e) {
      if (!api.enabled() || e.touches.length !== 1) { s.mode = 'idle'; return }
      const t = e.touches[0]
      s.mode = 'pending'
      begin(t.clientX, t.clientY, e.timeStamp)
      s.scrollTop0 = body.scrollTop
      if (insideScrolled(e.target)) s.scrollTop0 = 1
    }
    function onTouchMove(e) {
      if (s.mode !== 'pending' && s.mode !== 'drag') return
      if (e.touches.length !== 1) { if (s.mode === 'drag') release(e.timeStamp); s.mode = 'native'; return }
      const t = e.touches[0]
      if (s.mode === 'pending') {
        const dx = t.clientX - s.x0
        const dy = t.clientY - s.y0
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return
        if (Math.abs(dx) > Math.abs(dy)) { s.mode = 'native'; return }
        // the list scrolls at this snap: only a pull down from its very top belongs to the sheet
        if (s.canScroll && (dy < 0 || s.scrollTop0 > 0)) { s.mode = 'native'; return }
        startDrag()
      }
      if (e.cancelable) e.preventDefault()
      move(t.clientY, e.timeStamp)
    }
    function onTouchEnd(e) {
      if (s.mode === 'drag') release(e.timeStamp)
      s.mode = 'idle'
    }

    head?.addEventListener('pointerdown', onPointerDown)
    body.addEventListener('touchstart', onTouchStart, { passive: true })
    body.addEventListener('touchmove', onTouchMove, { passive: false })
    body.addEventListener('touchend', onTouchEnd)
    body.addEventListener('touchcancel', onTouchEnd)
    return () => {
      head?.removeEventListener('pointerdown', onPointerDown)
      track(false)
      body.removeEventListener('touchstart', onTouchStart)
      body.removeEventListener('touchmove', onTouchMove)
      body.removeEventListener('touchend', onTouchEnd)
      body.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [rootRef, headRef, bodyRef, api])
}
