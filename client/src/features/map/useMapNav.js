import { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { tap as haptic } from '../../lib/haptics'
import { setSelectedSlug } from './store'
import { useMapState } from './hooks'

// Selection and the address bar (docs/MAP-PLAN-2026-10-18.md 4, "URL + history", M10):
//  - the first selection PUSHES /map?place=<slug> (state.mpPushed), later ones REPLACE it, so Back removes the card and
//    the next Back leaves the map;
//  - arriving with ?place= selects without pushing anything (Back leaves at once; deselecting replaces the URL);
//  - Back / Forward / a link change the URL: the selection follows it (a layout effect, so a deep link has its card on the
//    first painted frame);
//  - leaving the full list sheet: its history entry is replaced by the selection's (releaseFull), never left behind.
export const placeKey = p => p.slug || p.id

export default function useMapNav({ places, releaseFull }) {
  const location = useLocation()
  const navigate = useNavigate()
  const placeParam = new URLSearchParams(location.search).get('place')
  const selectedKey = useMapState(s => s.selectedSlug)
  const live = useRef({})
  live.current = { location, navigate, releaseFull, places, selectedKey }

  // URL -> selection (also on mount)
  useLayoutEffect(() => { setSelectedSlug(placeParam) }, [placeParam])

  const selected = useMemo(
    () => (selectedKey && places ? places.find(p => placeKey(p) === selectedKey) || null : null),
    [places, selectedKey],
  )

  const select = useCallback(place => {
    const { location: loc, navigate: go, releaseFull: release, selectedKey: cur } = live.current
    const key = placeKey(place)
    if (key === cur) return
    haptic(6)
    setSelectedSlug(key)
    const hadFullEntry = release()
    const has = new URLSearchParams(loc.search).has('place')
    const pushed = !!(window.history.state?.usr?.mpPushed)
    go(
      { pathname: loc.pathname, search: `?place=${encodeURIComponent(key)}` },
      { replace: has || hadFullEntry, state: { mpPushed: has ? pushed : true } },
    )
  }, [])

  const deselect = useCallback(() => {
    const { location: loc, navigate: go, selectedKey: cur } = live.current
    const has = new URLSearchParams(loc.search).has('place')
    if (!cur && !has) return
    setSelectedSlug(null)
    if (!has) return
    if (window.history.state?.usr?.mpPushed) go(-1)
    else go({ pathname: loc.pathname, search: '' }, { replace: true, state: {} })
  }, [])

  return useMemo(() => ({ placeParam, selectedKey, selected, select, deselect }), [placeParam, selectedKey, selected, select, deselect])
}
