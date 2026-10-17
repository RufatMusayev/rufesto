// One counted scroll lock for every overlay (docs/UX-PLAN-2026-10-18.md 6.2, D3). Replaces body.modal-open.
//  - the first lock() puts `is-locked` on <html> (overflow hidden + overscroll none, see bottomSheet.css) and, where
//    the page has a visible scrollbar, pads <body> by its width so nothing shifts;
//  - while locked, one non-passive touchmove guard on the document cancels any gesture that could move the page:
//    iOS ignores overflow:hidden on html/body for touch, and a scroller at its end chains into the page;
//  - the scroll position is never touched (no position:fixed trick), so there is nothing to restore and sticky
//    elements keep working.
// A scroller that may scroll is marked [data-bs-scroll] (BottomSheet marks its body; mark any other scroller of an
// overlay too, e.g. the floor plan). Nested scrollers inside it are honoured while they can still move.
let count = 0
let lastY = 0
let lastDir = 0
let padded = false
let prevPad = ''

// dir > 0: finger moves down (content scrolls towards its start); dir < 0: finger moves up (towards its end)
function canScroll(el, dir) {
  if (el.scrollHeight <= el.clientHeight + 1) return false
  const oy = getComputedStyle(el).overflowY
  if (oy !== 'auto' && oy !== 'scroll') return false
  return dir > 0 ? el.scrollTop > 0 : el.scrollTop + el.clientHeight < el.scrollHeight - 1
}

function onTouchStart(e) {
  if (e.touches.length !== 1) return
  lastY = e.touches[0].clientY
  lastDir = 0
}

function onTouchMove(e) {
  if (e.touches.length !== 1) return // pinch zoom stays available
  const y = e.touches[0].clientY
  const dy = y - lastY
  lastY = y
  if (dy) lastDir = dy > 0 ? 1 : -1
  if (!lastDir) return
  let el = e.target instanceof Element ? e.target : null
  while (el && el !== document.documentElement) {
    // a scroller that can still move in this direction owns the gesture, but only inside an overlay scroller
    if (canScroll(el, lastDir) && (el.hasAttribute('data-bs-scroll') || el.closest('[data-bs-scroll]'))) return
    if (el.hasAttribute('data-bs-scroll')) break
    el = el.parentElement
  }
  if (e.cancelable) e.preventDefault()
}

function apply() {
  const html = document.documentElement
  const body = document.body
  const bar = window.innerWidth - html.clientWidth
  if (bar > 0) {
    prevPad = body.style.paddingRight
    body.style.paddingRight = `${bar}px`
    padded = true
  }
  html.classList.add('is-locked')
  document.addEventListener('touchstart', onTouchStart, { passive: true })
  document.addEventListener('touchmove', onTouchMove, { passive: false })
}

function release() {
  document.documentElement.classList.remove('is-locked')
  if (padded) { document.body.style.paddingRight = prevPad; padded = false }
  document.removeEventListener('touchstart', onTouchStart)
  document.removeEventListener('touchmove', onTouchMove)
}

/** Take a lock. Returns an idempotent release function. */
export function lock() {
  count += 1
  if (count === 1) apply()
  let released = false
  return () => {
    if (released) return
    released = true
    unlock()
  }
}

export function unlock() {
  count = Math.max(0, count - 1)
  if (count === 0) release()
}

export const isLocked = () => count > 0
