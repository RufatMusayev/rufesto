import { useCallback, useEffect, useRef, useState } from 'react'
import {
  listFriends, listRequests, respondFriendRequest, cancelFriendRequest, removeFriend, subscribeFriendships,
  countIncomingRequests, countFriends,
} from './api'
import { useOnVisible } from './hooks'
import { SOCIAL_WRITE_EVENT } from '../../lib/supabase'

const EMPTY = { friends: [], incoming: [], outgoing: [], loading: true, error: null }

/**
 * Friends + requests of the signed-in guest, kept live through the friendships channel.
 * The mutation helpers update the lists at once and reload from the server on failure.
 */
export function useFriendsData(userId) {
  const [state, setState] = useState(EMPTY)
  const seq = useRef(0)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!userId) return
    const mine = ++seq.current
    if (!silent) setState(s => ({ ...s, loading: true, error: null }))
    const [f, r] = await Promise.all([listFriends(), listRequests()])
    if (mine !== seq.current) return
    const error = f.error || r.error
    if (error) {
      // a silent refresh that fails keeps what is on screen
      setState(s => (silent ? s : { ...s, loading: false, error }))
      return
    }
    setState({ friends: f.data, incoming: r.data.incoming, outgoing: r.data.outgoing, loading: false, error: null })
  }, [userId])

  useEffect(() => {
    if (!userId) { setState(EMPTY); return undefined }
    load()
    let timer = null
    const off = subscribeFriendships(userId, () => {
      clearTimeout(timer)
      timer = setTimeout(() => load({ silent: true }), 400)
    })
    return () => { clearTimeout(timer); off(); seq.current++ }
  }, [userId, load])

  useOnVisible(() => load({ silent: true }), 15000)

  const patch = fn => setState(s => ({ ...s, ...fn(s) }))

  const accept = useCallback(async req => {
    patch(s => ({
      incoming: s.incoming.filter(x => x.id !== req.id),
      friends: [{ friendshipId: req.id, userId: req.userId, name: req.name, photo: req.photo, since: new Date().toISOString() }, ...s.friends],
    }))
    const { error } = await respondFriendRequest(req.id, true)
    if (error) load({ silent: true })
    return { error }
  }, [load])

  const decline = useCallback(async req => {
    patch(s => ({ incoming: s.incoming.filter(x => x.id !== req.id) }))
    const { error } = await respondFriendRequest(req.id, false)
    if (error) load({ silent: true })
    return { error }
  }, [load])

  const cancel = useCallback(async req => {
    patch(s => ({ outgoing: s.outgoing.filter(x => x.id !== req.id) }))
    const { error } = await cancelFriendRequest(req.id)
    if (error) load({ silent: true })
    return { error }
  }, [load])

  const unfriend = useCallback(async friend => {
    const { error } = await removeFriend(friend.userId)
    if (error) return { error }
    patch(s => ({ friends: s.friends.filter(x => x.userId !== friend.userId) }))
    return { error: null }
  }, [])

  return { ...state, reload: load, accept, decline, cancel, unfriend }
}

/**
 * How many friends the viewer has (accepted friendships): null until known, or signed out. Read once, again when
 * `active` turns true (the Friends tab is shown) and after any friend write made in this app (a request accepted,
 * a friend removed). One HEAD count request each time.
 */
export function useFriendCount(userId, active = true) {
  const [count, setCount] = useState(null)
  useEffect(() => {
    if (!userId) { setCount(null); return undefined }
    if (!active) return undefined
    let alive = true
    const refresh = () => countFriends(userId).then(({ data }) => { if (alive && data != null) setCount(data) })
    refresh()
    const onWrite = e => { if (e.detail === 'friend') refresh() }
    window.addEventListener(SOCIAL_WRITE_EVENT, onWrite)
    return () => { alive = false; window.removeEventListener(SOCIAL_WRITE_EVENT, onWrite) }
  }, [userId, active])
  return count
}

/** Number of incoming friend requests (live), for the Profile row badge. */
export function useIncomingCount(userId) {
  const [count, setCount] = useState(0)
  useEffect(() => {
    if (!userId) { setCount(0); return undefined }
    let alive = true
    let timer = null
    const refresh = () => countIncomingRequests(userId).then(({ data }) => { if (alive && data != null) setCount(data) })
    refresh()
    const off = subscribeFriendships(userId, () => { clearTimeout(timer); timer = setTimeout(refresh, 400) })
    return () => { alive = false; clearTimeout(timer); off() }
  }, [userId])
  return count
}
