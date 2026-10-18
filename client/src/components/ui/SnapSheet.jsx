import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef } from 'react'
import useSnapDrag from './useSnapDrag'
import { clamp } from './dragMath'
import './snapSheet.css'

/**
 * A persistent, non-modal bottom sheet with snap points (docs/MAP-PLAN-2026-10-18.md 3, 4). Unlike BottomSheet it has no
 * scrim, no focus trap, no inert page and it is never dismissed: the screen behind stays interactive above it.
 *
 *   <SnapSheet snaps={[116, 390, 716]} index={1} onSnap={i => ...} hidden={false} head={node} float={node} label="Places">
 *     list...
 *   </SnapSheet>
 *
 *  - snaps   visible heights in px, ascending (peek, half, full). The panel is as tall as the last one and slides by
 *            translateY; it sits at the bottom of its positioned parent (the parent ends where the bottom nav begins).
 *  - index   the settled snap (controlled). A change of `index` animates (320 ms drawer ease); the user's own drag
 *            lands on a snap by itself and then reports it with `onSnap(i)`.
 *  - hidden  the panel slides fully below the parent (and becomes inert) while something else takes its place.
 *  - scrollAt  the snap at which the body scrolls (default: the last). At the others the body is overflow:hidden and any
 *            vertical gesture on it moves the sheet.
 *  - head    node inside the draggable head, under the handle (count, chips). touch-action:none: no vertical scrollers.
 *  - float   node that rides the panel, 56 px above its top edge (the Locate button); hidden at the scrolling snap.
 *  - handle  { show, hide } labels of the handle button (a keyboard / screen reader way to move the sheet).
 *  - ref     { bodyRef, snapTo(i, { animate }) }.
 * While dragging nothing touches React: the transform is written to the panel on every move (useSnapDrag).
 */
const SETTLE_MS = 320
const HIDE_MS = 240
const SHOW_DELAY_MS = 60
const HIDDEN_GAP = 56 // extra px below the parent so the shadow and the float button leave with the panel

const SnapSheet = forwardRef(function SnapSheet({
  snaps, index, onSnap, hidden = false, scrollAt, head, float, label, handle, className = '', children,
}, ref) {
  const rootRef = useRef(null)
  const panelRef = useRef(null)
  const headRef = useRef(null)
  const bodyRef = useRef(null)
  const full = snaps[snaps.length - 1]
  const scrollIdx = scrollAt ?? snaps.length - 1

  const live = useRef({})
  live.current = { snaps, full, index, hidden, scrollIdx, onSnap }
  const mem = useRef({ y: null, timer: 0, scrollTimer: 0 })

  const reducedNow = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const yOf = i => live.current.full - live.current.snaps[clamp(i, 0, live.current.snaps.length - 1)]

  const write = useCallback((y, transition = 'none') => {
    const panel = panelRef.current
    if (!panel) return
    clearTimeout(mem.current.timer)
    panel.style.transition = transition
    panel.style.transform = `translate3d(0, ${y}px, 0)`
    mem.current.y = y
  }, [])

  const readY = useCallback(() => {
    const panel = panelRef.current
    if (!panel) return mem.current.y ?? 0
    try {
      const m = getComputedStyle(panel).transform
      if (m && m !== 'none') return new DOMMatrixReadOnly(m).m42
    } catch { /* fall back to the last written value */ }
    return mem.current.y ?? 0
  }, [])

  // animate to y; the inline transition is dropped when it is over so a later write never inherits it
  const glide = useCallback((y, ms, ease, delay = 0) => {
    if (reducedNow() || ms <= 0) { write(y); return }
    write(y, `transform ${ms}ms ${ease} ${delay}ms`)
    mem.current.timer = setTimeout(() => {
      const panel = panelRef.current
      if (panel) panel.style.transition = 'none'
    }, ms + delay + 40)
  }, [write])

  const resetScroll = useCallback(() => {
    clearTimeout(mem.current.scrollTimer)
    mem.current.scrollTimer = setTimeout(() => {
      if (live.current.index !== live.current.scrollIdx && bodyRef.current) bodyRef.current.scrollTop = 0
    }, 360)
  }, [])

  // ---- the drag hook talks to the sheet through this ----
  const api = useMemo(() => ({
    ys: () => live.current.snaps.map((_, i) => yOf(i)),
    index: () => live.current.index,
    enabled: () => !live.current.hidden,
    scrolls: () => live.current.index === live.current.scrollIdx,
    currentY: readY,
    setY: y => write(y),
    settle: (i, y, ms) => {
      glide(y, ms, 'var(--ease-drawer)')
      if (i !== live.current.index) live.current.onSnap?.(i)
      resetScroll()
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [readY, write, glide, resetScroll])
  useSnapDrag({ rootRef, headRef, bodyRef, api })

  useImperativeHandle(ref, () => ({
    bodyRef,
    snapTo(i, { animate = true } = {}) {
      const y = yOf(i)
      if (animate) glide(y, SETTLE_MS, 'var(--ease-drawer)'); else write(y)
    },
  }), [glide, write])

  // ---- place the panel: on mount, when the snaps change (resize), when `index` or `hidden` change ----
  const snapKey = snaps.join(',')
  const first = useRef(true)
  const prev = useRef({ index, hidden, key: snapKey })
  useLayoutEffect(() => {
    const p = prev.current
    prev.current = { index, hidden, key: snapKey }
    const target = hidden ? full + HIDDEN_GAP : yOf(index)
    if (first.current) { first.current = false; write(target); return }
    if (p.key !== snapKey) { write(target); return } // the screen was resized: no glide
    if (p.hidden !== hidden) {
      if (hidden) glide(target, HIDE_MS, 'var(--ease-exit)')
      else glide(target, SETTLE_MS, 'var(--ease-drawer)', SHOW_DELAY_MS)
      return
    }
    if (Math.abs((mem.current.y ?? 0) - target) > 0.5) glide(target, SETTLE_MS, 'var(--ease-drawer)')
    resetScroll()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, hidden, snapKey])

  useEffect(() => () => { clearTimeout(mem.current.timer); clearTimeout(mem.current.scrollTimer) }, [])

  // hidden = nothing to reach: no focus, no pointer, not read out
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    if (hidden) el.setAttribute('inert', ''); else el.removeAttribute('inert')
  }, [hidden])

  const handleKey = e => {
    if (e.key === 'ArrowUp') { e.preventDefault(); if (index < snaps.length - 1) onSnap?.(index + 1) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (index > 0) onSnap?.(index - 1) }
  }
  const toggle = () => onSnap?.(index === 0 ? Math.min(1, snaps.length - 1) : 0)
  const expanded = index > 0

  return (
    <div
      ref={rootRef}
      className={`ss-root${className ? ` ${className}` : ''}`}
      style={{ '--ss-full': `${full}px` }}
      data-snap={index}
      data-scrolling={index === scrollIdx ? '' : undefined}
      data-hidden={hidden ? '' : undefined}
    >
      <section ref={panelRef} className="ss-panel" aria-label={label} aria-hidden={hidden ? 'true' : undefined}>
        {float ? <div className="ss-float">{float}</div> : null}
        <div ref={headRef} className="ss-head">
          <button
            type="button"
            className="ss-grab"
            aria-label={expanded ? handle?.hide : handle?.show}
            aria-expanded={expanded}
            onClick={toggle}
            onKeyDown={handleKey}
          >
            <span className="ss-grab-bar" aria-hidden="true" />
          </button>
          {head}
        </div>
        <div ref={bodyRef} className="ss-body" data-bs-scroll="">
          {children}
        </div>
      </section>
    </div>
  )
})

export default SnapSheet
