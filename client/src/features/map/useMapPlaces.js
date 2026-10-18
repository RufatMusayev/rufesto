import { useCallback, useEffect, useMemo } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { withoutSocial } from './api'
import { useMapState } from './hooks'
import { loadPlaces, mapStore } from './store'

// The venues of the map and when they are fetched again (docs/MAP-PLAN-2026-10-18.md 4, "Open state"/data refresh):
// on mount (the screen paints from the store first: stale-while-revalidate), every 5 minutes while the page is visible,
// when the tab comes back after more than 2 minutes, and when the signed-in person changes. The social fields (followed,
// friends) of a snapshot are only shown to the person they were fetched for.
const REFRESH_MS = 5 * 60 * 1000
const STALE_MS = 2 * 60 * 1000

export default function useMapPlaces() {
  const { session, loading: authLoading } = useAuth()
  const uid = session?.user?.id ?? null
  const raw = useMapState(s => s.places)
  const placesUid = useMapState(s => s.placesUid)
  const status = useMapState(s => s.status)

  const places = useMemo(
    () => (raw && placesUid !== uid ? withoutSocial(raw) : raw),
    [raw, placesUid, uid],
  )

  // mount, and a different person: ask (once the session is restored, so the answer is for the right person)
  useEffect(() => {
    if (authLoading) return
    loadPlaces({ uid })
  }, [uid, authLoading])

  useEffect(() => {
    if (authLoading) return undefined
    const every = setInterval(() => { if (document.visibilityState === 'visible') loadPlaces({ uid }) }, REFRESH_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - mapStore.get().fetchedAt > STALE_MS) loadPlaces({ uid })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(every); document.removeEventListener('visibilitychange', onVisible) }
  }, [uid, authLoading])

  const reload = useCallback(() => loadPlaces({ uid }), [uid])
  return { places, status, reload }
}
