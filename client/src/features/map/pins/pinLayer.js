// The venue pins on the map: imperative DOM markers diffed by place id (docs/MAP-PLAN-2026-10-18.md M7, section 2, 4).
//  - at zoom <= CLUSTER_MAX_ZOOM places that sit close together are count bubbles (supercluster), above it every place is a
//    pin; the selected place is always a pin;
//  - a pin is a pill, or a dot when the greedy collision (collide.js, on zoomend) finds it would overlap a better ranked pill;
//  - state classes live on the <button> inside the marker element (pinElement.js), never on the element MapLibre moves;
//  - roving tabindex: one pin / bubble is a tab stop, arrow keys move between them in the order of the `places` array.
// Nothing here runs per frame: sync() is called on data, selection, zoomend and language changes.
import { Marker } from 'maplibre-gl'
import { createClusterIndex } from './cluster.js'
import { resolveDots, rankOf } from './collide.js'
import { makeBubble, makePin, patchBubble, patchPin } from './pinElement.js'

const LEAVE_MS = 160
const FLY_MS = 260
const FLY_WINDOW_MS = 1500
const STAGGER_MS = 18
const STAGGER_COUNT = 16
const cubicOut = 'cubic-bezier(0.215, 0.61, 0.355, 1)'

/**
 * @param {object} o
 * @param {import('maplibre-gl').Map} o.map
 * @param {{ onSelect(id:string):void, onCluster(b:object):void, onHover(id:string|null):void }} o.cb
 * @param {{ place(p:object):string, cluster(n:number):string, rating(r:number):string }} o.text
 * @param {boolean} o.reduced
 */
