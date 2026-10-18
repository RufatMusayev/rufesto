// Greedy pin collision (docs/MAP-PLAN-2026-10-18.md M7): the ranked pills are placed first, and a pill whose box would
// overlap an already placed one turns into a dot. Runs on zoomend and when the data / selection changes, never per frame.
//
// A pill is anchored at its tail tip: its box spans [x - w/2, x + w/2] x [y - H, y]. Widths are estimated from the content
// (kind icon + star + rating in tabular figures) so there is no layout read.
//
// Rank (round 2): the selected pin, then places where friends have been, then the weight of the rating
// (review count x rating, so a place with 35 reviews beats one with 5), then open before closed, then id for stability.

export const PILL_H = 34 // 28 px pill + 6 px tail
const PILL_W_RATED = 66
const PILL_W_ICON = 28
const GAP = 3

export const pillWidth = place => (place.rating != null ? PILL_W_RATED : PILL_W_ICON)

export const hasFriends = place => (place.friends?.count || 0) > 0
const weight = place => (Number(place.review_count) || 0) * (place.rating != null ? Number(place.rating) : 0)

/** Sort comparator: best ranked first. */
export function compareRank(a, b, selectedId) {
  const sa = a.id === selectedId
  const sb = b.id === selectedId
  if (sa !== sb) return sa ? -1 : 1
  const fa = hasFriends(a)
  const fb = hasFriends(b)
  if (fa !== fb) return fa ? -1 : 1
  const w = weight(b) - weight(a)
  if (w) return w
  if (!!a.open_now !== !!b.open_now) return a.open_now ? -1 : 1
  return a.id < b.id ? -1 : 1
}

/**
 * @param {Array<{place:object, x:number, y:number}>} items projected anchors (screen px)
 * @returns {Set<string>} ids that must be dots
 */
export function resolveDots(items, selectedId) {
  const sorted = items.slice().sort((a, b) => compareRank(a.place, b.place, selectedId))
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
