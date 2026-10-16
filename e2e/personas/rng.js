'use strict'
// Seeded random numbers (mulberry32): the same seed gives the same day, so a run can be repeated and compared.

function makeRng(seed) {
  let a = (Number(seed) || 0) >>> 0
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const rng = {
    next,
    /** integer in [lo, hi] */
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    chance: p => next() < p,
    pick: arr => (arr.length ? arr[Math.floor(next() * arr.length)] : undefined),
    shuffle(arr) {
      const out = arr.slice()
      for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [out[i], out[j]] = [out[j], out[i]] }
      return out
    },
    /** one item of `items`, picked with probability proportional to weight(item) (items with weight <= 0 never win) */
    weighted(items, weight) {
      const ws = items.map(i => Math.max(0, weight(i)))
      const sum = ws.reduce((s, w) => s + w, 0)
      if (!sum) return undefined
      let r = next() * sum
      for (let i = 0; i < items.length; i++) { r -= ws[i]; if (r < 0) return items[i] }
      return items[items.length - 1]
    },
    /** n distinct items, weighted, without replacement */
    sample(items, n, weight = () => 1) {
      const pool = items.slice(), out = []
      while (out.length < n && pool.length) {
        const w = rng.weighted(pool, weight)
        if (w === undefined) break
        out.push(w)
        pool.splice(pool.indexOf(w), 1)
      }
      return out
    },
    money: (lo, hi) => Math.round((lo + next() * (hi - lo)) * 100) / 100,
  }
  return rng
}

module.exports = { makeRng }
