import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigationType } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import SnapSheet from '../../components/ui/SnapSheet'
import { useTheme } from '../../contexts/ThemeContext'
import { useViewerLocation } from '../feed/useViewerLocation'
import useSheetHistory from '../../lib/useSheetHistory'
import { lock } from '../../lib/scrollLock'
import { langOf } from '../../lib/lang'
import { isOpenNow } from '../../lib/openState'
import DirectionsSheet from './DirectionsSheet'
import ListHead from './ListHead'
import LocateButton from './LocateButton'
import PlaceCard from './PlaceCard'
import PlaceCarousel from './PlaceCarousel'
import PlaceList from './PlaceList'
import PlacePanel from './PlacePanel'
import TiltButton from './TiltButton'
import { haversineKm } from './distance'
import { useAfterMount, useBakuMinute, useBoxSize, useMapState, useMedia, useReducedMotion } from './hooks'
import { boundsOfPoints, denseCore } from './camera'
import useInitialCamera, { centerOfBounds } from './initialCamera'
import { hasWebGL2, prefetchMap } from './prefetch'
import { rowMeta } from './rowMeta'
import { DEFAULT_FILTERS, FULL, HALF, PEEK, mapStore, setCamera, setFilters, setSnap } from './store'
import useMapNav, { placeKey } from './useMapNav'
import useMapPlaces from './useMapPlaces'
import useMyPosition from './useMyPosition'
import './styles.css'

const MapCanvas = lazy(() => import('./MapCanvas.jsx'))

