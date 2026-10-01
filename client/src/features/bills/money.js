// Money helpers. The client never computes bill amounts (the server does); it only derives the tip and the
// "pay now" sum, both in integer cents so 0.1 + 0.2 style float noise never reaches the screen.
export const toCents = n => Math.round((Number(n) || 0) * 100)
export const fromCents = c => (Number(c) || 0) / 100

export const TIP_PERCENTS = [0, 5, 10, 15]
export const TIP_MAX = 999.99

/** Tip for a share at `pct` percent, rounded to the nearest 0.10. */
export function tipForShare(share, pct) {
  const cents = toCents(share)
  return fromCents(Math.round((cents * pct) / 1000) * 10)
}

/** Parse the custom tip field. '' is 0; returns null when it is not a valid amount in 0..999.99. */
export function parseTip(text) {
  const raw = String(text ?? '').trim().replace(',', '.')
  if (raw === '') return 0
  if (!/^\d{1,3}(\.\d{0,2})?$/.test(raw)) return null
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 && n <= TIP_MAX ? n : null
}

/** share + tip as a number (cents arithmetic). */
export const addMoney = (a, b) => fromCents(toCents(a) + toCents(b))

/** Same amount within half a qepik. */
export const sameAmount = (a, b) => Math.abs(toCents(a) - toCents(b)) < 1
