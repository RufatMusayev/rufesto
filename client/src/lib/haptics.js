// Short vibration taps (docs/UX-PLAN-2026-10-18.md 6.7). Android Chrome only: iOS has no navigator.vibrate, and the
// call is skipped on a mouse device, with reduced motion, and until the page has had a user gesture (Chrome logs an
// "[Intervention] Blocked call to navigator.vibrate" error otherwise).
const media = q => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(q).matches : false)

/** True when a tap would actually vibrate. */
export function canVibrate() {
  try {
    if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return false
    if (!media('(pointer: coarse)') || media('(prefers-reduced-motion: reduce)')) return false
    const ua = navigator.userActivation
    return !ua || ua.hasBeenActive
  } catch {
    return false
  }
}

/** Vibrate for `ms` milliseconds (sheet dismiss threshold, like on, pull-to-refresh trigger, Confirm). */
export function tap(ms = 8) {
  if (!canVibrate()) return false
  try { return navigator.vibrate(ms) } catch { return false }
}

export const haptics = { tap, canVibrate }
export default haptics
