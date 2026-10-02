// Phone checks shared by the mobile checklist: horizontal overflow, text that spills out of its container,
// small tap targets, console errors and the Leaflet stacking glitch. Everything uses expect.soft, so one walk
// reports every problem it meets instead of stopping at the first; failing screens get a PNG in test-results.
const { expect } = require('./fixtures')

const MIN_TAP_PX = 40   // a finger needs about 40 CSS px of height

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'shot'

/** Runs in the page. Facts about the layout of the current screen; no assertions. */
function measureLayout() {
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const desc = el => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/)[0] : '')
  const root = document.documentElement
  const iw = window.innerWidth
  // inside a horizontally clipping / scrolling ancestor, or position: fixed: cannot widen the document
  const harmless = el => {
    for (let p = el; p && p !== document.body && p !== root; p = p.parentElement) {
      const s = getComputedStyle(p)
      if (p !== el && s.overflowX !== 'visible') return true
      if (s.position === 'fixed') return true
    }
    return false
  }

  const offenders = []
  if (root.scrollWidth > iw) {
    for (const el of document.body.querySelectorAll('*')) {
      if (!vis(el) || harmless(el)) continue
      const r = el.getBoundingClientRect()
      if (r.right > iw + 1 || r.left < -1) offenders.push({ what: `${desc(el)} "${(el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 24)}"`, left: Math.round(r.left), right: Math.round(r.right) })
    }
    offenders.sort((a, b) => b.right - a.right)
  }

  // The scrollWidth test cannot see content that an overflow:hidden ancestor as wide as the screen cuts off, so look for
  // interactive / text elements that straddle the right edge inside such an ancestor (scrollers with auto|scroll are fine).
  const cutOff = []
  for (const el of document.body.querySelectorAll('a, button, input, select, textarea, [role="button"], [role="tab"], h1, h2, h3, p, label')) {
    if (!vis(el)) continue
    const r = el.getBoundingClientRect()
    if (r.right <= iw + 1 || r.left >= iw - 1) continue
    let clip = null
    for (let p = el.parentElement; p && p !== root; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX
      if (o !== 'visible') { clip = { p, o }; break }
    }
    if (!clip || /auto|scroll/.test(clip.o) || clip.p === document.body || clip.p.getBoundingClientRect().right < iw - 1) continue
    if (getComputedStyle(el).position === 'fixed') continue
    cutOff.push(`${desc(el)} "${(el.innerText || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 24)}" right edge ${Math.round(r.right)} > ${iw}, clipped by ${desc(clip.p)}`)
  }

  // main headings: their text must stay inside the heading box, the heading inside its parent and the viewport
  const badHeadings = []
  for (const h of document.querySelectorAll('h1, h2, h3, [role="heading"]')) {
    if (!vis(h)) continue
    const r = h.getBoundingClientRect()
    if (r.left >= iw || r.right <= 0) continue   // scrolled away inside a carousel
    const range = document.createRange()
    range.selectNodeContents(h)
    const t = range.getBoundingClientRect()
    const parent = (h.parentElement || h).getBoundingClientRect()
    const clipped = h.scrollWidth > h.clientWidth + 1
    const spills = t.right > r.right + 1 || t.right > parent.right + 1 || t.right > iw + 1 || t.left < -1
    if (clipped || spills) badHeadings.push(`"${(h.innerText || '').trim().slice(0, 40)}" ${clipped ? `scrollWidth ${h.scrollWidth} > clientWidth ${h.clientWidth}` : `text right edge ${Math.round(t.right)} vs box ${Math.round(r.right)} / viewport ${iw}`}`)
  }

  return {
    sw: root.scrollWidth, iw,
    scale: window.visualViewport ? window.visualViewport.scale : 1,
    offenders: offenders.slice(0, 4),
    cutOff: cutOff.slice(0, 4),
    badHeadings: badHeadings.slice(0, 4),
  }
}

/**
 * `watch` is the console/network fixture of support/fixtures.js. Returns the per-test toolbox:
 *   check(label)         overflow + zoom + heading fit + new console errors since the last check
 *   scrollThrough(label) scroll the whole page in steps, overflow check at every step
 *   tap(locator, label)  assert the target is >= 40px tall and not covered, then tap it (touch event, not a mouse click)
 *   shot(label)          save + attach a PNG of the current screen
 */
