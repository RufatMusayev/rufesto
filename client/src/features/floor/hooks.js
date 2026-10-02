import { useEffect, useLayoutEffect, useState } from 'react'
import { fetchMySeat } from './api'

const MIN_CELL = 6
const MAX_CELL = 14

/** Whole-pixel cell size so `cols` cells fill the width of `ref` (crisp pixel art needs integer cells). */
export function useCellSize(ref, cols) {
  const [cell, setCell] = useState(10)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const measure = () => {
      const width = el.clientWidth
      if (width > 0) setCell(Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor(width / cols))))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure)
      return () => window.removeEventListener('resize', measure)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, cols])
  return cell
}

/**
 * Where the guest sits, from my_table_session() (the local cart session only knows the table, not the chair).
 * Returns { tableId, seatNo|null } or null. Only asked while the guest holds a table session.
 */
export function useMySeat(sessionTableId) {
  const [seat, setSeat] = useState(null)
  useEffect(() => {
    if (!sessionTableId) { setSeat(null); return undefined }
    let cancelled = false
    fetchMySeat().then(res => { if (!cancelled) setSeat(res) })
    return () => { cancelled = true }
  }, [sessionTableId])
  return seat
}
