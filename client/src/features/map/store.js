// Module store of the map (on features/feed/store.js createStore): the venues and the screen state live outside React, so
// coming back from a restaurant page, switching tabs or a reload inside 30 minutes never starts from an empty screen
// (docs/MAP-PLAN-2026-10-18.md 4 "Session", 7 "List-first"). Components read it with useStore.
import { createStore } from '../feed/store'
import { fetchMapPlaces } from './api'
import { readSession, saveSession } from './session'

export const DEFAULT_FILTERS = { open: false, kinds: [] }
export const PEEK = 0
export const HALF = 1
export const FULL = 2

const saved = readSession()
const validFilters = f => (f && typeof f === 'object'
  ? { open: !!f.open, kinds: Array.isArray(f.kinds) ? f.kinds.filter(k => typeof k === 'string').slice(0, 3) : [] }
  : DEFAULT_FILTERS)
const validCamera = c => (c && Array.isArray(c.center) && c.center.length === 2 && c.center.every(Number.isFinite) && Number.isFinite(c.zoom)
  ? { center: [c.center[0], c.center[1]], zoom: c.zoom }
  : null)

export const mapStore = createStore({
  places: Array.isArray(saved?.places) ? saved.places : null,
  placesUid: saved?.uid ?? null,       // whom the social fields in `places` belong to (null = nobody / signed out)
  fetchedAt: saved?.fetchedAt ?? 0,
  status: Array.isArray(saved?.places) ? 'ready' : 'idle',   // idle | loading | ready | error
  camera: validCamera(saved?.camera),
  snap: [PEEK, HALF, FULL].includes(saved?.snap) ? saved.snap : HALF,
  filters: validFilters(saved?.filters),
  selectedSlug: null,                  // the URL (?place=) decides what is selected when the screen opens
})

mapStore.subscribe(() => {
  const s = mapStore.get()
  saveSession({
    uid: s.placesUid, places: s.places, fetchedAt: s.fetchedAt, camera: s.camera, snap: s.snap, filters: s.filters, selectedSlug: s.selectedSlug,
  })
})

let inflight = null

/** Fetches map_places. Keeps what is on screen while it runs; an unchanged answer replaces nothing (no re-render, no pin diff). */
export function loadPlaces({ uid = null } = {}) {
  if (inflight) return inflight
  if (!mapStore.get().places) mapStore.set({ status: 'loading' })
  inflight = fetchMapPlaces().then(res => {
    // an answer that left before the session was restored is anonymous: ask again once, for the social fields
    return uid && res.data && !res.data.signedIn ? fetchMapPlaces({ fresh: true }) : res
  }).then(({ data, error }) => {
    inflight = null
    const s = mapStore.get()
    if (error || !data) {
      mapStore.set({ status: s.places ? 'ready' : 'error' })
      return false
    }
    const placesUid = data.signedIn ? uid : null
    const same = s.places && s.placesUid === placesUid && JSON.stringify(s.places) === JSON.stringify(data.places)
    mapStore.set({
      places: same ? s.places : data.places,
      placesUid,
      fetchedAt: Date.now(),
      status: 'ready',
    })
    return true
  })
  return inflight
}

export const setCamera = camera => mapStore.set({ camera })
export const setSnap = snap => { if (mapStore.get().snap !== snap) mapStore.set({ snap }) }
export const setFilters = filters => mapStore.set({ filters })
export const setSelectedSlug = slug => { if (mapStore.get().selectedSlug !== slug) mapStore.set({ selectedSlug: slug }) }