function walker(page, watch, testInfo) {
  const smallSeen = new Set()
  let errorsSeen = watch.consoleErrors.length
  let shots = 0

  async function shot(label, locator) {
    const file = testInfo.outputPath(`${String(++shots).padStart(2, '0')}-${slug(label)}.png`)
    try {
      if (locator) await locator.evaluate(el => { el.dataset.qaOutline = el.style.outline; el.style.outline = '3px solid #ff2d55' }).catch(() => {})
      await page.screenshot({ path: file })
      if (locator) await locator.evaluate(el => { el.style.outline = el.dataset.qaOutline || ''; delete el.dataset.qaOutline }).catch(() => {})
      await testInfo.attach(slug(label), { path: file, contentType: 'image/png' })
    } catch { /* page is gone: the assertion that follows still reports */ }
  }

  async function check(label, { headings = true } = {}) {
    await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {})
    const m = await page.evaluate(measureLayout)
    const problems = []
    if (m.sw > m.iw) problems.push(`horizontal overflow: scrollWidth ${m.sw} > innerWidth ${m.iw}; widest: ${m.offenders.map(o => `${o.what} (${o.left}..${o.right})`).join(' | ') || 'n/a'}`)
    if (m.cutOff.length) problems.push(`content is cut off at the right edge: ${m.cutOff.join(' | ')}`)
    if (m.scale > 1.01) problems.push(`page is zoomed (visualViewport.scale ${m.scale.toFixed(2)})`)
    if (headings && m.badHeadings.length) problems.push(`heading text overflows its container: ${m.badHeadings.join(' | ')}`)
    const errors = watch.consoleErrors.slice(errorsSeen)
    errorsSeen = watch.consoleErrors.length
    if (errors.length) problems.push(`console errors: ${errors.join(' | ')}`)
    if (problems.length) await shot(`${label} problems`)
    expect.soft(problems, `[${label}]`).toEqual([])
  }

  async function scrollThrough(label, { maxSteps = 25 } = {}) {
    const r = await page.evaluate(async maxSteps => {
      const root = document.documentElement
      const step = Math.max(300, Math.round(innerHeight * 0.8))
      let widest = root.scrollWidth, widestAt = 0, steps = 0
      for (let y = 0; steps < maxSteps; y += step, steps++) {
        scrollTo({ top: y, behavior: 'instant' })
        await new Promise(res => setTimeout(res, 80))
        if (root.scrollWidth > widest) { widest = root.scrollWidth; widestAt = scrollY }
        if (y + innerHeight >= root.scrollHeight - 1) break
      }
      return { widest, widestAt, iw: innerWidth, height: root.scrollHeight, steps }
    }, maxSteps)
    if (r.widest > r.iw) {
      await page.evaluate(y => scrollTo({ top: y, behavior: 'instant' }), r.widestAt)
      await shot(`${label} overflow while scrolling`)
    }
    expect.soft(r.widest, `[${label}] widest scrollWidth while scrolling ${r.height}px of page (${r.steps} steps), viewport ${r.iw}`).toBeLessThanOrEqual(r.iw)
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }))
  }

  /** Returns true when the tap happened; false when something else sits on top of the target (reported, nothing is tapped). */
  async function tap(locator, label) {
    await locator.waitFor({ state: 'visible' })
    await locator.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })).catch(() => {})
    const t = await locator.evaluate(el => {
      const r = el.getBoundingClientRect()
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      const covered = !!top && !el.contains(top)
      return { h: r.height, covered, by: covered ? top.tagName.toLowerCase() + (typeof top.className === 'string' && top.className ? '.' + top.className.trim().split(/s+/)[0] : '') : '' }
    })
    if (t.h < MIN_TAP_PX - 0.05 && !smallSeen.has(label)) {
      smallSeen.add(label)
      testInfo.annotations.push({ type: 'small-tap-target', description: `${label}: ${t.h.toFixed(1)}px` })
      await shot(`small target ${label}`, locator)
      expect.soft(t.h, `tap target "${label}" is ${t.h.toFixed(1)}px tall, needs >= ${MIN_TAP_PX}px`).toBeGreaterThanOrEqual(MIN_TAP_PX)
    }
    if (t.covered) {
      testInfo.annotations.push({ type: 'covered-tap-target', description: `${label} is under <${t.by}>` })
      await shot(`covered target ${label}`, locator)
      expect.soft(t.covered, `tap target "${label}" is covered by <${t.by}> at its centre, a finger cannot reach it`).toBe(false)
      return false
    }
    await locator.tap()
    return true
  }

  return { check, scrollThrough, tap, shot }
}

/** The bottom navigation (rendered at <= 768px). Home / Explore / Map are named links, Profile is an unnamed icon link. */
function bottomNav(page) {
  const nav = page.locator('nav').filter({ has: page.locator('a[href="/map"]') })
  return {
    home: nav.getByRole('link', { name: 'Home', exact: true }),
    explore: nav.getByRole('link', { name: 'Explore', exact: true }),
    map: nav.getByRole('link', { name: 'Map', exact: true }),
    profile: nav.locator('a[href="/profile"]'),
    qr: nav.getByRole('button', { name: /scan qr|active table/i }),
  }
}

/** In the page: where does Leaflet's z-index 200..1000 land? Nearest ancestor of .leaflet-container that forms a stacking context. */
function leafletStacking() {
  const lc = document.querySelector('.leaflet-container')
  if (!lc) return null
  const forms = el => {
    if (el === document.documentElement) return true
    const s = getComputedStyle(el)
    const flexChild = /flex|grid/.test(getComputedStyle(el.parentElement).display)
    return (s.zIndex !== 'auto' && (s.position !== 'static' || flexChild)) || s.position === 'fixed' || s.position === 'sticky' ||
      s.isolation === 'isolate' || +s.opacity < 1 || s.transform !== 'none' || s.filter !== 'none' || s.perspective !== 'none' ||
      s.mixBlendMode !== 'normal' || /paint|layout|strict|content/.test(s.contain) || /transform|opacity|filter/.test(s.willChange)
  }
  for (let p = lc.parentElement; p; p = p.parentElement) {
    if (forms(p)) {
      const z = getComputedStyle(p).zIndex
      return { root: p === document.documentElement, el: p.tagName.toLowerCase() + (typeof p.className === 'string' && p.className ? '.' + p.className.trim().split(/\s+/)[0] : ''), z: z === 'auto' ? 0 : +z }
    }
  }
  return null
}

module.exports = { MIN_TAP_PX, walker, bottomNav, leafletStacking, slug }
