// Pure layout engine of the pixel floor plan (no React, no DOM). It turns the tables of floor_plan()
// into blocks on a grid of square cells: every table becomes a block, every seat a one-cell chair on the
// ring around it. The renderer only has to multiply cell coordinates by the cell size in pixels.
//
//   layoutFloor(tables, { sectionOrder }) -> { cols, rows, items, zones, door }
//
// A table is { id, number, capacity, sectionId, x, y, w, h, shape } (x/y/w/h may be null).
// Positioned tables keep their relative arrangement (their centres are scaled to fit the grid width, so it
// does not matter which unit x/y use); tables without a position are packed below them in rows.
// Blocks and their chair rings never overlap and keep a one-cell gap: a block that would collide is nudged
// to the nearest free spot.

export const COLS = 28          // grid width in cells; the renderer picks the cell size from the screen width
export const MAX_SEATS = 24     // chairs drawn per table (capacity is still shown in full)

const TOP_PAD = 3               // empty rows above the first table (room for the section label)
const SIDE_PAD = 1              // empty columns left and right of a ring
const BOTTOM_ROWS = 4           // wall + entrance below the last table
const MAX_SCALE = 0.5           // cells per source unit: stops a tiny cluster from being spread out
const WIDE_RATIO = 1.35

const finite = n => typeof n === 'number' && Number.isFinite(n)

/** Block size (in cells), orientation and chair slots' side counts for a table. */
export function tableDims(table) {
  const cap = Math.max(1, Math.min(MAX_SEATS, Math.floor(Number(table.capacity) || 0) || 1))
  const ratio = finite(table.w) && finite(table.h) && table.w > 0 && table.h > 0 ? table.w / table.h : null
  const round = table.shape === 'round'
  let orient = 'sq'
  if (!round) {
    if (ratio !== null) {
      if (ratio >= WIDE_RATIO) orient = 'h'
      else if (ratio <= 1 / WIDE_RATIO) orient = 'v'
    } else if (table.shape === 'rect') {
      orient = 'h'
    }
  }
  if (orient === 'sq') {
    // round tables start at 5x5 so the cut corners leave a readable octagon (a 3x3 would be a plus sign)
    const side = Math.max(round ? 5 : 3, 2 * Math.ceil(cap / 4) + 1)
    return { cap, orient, round, bw: side, bh: side }
  }
  const k = Math.ceil(cap / 2)
  const long = Math.max(5, 2 * k - 1)
  return orient === 'h'
    ? { cap, orient, round: false, bw: long, bh: 3 }
    : { cap, orient, round: false, bw: 3, bh: long }
}

/** Position of the k chairs on a side of length `len`: evenly spread, never on a corner. */
function spread(len, k) {
  return Array.from({ length: k }, (_, j) => Math.floor(((j + 0.5) * len) / k))
}

/**
 * Chairs of a table whose block starts at (col, row): [{ n, col, row }], n = 1..cap, numbered clockwise
 * from the top-left. The seat number is the same number the seat QR carries (`<code>-S<n>`).
 */
export function chairSlots(dims, col, row) {
  const { cap, orient, bw, bh } = dims
  // Work in a "wide" frame (u along the long side, v across) and map back for tall tables.
  const cu = orient === 'v' ? bh : bw
  const cv = orient === 'v' ? bw : bh
  const at = (u, v) => (orient === 'v' ? { col: col + v, row: row + u } : { col: col + u, row: row + v })

  const slots = [] // [u, v] in clockwise order
  if (orient === 'sq') {
    const base = Math.floor(cap / 4)
    const rem = cap % 4
    const top = base + (rem >= 1 ? 1 : 0)
    const bottom = base + (rem >= 2 ? 1 : 0)
    const right = base + (rem >= 3 ? 1 : 0)
    const left = base
    spread(cu, top).forEach(u => slots.push([u, -1]))
    spread(cv, right).forEach(v => slots.push([cu, v]))
    spread(cu, bottom).reverse().forEach(u => slots.push([u, cv]))
    spread(cv, left).reverse().forEach(v => slots.push([-1, v]))
  } else {
    const top = Math.ceil(cap / 2)
    const bottom = cap - top
    spread(cu, top).forEach(u => slots.push([u, -1]))
    spread(cu, bottom).reverse().forEach(u => slots.push([u, cv]))
  }
  return slots.map(([u, v], i) => ({ n: i + 1, ...at(u, v) }))
}

