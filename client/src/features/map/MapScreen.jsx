import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigationType } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import SnapSheet from '../../components/ui/SnapSheet'
import { useTheme } from '../../contexts/ThemeContext'
import { useViewerLocation } from '../feed/useViewerLocation'
import { cuisineLabel } from '../discover/cuisine'
import useSheetHistory from '../../lib/useSheetHistory'
import { lock } from '../../lib/scrollLock'
import { langOf } from '../../lib/lang'
import { formatNumber } from '../../lib/helpers'
import { isOpenNow, openState } from '../../lib/openState'
import DirectionsSheet from './DirectionsSheet'
import ListHead from './ListHead'
import LocateButton from './LocateButton'
import PlaceCard from './PlaceCard'
import PlaceCarousel from './PlaceCarousel'
import PlaceList from './PlaceList'
import PlacePanel from './PlacePanel'
import { distanceText, haversineKm } from './distance'
import { useAfterMount, useBakuMinute, useBoxSize, useMapState, useMedia, useReducedMotion } from './hooks'
import useInitialCamera, { centerOfBounds } from './initialCamera'
import { kindOneKey } from './kind'
import { hasWebGL2, prefetchMap } from './prefetch'
import { statusLabel } from './status'
import { DEFAULT_FILTERS, FULL, HALF, PEEK, mapStore, setCamera, setFilters, setSnap } from './store'
import useMapNav, { placeKey } from './useMapNav'
import useMapPlaces from './useMapPlaces'
import useMyPosition from './useMyPosition'
import './styles.css'

const MapCanvas = lazy(() => import('./MapCanvas.jsx'))

// The map screen: layout and orchestration (docs/MAP-PLAN-2026-10-18.md 3, 4, 6). Phone and tablet (< 1024 px): the map
// full-bleed, a persistent snap sheet with the list, and the card carousel that replaces the sheet while a place is
// selected. Desktop (>= 1024 px) and list mode (no WebGL2): a side panel / the whole screen as a list, the selected row
// opening into the card in place. The list renders from the store before the map exists.
const PEEK_PX = 116
const STRIP_PX = 64          // the map strip above the full sheet (plus the status bar)
const NOTICE_MS = 6000

