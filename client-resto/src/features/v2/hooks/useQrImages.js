import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { tableQrUrl } from '../../../lib/qr'
import { qrDataUrl } from '../qrImage'

const CHUNK = 6

/**
 * Generates QR images for `tables` ({ id, code }: table cards and seat cards from
 * qrCards.js, `code` is the table code or `<code>-S<n>`) in chunks of 6 so the page
 * stays responsive. `images[id]` is a PNG data URL, 'error' or undefined
 * (pending). `progress` is { done, total } while generating, else null.
 * `retry(id)` regenerates one failed card.
 * An image is tied to the code it was made for: when a card's code changes (codes rotated) its old image is
 * dropped from `images` and made again, so a dead QR is never shown or printed.
 */
export default function useQrImages(tables, enabled) {
  const [made, setMade] = useState({}) // id -> { code, src }
  const [progress, setProgress] = useState(null)
  const [tick, setTick] = useState(0)
  const madeRef = useRef(made)
  madeRef.current = made
  const tablesRef = useRef(tables)
  tablesRef.current = tables
  const key = tables.map(t => `${t.id}:${t.code}`).join('|')

  useEffect(() => {
    if (!enabled) return undefined
    const todo = tablesRef.current.filter(tb => madeRef.current[tb.id]?.code !== tb.code)
    if (todo.length === 0) {
      setProgress(null)
      return undefined
    }
    let cancelled = false
    ;(async () => {
      setProgress({ done: 0, total: todo.length })
      for (let i = 0; i < todo.length; i += CHUNK) {
        const results = await Promise.all(todo.slice(i, i + CHUNK).map(async tb => {
          try {
            return [tb.id, { code: tb.code, src: await qrDataUrl(tableQrUrl(tb.code)) }]
          } catch {
            return [tb.id, { code: tb.code, src: 'error' }]
          }
        }))
        if (cancelled) return
        setMade(prev => ({ ...prev, ...Object.fromEntries(results) }))
        setProgress({ done: Math.min(i + CHUNK, todo.length), total: todo.length })
        await new Promise(resolve => setTimeout(resolve, 0)) // let the UI paint between chunks
      }
      if (!cancelled) setProgress(null)
    })()
    return () => { cancelled = true }
  }, [key, enabled, tick])

  // Only images made for the code each card has right now (`key` changes with any id or code).
  const images = useMemo(() => {
    const out = {}
    for (const tb of tablesRef.current) {
      const entry = made[tb.id]
      if (entry && entry.code === tb.code) out[tb.id] = entry.src
    }
    return out
  }, [made, key])

  const retry = useCallback(id => {
    setMade(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setTick(n => n + 1)
  }, [])

  return { images, progress, retry }
}