/** Occupancy grid of already placed rings, used to find a free spot for the next block. */
function makeGrid(cols) {
  const rows = []
  const row = r => (rows[r] || (rows[r] = new Uint8Array(cols)))
  return {
    free(c, r, w, h) { // is the w x h rect at (c, r) inside the grid and empty?
      if (c < 0 || r < 0 || c + w > cols) return false
      for (let y = r; y < r + h; y += 1) {
        const line = rows[y]
        if (!line) continue
        for (let x = c; x < c + w; x += 1) if (line[x]) return false
      }
      return true
    },
    mark(c, r, w, h) {
      for (let y = r; y < r + h; y += 1) {
        const line = row(y)
        for (let x = c; x < c + w; x += 1) line[x] = 1
      }
    },
  }
}

/** Nearest free spot for a ring of size w x h around (c0, r0): spiral outwards, one cell of air on every side. */
function findSpot(grid, c0, r0, w, h, minRow) {
  const maxCol = COLS - w - SIDE_PAD // ring columns stay inside [SIDE_PAD, maxCol]
  const fits = (c, r) => c >= SIDE_PAD && c <= maxCol && r >= minRow && grid.free(c - 1, r - 1, w + 2, h + 2)
  const clampC = Math.max(SIDE_PAD, Math.min(maxCol, c0))
  const startR = Math.max(minRow, r0)
  if (fits(clampC, startR)) return [clampC, startR]
  for (let d = 1; d <= 40; d += 1) {
    let best = null
    let bestDist = Infinity
    for (let dy = -d; dy <= d; dy += 1) {
      for (let dx = -d; dx <= d; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue
        const c = clampC + dx
        const r = startR + dy
        if (!fits(c, r)) continue
        const dist = dx * dx + dy * dy * 1.1
        if (dist < bestDist) { bestDist = dist; best = [c, r] }
      }
    }
    if (best) return best
  }
  // Crowded plan: first free spot in reading order below the start row (always ends below the last block).
  for (let r = startR; ; r += 1) {
    for (let c = SIDE_PAD; c <= maxCol; c += 1) if (fits(c, r)) return [c, r]
  }
}

const numeric = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true })

/**
 * @param {Array} tables  tables to lay out (already filtered by section)
 * @param {{ sectionOrder?: string[] }} [opts]  section ids in display order (used by the auto layout)
 */
