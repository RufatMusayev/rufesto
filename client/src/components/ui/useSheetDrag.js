import { useEffect } from 'react'
import { tap as haptic } from '../../lib/haptics'
import { SLOP, FLICK, NO_DRAG, clamp, rubberBand, pushSample, velocity } from './dragMath'

// Drag-to-dismiss for BottomSheet (docs/UX-PLAN-2026-10-18.md 6.1, D4). No React state: the transform is written
// straight to the panel on every move.
//  - the head (handle + header) is dragged with Pointer Events (touch-action:none, capture taken lazily so a tap on
//    the close button still clicks);
//  - the body is dragged with Touch Events (Pointer Events alone are cancelled by native panning on iOS): the
//    gesture is decided on the first move past 6px. Downward with the content at scrollTop 0 -> a sheet drag (a
//    non-passive touchmove cancels native scrolling); anything else -> native scroll for the whole gesture;
//  - release: dismiss when dy > 30% of the panel or a flick (> 0.5 px/ms and dy > 24); otherwise snap back.
const DISMISS_RATIO = 0.3

export default function useSheetDrag({ active, panelRef, rootRef, headRef, bodyRef, canDismiss, isOpen, onDismiss }) {
  useEffect(() => {
    const panel = panelRef.current
    const root = rootRef.current
    const head = headRef.current
    const body = bodyRef.current
    if (!active || !panel || !root || !body) return undefined

    const desktop = window.matchMedia('(min-width: 1024px) and (pointer: fine)')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const scrim = root.querySelector('.bs-scrim')
    const s = { mode: 'idle', pid: null, x0: 0, y0: 0, dy: 0, h: 0, crossed: false, samples: [], scrollTop0: 0 }
    let snapTimer = 0

    const allowed = () => !desktop.matches && canDismiss()

    function begin(x, y, t) {
      clearTimeout(snapTimer)
      s.x0 = x; s.y0 = y; s.dy = 0; s.crossed = false
      s.h = panel.offsetHeight || 1
      s.samples = [{ y, t }]
    }

    function startDrag() {
      s.mode = 'drag'
      root.setAttribute('data-dragging', '')
      panel.style.transition = 'none'
    }

    function move(y, t) {
      pushSample(s.samples, y, t)
      let dy = y - s.y0
      if (dy < 0) dy = reduced.matches ? 0 : rubberBand(dy) // rubber band upwards
      s.dy = dy
      panel.style.transform = `translate3d(0, ${dy}px, 0)`
      root.style.setProperty('--bs-fade', String(clamp(1 - Math.max(dy, 0) / s.h, 0, 1)))
      if (!s.crossed && dy > DISMISS_RATIO * s.h) { s.crossed = true; haptic(8) }
    }

    function clearInline() {
      panel.style.transition = ''
      panel.style.transform = ''
      root.style.removeProperty('--bs-fade')
      if (scrim) { scrim.style.transition = ''; scrim.style.opacity = '' }
    }

    function snapBack() {
      if (reduced.matches) { clearInline(); return }
      panel.style.transition = 'transform 300ms var(--ease-drawer)'
      panel.style.transform = 'translate3d(0, 0, 0)'
      root.style.setProperty('--bs-fade', '1')
      clearTimeout(snapTimer)
      snapTimer = setTimeout(clearInline, 320)
    }

    function release(endT) {
      const dy = s.dy
      const v = velocity(s.samples, endT)
      s.mode = 'idle'
      s.pid = null
      root.removeAttribute('data-dragging')
      if (canDismiss() && (dy > DISMISS_RATIO * s.h || (v > FLICK && dy > 24))) {
        const dur = reduced.matches ? 0 : clamp((s.h - dy) / Math.max(v, 1), 120, 240)
        panel.style.transition = dur ? `transform ${dur}ms cubic-bezier(0.2, 0.8, 0.4, 1)` : 'none'
        panel.style.transform = 'translate3d(0, 100%, 0)'
        if (scrim) { scrim.style.transition = dur ? `opacity ${dur}ms linear` : 'none'; scrim.style.opacity = '0' }
        onDismiss(dur)
        // the owner may refuse to close (busy state, a confirm): bring the sheet back
        clearTimeout(snapTimer)
        snapTimer = setTimeout(() => { if (isOpen()) snapBack() }, dur + 120)
      } else {
        snapBack()
      }
    }

    // ---- head: Pointer Events ----
    function onPointerDown(e) {
      if (!allowed() || s.mode !== 'idle') return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (e.target instanceof Element && e.target.closest(NO_DRAG)) return
      s.mode = 'pending'
      s.pid = e.pointerId
      begin(e.clientX, e.clientY, e.timeStamp)
    }
    function onPointerMove(e) {
      if (e.pointerId !== s.pid) return
      if (s.mode === 'pending') {
        const dx = e.clientX - s.x0
        const dy = e.clientY - s.y0
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return
        if (Math.abs(dx) > Math.abs(dy)) { s.mode = 'idle'; s.pid = null; return }
        try { head.setPointerCapture(e.pointerId) } catch { /* not supported */ }
        startDrag()
      }
      if (s.mode === 'drag') move(e.clientY, e.timeStamp)
    }
    function onPointerEnd(e) {
      if (e.pointerId !== s.pid) return
      if (s.mode === 'drag') release(e.timeStamp)
      else { s.mode = 'idle'; s.pid = null }
    }

    // ---- body: Touch Events ----
    // true when the touch started inside a nested scroller that is not at its top (it must scroll, not drag the sheet)
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
      if (!allowed() || e.touches.length !== 1) { s.mode = 'idle'; return }
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
        if (Math.abs(dx) > Math.abs(dy) || dy < 0 || s.scrollTop0 > 0) { s.mode = 'native'; return }
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
    head?.addEventListener('pointermove', onPointerMove)
    head?.addEventListener('pointerup', onPointerEnd)
    head?.addEventListener('pointercancel', onPointerEnd)
    body.addEventListener('touchstart', onTouchStart, { passive: true })
    body.addEventListener('touchmove', onTouchMove, { passive: false })
    body.addEventListener('touchend', onTouchEnd)
    body.addEventListener('touchcancel', onTouchEnd)
    return () => {
      clearTimeout(snapTimer)
      head?.removeEventListener('pointerdown', onPointerDown)
      head?.removeEventListener('pointermove', onPointerMove)
      head?.removeEventListener('pointerup', onPointerEnd)
      head?.removeEventListener('pointercancel', onPointerEnd)
      body.removeEventListener('touchstart', onTouchStart)
      body.removeEventListener('touchmove', onTouchMove)
      body.removeEventListener('touchend', onTouchEnd)
      body.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [active, panelRef, rootRef, headRef, bodyRef, canDismiss, isOpen, onDismiss])
}
