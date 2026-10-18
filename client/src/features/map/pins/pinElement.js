// DOM of one pin and one count bubble, built imperatively (no React per marker). MapLibre owns the transform of the
// marker element, so the marker element is an empty zero-size anchor and everything visible lives in a <button> inside it;
// the state classes (is-selected, is-closed, is-dot, has-ring, is-hover) go on that button.
//
//   div.mp-marker                      the MapLibre marker element, 0 x 0 at the venue's point
//     button.mp-pin                    state classes, aria-label, aria-pressed, roving tabindex, 44 px hit area (::before)
//       span.mp-pin__body              enter / leave / hover / selected motion (scale, translate, opacity)
//         span.mp-pin__pill            28 px tall pill: kind icon + star + rating   (icon-only circle without rating)
//         span.mp-pin__tail            6 px tail, its tip is the anchor
//       span.mp-pin__dot               12 px dot, shown instead of the body when the pill would collide (36 px hit area)
//
// Text only ever goes in through textContent / setAttribute; the SVG markup below is static.

const SVG_OPEN = '<svg class="mp-pin__icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
const ICONS = {
  coffee: '<path d="M5 9h11v4.5A4.5 4.5 0 0 1 11.5 18h-2A4.5 4.5 0 0 1 5 13.5z"/><path d="M16 10.5h1.2a2.3 2.3 0 0 1 0 4.6h-1.6"/><path d="M8 3.5v2.5M12 3.5v2.5"/>',
  quick: '<path d="M5.5 8.5h13l-1.2 11.5H6.7z"/><path d="M9 8.5V7a3 3 0 0 1 6 0v1.5"/>',
  restaurant: '<path d="M6.5 3v5.5a2.5 2.5 0 0 0 5 0V3"/><path d="M9 3v18"/><path d="M16.5 21V3c-2.2 1.6-3 4.4-3 7.5v2h3"/>',
}
const STAR = '<svg class="mp-pin__star" viewBox="0 0 24 24" width="10" height="10" aria-hidden="true" focusable="false"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z" fill="currentColor"/></svg>'

const iconOf = kind => `${SVG_OPEN}${ICONS[kind] || ICONS.restaurant}</svg>`

function div(className) {
  const el = document.createElement('div')
  el.className = className
  return el
}

/** @returns {{ el: HTMLElement, btn: HTMLButtonElement, refs: object }} */
export function makePin(place, text) {
  const el = div('mp-marker')
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'mp-pin'
  btn.tabIndex = -1
  btn.dataset.id = place.id
  btn.setAttribute('aria-pressed', 'false')

  const body = document.createElement('span')
  body.className = 'mp-pin__body'
  const pill = document.createElement('span')
  pill.className = 'mp-pin__pill'
  const tail = document.createElement('span')
  tail.className = 'mp-pin__tail'
  const dot = document.createElement('span')
  dot.className = 'mp-pin__dot'

  body.append(pill, tail)
  btn.append(body, dot)
  el.append(btn)

  const refs = { pill, sig: '' }
  patchPin({ btn, refs }, place, text)
  return { el, btn, refs }
}

/** Brings the content of a pin up to date; cheap when nothing changed. Class state (open, ring) is always refreshed. */
export function patchPin(entry, place, text) {
  const { btn, refs } = entry
  const rating = place.rating != null ? text.rating(place.rating) : ''
  const sig = `${place.kind}|${rating}`
  if (sig !== refs.sig) {
    refs.sig = sig
    refs.pill.innerHTML = iconOf(place.kind) + (rating ? `<span class="mp-pin__rating">${STAR}<span class="mp-pin__num"></span></span>` : '')
    if (rating) refs.pill.querySelector('.mp-pin__num').textContent = rating
    btn.classList.toggle('mp-pin--icon', !rating)
  }
  btn.classList.toggle('is-closed', !place.open_now)
  btn.classList.toggle('has-ring', place.followed === true || (place.friends?.count || 0) > 0)
}

export function makeBubble(data, label) {
  const el = div('mp-marker')
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'mp-cluster'
  btn.tabIndex = -1
  const n = document.createElement('span')
  n.className = 'mp-cluster__n'
  btn.append(n)
  el.append(btn)
  patchBubble({ btn, n }, data, label)
  return { el, btn, n }
}

export function patchBubble(entry, data, label) {
  entry.n.textContent = String(data.count)
  entry.btn.setAttribute('aria-label', label)
  entry.btn.dataset.size = data.count >= 50 ? 'l' : data.count >= 10 ? 'm' : 's'
}
