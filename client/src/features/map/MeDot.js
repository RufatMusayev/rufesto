// "You are here" dot (docs/MAP-PLAN-2026-10-18.md section 2, 4): a 14 px blue dot with a white ring, a pulse ring
// (2 s, paused while the page is hidden) and an accuracy halo when the fix is worse than 25 m. New fixes glide to the new
// spot over 400 ms (a plain jump with reduced motion). The marker element is an empty anchor; the visuals are CSS (canvas.css).
import { Marker } from 'maplibre-gl'
import { metersPerPixel } from './camera.js'

const GLIDE_MS = 400
const HALO_MIN_ACCURACY = 25
const HALO_MAX_PX = 520

const span = cls => {
  const el = document.createElement('span')
  el.className = cls
  return el
}

export function createMeDot({ map, reduced }) {
  const el = document.createElement('div')
  el.className = 'mp-marker mp-me'
  el.setAttribute('aria-hidden', 'true')
  const halo = span('mp-me__halo')
  el.append(halo, span('mp-me__pulse'), span('mp-me__dot'))
  const marker = new Marker({ element: el, anchor: 'top-left' })

  let isReduced = reduced
  let at = null          // [lng, lat] currently drawn
  let accuracy = 0
  let raf = 0

  const fitHalo = () => {
    if (!at || accuracy <= HALO_MIN_ACCURACY) { el.classList.remove('has-halo'); return }
    const px = Math.min(HALO_MAX_PX, (2 * accuracy) / metersPerPixel(at[1], map.getZoom()))
    el.classList.toggle('has-halo', px > 20)
    halo.style.setProperty('--mp-halo', `${px.toFixed(1)}px`)
  }
  const onVisibility = () => el.classList.toggle('is-paused', document.hidden)
  map.on('zoom', fitHalo)
  document.addEventListener('visibilitychange', onVisibility)
  onVisibility()

  function glide(to) {
    cancelAnimationFrame(raf)
    const from = at
    if (!from || isReduced) { at = to; marker.setLngLat(at); fitHalo(); return }
    const t0 = performance.now()
    const step = now => {
      const k = Math.min(1, (now - t0) / GLIDE_MS)
      const e = 1 - (1 - k) ** 3
      at = [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e]
      marker.setLngLat(at)
      if (k < 1) raf = requestAnimationFrame(step)
      else fitHalo()
    }
    raf = requestAnimationFrame(step)
  }

  return {
    /** me: { lat, lng, accuracy } or null. */
    set(me) {
      if (!me) { cancelAnimationFrame(raf); marker.remove(); at = null; return }
      accuracy = Number(me.accuracy) || 0
      const first = !at
      if (first) marker.setLngLat([me.lng, me.lat]).addTo(map)
      glide([me.lng, me.lat])
      fitHalo()
    },
    setReduced(v) { isReduced = v },
    position: () => at,
    destroy() {
      cancelAnimationFrame(raf)
      map.off('zoom', fitHalo)
      document.removeEventListener('visibilitychange', onVisibility)
      marker.remove()
    },
  }
}
