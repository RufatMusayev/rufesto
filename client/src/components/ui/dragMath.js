// Numbers and helpers shared by the sheet drag hooks (useSheetDrag for BottomSheet, useSnapDrag for SnapSheet).
// Extracted from useSheetDrag.js without changing a value (docs/MAP-PLAN-2026-10-18.md section 6).

export const SLOP = 6                 // px a finger must travel before the gesture is classified
export const FLICK = 0.5              // px per ms: a release faster than this is a flick
export const SAMPLE_MS = 100          // velocity is measured over the last 100 ms before the finger lifts
export const MAX_SAMPLES = 12
// controls that must keep their own tap (a drag may still start on them in hooks that take the pointer lazily)
export const NO_DRAG = 'button, a, input, textarea, select, [role="button"], [data-bs-nodrag]'

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n))

/** Rubber band for a drag past an end: the (negative) overshoot `over` becomes -min(max, |over|^0.7). */
export function rubberBand(over, max = 24) {
  return -Math.min(max, Math.pow(-over, 0.7))
}

/** Appends a { y, t } sample and keeps the last MAX_SAMPLES. */
export function pushSample(samples, y, t) {
  samples.push({ y, t })
  if (samples.length > MAX_SAMPLES) samples.shift()
}

/**
 * px/ms over the last 100 ms before the finger lifted (`now` is the end event's own time: a finger that rested before
 * lifting has no speed). Positive = moving down.
 */
export function velocity(samples, now) {
  const recent = samples.filter(p => now - p.t <= SAMPLE_MS)
  if (recent.length < 2) return 0
  const a = recent[0]
  const b = recent[recent.length - 1]
  return b.t > a.t ? (b.y - a.y) / (b.t - a.t) : 0
}