export function layoutFloor(tables, opts = {}) {
  const sectionOrder = opts.sectionOrder || []
  const sectionRank = id => {
    const i = sectionOrder.indexOf(id)
    return i === -1 ? sectionOrder.length : i
  }

  const entries = tables.map(table => {
    const dims = tableDims(table)
    return { table, dims, ringW: dims.bw + 2, ringH: dims.bh + 2 }
  })
  const positioned = entries.filter(e => finite(e.table.x) && finite(e.table.y))
  const loose = entries
    .filter(e => !(finite(e.table.x) && finite(e.table.y)))
    .sort((a, b) => sectionRank(a.table.sectionId) - sectionRank(b.table.sectionId) || numeric(a.table.number, b.table.number))

  const grid = makeGrid(COLS)
  const placed = [] // { entry, col, row } (col/row = block top-left)

  if (positioned.length > 0) {
    // centres in source units
    const cx = e => e.table.x + (finite(e.table.w) ? e.table.w / 2 : 0)
    const cy = e => e.table.y + (finite(e.table.h) ? e.table.h / 2 : 0)
    const xs = positioned.map(cx)
    const ys = positioned.map(cy)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const widest = Math.max(...positioned.map(e => e.ringW))
    const tallest = Math.max(...positioned.map(e => e.ringH))
    const usable = COLS - 2 * (SIDE_PAD + Math.ceil(widest / 2))
    const rangeX = maxX - minX
    const scale = rangeX > 0 ? Math.min(MAX_SCALE, usable / rangeX) : MAX_SCALE
    const midX = (minX + maxX) / 2

    const wanted = positioned
      .map((entry, i) => ({
        entry,
        gx: COLS / 2 + (xs[i] - midX) * scale,
        gy: TOP_PAD + Math.ceil(tallest / 2) + (ys[i] - minY) * scale,
      }))
      .sort((a, b) => a.gy - b.gy || a.gx - b.gx)

    for (const { entry, gx, gy } of wanted) {
      const c0 = Math.round(gx - entry.ringW / 2)
      const r0 = Math.round(gy - entry.ringH / 2)
      const [c, r] = findSpot(grid, c0, r0, entry.ringW, entry.ringH, TOP_PAD - 1)
      grid.mark(c, r, entry.ringW, entry.ringH)
      placed.push({ entry, col: c + 1, row: r + 1 })
    }
  }

  if (loose.length > 0) {
    // Rows below everything else, left to right, a new row at every section change.
    let top = TOP_PAD - 1
    for (const p of placed) top = Math.max(top, p.row - 1 + p.entry.ringH + 1)
    if (placed.length > 0) top += 1
    let c = SIDE_PAD
    let r = top
    let lineH = 0
    let lastSection = loose[0].table.sectionId
    for (const entry of loose) {
      const sectionChanged = entry.table.sectionId !== lastSection
      if (c > SIDE_PAD && (sectionChanged || c + entry.ringW + SIDE_PAD > COLS)) {
        r += lineH + 1
        c = SIDE_PAD
        lineH = 0
      }
      lastSection = entry.table.sectionId
      placed.push({ entry, col: c + 1, row: r + 1 })
      c += entry.ringW + 1
      lineH = Math.max(lineH, entry.ringH)
    }
  }

  const items = placed.map(({ entry, col, row }) => ({
    id: entry.table.id,
    sectionId: entry.table.sectionId,
    col, row, bw: entry.dims.bw, bh: entry.dims.bh,
    orient: entry.dims.orient, round: entry.dims.round,
    cap: entry.dims.cap,
    chairs: chairSlots(entry.dims, col, row),
  }))

  const lastRow = items.reduce((m, it) => Math.max(m, it.row + it.bh + 1), TOP_PAD)
  const rows = lastRow + BOTTOM_ROWS
  const door = { col: Math.floor(COLS / 2) - 2, row: rows - 1, w: 4 }
  return { cols: COLS, rows, items, zones: sectionZones(items), door }
}

/** One dashed zone per section (the renderer looks the name up). Tries one cell of air around the rings, then none;
 *  when sections still interleave (zones would overlap) there are no zones at all. */
function sectionZones(items) {
  const ids = [...new Set(items.map(it => it.sectionId))]
  if (ids.length < 2) return []
  for (const pad of [1, 0]) {
    const zones = ids.map(id => {
      const mine = items.filter(it => it.sectionId === id)
      const c0 = Math.max(0, Math.min(...mine.map(it => it.col - 1)) - pad)
      const r0 = Math.max(0, Math.min(...mine.map(it => it.row - 1)) - 1 - pad) // one more row for the name
      const c1 = Math.min(COLS, Math.max(...mine.map(it => it.col + it.bw + 1)) + pad)
      const r1 = Math.max(...mine.map(it => it.row + it.bh + 1)) + pad
      return { id, col: c0, row: r0, w: c1 - c0, h: r1 - r0 }
    })
    const overlap = zones.some((a, i) => zones.some((b, j) => j > i
      && a.col < b.col + b.w && b.col < a.col + a.w && a.row < b.row + b.h && b.row < a.row + a.h))
    if (!overlap) return zones
  }
  return []
}
