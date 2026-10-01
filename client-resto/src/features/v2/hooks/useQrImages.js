import { useCallback, useEffect, useRef, useState } from 'react'
import { tableQrUrl } from '../../../lib/qr'
import { qrDataUrl } from '../qrImage'

const CHUNK = 6

/**
 * Generates QR images for `tables` ({ id, code }) in chunks of 6 so the page
 * stays responsive. `images[id]` is a PNG data URL, 'error' or undefined
 * (pending). `progress` is { done, total } while generating, else null.
 * `retry(id)` regenerates one failed card.
 */
export default function useQrImages(tables, enabled) {
  const [images, setImages] = useState({})
  const [progress, setProgress] = useState(null)
  const [tick, setTick] = useState(0)
  const imagesRef = useRef(images)
  imagesRef.current = images
  const tablesRef = useRef(tables)
  tablesRef.current = tables
  const key = tables.map(t => `${t.id}:${t.code}`).join('|')

  useEffect(() => {
    if (!enabled) return undefined
    const todo = tablesRef.current.filter(tb => !imagesRef.current[tb.id])
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
            return [tb.id, await qrDataUrl(tableQrUrl(tb.code))]
          } catch {
            return [tb.id, 'error']
          }
        }))
        if (cancelled) return
        setImages(prev => ({ ...prev, ...Object.fromEntries(results) }))
        setProgress({ done: Math.min(i + CHUNK, todo.length), total: todo.length })
        await new Promise(resolve => setTimeout(resolve, 0)) // let the UI paint between chunks
      }
      if (!cancelled) setProgress(null)
    })()
    return () => { cancelled = true }
  }, [key, enabled, tick])

  const retry = useCallback(id => {
    setImages(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setTick(n => n + 1)
  }, [])

  return { images, progress, retry }
}
