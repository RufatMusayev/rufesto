import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchInbox, markRead, markAllSeen } from './api'
import { onInboxInsert, refreshBadge } from './badge'
import { signSmallPhotos } from '../social/lib/postPhotos'
import { respondFriendRequest } from '../social/api'
import { thumbOfItem } from '../../lib/notificationView'
import { tap } from '../../lib/haptics'

const PAGE = 30
const LEAVE_MS = 200            // a deleted friend request collapses in this long (styles.css .is-leaving)
const FADE_MS = 160             // the Confirm / Delete buttons fade away after Confirm

/**
 * The guest inbox (docs/UX-PLAN-2026-10-18.md 2): grouped items, paging, a silent refresh when a new row arrives over the realtime
 * channel (badge.js owns that channel) and the friend-request actions.
 *  - "New" is a snapshot: an item that was unseen when it first reached this page keeps `isNew` while the page is open, even
 *    though opening the inbox marks everything seen a moment later.
 *  - Confirm / Delete answer the request from the row (optimistic; a failure puts the row back and reports it).
 * Items of an answered-and-gone request (declined / cancelled) are never listed.
 */
export default function useInbox() {
  const req = useRef(0)                           // only the newest request may write
  const fresh = useRef(new Set())                 // ids shown under "New"
  const [view, setView] = useState({ items: [], next: null, status: 'loading' })
  const [loadingMore, setLoadingMore] = useState(false)

  const take = useCallback(items => {
    for (const it of items) if (!it.seen) fresh.current.add(it.id)
    return items.filter(i => i.friendStatus !== 'gone').map(i => ({ ...i, isNew: fresh.current.has(i.id) }))
  }, [])

  const load = useCallback(async () => {
    const id = ++req.current
    const { data, error } = await fetchInbox({ limit: PAGE })
    if (id !== req.current) return null
    if (error) {
      setView(v => (v.status === 'ready' ? v : { items: [], next: null, status: 'error' }))
      return error
    }
    setView({ items: take(data.items), next: data.nextCursor, status: 'ready' })
    // looking at the list is what clears the bell: after the first read of the unseen rows
    if (data.items.some(i => !i.seen)) markAllSeen().then(() => refreshBadge())
    return null
  }, [take])

  useEffect(() => {
    load()
    return () => { req.current += 1 }
  }, [load])

  // a new row while the page is open: show it, keep the bell at 0
  useEffect(() => {
    let t
    const off = onInboxInsert(() => {
      clearTimeout(t)
      t = setTimeout(() => load(), 400)
    })
    return () => { off(); clearTimeout(t) }
  }, [load])

  const loadMore = useCallback(async () => {
    if (loadingMore || !view.next) return
    setLoadingMore(true)
    const id = req.current
    const { data, error } = await fetchInbox({ cursor: view.next, limit: PAGE })
    setLoadingMore(false)
    if (id !== req.current || error || !data) return
    const more = take(data.items)
    setView(v => {
      const seen = new Set(v.items.map(i => i.id))
      return { ...v, items: [...v.items, ...more.filter(i => !seen.has(i.id))], next: data.nextCursor }
    })
  }, [loadingMore, view.next, take])

  const patch = useCallback((id, partial) => {
    setView(v => ({ ...v, items: v.items.map(i => (i.id === id ? { ...i, ...partial } : i)) }))
  }, [])

  /** Mark one item (all the rows of its group) read. Instant on screen; a failed write is retried by the next visit. */
  const read = useCallback(item => {
    if (item.read) return
    patch(item.id, { read: true })
    markRead(item.ids).then(() => refreshBadge())
  }, [patch])

  /** Confirm an incoming friend request. Resolves { error } (null on success). */
  const confirm = useCallback(async item => {
    tap(8)
    patch(item.id, { friendStatus: 'accepted', fading: true, read: true })
    setTimeout(() => patch(item.id, { fading: false }), FADE_MS)
    const { error } = await respondFriendRequest(item.friendshipId, true)
    if (error) {
      patch(item.id, { friendStatus: 'pending', fading: false, read: false })
      return { error }
    }
    markRead(item.ids).then(() => refreshBadge())
    return { error: null }
  }, [patch])

  /** Delete an incoming friend request: the row collapses at once. */
  const decline = useCallback(async item => {
    patch(item.id, { leaving: true, read: true })
    const gone = setTimeout(() => setView(v => ({ ...v, items: v.items.filter(i => i.id !== item.id) })), LEAVE_MS)
    const { error } = await respondFriendRequest(item.friendshipId, false)
    if (error) {
      clearTimeout(gone)
      patch(item.id, { leaving: false, read: false })
      return { error }
    }
    markRead(item.ids).then(() => refreshBadge())
    return { error: null }
  }, [patch])

  return { ...view, loadingMore, loadMore, read, confirm, decline, reload: load }
}

/** Signed URLs for the storage paths the items' thumbnails name (the post-photos bucket is private): Map(path -> url | null). */
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
    signSmallPhotos(paths).then(m => { if (alive) setUrls(prev => new Map([...prev, ...m])) })
    return () => { alive = false }
  }, [items])
  return urls
}
