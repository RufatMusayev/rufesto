// Greedy pin collision (docs/MAP-PLAN-2026-10-18.md M7): the ranked pills are placed first, and a pill whose box would
// overlap an already placed one turns into a dot. Runs on zoomend and when the data / selection changes, never per frame.
//
// A pill is anchored at its tail tip: its box spans [x - w/2, x + w/2] x [y - H, y]. Widths are estimated from the content
// (kind icon + star + rating in tabular figures) so there is no layout read.

export const PILL_H = 34 // 28 px pill + 6 px tail
const PILL_W_RATED = 66
const PILL_W_ICON = 28
const GAP = 3

export const pillWidth = place => (place.rating != null ? PILL_W_RATED : PILL_W_ICON)

/** Higher is placed first: the selected pin, then open before closed, rating, number of reviews, then id for stability. */
export function rankOf(place, selectedId) {
  return (place.id === selectedId ? 1e9 : 0)
    + (place.open_now ? 1e6 : 0)
    + (place.rating != null ? Number(place.rating) * 1e3 : 0)
    + Math.min(Number(place.review_count) || 0, 999)
}

/**
 * @param {Array<{place:object, x:number, y:number}>} items projected anchors (screen px)
 * @returns {Set<string>} ids that must be dots
 */
export function resolveDots(items, selectedId) {
  const sorted = items.slice().sort((a, b) => {
    const d = rankOf(b.place, selectedId) - rankOf(a.place, selectedId)
    return d || (a.place.id < b.place.id ? -1 : 1)
  })
  const placed = []
  const dots = new Set()
  for (const it of sorted) {
    const half = pillWidth(it.place) / 2 + GAP
    const box = { l: it.x - half, r: it.x + half, t: it.y - PILL_H - GAP, b: it.y + GAP }
    const forced = it.place.id === selectedId
    let hit = false
    if (!forced) {
      for (const p of placed) {
        if (box.l < p.r && box.r > p.l && box.t < p.b && box.b > p.t) { hit = true; break }
      }
    }
    if (hit) dots.add(it.place.id)
    else placed.push(box)
  }
  return dots
}
