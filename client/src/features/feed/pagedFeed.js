// Exclusion-paged feed kept outside React (docs/V2-CONTRACT.md 17.3 / 18.1 / 18.5). One instance per tab
// (feeds.js). The first page, the pages after it and the "already loaded" state live here, so:
//  - a tab that is hidden, unmounted or mounted again never refetches (ensure() is a no-op while the data
//    is for the same viewer + location and younger than `maxAge`),
//  - the first request can start before any component mounts (prefetch.js),
//  - the pages after the first load in the background (loadMore() is called when the viewer is 3 cards
//    from the end).
// A page answers { items, exclude, caughtUp, radiusKm }; the next page sends back `exclude`.
import { createStore } from './store'
import { MAX_EXCLUDE } from './api'

export const PAGE_SIZE = 20
const STALE_MS = 5 * 60 * 1000          // a tab that comes back after this long refreshes in the background

const blank = () => ({
  key: null, args: null, items: [], exclude: [], caughtUp: false, radiusKm: null, pageStart: 0,
  status: 'idle',                        // 'idle' | 'loading' | 'ready' | 'error'
  error: null, loadedAt: 0, loadedIso: null, refreshing: false,
  more: { loading: false, error: false },
})

const keyOf = it => `${it.kind}-${it.id}`
// `position` sent with every event is the 1-based index across the whole loaded list (page 2 starts at 21),
// not the server's per-page slot, so positions stay comparable between pages.
const numbered = (items, offset) => items.map((it, i) => ({ ...it, position: offset + i + 1 }))

/** The viewer + location a loaded list belongs to: a different one means a different answer. */
export const viewKey = ({ userId, lat, lng }) => `${userId || 'anon'}|${lat ?? ''},${lng ?? ''}`

export function createPagedFeed({ fetchPage, onFresh }) {
  const store = createStore(blank())
  let seq = 0                            // a load or reload bumps it; answers of older calls are dropped
  let pending = Promise.resolve()

  async function load(args, { silent = false } = {}) {
    const mine = ++seq
    const key = viewKey(args)
    const keep = silent && store.get().key === key && store.get().items.length > 0
    store.update(s => (keep
      ? { ...s, args, refreshing: true, error: null }
      : { ...blank(), key, args, status: 'loading' }))
    const iso = new Date().toISOString()
    const { data, error } = await fetchPage({ lat: args.lat, lng: args.lng, exclude: [], limit: PAGE_SIZE })
    if (mine !== seq) return
    if (error) {
      store.update(s => (keep ? { ...s, refreshing: false, more: { loading: false, error: false } } : { ...blank(), key, args, status: 'error', error }))
      return
    }
    onFresh?.()
    store.set({
      items: numbered(data.items, 0),
      exclude: data.exclude,
      caughtUp: data.caughtUp || data.exclude.length > MAX_EXCLUDE,
      radiusKm: data.radiusKm ?? null,
      pageStart: 0, status: 'ready', error: null, refreshing: false,
      loadedAt: Date.now(), loadedIso: iso, more: { loading: false, error: false },
    })
  }

  return {
    store,

    /**
     * Makes sure the list for { userId, lat, lng } is loaded. Same viewer + location and still fresh: nothing.
     * Loading: joins the call in flight. Failed earlier: tries again. Stale: refreshes in the background
     * (the old list stays on screen until the new first page arrives).
     */
    ensure(args, { maxAge = STALE_MS } = {}) {
      const s = store.get()
      if (s.key === viewKey(args) && s.status !== 'error') {
        if (s.status === 'loading') return pending
        if (s.status === 'ready') {
          if (Date.now() - s.loadedAt <= maxAge || s.refreshing) return pending
          return (pending = load(args, { silent: true }))
        }
      }
      return (pending = load(args))
    },

    /** Starts over with the same viewer + location (the new-posts pill, the retry button). */
    reload() {
      const { args } = store.get()
      return args ? (pending = load(args)) : pending
    },

    /** The next page; a no-op while one is loading or after caught up. */
    async loadMore() {
      const s = store.get()
      if (s.status !== 'ready' || s.caughtUp || s.more.loading) return
      const mine = seq
      store.set({ more: { loading: true, error: false } })
      const { data, error } = await fetchPage({ lat: s.args.lat, lng: s.args.lng, exclude: s.exclude, limit: PAGE_SIZE })
      if (mine !== seq) return           // the feed reloaded meanwhile: this page is stale
      if (error) { store.set({ more: { loading: false, error: true } }); return }
      store.update(cur => {
        const seen = new Set(cur.items.map(keyOf))
        const fresh = data.items.filter(i => !seen.has(keyOf(i)))
        return {
          ...cur,
          items: [...cur.items, ...numbered(fresh, cur.items.length)],
          pageStart: cur.items.length,
          exclude: data.exclude,
          // an empty page, or the server's 300-id exclusion cap reached, ends the ranked list
          caughtUp: data.caughtUp || fresh.length === 0 || data.exclude.length > MAX_EXCLUDE,
          radiusKm: data.radiusKm ?? cur.radiusKm,
          more: { loading: false, error: false },
        }
      })
    },

    /** Marks the loaded list stale: the next ensure() refreshes it in the background (the old list stays until then). */
    invalidate() { store.set({ loadedAt: 0 }) },

    /** Drops a deleted post from the list. */
    remove(id) {
      store.update(s => ({ ...s, items: s.items.filter(i => !(i.kind === 'post' && i.id === id)) }))
    },

    /** Forgets everything (sign-out): the next ensure() loads from scratch. */
    clear() { seq++; store.set(blank()) },
  }
}
