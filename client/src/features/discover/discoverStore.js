// Discover data kept outside React (docs/V2-CONTRACT.md 18.5): one answer per viewer + location + cuisine,
// so switching tabs, leaving Home and coming back, or picking a cuisine chip again never refetches while the
// answer is fresh. Also holds the follow / like state of restaurant cards (shared by every rail and the list).
import { createStore } from '../feed/store'
import { resetImpressions } from '../feed/useFeedEvents'
import { getDiscover, getRestaurantLikes, setFollow, setRestaurantLike } from './api'

const STALE_MS = 5 * 60 * 1000          // a tab that comes back after this long refreshes in the background
const MAX_ENTRIES = 8                   // answers kept (viewer x location x cuisine)

export const discoverStore = createStore({
  entries: {},                          // key -> { status, data, error, loadedAt, refreshing }
  cuisine: null,                        // the selected chip (null = All)
  chips: [],                            // [{ key, count }] from the unfiltered answer
  follows: {},                          // restaurant id -> desired follow state (optimistic, this viewer)
  likes: { userId: null, counts: {}, mine: {}, asked: {} },
})

export const discoverKey = ({ userId, lat, lng, cuisine }) =>
  `${userId || 'anon'}|${lat ?? ''},${lng ?? ''}|${(cuisine || '').toLowerCase()}`

const inflight = new Map()
let lastUser

/** The viewer the last request was made for (known from the stored session before AuthContext has finished). */
export const currentViewer = () => lastUser ?? null

function put(key, patch) {
  discoverStore.update(s => {
    const entries = { ...s.entries, [key]: { ...(s.entries[key] || {}), ...patch } }
    const keys = Object.keys(entries)
    if (keys.length > MAX_ENTRIES) {                         // drop the oldest answers, never the one just written
      keys.filter(k => k !== key)
        .sort((a, b) => (entries[a].loadedAt || 0) - (entries[b].loadedAt || 0))
        .slice(0, keys.length - MAX_ENTRIES)
        .forEach(k => delete entries[k])
    }
    return { ...s, entries }
  })
}

async function loadEngagement(ids, userId) {
  const owner = userId || null
  if (discoverStore.get().likes.userId !== owner) {
    discoverStore.set({ likes: { userId: owner, counts: {}, mine: {}, asked: {} } })
  }
  const todo = ids.filter(id => !discoverStore.get().likes.asked[id])
  if (!todo.length) return
  discoverStore.update(s => ({
    ...s, likes: { ...s.likes, asked: { ...s.likes.asked, ...Object.fromEntries(todo.map(id => [id, true])) } },
  }))
  const { counts, mine } = await getRestaurantLikes(todo, owner)
  discoverStore.update(s => (s.likes.userId !== owner ? s : {
    ...s, likes: { ...s.likes, counts: { ...counts, ...s.likes.counts }, mine: { ...mine, ...s.likes.mine } },
  }))
}

async function run(key, args, silent) {
  put(key, silent ? { refreshing: true } : { status: 'loading', error: null, data: null, refreshing: false })
  const { data, error } = await getDiscover(args)
  if (error) {
    put(key, silent ? { refreshing: false } : { status: 'error', error })
    return
  }
  resetImpressions('discover')
  // a quiet refresh that brings the same answer keeps the object on screen: nothing under it re-renders
  const was = discoverStore.get().entries[key]?.data
  const same = silent && was && JSON.stringify(was) === JSON.stringify(data)
  put(key, { status: 'ready', data: same ? was : data, error: null, refreshing: false, loadedAt: Date.now() })
  if (!args.cuisine || !discoverStore.get().chips.length) discoverStore.set({ chips: data.cuisines })
  loadEngagement(data.allRestaurants.map(r => r.id), args.userId)
}

function start(key, args, silent) {
  const p = run(key, args, silent).then(() => { inflight.delete(key) })
  inflight.set(key, p)
  return p
}

/**
 * Makes sure the Discover answer for { userId, lat, lng, cuisine } is loaded. Fresh: nothing. Loading: joins
 * the call in flight. Failed earlier: tries again. Stale: refreshes in the background (the old answer stays).
 */
export function ensureDiscover(args, { maxAge = STALE_MS } = {}) {
  const key = discoverKey(args)
  if ((args.userId || null) !== lastUser) {
    lastUser = args.userId || null
    discoverStore.set({ follows: {} })
  }
  const e = discoverStore.get().entries[key]
  if (e?.status === 'loading') return inflight.get(key)
  const silent = e?.status === 'ready'
  if (silent && (Date.now() - e.loadedAt <= maxAge || e.refreshing)) return Promise.resolve()
  return start(key, args, silent)
}

/** Changes fields of a top review that is in an answer (a like or reply made on its card), so it shows after a remount. */
export function patchDiscoverReview(id, partial) {
  discoverStore.update(s => {
    let hit = false
    const entries = {}
    for (const [k, e] of Object.entries(s.entries)) {
      const list = e.data?.topReviews
      const at = list ? list.findIndex(r => r.id === id) : -1
      if (at < 0 || Object.keys(partial).every(f => list[at][f] === partial[f])) { entries[k] = e; continue }
      hit = true
      const topReviews = list.map((r, i) => (i === at ? { ...r, ...partial } : r))
      entries[k] = { ...e, data: { ...e.data, topReviews } }
    }
    return hit ? { ...s, entries } : s
  })
}

/** The viewer's follows or friends changed: every answer refreshes quietly on its next visit (the old one stays until then). */
export function invalidateDiscover() {
  discoverStore.update(s => {
    const entries = {}
    for (const [k, e] of Object.entries(s.entries)) entries[k] = e.status === 'ready' ? { ...e, loadedAt: 0 } : e
    return { ...s, entries }
  })
}

/** Reload the answer for these args now (the retry button). */
export const reloadDiscover = args => start(discoverKey(args), args, false)

export const setCuisine = cuisine => discoverStore.set({ cuisine: cuisine || null })

/** Follow / unfollow with an optimistic update; resolves true when the server accepted it. */
export async function toggleFollow(restaurantId, userId, wasOn) {
  discoverStore.update(s => ({ ...s, follows: { ...s.follows, [restaurantId]: !wasOn } }))
  const { error } = await setFollow(userId, restaurantId, !wasOn)
  if (error) discoverStore.update(s => ({ ...s, follows: { ...s.follows, [restaurantId]: wasOn } }))
  return !error
}

/** Like / unlike a restaurant with an optimistic update; resolves true when the server accepted it. */
export async function toggleLike(restaurantId, userId, wasOn) {
  const move = on => discoverStore.update(s => ({
    ...s,
    likes: {
      ...s.likes,
      mine: { ...s.likes.mine, [restaurantId]: on },
      counts: { ...s.likes.counts, [restaurantId]: Math.max(0, (s.likes.counts[restaurantId] || 0) + (on ? 1 : -1)) },
    },
  }))
  move(!wasOn)
  const { error } = await setRestaurantLike(userId, restaurantId, !wasOn)
  if (error) move(wasOn)
  return !error
}
