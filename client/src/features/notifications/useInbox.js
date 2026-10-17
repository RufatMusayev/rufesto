import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchInbox, markRead, markAllRead, markAllSeen } from './api'
import { onInboxInsert, refreshBadge } from './badge'
import { signPostPhotos } from '../social/lib/postPhotos'
import { thumbOfItem } from '../../lib/notificationView'

const PAGE = 30

/**
 * The guest inbox for one filter (`category` null = All): grouped items, the unread count, paging, optimistic
 * "read" updates and a silent refresh when a new row arrives over the realtime channel (badge.js owns that channel).
 * Each filter keeps its first page while the page is open, so switching chips paints at once and then refreshes.
 */
export default function useInbox(category) {
  const key = category || 'all'
  const cache = useRef(new Map())                 // filter -> { items, unread, next }
  const req = useRef(0)                           // only the newest request may write
  const [view, setView] = useState({ items: [], unread: 0, next: null, status: 'loading' })
  const [loadingMore, setLoadingMore] = useState(false)

  const load = useCallback(async () => {
    const id = ++req.current
    const { data, error } = await fetchInbox({ category, limit: PAGE })
    if (id !== req.current) return
    if (error) {
      setView(v => (v.status === 'ready' ? v : { items: [], unread: 0, next: null, status: 'error' }))
      return
    }
    cache.current.set(key, data)
    setView({ items: data.items, unread: data.unread, next: data.nextCursor, status: 'ready' })
  }, [category, key])

  // first load and every filter change: cached page at once if there is one, else the skeleton
  useEffect(() => {
    const hit = cache.current.get(key)
    if (hit) setView({ items: hit.items, unread: hit.unread, next: hit.nextCursor, status: 'ready' })
    else setView({ items: [], unread: 0, next: null, status: 'loading' })
    load()
    return () => { req.current += 1 }
  }, [key, load])

  // a new row while the page is open: show it, keep the bell at 0
  useEffect(() => {
    let t
    const off = onInboxInsert(() => {
      clearTimeout(t)
      t = setTimeout(() => { load(); markAllSeen() }, 400)
    })
    return () => { off(); clearTimeout(t) }
  }, [load])

  const loadMore = useCallback(async () => {
    if (loadingMore || !view.next) return
    setLoadingMore(true)
    const id = req.current
    const { data, error } = await fetchInbox({ category, cursor: view.next, limit: PAGE })
    setLoadingMore(false)
    if (id !== req.current || error || !data) return
    setView(v => {
      const seen = new Set(v.items.map(i => i.id))
      return { ...v, items: [...v.items, ...data.items.filter(i => !seen.has(i.id))], next: data.nextCursor }
    })
  }, [category, loadingMore, view.next])

  /** Mark one item (all the rows of its group) read. Instant on screen; a failed write reloads the truth. */
  const read = useCallback(item => {
    if (item.read) return
    cache.current.clear()
    setView(v => ({
      ...v,
      items: v.items.map(i => (i.id === item.id ? { ...i, read: true } : i)),
      unread: Math.max(0, v.unread - 1),
    }))
    markRead(item.ids).then(({ error }) => { if (error) load(); refreshBadge() })
  }, [load])

  const readAll = useCallback(() => {
    setView(v => ({ ...v, items: v.items.map(i => ({ ...i, read: true })), unread: 0 }))
    cache.current.clear()
    markAllRead().then(({ error }) => { if (error) load(); refreshBadge() })
  }, [load])

  return { ...view, loadingMore, loadMore, read, readAll, reload: load }
}

/** Signed URLs for the post photos the items' payloads carry (the bucket is private): Map(path -> url | null). */
export function useThumbUrls(items) {
  const [urls, setUrls] = useState(() => new Map())
  useEffect(() => {
    const paths = []
    for (const it of items) {
      const th = thumbOfItem(it)
      if (th && th.path) paths.push(th.path)
    }
    if (!paths.length) return undefined
    let alive = true
    signPostPhotos(paths).then(m => { if (alive) setUrls(prev => new Map([...prev, ...m])) })
    return () => { alive = false }
  }, [items])
  return urls
}