// The map screen: layout and orchestration (docs/MAP-PLAN-2026-10-18.md 3, 4, 6). Phone and tablet (< 1024 px): the map
// full-bleed, a persistent snap sheet with the list, and the card carousel that replaces the sheet while a place is
// selected. Desktop (>= 1024 px) and list mode (no WebGL2): a side panel / the whole screen as a list, the selected row
// opening into the card in place. The list renders from the store before the map exists: the map (and its heavy chunk) is
// mounted only after the rows have been painted.
const PEEK_PX = 116
const STRIP_PX = 64          // the map strip above the full sheet (plus the status bar)
const NOTICE_MS = 6000
const MAP_AFTER_ROWS_MS = 400  // safety: the map starts this long after the rows even if no frame is drawn (a hidden tab)
const MAP_WITHOUT_ROWS_MS = 1500

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
  const [mapOn, setMapOn] = useState(false)        // the map mounts after the rows are painted
  const [canvasKey, setCanvasKey] = useState(0)
  const [hoverId, setHoverId] = useState(null)
  const [dir, setDir] = useState(null)             // { place, key } of the open Directions sheet
  const [notice, setNotice] = useState(null)
  const [carH, setCarH] = useState(0)
  const [detail, setDetail] = useState({ available: false, tilted: false })
  const [captured, setCaptured] = useState(null)   // map centre when the sheet last rose from peek (see the order below)
  const noMap = !webgl || mapErr === 'nowebgl'
  const panelMode = desktop || noMap

  // ---- page lock: nothing on this screen scrolls the page; the carousel needs its horizontal gestures ----
  useEffect(() => lock({ touchGuard: false }), [])

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
  // Without a location the rows are ordered from the centre of the DENSE CORE of the venues (the Old City, not the outliers) or,
  // coming back, from where the map was left; both known before the first row is drawn, so the rows never reorder after they
  // appear (that was a layout shift). Later the centre of the map each time the sheet rises from peek.
  const restoredOrigin = useMemo(() => {
    const c = savedCamera.current && (navType === 'POP' || !new URLSearchParams(window.location.search).has('place')) ? savedCamera.current.center : null
    return c ? { lat: c[1], lng: c[0] } : null
  }, [navType])
  const coreOrigin = useMemo(() => {
    if (!places || !places.length) return null
    const c = centerOfBounds(boundsOfPoints(denseCore(places)))
    return { lat: c[1], lng: c[0] }
  // the set of venues decides it, not their open state or rating
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey])
  const origin = coords || captured || restoredOrigin || coreOrigin
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

  // a card that is there because of the address (a deep link, or Back from a restaurant) shows at once; one the guest asks
  // for slides up (plan 4: "Return / deep link 0 ms")
  const arrivalCard = useRef(!!nav.placeParam)
  const selectPlace = useCallback(place => {
    arrivalCard.current = false
    if (!visibleRef.current.some(p => p.id === place.id)) setFilters(DEFAULT_FILTERS)
    navSelect(place)
  }, [navSelect])
  const deselect = useCallback(() => { arrivalCard.current = false; navDeselect() }, [navDeselect])
  const onPinSelect = useCallback(id => { const p = byIdRef.current.get(id); if (p) selectPlace(p) }, [selectPlace])

  // a deep link to a place the saved filters hide: the guest asked for this one
  useEffect(() => { if (nav.selected && !selected && filtersOn) setFilters(DEFAULT_FILTERS) }, [nav.selected, selected, filtersOn])
  // an unknown or vanished place: back to the plain map
  useEffect(() => { if (nav.selectedKey && freshData && !nav.selected) navDeselect() }, [nav.selectedKey, nav.selected, freshData, navDeselect])

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
  // ---- the map starts after the rows are on screen ----
  const rowsReady = places != null || status === 'error'
  useEffect(() => {
    if (mapOn || noMap) return undefined
    let r1 = 0
    let r2 = 0
    const go = () => setMapOn(true)
    const timer = setTimeout(go, rowsReady ? MAP_AFTER_ROWS_MS : MAP_WITHOUT_ROWS_MS)
    if (rowsReady) r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(go) })
    return () => { clearTimeout(timer); cancelAnimationFrame(r1); cancelAnimationFrame(r2) }
  }, [mapOn, noMap, rowsReady])
  useEffect(() => { if (mapOn && status !== 'error') prefetchMap() }, [mapOn, status])

  const onReady = useCallback(() => {
    if (arrival.current) {
      const p = [...byIdRef.current.values()].find(x => placeKey(x) === arrival.current)
      if (p) canvasRef.current?.revealPlace(p.id, { animate: false })
      arrival.current = null
    }
  }, [])
  const onCamera = useCallback(c => setCamera({ center: c.center, zoom: c.zoom }), [])
  const onMapError = useCallback(kind => { setMapErr(kind) }, [])
  const retryMap = useCallback(() => { setMapErr(null); setCanvasKey(k => k + 1) }, [])
  const onDetail = useCallback(d => setDetail(d), [])
  const showDetail = useCallback(p => canvasRef.current?.showPlaceDetail(p.id), [])
  const toggleTilt = useCallback(() => canvasRef.current?.toggleTilt(), [])

  // a filter that NARROWS the set brings the results into view (MapCanvas moves only if some are outside it); clearing or
  // widening never moves the camera: the guest's own view stays
  const lastIds = useRef(null)
  const firstFilter = useRef(true)
  useEffect(() => {
    if (firstFilter.current) { firstFilter.current = false; return }
    const prev = lastIds.current
    const now = visibleRef.current
    if (prev && now.length && now.length < prev.size && now.every(p => prev.has(p.id))) {
      canvasRef.current?.fitPlaces(now.map(p => p.id), { animate: true })
    }
  }, [filters])
  useEffect(() => { lastIds.current = new Set(visible.map(p => p.id)) }, [visible])

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
  // "See distances": asks for the location without moving the map (the list gets distances, the map its dot)
  const seeDistances = useCallback(() => { loc.request() }, [loc])
  const canAsk = !coords && loc.supported && (loc.status === 'off' || loc.status === 'error')
  const dirCount = useRef(0)
  const openDirections = useCallback(p => { dirCount.current += 1; setDir({ place: p, key: dirCount.current }) }, [])
  const closeDirections = useCallback(key => setDir(d => (d && d.key === key ? null : d)), [])

  // Esc: close the card; at the full list, back to half (the Directions sheet takes its own Esc first)
  useEffect(() => {
    const onKey = e => {
      if (e.key !== 'Escape' || document.querySelector('.bs-root')) return
      if (nav.selectedKey) deselect()
      else if (mapStore.get().snap === FULL) setSnap(HALF)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [nav.selectedKey, deselect])

  // ---- what the rows say; a pin and its row light up together on a desktop ----
  const metaFor = useCallback(p => rowMeta({ place: p, t, lang, nowMin, km: kmFor(p) }), [t, lang, nowMin, kmFor])
  // a row that is left clears the highlight only if it is still the row (or pin) that lit it
  const onHover = useCallback((id, from) => setHoverId(h => (id ? id : from && h !== from ? h : null)), [])

  const head = {
    total: visible.length, open: openCount, loading: !places && status !== 'error', filters,
    onToggleOpen: toggleOpen, onToggleKind: toggleKind, onSeeDistances: canAsk ? seeDistances : undefined,
  }
  const list = {
    places: visible, status, hoveredId: desktop ? hoverId : null, metaFor, onSelect: selectPlace, onHover: desktop ? onHover : undefined,
    onEscape: deselect, onKeyFocus: panelMode ? undefined : raiseForKeyboard, filtersOn, onClearFilters: clearFilters, onRetry: reload,
  }
  const mapUp = !noMap
  const expanded = panelMode && selected
    ? {
      id: selected.id,
      node: (
        <PlaceCard
          variant="inline" place={selected} nowMin={nowMin} km={kmFor(selected)} onDirections={openDirections}
          onShowDetail={mapUp ? showDetail : undefined} onClose={deselect}
        />
      ),
    }
    : null
  const floats = (
    <>
      {detail.available && <TiltButton tilted={detail.tilted} onClick={toggleTilt} />}
      <LocateButton status={loc.status} onClick={onLocate} />
    </>
  )

  return (
    <div
      ref={screenRef}
      className={`mp-screen${desktop ? ' is-desktop' : ''}${noMap ? ' is-nomap' : ''}`}
      data-map-theme={theme}
      data-snap={snap}
      data-sheet={!panelMode && !carouselOpen ? '' : undefined}
    >
      <h1 className="sr-only">{t('mapLabel')}</h1>
      <div ref={probeRef} className="mp-probe" aria-hidden="true" />

      {panelMode && (
        <PlacePanel full={noMap} list={list} head={head} selectedId={selected?.id ?? null} expanded={expanded} notice={noMap ? t('noMap') : null} />
      )}

      {!noMap && (
        <div className="mp-map">
          {initCam && mapOn ? (
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
                onHoverPlace={desktop ? onHover : undefined}
                onSelect={onPinSelect}
                onDeselect={deselect}
                onCamera={onCamera}
                onReady={onReady}
                onError={onMapError}
                onDetail={onDetail}
              />
            </Suspense>
          ) : <div className="mp-placeholder" />}

          {mapErr === 'offline' && (
            <div className="mp-offline" role="alert">
              <span>{t('mapOffline')}</span>
              <button type="button" className="mp-retry" onClick={retryMap}>{t('retry')}</button>
            </div>
          )}
          {desktop && <div className="mp-locate-desk">{floats}</div>}
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
          float={carouselOpen ? null : floats}
        >
          <PlaceList {...list} selectedId={selected?.id ?? null} />
        </SnapSheet>
      )}
      {!panelMode && (
        <PlaceCarousel
          open={carouselOpen}
          instant={arrivalCard.current}
          places={visible}
          selectedId={selected?.id ?? null}
          onSelect={selectPlace}
          onDismiss={deselect}
          onDirections={openDirections}
          onShowDetail={showDetail}
          nowMin={nowMin}
          kmFor={kmFor}
          float={floats}
          onHeight={setCarH}
          reduced={reduced}
        />
      )}

      {notice && (
        <div className={`mp-notice mp-notice--${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{t(notice.key)}</div>
      )}
      <div className="sr-only" role="status" aria-live="polite">{selected ? t('selected', { name: selected.name }) : ''}</div>

      {dir && (
        <DirectionsSheet
          key={dir.key} place={dir.place} km={kmFor(dir.place)} onClose={() => closeDirections(dir.key)} onCopied={() => showNotice('copied')}
        />
      )}
    </div>
  )
}
