// Design audit on a Pixel 7: per screen, in dark/light and en/az: horizontal overflow, clipped text, small tap targets,
// broken images, low-contrast text. Writes screenshots to tour-out/personas/aysel/design-*.png and a JSON summary.
const L = require('./aysel-r2-lib')
const fs = require('fs')
const ONLY = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean)

const SCREENS = [
  ['home', '/', {}],
  ['friends-tab', '/', { storage: { rufesto_home_tab: 'friends' } }],
  ['discover-tab', '/', { storage: { rufesto_home_tab: 'discover' } }],
  ['explore', '/explore', {}],
  ['map', '/map', {}],
  ['restaurant-bella', '/restaurant/bella-roma', {}],
  ['restaurant-fincan', '/restaurant/fincan-coffee', {}],
  ['profile', '/profile', {}],
  ['notifications', '/notifications', {}],
  ['friends-page', '/friends', {}],
  ['table-none', '/table', {}],
  ['reserve', '/book/bella-roma', {}],
]

const MEASURE = () => {
  const vis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.05 }
  const inViewport = r => r.bottom > 0 && r.top < innerHeight * 6
  const iw = innerWidth
  const desc = el => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : '') + ' "' + (el.innerText || el.getAttribute('aria-label') || el.alt || '').trim().replace(/\s+/g, ' ').slice(0, 28) + '"'
  const out = { overflowX: document.documentElement.scrollWidth > iw + 1 ? document.documentElement.scrollWidth - iw : 0, small: [], clipped: [], ellipsis: [], broken: [], contrast: [], noName: [] }
  // tap targets
  for (const el of document.querySelectorAll('a[href], button, [role=button], [role=tab], input:not([type=hidden]), select, textarea, summary')) {
    if (!vis(el)) continue
    const r = el.getBoundingClientRect()
    if (!inViewport(r) || r.left > iw) continue
    // inline links inside a text block are not counted (WCAG exception), only block-ish controls
    if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') continue
    if (r.height < 40 || r.width < 40) {
      // hit-ext pseudo areas: the app extends hit areas with ::after on some controls
      out.small.push(`${desc(el)} ${Math.round(r.width)}x${Math.round(r.height)}`)
    }
    const name = (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || el.placeholder || el.getAttribute('aria-labelledby') || '').trim()
    if (!name && el.tagName !== 'INPUT') out.noName.push(desc(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height))
  }
  // clipped / ellipsised text
  for (const el of document.querySelectorAll('h1,h2,h3,p,span,a,button,div,li,label')) {
    if (!vis(el) || el.children.length > 3) continue
    const s = getComputedStyle(el), r = el.getBoundingClientRect()
    if (!inViewport(r) || r.left > iw || !(el.innerText || '').trim()) continue
    if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
      if (s.textOverflow === 'ellipsis') out.ellipsis.push(desc(el))
      else if (s.overflowX === 'hidden' || s.overflowX === 'clip') out.clipped.push(desc(el))
    }
    if (r.right > iw + 1 && s.position !== 'fixed' && !el.closest('[style*="overflow-x: auto"], .dsc-rail, .soc-chips, [class*="rail"], [class*="scroll"]')) out.clipped.push('overflows right edge: ' + desc(el) + ' right=' + Math.round(r.right))
  }
  for (const i of document.images) { if (vis(i) && i.complete && i.naturalWidth === 0) out.broken.push(i.currentSrc.slice(-60)) }
  // contrast for text leaves
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]) }
  const parse = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(x => parseFloat(x)); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1] }
  const bgOf = el => { for (let p = el; p; p = p.parentElement) { const s = getComputedStyle(p); if (s.backgroundImage !== 'none') return null; const c = parse(s.backgroundColor); if (c && c[3] > 0.9) return c } return [255, 255, 255, 1] }
  const seen = new Set()
  for (const el of document.querySelectorAll('p,span,a,button,h1,h2,h3,h4,label,div,li,small')) {
    if (!vis(el)) continue
    const own = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).map(n => n.textContent.trim()).join(' ')
    if (!own) continue
    const r = el.getBoundingClientRect(); if (!inViewport(r) || r.left > iw) continue
    const s = getComputedStyle(el), fg = parse(s.color), bg = bgOf(el); if (!fg || !bg) continue
    const op = fg[3] * (+s.opacity)
    const mix = fg.slice(0, 3).map((v, k) => v * op + bg[k] * (1 - op))
    const l1 = lum(mix), l2 = lum(bg), ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
    const size = parseFloat(s.fontSize), bold = +s.fontWeight >= 700
    const need = size >= 24 || (size >= 18.66 && bold) ? 3 : 4.5
    if (ratio < need) { const key = own.slice(0, 20) + Math.round(ratio * 10); if (!seen.has(key)) { seen.add(key); out.contrast.push(`${ratio.toFixed(2)}:1 (need ${need}) ${Math.round(size)}px "${own.slice(0, 30)}"`) } }
  }
  for (const k of ['small', 'clipped', 'ellipsis', 'noName', 'contrast']) { const u = [...new Set(out[k])]; out[k] = u.slice(0, 40); out[k + 'N'] = u.length }
  return out
}

;(async () => {
  const b = await L.launch()
  const summary = {}
  for (const lang of ['en', 'az']) for (const theme of ['dark', 'light']) {
    for (const [name, path, o] of SCREENS) {
      if (ONLY.length && !ONLY.includes(name)) continue
      if (lang === 'az' && !['home', 'discover-tab', 'friends-tab', 'restaurant-bella', 'profile', 'reserve'].includes(name)) continue
      const A = await L.phone(b, 'Aysel Məmmədova', { lang, storage: { ...(o.storage || {}), rufesto_theme: theme } })
      try {
        await A.page.goto(L.CONSUMER + path, { waitUntil: 'load' })
        await A.page.waitForTimeout(3500)
        await A.page.evaluate(() => window.scrollTo(0, 0))
        const key = `${name}.${lang}.${theme}`
        await L.shot(A.page, `design-${key}`)
        const m = await A.page.evaluate(MEASURE)
        summary[key] = { ...m, errors: A.errors.filter(e => !/notifications\?select|ERR_ABORTED/.test(e)) }
        L.log(key.padEnd(34), 'overflowX', m.overflowX, '| small', m.smallN, '| clipped', m.clippedN, '| ellipsis', m.ellipsisN, '| broken', m.broken.length, '| noName', m.noNameN, '| contrast', m.contrastN)
      } catch (e) { L.log(name, lang, theme, 'FAILED', String(e.message).split('\n')[0]) }
      await A.ctx.close()
    }
  }
  fs.writeFileSync(L.path.join(L.OUT, 'design-summary.json'), JSON.stringify(summary, null, 1))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
