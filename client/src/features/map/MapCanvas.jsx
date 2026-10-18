import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { langOf } from '../../lib/lang'
import { decimal } from './format'
import AttributionChip from './AttributionChip'
import { PMTILES_URL } from './mapConfig'
import { LOAD_TIMEOUT_MS } from './mapTuning'
import { getTileJSON, hasWebGL2, loadMapController } from './prefetch'
import './canvas.css'

// The map canvas (docs/MAP-PLAN-2026-10-18.md 6a). React owns only this thin shell: a root, the host element MapLibre draws
// into, the attribution chip and the +/- buttons. Everything on the map (style, pins, camera, me dot) is the imperative
// controller in mapController.js, a lazy chunk that carries maplibre-gl and is reached only after the WebGL2 check, so a
// device without WebGL2 never downloads it. Props are forwarded with effects; nothing re-renders per frame.
//
// Props: places, selectedId, me, theme, lang, reducedMotion, overlay {top,bottom}, initialCamera (constructor only:
//   {center, zoom, exact?} | {bounds, minZoom?, maxZoom?}; a centre without `exact` is shown in the visible area above the sheet),
//   onSelect, onDeselect, onCamera({center,zoom,pitch,user}), onReady, onError('nowebgl'|'offline'), onDetail({available,tilted}),
//   plus hoveredId / onHoverPlace / labelFor.
// Ref: revealPlace(id,{animate}), fitPlaces(ids,{animate}), easeToMe({animate}), getCenter(), getCamera(), zoomBy(delta),
//   showPlaceDetail(id) (zoom 17.5, pitch 55), toggleTilt(). The 2D / 3D button itself is TiltButton.jsx, placed by the screen.

const KIND_DEFAULT = { coffee: 'Café', quick: 'Quick bite', restaurant: 'Restaurant' }
const TILEJSON_WAIT_MS = 1500

const prefersReduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Texts the pins carry (aria-labels, rating format), rebuilt when the language or `t` changes. */
function makeText(t, lang, labelFor) {
  const fmt = r => decimal(r, 1, lang)
  const kind = k => t(`map:kindOne.${k}`, { defaultValue: KIND_DEFAULT[k] || KIND_DEFAULT.restaurant })
  return {
    rating: fmt,
    place(p) {
      if (labelFor) return labelFor(p)
      const status = p.open_now
        ? t('map:statusOpen', { defaultValue: 'Open' })
        : t('map:statusClosed', { defaultValue: 'Closed' })
      const base = { name: p.name, kind: kind(p.kind), status }
      return p.rating != null
        ? t('map:pinLabel', { ...base, rating: fmt(p.rating), defaultValue: '{{name}}, {{kind}}, rated {{rating}}, {{status}}' })
        : t('map:pinLabelNoRating', { ...base, defaultValue: '{{name}}, {{kind}}, {{status}}' })
    },
    cluster: count => t('map:cluster', {
      count, defaultValue_one: '{{count}} place, zoom in', defaultValue_other: '{{count}} places, zoom in',
    }),
  }
}

