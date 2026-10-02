import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { supabase } from '../lib/supabase'
import { rsrc } from '../lib/publicSource'
import './MapPage.css'

// Vite fingerprints/relocates these assets at build time, so Leaflet's own hardcoded
// default-icon URLs (which assume a classic /images/ path next to leaflet.js) 404 unless
// we point them at the imported, build-hashed asset URLs ourselves. We always pass a
// custom divIcon per marker below, so this only matters if Leaflet ever falls back to
// its default icon (e.g. a future L.marker() call without an explicit icon).
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
})

const BAKU_CENTER = [40.4093, 49.8671]

// Whitelist of cuisines that have a colour in MapPage.css; anything else gets the default.
// The result goes into a class name, so it must never echo owner-controlled text.
const KNOWN_CUISINES = ['italian', 'azerbaijani', 'japanese']
function cuisineKey(r) {
  const c = r.cuisine_type?.toLowerCase()
  return KNOWN_CUISINES.includes(c) ? c : 'default'
}

// Builds the marker popup as real DOM nodes (never innerHTML) so restaurant-owner-
// controlled fields (name, cuisine, address) can never inject markup, and wires the
// "view menu" link through react-router's navigate instead of a plain <a href> that
// would force a full page reload.
function buildPopupContent(r, t, go) {
  const wrap = document.createElement('div')
  wrap.className = 'map-popup'

  const strong = document.createElement('strong')
  strong.className = 'map-popup-name'
  strong.textContent = r.name
  wrap.appendChild(strong)
  wrap.appendChild(document.createElement('br'))

  const meta = document.createElement('span')
  meta.className = 'map-popup-meta'
  meta.textContent = `${r.cuisine_type || ''} · ${r.address || 'Baku'}`
  wrap.appendChild(meta)
  wrap.appendChild(document.createElement('br'))

  const link = document.createElement('a')
  link.className = 'map-popup-link'
  link.href = `/restaurant/${r.slug}`
  link.textContent = t('map:viewMenu')
  link.addEventListener('click', e => {
    e.preventDefault()
    go(`/restaurant/${r.slug}`)
  })
  wrap.appendChild(link)

  return wrap
}

// Tears a Leaflet map down without leaving anything that fires later. map.remove() only cancels
// pan/flyTo animations; an animated ZOOM (a chip tap, the +/- buttons, a pinch) also arms a
// 250 ms setTimeout inside Leaflet that calls _move() on the map. Once remove() has deleted the
// map pane that call throws "Cannot read properties of undefined (reading '_leaflet_pos')", which
// is what leaving the page right after tapping a restaurant chip used to do. So: stop the
// animations, finish a running zoom transition while the panes still exist (the timer then
// returns at its first line), close the popup, and only then remove the map.
function disposeMap(m) {
  try {
    m.stop()
    if (m._animatingZoom) m._onZoomTransitionEnd()
    m.closePopup()
  } catch { /* half-built map: remove() below still runs */ }
  m.off()
  m.remove()
}

export default function MapPage() {
  const { t } = useTranslation(['map', 'common'])
  const navigate = useNavigate()
  const containerRef = useRef(null)
  const markersRef = useRef({})
  const mountedRef = useRef(true)
  const navigateRef = useRef(navigate)
  const [map, setMap] = useState(null)
  const [restaurants, setRestaurants] = useState([])
  const [selected, setSelected] = useState(null)

  // react-router hands out a new navigate() on every location change; popups call it through a
  // ref so the markers are not torn down and rebuilt just because the URL changed.
  useEffect(() => { navigateRef.current = navigate }, [navigate])

  useEffect(() => {
    let cancelled = false
    supabase
      .from(rsrc())
      .select('id, name, slug, cuisine_type, address, latitude, longitude')
      .eq('status', 'active')
      .then(({ data }) => {
        if (cancelled) return
        // Never invent a marker position — restaurants without real coordinates are
        // left off the map (and out of the chip list, since a chip with no matching
        // marker would just center on a fake spot).
        const withCoords = (data || []).filter(r => r.latitude != null && r.longitude != null)
        setRestaurants(withCoords)
      })
    return () => { cancelled = true }
  }, [])

  // One Leaflet map per mount. Everything it attaches to the window/document is released in the
  // cleanup, and disposeMap() stops its animations and removes it, so leaving the page leaves
  // nothing behind and coming back starts from a clean container. It is a layout effect on
  // purpose: its cleanup runs while React is tearing the page down, before the container <div>
  // is detached, so a pan/zoom animation can never outlive the DOM it draws into.
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return
    mountedRef.current = true

    const m = L.map(el, { zoomControl: false }).setView(BAKU_CENTER, 13)

    L.control.zoom({ position: 'bottomright' }).addTo(m)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(m)

    // Leaflet only listens to window resize. The container also changes size without one (mobile
    // address bar collapsing, on-screen keyboard, bottom nav/orientation changes, bfcache
    // restore), and a stale size leaves grey/missing tiles and a mis-centred map.
    const refit = () => m.invalidateSize({ animate: false })
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(refit) : null
    ro?.observe(el)
    const onVisible = () => { if (!document.hidden) refit() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', refit)

    setMap(m)

    return () => {
      mountedRef.current = false
      markersRef.current = {}
      ro?.disconnect()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', refit)
      disposeMap(m)
      setMap(null)
    }
  }, [])

  useEffect(() => {
    if (!map) return

    const group = L.layerGroup().addTo(map)
    const markers = {}

    restaurants.forEach(r => {
      const icon = L.divIcon({
        className: '',
        html: `<div class="map-pin map-pin--${cuisineKey(r)}">🍽</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      })

      markers[r.id] = L.marker([r.latitude, r.longitude], { icon })
        .bindPopup(buildPopupContent(r, t, path => navigateRef.current(path)))
        .addTo(group)
    })
    markersRef.current = markers

    return () => {
      // On unmount the map is already disposed (and its layers with it); only a re-render that
      // swaps the restaurant list or the language has a live group to take down.
      if (mountedRef.current) group.remove()
      markersRef.current = {}
    }
  }, [map, restaurants, t])

  function focusRestaurant(r) {
    if (!mountedRef.current) return
    setSelected(r.id)
    if (!map) return
    map.setView([r.latitude, r.longitude], 16)
    markersRef.current[r.id]?.openPopup()
  }

  return (
    <div className={`map-page${restaurants.length > 0 ? ' map-page--chips' : ''}`}>
      <div ref={containerRef} className="map-canvas" />

      {/* Search overlay */}
      <div className="map-search">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" strokeWidth="2">
          <circle cx="10.5" cy="10.5" r="7.5" />
          <line x1="16.5" y1="16.5" x2="22" y2="22" strokeLinecap="round" />
        </svg>
        <span className="map-search-text">{t('map:searchPlaceholder')}</span>
      </div>

      {/* Restaurant chips at bottom */}
      {restaurants.length > 0 && (
        <div className="map-chips no-scrollbar">
          {restaurants.map(r => (
            <button
              key={r.id}
              type="button"
              className={`map-chip${selected === r.id ? ' is-selected' : ''}`}
              onClick={() => focusRestaurant(r)}
            >
              <div className={`map-dot map-dot--${cuisineKey(r)}`}>🍽</div>
              <div className="map-chip-text">
                <div className="map-chip-name">{r.name}</div>
                <div className="map-chip-sub">{r.cuisine_type || t('map:restaurant')}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