export default function MapScreen() {
  const { t, i18n } = useTranslation('map')
  const lang = langOf(i18n.language)
  const theme = useTheme()?.theme === 'light' ? 'light' : 'dark'
  const navType = useNavigationType()
  const reduced = useReducedMotion()
  const desktop = useMedia('(min-width: 1024px)')
  const nowMin = useBakuMinute()
  const loc = useViewerLocation()
  const me = useMyPosition(loc.status === 'on')
  const { places, status, reload } = useMapPlaces()
  const snap = useMapState(s => s.snap)
  const filters = useMapState(s => s.filters)
  const fetchedAt = useMapState(s => s.fetchedAt)

  const screenRef = useRef(null)
  const probeRef = useRef(null)
  const canvasRef = useRef(null)
  const mountedAt = useRef(Date.now())
  const savedCamera = useRef(mapStore.get().camera)
  const [webgl] = useState(() => hasWebGL2())
  const [mapErr, setMapErr] = useState(null)       // 'nowebgl' | 'offline'
  const [mapReady, setMapReady] = useState(false)
  const [canvasKey, setCanvasKey] = useState(0)
  const [hoverId, setHoverId] = useState(null)
  const [dirPlace, setDirPlace] = useState(null)
  const [notice, setNotice] = useState(null)
  const [carH, setCarH] = useState(0)
  const [captured, setCaptured] = useState(null)   // map centre when the sheet last rose from peek (the list order origin)
  const noMap = !webgl || mapErr === 'nowebgl'
  const panelMode = desktop || noMap

  // ---- page lock: nothing on this screen scrolls the page; the carousel needs its horizontal gestures ----
  useEffect(() => lock({ touchGuard: false }), [])
  useEffect(() => { prefetchMap() }, [])

  // ---- sizes: the screen ends where the bottom nav begins ----
  const { h: H } = useBoxSize(screenRef)
  const [safeTop, setSafeTop] = useState(0)
  useLayoutEffect(() => { setSafeTop(probeRef.current?.offsetHeight || 0) }, [H])
  const snaps = useMemo(() => {
    const half = Math.max(PEEK_PX + 48, Math.round(H * 0.5))
    return [PEEK_PX, half, Math.max(half + 48, H - (safeTop + STRIP_PX))]
  }, [H, safeTop])

  // ---- the venues: ordered by distance (frozen while visible), filtered on the device ----
  const coords = loc.coords
  const idsKey = useMemo(() => (places ? places.map(p => p.id).join('|') : ''), [places])
  const origin = coords || captured
  const originKey = origin ? `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}` : ''
  const order = useMemo(() => {
    if (!places) return []
    if (!origin) return places.map(p => p.id)
    return places.map(p => [p.id, haversineKm(origin, p)]).sort((a, b) => a[1] - b[1]).map(x => x[0])
  // the order moves only when the set of venues or the origin does: a refresh with the same venues never reshuffles rows
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, originKey])
  const nowRef = useRef(nowMin)
  nowRef.current = nowMin
  const openKey = useMemo(() => (places ? places.map(p => (isOpenNow(p, nowMin) ? '1' : '0')).join('') : ''), [places, nowMin])
  const all = useMemo(() => {
    if (!places) return []
    const byId = new Map(places.map(p => [p.id, p]))
    return order.map(id => byId.get(id)).filter(Boolean).map(p => {
      const o = isOpenNow(p, nowRef.current)
      return o === p.open_now ? p : { ...p, open_now: o }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, order, openKey])
  const visible = useMemo(
    () => all.filter(p => (!filters.kinds.length || filters.kinds.includes(p.kind)) && (!filters.open || p.open_now)),
    [all, filters],
  )
  const visibleRef = useRef(visible)
  visibleRef.current = visible
  const openCount = useMemo(() => visible.reduce((n, p) => n + (p.open_now ? 1 : 0), 0), [visible])
  const filtersOn = filters.open || filters.kinds.length > 0
  const byIdRef = useRef(new Map())
  byIdRef.current = new Map(all.map(p => [p.id, p]))
  const kmFor = useCallback(p => (coords ? haversineKm(coords, p) : null), [coords])

  // ---- history of the full sheet; selection and the address bar ----
  const histReady = useAfterMount(250)
  const hist = useSheetHistory({
    active: snap === FULL && !panelMode && histReady,
    id: 'map-full',
    onBack: () => { setSnap(HALF); return true },
  })
  const releaseFull = useCallback(() => {
    if (mapStore.get().snap === FULL) setSnap(HALF)
    const had = hist.hasEntry()
    if (had) hist.consume()
    return had
  }, [hist])
  const nav = useMapNav({ places: all, releaseFull })
  const { select: navSelect, deselect: navDeselect } = nav
  const selected = nav.selected && visible.find(p => p.id === nav.selected.id) || null
  const carouselOpen = !!selected && !panelMode
  const freshData = fetchedAt > mountedAt.current

  // a deep link to a place the saved filters hide: the guest asked for this one
  useEffect(() => { if (nav.selected && !selected && filtersOn) setFilters(DEFAULT_FILTERS) }, [nav.selected, selected, filtersOn])
  // an unknown or vanished place: back to the plain map
  useEffect(() => { if (nav.selectedKey && freshData && !nav.selected) navDeselect() }, [nav.selectedKey, nav.selected, freshData, navDeselect])

  const selectPlace = useCallback(place => {
    if (!visibleRef.current.some(p => p.id === place.id)) setFilters(DEFAULT_FILTERS)
    navSelect(place)
  }, [navSelect])
  const onPinSelect = useCallback(id => { const p = byIdRef.current.get(id); if (p) selectPlace(p) }, [selectPlace])

  // ---- where the map opens ----
  // a deep link is revealed on arrival; coming Back to the screen keeps the camera exactly where it was
  const arrival = useRef(navType === 'POP' ? null : nav.placeParam)
  const restore = navType === 'POP' || !nav.placeParam
  const initCam = useInitialCamera({
    savedCamera: restore ? savedCamera.current : null,
    placeKey: nav.placeParam,
    places: all.length ? all : places,
    status,
    coords,
    locationPending: loc.pending,
  })
  useEffect(() => {
    if (captured || !initCam) return
    const c = initCam.center || (initCam.bounds && centerOfBounds(initCam.bounds))
    if (c) setCaptured({ lat: c[1], lng: c[0] })
  }, [initCam, captured])

  const onReady = useCallback(() => {
    setMapReady(true)
    if (arrival.current) {
      const p = [...byIdRef.current.values()].find(x => placeKey(x) === arrival.current)
      if (p) canvasRef.current?.revealPlace(p.id, { animate: false })
      arrival.current = null
    }
  }, [])
  const onCamera = useCallback(c => setCamera({ center: c.center, zoom: c.zoom }), [])
  const onMapError = useCallback(kind => { setMapErr(kind) }, [])
  const retryMap = useCallback(() => { setMapErr(null); setMapReady(false); setCanvasKey(k => k + 1) }, [])

  // a filter changed: bring the results into view when some are outside it (MapCanvas decides)
  const firstFilter = useRef(true)
  useEffect(() => {
    if (firstFilter.current) { firstFilter.current = false; return }
    if (visibleRef.current.length) canvasRef.current?.fitPlaces(visibleRef.current.map(p => p.id), { animate: true })
  }, [filters])

  // ---- sheet ----
  const onSnap = useCallback(i => {
    const prev = mapStore.get().snap
    setSnap(i)
    if (prev === PEEK && i > PEEK) {
      const c = canvasRef.current?.getCenter()
      if (c) setCaptured({ lat: c[1], lng: c[0] })
    }
  }, [])
  const anyFriends = useMemo(() => visible.some(p => p.friends && p.friends.count > 0), [visible])
  const overlay = useMemo(() => {
    if (panelMode) return { top: 0, bottom: 0 }
    return { top: 0, bottom: carouselOpen ? (carH || (anyFriends ? 190 : 166)) + 12 : snaps[snap] }
  }, [panelMode, carouselOpen, carH, anyFriends, snaps, snap])

  // ---- filters ----
  const toggleOpen = useCallback(() => { const f = mapStore.get().filters; setFilters({ ...f, open: !f.open }) }, [])
  const toggleKind = useCallback(k => {
    const f = mapStore.get().filters
    setFilters({ ...f, kinds: f.kinds.includes(k) ? f.kinds.filter(x => x !== k) : [...f.kinds, k] })
  }, [])
  const raiseForKeyboard = useCallback(() => { if (mapStore.get().snap < FULL) setSnap(FULL) }, [])
  const clearFilters = useCallback(() => setFilters(DEFAULT_FILTERS), [])

  // ---- notices, locate, directions ----
  const noticeTimer = useRef(0)
  const showNotice = useCallback((key, kind = 'info') => {
    clearTimeout(noticeTimer.current)
    setNotice({ key, kind })
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS)
  }, [])
  useEffect(() => () => clearTimeout(noticeTimer.current), [])
  const pendingLocate = useRef(false)
  const onLocate = useCallback(() => {
    if (!loc.supported) { showNotice('locateUnsupported', 'error'); return }
    if (loc.status === 'denied') { showNotice('locateDenied', 'error'); return }
    if (loc.status === 'asking') return
    if (loc.status === 'on') { canvasRef.current?.easeToMe({ animate: true }); return }
    pendingLocate.current = true
    loc.request()
  }, [loc, showNotice])
  useEffect(() => {
    if (!pendingLocate.current) return
    if (loc.status === 'denied') { pendingLocate.current = false; showNotice('locateDenied', 'error') }
    else if (loc.status === 'error') { pendingLocate.current = false; showNotice('locateFailed', 'error') }
    else if (loc.status === 'on' && me) { pendingLocate.current = false; canvasRef.current?.easeToMe({ animate: true }) }
  }, [loc.status, me, showNotice])
  const openDirections = useCallback(p => setDirPlace(p), [])

  // Esc: close the card; at the full list, back to half (the Directions sheet takes its own Esc first)
  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'Escape' || document.querySelector('.bs-root')) return
      if (nav.selectedKey) navDeselect()
      else if (mapStore.get().snap === FULL) setSnap(HALF)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [nav])

  // ---- text of a row ----
  const metaFor = useCallback(p => {
    const st = openState(p, nowMin)
    const rating = p.rating != null && p.review_count > 0 ? `★${formatNumber(p.rating, 1)} (${p.review_count})` : null
    const price = p.price_band ? '₼'.repeat(p.price_band) : null
    return [
      [p.cuisine_type ? cuisineLabel(t, p.cuisine_type) : t(kindOneKey(p.kind)), rating, price].filter(Boolean).join(' · '),
      [statusLabel(t, st), distanceText(t, kmFor(p), lang)].filter(Boolean).join(' · '),
    ]
  }, [nowMin, kmFor, t, lang])

  const head = {
    total: visible.length, open: openCount, loading: !places && status !== 'error', filters, onToggleOpen: toggleOpen, onToggleKind: toggleKind,
  }
  const list = {
    places: visible, status, hoveredId: desktop ? hoverId : null, metaFor, onSelect: selectPlace, onHover: desktop ? setHoverId : undefined, onEscape: navDeselect, onKeyFocus: panelMode ? undefined : raiseForKeyboard,
    filtersOn, onClearFilters: clearFilters, onRetry: reload,
  }
  const expanded = panelMode && selected
    ? {
      id: selected.id,
      node: <PlaceCard variant="inline" place={selected} nowMin={nowMin} km={kmFor(selected)} onDirections={openDirections} onClose={navDeselect} />,
    }
    : null
  const locate = <LocateButton status={loc.status} onClick={onLocate} />

  return (
    <div
      ref={screenRef}
      className={`mp-screen${desktop ? ' is-desktop' : ''}${noMap ? ' is-nomap' : ''}`}
      data-map-theme={theme}
      data-snap={snap}
    >
      <h1 className="sr-only">{t('mapLabel')}</h1>
      <div ref={probeRef} className="mp-probe" aria-hidden="true" />

      {panelMode && (
        <PlacePanel full={!desktop} list={list} head={head} selectedId={selected?.id ?? null} expanded={expanded} notice={noMap ? t('noMap') : null} />
      )}

      {!noMap && (
        <div className="mp-map">
          {initCam ? (
            <Suspense fallback={<div className="mp-placeholder" />}>
              <MapCanvas
                key={canvasKey}
                ref={canvasRef}
                places={visible}
                selectedId={selected?.id ?? null}
                me={me}
                theme={theme}
                lang={lang}
                reducedMotion={reduced}
                initialCamera={initCam}
                overlay={overlay}
                hoveredId={desktop ? hoverId : null}
                onHoverPlace={desktop ? setHoverId : undefined}
                onSelect={onPinSelect}
                onDeselect={navDeselect}
                onCamera={onCamera}
                onReady={onReady}
                onError={onMapError}
              />
            </Suspense>
          ) : <div className="mp-placeholder" />}

          {mapErr === 'offline' && (
            <div className="mp-offline" role="alert">
              <span>{t('mapOffline')}</span>
              <button type="button" className="mp-retry" onClick={retryMap}>{t('retry')}</button>
            </div>
          )}
          {desktop && <div className="mp-locate-desk">{locate}</div>}
          {!desktop && snap === FULL && !carouselOpen && (
            <button type="button" className="mp-strip" onClick={() => setSnap(HALF)} aria-label={t('hideList')} />
          )}
        </div>
      )}

      {!panelMode && (
        <SnapSheet
          snaps={snaps}
          index={snap}
          onSnap={onSnap}
          hidden={carouselOpen}
          label={t('listLabel')}
          handle={{ show: t('showList'), hide: t('hideList') }}
          head={<ListHead {...head} />}
          float={carouselOpen ? null : locate}
        >
          <PlaceList {...list} selectedId={selected?.id ?? null} />
        </SnapSheet>
      )}
      {!panelMode && (
        <PlaceCarousel
          open={carouselOpen}
          places={visible}
          selectedId={selected?.id ?? null}
          onSelect={selectPlace}
          onDismiss={navDeselect}
          onDirections={openDirections}
          nowMin={nowMin}
          kmFor={kmFor}
          float={locate}
          onHeight={setCarH}
          reduced={reduced}
        />
      )}

      {notice && (
        <div className={`mp-notice mp-notice--${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{t(notice.key)}</div>
      )}
      <div className="sr-only" role="status" aria-live="polite">{selected ? t('selected', { name: selected.name }) : ''}</div>

      {dirPlace && (
        <DirectionsSheet place={dirPlace} km={kmFor(dirPlace)} onClose={() => setDirPlace(null)} onCopied={() => showNotice('copied')} />
      )}
    </div>
  )
}
