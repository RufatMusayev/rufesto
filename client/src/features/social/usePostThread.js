import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getPost, listComments, addComment, deleteComment, subscribeComments,
} from './api'
import { useOnVisible } from './hooks'

const byTime = (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
const merge = (...lists) => {
  const map = new Map()
  for (const c of lists.flat()) map.set(c.id, { ...map.get(c.id), ...c })
  return [...map.values()].sort(byTime)
}

/**
 * One post and its comments (oldest first). Comments are live through the post_comments
 * channel of this post; adding appends at once and is reverted if the server refuses.
 * `seed` is a feed item passed through router state so the card renders without a round trip.
 */
export function usePostThread({ id, userId, seed, authLoading, me }) {
  const [post, setPost] = useState(seed || null)
  const [postState, setPostState] = useState(seed ? 'ready' : 'loading')   // loading | ready | missing | error
  const [comments, setComments] = useState([])
  const [cs, setCs] = useState({ loading: true, error: null, nextCursor: null, loadingMore: false })
  const [attempt, setAttempt] = useState(0)
  const seq = useRef(0)
  const shown = useRef([])        // ids on screen, so a realtime DELETE of one we already removed is ignored
  shown.current = comments

  // ---- the post
  useEffect(() => {
    if (authLoading) return undefined
    let alive = true
    if (!seed) setPostState('loading')
    getPost(id).then(({ data, error }) => {
      if (!alive) return
      if (error) {
        if (!seed) setPostState('error')
        return
      }
      if (!data) { setPost(null); setPostState('missing'); return }
      setPost(data)
      setPostState('ready')
    })
    return () => { alive = false }
  }, [id, userId, authLoading, attempt, seed])

  // ---- comments (post_comments is readable signed-out too; only writing needs an account)
  const loadComments = useCallback(async () => {
    const mine = ++seq.current
    setCs(s => ({ ...s, loading: true, error: null }))
    const { data, error } = await listComments(id, { limit: 30 })
    if (mine !== seq.current) return
    if (error) { setCs(s => ({ ...s, loading: false, error })); return }
    setComments(data.items.slice().sort(byTime))
    setCs({ loading: false, error: null, nextCursor: data.nextCursor, loadingMore: false })
  }, [id])

  useEffect(() => {
    if (authLoading || postState !== 'ready') return
    loadComments()
  }, [authLoading, postState, loadComments])

  const loadEarlier = useCallback(async () => {
    if (!cs.nextCursor || cs.loadingMore) return
    setCs(s => ({ ...s, loadingMore: true }))
    const { data, error } = await listComments(id, { cursor: cs.nextCursor, limit: 30 })
    if (error) { setCs(s => ({ ...s, loadingMore: false, error })); return }
    setComments(c => merge(data.items, c))
    setCs(s => ({ ...s, loadingMore: false, error: null, nextCursor: data.nextCursor }))
  }, [id, cs.nextCursor, cs.loadingMore])

  // ---- realtime + tab visibility: merge the newest page into what is on screen
  const refreshLatest = useCallback(async () => {
    const { data } = await listComments(id, { limit: 30 })
    if (!data) return
    setComments(c => merge(c, data.items))
    setPost(p => (p ? { ...p, commentCount: Math.max(p.commentCount, data.items.length) } : p))
  }, [id])

  useEffect(() => {
    if (!userId || postState !== 'ready') return undefined
    let timer = null
    const off = subscribeComments(id, ev => {
      if (ev.type === 'DELETE' && ev.id) {
        if (!shown.current.some(x => x.id === ev.id)) return
        setComments(c => c.filter(x => x.id !== ev.id))
        setPost(p => (p ? { ...p, commentCount: Math.max(0, p.commentCount - 1) } : p))
        return
      }
      clearTimeout(timer)
      timer = setTimeout(refreshLatest, 200)
    })
    return () => { clearTimeout(timer); off() }
  }, [id, userId, postState, refreshLatest])

  useOnVisible(() => { if (postState === 'ready') refreshLatest() }, 15000)

  // ---- writes
  const send = useCallback(async body => {
    const temp = {
      id: `tmp-${Date.now()}`, user: { id: userId, name: me?.name || null, photo: me?.photo || null },
      body, createdAt: new Date().toISOString(), mine: true, pending: true,
    }
    setComments(c => [...c, temp])
    const { data, error } = await addComment(id, body)
    if (error) {
      setComments(c => c.filter(x => x.id !== temp.id))
      return { error }
    }
    setComments(c => merge(c.filter(x => x.id !== temp.id), [{ ...temp, id: data.id, createdAt: data.createdAt, pending: false }]))
    setPost(p => (p ? { ...p, commentCount: data.commentCount } : p))
    return { error: null }
  }, [id, userId, me?.name, me?.photo])

  const remove = useCallback(async comment => {
    const { error } = await deleteComment(comment.id)
    if (error) return { error }
    setComments(c => c.filter(x => x.id !== comment.id))
    setPost(p => (p ? { ...p, commentCount: Math.max(0, p.commentCount - 1) } : p))
    return { error: null }
  }, [])

  return {
    post, postState, comments, commentState: cs,
    retryPost: () => setAttempt(a => a + 1), retryComments: loadComments, loadEarlier, send, remove,
  }
}