const MapCanvas = forwardRef(function MapCanvas(props, ref) {
  const {
    places, selectedId = null, me = null, theme = 'light', lang, reducedMotion, overlay, hoveredId = null, labelFor,
  } = props
  const { t, i18n } = useTranslation(['map'])
  const appLang = langOf(lang || i18n.language)
  const [systemReduced, setSystemReduced] = useState(prefersReduced)
  const reduced = reducedMotion ?? systemReduced

  const rootRef = useRef(null)
  const hostRef = useRef(null)
  const ctrlRef = useRef(null)
  const propsRef = useRef(props)
  propsRef.current = props
  const live = useRef({ t, lang: appLang, reduced, labelFor })
  live.current = { t, lang: appLang, reduced, labelFor }

  // ---- one controller per mount (layout effect: its cleanup runs before the container is detached) ------------------
  useLayoutEffect(() => {
    const root = rootRef.current
    const host = hostRef.current
    let cancelled = false
    let finished = false
    let waitTimer = 0
    let loadTimer = 0

    const fail = kind => {
      if (cancelled || finished) return
      finished = true
      cancelAnimationFrame(loadTimer)
      // destroyed on the next tick: fail() may be running inside one of the map's own event handlers
      const c = ctrlRef.current
      ctrlRef.current = null
      setTimeout(() => c?.destroy(), 0)
      propsRef.current.onError?.(kind)
    }

    if (!hasWebGL2()) {
      queueMicrotask(() => fail('nowebgl'))
      return () => { cancelled = true }
    }
    // No map `load` in time (chunk, TileJSON, tiles): the list carries on, the screen shows its Retry. The clock counts animation
    // frames, not wall time: a hidden tab or a pane that is not composited gets no frames and renders nothing, so it must not
    // run out (a long stall counts for at most 250 ms per frame).
    const clock = () => {
      let waited = 0
      let last = performance.now()
      const tick = now => {
        waited += Math.min(now - last, 250)
        last = now
        loadTimer = waited >= LOAD_TIMEOUT_MS ? 0 : requestAnimationFrame(tick)
        if (!loadTimer) fail('offline')
      }
      loadTimer = requestAnimationFrame(tick)
    }
    clock()

    const tilejson = Promise.race([
      getTileJSON(),
      new Promise(resolve => { waitTimer = setTimeout(() => resolve(undefined), TILEJSON_WAIT_MS) }),
    ]).finally(() => clearTimeout(waitTimer))

    Promise.all([loadMapController(), tilejson]).then(([mod, tj]) => {
      if (cancelled || finished) return
      // null = the TileJSON request failed (host blocked, no network); undefined = it is just slow, MapLibre fetches it itself
      if (tj === null && !PMTILES_URL) { fail('offline'); return }
      const p = propsRef.current
      const cur = live.current
      const ctrl = mod.createController({
        root,
        container: host,
        camera: p.initialCamera,
        theme: p.theme || 'light',
        lang: cur.lang,
        reduced: cur.reduced,
        tilejson: tj,
        overlay: p.overlay,
        text: makeText(cur.t, cur.lang, cur.labelFor),
        cb: {
          onSelect: id => propsRef.current.onSelect?.(id),
          onDeselect: () => propsRef.current.onDeselect?.(),
          onCamera: c => propsRef.current.onCamera?.(c),
          onHover: id => propsRef.current.onHoverPlace?.(id),
          // leaving a pin: the screen decides (onHover(null, pinId) clears only if that pin is still the hovered one; a list row
          // that took over in the same task keeps its highlight)
          onHoverEnd: id => propsRef.current.onHoverPlace?.(null, id),
          onDetail: st => propsRef.current.onDetail?.(st),
          onLoad: () => cancelAnimationFrame(loadTimer),
          onReady: () => propsRef.current.onReady?.(),
          onError: fail,
        },
      })
      if (finished || cancelled) { ctrl.destroy(); return }
      ctrlRef.current = ctrl
      ctrl.setPlaces(p.places || [])
      ctrl.setSelected(p.selectedId ?? null, { camera: false })
      ctrl.setHovered(p.hoveredId ?? null)
      ctrl.setMe(p.me ?? null)
    }).catch(err => {
      if (import.meta.env.DEV) console.error('[map]', err) // a failed chunk fetch is the offline case; anything else is a bug worth seeing
      fail('offline')
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(loadTimer)
      clearTimeout(waitTimer)
      const c = ctrlRef.current
      ctrlRef.current = null
      c?.destroy()
    }
  }, [])

  // ---- props -> controller (the first values are applied when the controller is created) ------------------------------
  const top = overlay?.top || 0
  const bottom = overlay?.bottom || 0
  // overlay before selection: the safe rect of a new selection must see the carousel that selecting it raises
  useEffect(() => { ctrlRef.current?.setOverlay({ top, bottom }) }, [top, bottom])
  useEffect(() => { ctrlRef.current?.setPlaces(places || []) }, [places])
  useEffect(() => { ctrlRef.current?.setSelected(selectedId ?? null) }, [selectedId])
  useEffect(() => { ctrlRef.current?.setHovered(hoveredId ?? null) }, [hoveredId])
  useEffect(() => { ctrlRef.current?.setMe(me ?? null) }, [me])
  useEffect(() => { ctrlRef.current?.setTheme(theme) }, [theme])
  useEffect(() => { ctrlRef.current?.setReduced(reduced) }, [reduced])
  useEffect(() => {
    const c = ctrlRef.current
    if (!c) return
    c.setLang(appLang)
    c.setText(makeText(t, appLang, labelFor))
  }, [t, appLang, labelFor])

  // the OS reduced-motion setting, followed unless the screen passes its own value
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq?.addEventListener) return undefined
    const on = () => setSystemReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  useImperativeHandle(ref, () => ({
    revealPlace: (id, o) => ctrlRef.current?.revealPlace(id, o) ?? false,
    fitPlaces: (ids, o) => ctrlRef.current?.fitPlaces(ids, o) ?? false,
    easeToMe: o => ctrlRef.current?.easeToMe(o) ?? false,
    getCenter: () => ctrlRef.current?.getCenter() ?? null,
    getCamera: () => ctrlRef.current?.getCamera() ?? null,
    zoomBy: d => ctrlRef.current?.zoomBy(d),
    showPlaceDetail: id => ctrlRef.current?.showPlaceDetail(id) ?? false,
    toggleTilt: () => ctrlRef.current?.toggleTilt() ?? false,
  }), [])

  return (
    <div
      ref={rootRef}
      className="mp-canvas"
      data-map-theme={theme}
      data-reduced={reduced ? '1' : undefined}
      role="region"
      aria-label={t('map:mapLabel', { defaultValue: 'Map of places' })}
    >
      <div ref={hostRef} className="mp-canvas__map" />
      <AttributionChip />
      <div className="mp-zoom">
        <button type="button" onClick={() => ctrlRef.current?.zoomBy(1)} aria-label={t('map:zoomIn', { defaultValue: 'Zoom in' })}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <button type="button" onClick={() => ctrlRef.current?.zoomBy(-1)} aria-label={t('map:zoomOut', { defaultValue: 'Zoom out' })}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
        </button>
      </div>
    </div>
  )
})

export default MapCanvas
