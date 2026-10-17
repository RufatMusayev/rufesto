// The Search brain (UX plan 3.6): debounce 150 ms, one AbortController per request, an LRU of 30 answers, instant
// local matches from the cached discover() answer while the server answers, and skeletons only when there is
// nothing at all to show after 250 ms.
//
// Modes by what the box and the filters say:
//   zero    no text, no filters            -> the Discover zero state (not this hook's rows)
//   local   exactly one letter             -> local matches only (the server ignores one-letter words)
//   search  two letters or more            -> search(), local matches first
//   browse  no text, filters set           -> search() browse mode (or the cached discover() while sql/67 is missing)
import { useEffect, useMemo, useRef, useState } from 'react'
import { useDebounced } from '../social/hooks'
import { searchUsers } from '../social/api'
import { fold } from './fold'
import { activeCount, filterKey } from './filters'
import { runSearch } from './api'
import { localBrowse, localMatches, placesOf } from './local'

const DEBOUNCE_MS = 150
const SKELETON_MS = 250
const CACHE_MAX = 30
const CACHE_TTL_MS = 2 * 60 * 1000       // open / closed changes with the clock
const PEOPLE_MIN = 3

const cache = new Map()                  // sig -> { at, data }; Map order = least recently used first
function cacheGet(sig) {
  const e = cache.get(sig)
  if (!e) return null
  cache.delete(sig)
  if (Date.now() - e.at > CACHE_TTL_MS) return null
  cache.set(sig, e)
  return e.data
}
function cachePut(sig, data) {
  cache.delete(sig)
  cache.set(sig, { at: Date.now(), data })
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value)
}

const hasGps = c => !!c && Number.isFinite(c.lat) && Number.isFinite(c.lng)
const sigOf = (kind, text, filters, gps) => `${kind}|${kind === 'search' ? fold(text) : ''}|${filterKey(filters)}|${gps ? 1 : 0}`
const EMPTY = { restaurants: [], dishes: [], browse: false }

/**
 * -> { mode, places, dishes, fresh, loading, skeleton, error, retry }
 * places / dishes are the rows to show right now (the server's answer when `fresh`, otherwise local matches or the
 * previous answer); `loading` is true while the server's answer for what is typed is still on the way.
 */
export function useSearch({ q, filters, coords, discover }) {
  const typed = q.trim()
  const filtersOn = activeCount(filters) > 0
  const gps = hasGps(coords)
  const fq = useDebounced(typed, DEBOUNCE_MS)

  const kindNow = typed.length >= 2 ? 'search' : typed.length === 1 ? 'local' : filtersOn ? 'browse' : 'zero'
  const remoteKind = fq.length >= 2 ? 'search' : filtersOn ? 'browse' : null
  const wantSig = kindNow === 'search' || kindNow === 'browse' ? sigOf(kindNow, typed, filters, gps) : null
  const remoteSig = remoteKind ? sigOf(remoteKind, fq, filters, gps) : null

  const [state, setState] = useState({ sig: null, data: null, error: null })
  const [attempt, setAttempt] = useState(0)
  const latest = useRef({})
  const index = useMemo(() => new Map(placesOf(discover).map(r => [r.id, r])), [discover])
  latest.current = { fq, filters, coords, remoteKind, lookup: id => (id ? index.get(id) : null) }

  useEffect(() => {
    if (!remoteSig) return undefined
    const hit = cacheGet(remoteSig)
    if (hit) { setState({ sig: remoteSig, data: hit, error: null }); return undefined }
    const ctrl = new AbortController()
    const { fq: text, filters: f, coords: c, remoteKind: kind, lookup } = latest.current
    runSearch({ q: kind === 'search' ? text : '', filters: f, coords: c, signal: ctrl.signal, lookup }).then(res => {
      if (res.aborted || ctrl.signal.aborted) return
      if (res.error) { setState({ sig: remoteSig, data: null, error: res.error }); return }
      if (res.browseUnavailable) { setState({ sig: remoteSig, data: { legacyBrowse: true }, error: null }); return }
      cachePut(remoteSig, res)
      setState({ sig: remoteSig, data: res, error: null })
    })
    return () => ctrl.abort()
  }, [remoteSig, attempt])

  // a request that is not answered within 250 ms and has nothing to show in the meantime gets skeleton rows
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    setSlow(false)
    if (!wantSig) return undefined
    const id = setTimeout(() => setSlow(true), SKELETON_MS)
    return () => clearTimeout(id)
  }, [wantSig, attempt])

  const local = useMemo(() => {
    if (kindNow === 'local' || (kindNow === 'search' && !filtersOn)) return localMatches(discover, typed)
    return EMPTY
  }, [kindNow, filtersOn, discover, typed])
  const browseLocal = useMemo(
    () => (state.data?.legacyBrowse ? localBrowse(discover, filters, coords) : null),
    [state.data, discover, filters, coords],
  )

  const answered = !!wantSig && state.sig === wantSig
  const fresh = kindNow === 'local' || answered
  const error = answered ? state.error : null
  const remote = state.data ? (browseLocal || state.data) : null
  const hasLocal = local.restaurants.length > 0 || local.dishes.length > 0

  let rows = EMPTY
  if (kindNow === 'local') rows = local
  else if (answered && remote) rows = remote
  else if (hasLocal) rows = local
  else if (remote) rows = remote            // the previous answer stays until the next one lands (no flash)

  const loading = !!wantSig && !answered
  const empty = fresh && !error && rows.restaurants.length === 0 && rows.dishes.length === 0
  return {
    mode: kindNow,
    places: rows.restaurants,
    dishes: rows.dishes,
    fresh,
    loading,
    skeleton: loading && slow && rows.restaurants.length === 0 && rows.dishes.length === 0,
    empty,
    error,
    retry: () => { setState(s => ({ ...s, error: null, sig: null })); setAttempt(a => a + 1) },
  }
}

/** People: search_users() for signed-in guests from three letters on; the rows keep their friend status locally. */
export function usePeople({ q, enabled }) {
  const fq = useDebounced(q.trim(), 250)
  const ok = enabled && fold(fq).length >= PEOPLE_MIN
  const [state, setState] = useState({ q: '', rows: [], status: 'idle' })
  useEffect(() => {
    if (!ok) { setState(s => (s.status === 'idle' ? s : { q: '', rows: [], status: 'idle' })); return undefined }
    let live = true
    setState(s => ({ ...s, status: 'loading' }))
    searchUsers(fq).then(({ data, error }) => {
      if (live) setState({ q: fq, rows: data || [], status: error ? 'error' : 'ready' })
    })
    return () => { live = false }
  }, [fq, ok])
  const setStatus = (id, status) => setState(s => ({ ...s, rows: s.rows.map(r => (r.id === id ? { ...r, status } : r)) }))
  return { ...state, enabled: ok, setStatus }
}