export function createPinLayer({ map, cb, text, reduced }) {
  const pins = new Map()      // id -> { place, marker, el, btn, refs, dot, leaving }
  const bubbles = new Map()   // 'c<id>' -> { data, marker, el, btn, n }
  const timers = new Set()
  let places = []
  let order = new Map()
  let index = createClusterIndex([])
  let selectedId = null
  let hoveredId = null
  let rovingId = null
  let revealed = false
  let dragged = false
  let flyOrigin = null // { lngLat:[lng,lat], at }
  let isReduced = reduced
  let labels = text
  let dead = false

  const later = (fn, ms) => {
    const t = setTimeout(() => { timers.delete(t); fn() }, ms)
    timers.add(t)
  }
  const onDragStart = () => { dragged = true }
  map.on('dragstart', onDragStart)

  // ---- creation --------------------------------------------------------------------------------------------------
  function bindPin(btn, id) {
    btn.addEventListener('pointerdown', () => { dragged = false })
    btn.addEventListener('click', () => { if (!dragged) cb.onSelect(id) })
    btn.addEventListener('keydown', e => onKey(e, id))
    btn.addEventListener('focus', () => { rovingId = id; applyRoving() })
    btn.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') cb.onHover(id) })
    btn.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') cb.onHover(null) })
  }

  function createPin(place) {
    const made = makePin(place, labels)
    const marker = new Marker({ element: made.el, anchor: 'top-left' }).setLngLat([place.lng, place.lat]).addTo(map)
    const e = { place, marker, el: made.el, btn: made.btn, refs: made.refs, dot: false, leaving: false, lngLat: [place.lng, place.lat] }
    made.btn.setAttribute('aria-label', labels.place(place))
    bindPin(made.btn, place.id)
    pins.set(place.id, e)
    return e
  }

  function createBubble(data) {
    const key = `c${data.id}`
    const made = makeBubble(data, labels.cluster(data.count))
    const marker = new Marker({ element: made.el, anchor: 'top-left' }).setLngLat([data.lng, data.lat]).addTo(map)
    const b = { key, data, marker, el: made.el, btn: made.btn, n: made.n }
    made.btn.addEventListener('pointerdown', () => { dragged = false })
    made.btn.addEventListener('click', () => { if (!dragged) cb.onCluster(b.data) })
    made.btn.addEventListener('keydown', e => onKey(e, key))
    made.btn.addEventListener('focus', () => { rovingId = key; applyRoving() })
    bubbles.set(key, b)
    return b
  }

  function dropPin(id) {
    const e = pins.get(id)
    if (!e) return
    pins.delete(id)
    leave(e)
  }

  function leave(e) {
    e.leaving = true
    e.btn.classList.add('is-leave')
    e.btn.tabIndex = -1
    e.btn.setAttribute('aria-hidden', 'true')
    later(() => e.marker.remove(), isReduced ? 120 : LEAVE_MS)
  }

  // ---- the view (what is a pin, what is a bubble) ---------------------------------------------------------------------
  function sync({ stagger = false } = {}) {
    if (!revealed || dead) return
    const view = index.view(map.getZoom())
    const wantIds = new Set(view.pins)
    if (selectedId && places.some(p => p.id === selectedId)) wantIds.add(selectedId)

    for (const id of [...pins.keys()]) if (!wantIds.has(id)) dropPin(id)

    const created = []
    for (const p of places) {
      if (!wantIds.has(p.id)) continue
      let e = pins.get(p.id)
      if (!e) { e = createPin(p); created.push(e) }
      else if (e.place !== p) { // same object: nothing to redo (sync also runs for selection and zoom changes)
        e.place = p
        patchPin(e, p, labels)
        e.btn.setAttribute('aria-label', labels.place(p))
        if (e.lngLat[0] !== p.lng || e.lngLat[1] !== p.lat) { e.marker.setLngLat([p.lng, p.lat]); e.lngLat = [p.lng, p.lat] }
      }
    }

    const seen = new Set()
    for (const data of view.bubbles) {
      const key = `c${data.id}`
      seen.add(key)
      const b = bubbles.get(key)
      if (b) { b.data = data; patchBubble(b, data, labels.cluster(data.count)) } else enterBubble(createBubble(data))
    }
    for (const [key, b] of [...bubbles]) {
      if (seen.has(key)) continue
      bubbles.delete(key)
      b.btn.classList.add('is-leave')
      later(() => b.marker.remove(), isReduced ? 120 : LEAVE_MS)
    }

    applyDots()
    applyState()
    if (created.length) enter(created, stagger)
    applyRoving()
  }

  function enterBubble(b) { b.btn.classList.add('is-enter'); later(() => b.btn.classList.remove('is-enter'), 400) }

  // pill <-> dot by greedy collision; z-order: selected, hovered, pills by rank, dots
  function applyDots() {
    const live = [...pins.values()].filter(e => !e.leaving)
    const items = live.map(e => {
      const pt = map.project([e.place.lng, e.place.lat])
      return { place: e.place, x: pt.x, y: pt.y }
    })
    const dots = resolveDots(items, selectedId)
    const ranked = live.map(e => e).sort((a, b) => rankOf(a.place, selectedId) - rankOf(b.place, selectedId))
    ranked.forEach((e, i) => {
      const dot = dots.has(e.place.id)
      e.dot = dot
      e.btn.classList.toggle('is-dot', dot)
      e.el.style.zIndex = e.place.id === selectedId ? '1000' : e.place.id === hoveredId ? '900' : dot ? '50' : String(100 + i)
    })
    for (const b of bubbles.values()) b.el.style.zIndex = '40'
  }

  function applyState() {
    for (const e of pins.values()) {
      const sel = e.place.id === selectedId
      e.btn.classList.toggle('is-selected', sel)
      e.btn.classList.toggle('is-hover', e.place.id === hoveredId)
      e.btn.setAttribute('aria-pressed', sel ? 'true' : 'false')
    }
  }

  // ---- appearing -------------------------------------------------------------------------------------------------
  function enter(created, stagger) {
    const now = performance.now()
    const fly = flyOrigin && now - flyOrigin.at < FLY_WINDOW_MS ? flyOrigin : null
    if (fly) flyOrigin = null
    if (fly && !isReduced) {
      const from = map.project(fly.lngLat)
      for (const e of created) {
        const to = map.project([e.place.lng, e.place.lat])
        const body = e.btn.querySelector(e.dot ? '.mp-pin__dot' : '.mp-pin__body')
        body?.animate?.(
          [{ translate: `${from.x - to.x}px ${from.y - to.y}px`, scale: 0.6, opacity: 0 }, { translate: '0 0', scale: 1, opacity: 1 }],
          { duration: FLY_MS, easing: cubicOut, fill: 'backwards' },
        )
      }
      return
    }
    let list = created
    if (stagger && !isReduced) {
      // radial from the centre of the view: the nearest first, only the first 16 that are on screen
      const c = map.getContainer()
      const cx = c.clientWidth / 2
      const cy = c.clientHeight / 2
      const withPos = created.map(e => {
        const p = map.project([e.place.lng, e.place.lat])
        return { e, d: Math.hypot(p.x - cx, p.y - cy), on: p.x >= 0 && p.x <= c.clientWidth && p.y >= 0 && p.y <= c.clientHeight }
      }).sort((a, b) => a.d - b.d)
      let i = 0
      list = []
      for (const w of withPos) {
        if (w.on && i < STAGGER_COUNT) { w.e.btn.style.setProperty('--mp-d', `${i * STAGGER_MS}ms`); i += 1; list.push(w.e) }
      }
    } else if (!stagger && created.length > 40) list = []
    for (const e of list) {
      e.btn.classList.add(isReduced ? 'is-enter-fade' : 'is-enter')
      const done = () => { e.btn.classList.remove('is-enter', 'is-enter-fade'); e.btn.style.removeProperty('--mp-d') }
      e.btn.addEventListener('animationend', done, { once: true })
      later(done, 900)
    }
  }

  // ---- keyboard: roving tabindex + arrows ------------------------------------------------------------------------
  function focusables() {
    const list = []
    for (const e of pins.values()) if (!e.leaving) list.push({ key: e.place.id, idx: order.get(e.place.id) ?? 0, btn: e.btn })
    for (const [key, b] of bubbles) list.push({ key, idx: b.data.idx, btn: b.btn })
    return list.sort((a, b) => a.idx - b.idx)
  }

  function applyRoving() {
    const list = focusables()
    const want = list.find(x => x.key === rovingId) || list.find(x => x.key === selectedId) || list[0]
    for (const x of list) x.btn.tabIndex = x === want ? 0 : -1
    rovingId = want ? want.key : null
  }

  function onKey(e, key) {
    const k = e.key
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(k)) return
    const list = focusables()
    const i = list.findIndex(x => x.key === key)
    if (i < 0) return
    let next = i
    if (k === 'ArrowRight' || k === 'ArrowDown') next = Math.min(list.length - 1, i + 1)
    else if (k === 'ArrowLeft' || k === 'ArrowUp') next = Math.max(0, i - 1)
    else if (k === 'Home') next = 0
    else next = list.length - 1
    e.preventDefault()
    e.stopPropagation() // the map must not pan on the arrow keys
    rovingId = list[next].key
    applyRoving()
    list[next].btn.focus()
  }

  // ---- public ----------------------------------------------------------------------------------------------------
  return {
    /** New list of (already filtered) places, in list order. Pins are diffed by id. */
    setPlaces(next) {
      places = next
      order = new Map(next.map((p, i) => [p.id, i]))
      index = createClusterIndex(next)
      sync()
    },
    /** First draw, with the staggered radial appearance. */
    reveal() {
      if (revealed) return
      revealed = true
      sync({ stagger: true })
    },
    onZoomEnd() { sync() },
    setSelected(id) {
      if (id === selectedId) return
      selectedId = id
      if (id) rovingId = id
      sync()
    },
    setHovered(id) {
      if (id === hoveredId) return
      hoveredId = id
      applyState()
      applyDots()
    },
    /** Remembers where a tapped bubble was, so the pins it fell apart into fly out of that point. */
    markFlyOrigin(lngLat) { flyOrigin = { lngLat, at: performance.now() } },
    expansionZoom: id => index.expansionZoom(id),
    setText(next) {
      labels = next
      for (const e of pins.values()) { patchPin(e, e.place, labels); e.btn.setAttribute('aria-label', labels.place(e.place)) }
      for (const b of bubbles.values()) patchBubble(b, b.data, labels.cluster(b.data.count))
    },
    setReduced(v) { isReduced = v },
    destroy() {
      dead = true
      map.off('dragstart', onDragStart)
      for (const t of timers) clearTimeout(t)
      timers.clear()
      for (const e of pins.values()) e.marker.remove()
      for (const b of bubbles.values()) b.marker.remove()
      pins.clear()
      bubbles.clear()
    },
  }
}
