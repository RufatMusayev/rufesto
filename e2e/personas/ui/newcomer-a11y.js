// Accessibility basics on the phone profile: tap targets, image alt, accessible names, contrast, tab-bar focus order.
// node personas/ui/newcomer-a11y.js   -> results/a11y.json (+ stdout)
const L = require('./lib')
const out = {}
const note = (k, v) => { out[k] = v; console.log('##', k, typeof v === 'string' ? v : JSON.stringify(v)) }

const AUDIT = () => {
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[hidden]') }
  const label = el => (el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') ? (document.getElementById(el.getAttribute('aria-labelledby')) || {}).innerText : '') || el.innerText || el.getAttribute('title') || (el.querySelector('img[alt]') || {}).alt || '').replace(/\s+/g, ' ').trim()
  const desc = el => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : ''}`
  // tap targets
  const targets = [...document.querySelectorAll('a[href], button, [role=tab], [role=button], input:not([type=hidden]), select, textarea, summary')].filter(vis)
  const small = []
  for (const el of targets) {
    const r = el.getBoundingClientRect()
    // an inline text link inside a paragraph is exempt (WCAG 2.5.8 inline exception); the brief asks 44 px for tabs / chips / buttons
    const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline'
    if ((r.width < 44 || r.height < 44) && !inline) small.push({ el: desc(el), label: label(el).slice(0, 30), w: Math.round(r.width), h: Math.round(r.height) })
  }
  const groups = {}
  for (const s of small) { const k = `${s.el}|${s.label}|${s.w}x${s.h}`; groups[k] = (groups[k] || 0) + 1 }
  // names
  const noName = targets.filter(el => !label(el)).map(el => `${desc(el)} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)} @y${Math.round(el.getBoundingClientRect().top + scrollY)}`)
  // images
  const imgs = [...document.querySelectorAll('img')].filter(vis)
  const noAltAttr = imgs.filter(i => i.getAttribute('alt') === null).map(i => i.currentSrc.replace(/\?.*$/, '').slice(-40))
  const emptyAlt = imgs.filter(i => i.getAttribute('alt') === '').length
  const bgOnly = [...document.querySelectorAll('[style*=background-image]')].filter(vis).length
  // contrast
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map(x => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 } }
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 })
  const bgOf = el => {
    const layers = []
    for (let p = el; p; p = p.parentElement) {
      const s = getComputedStyle(p); const c = parse(s.backgroundColor)
      if (s.backgroundImage !== 'none' && !/gradient/.test(s.backgroundImage)) return { photo: true }
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 }
    for (const l of layers.reverse()) base = over(l, base)
    return base
  }
  const seen = {}, low = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  while (walker.nextNode()) {
    const n = walker.currentNode; const t = n.nodeValue.trim(); if (!t) continue
    const el = n.parentElement; if (!el || !vis(el) || el.closest('script,style,svg')) continue
    const r = el.getBoundingClientRect(); if (r.bottom < 0 || r.top > document.body.scrollHeight) continue
    const s = getComputedStyle(el); const fg0 = parse(s.color); if (!fg0) continue
    const bg = bgOf(el); if (bg.photo) continue
    const op = parseFloat(s.opacity) || 1
    const fg = over({ ...fg0, a: fg0.a * op }, bg)
    const ratio = (Math.max(lum([fg.r, fg.g, fg.b]), lum([bg.r, bg.g, bg.b])) + 0.05) / (Math.min(lum([fg.r, fg.g, fg.b]), lum([bg.r, bg.g, bg.b])) + 0.05)
    const px = parseFloat(s.fontSize); const bold = parseInt(s.fontWeight) >= 700
    const large = px >= 24 || (px >= 18.66 && bold)
    const need = large ? 3 : 4.5
    const key = `${s.color}|${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)}|${px}`
    if (ratio < need && !seen[key]) { seen[key] = 1; low.push({ ratio: +ratio.toFixed(2), need, px, color: s.color, bg: `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`, sample: t.slice(0, 28), el: desc(el) }) }
  }
  low.sort((a, b) => a.ratio - b.ratio)
  return { theme: document.documentElement.getAttribute('data-theme'), lang: document.documentElement.lang, targets: targets.length, smallGroups: Object.entries(groups).map(([k, n]) => `${n}x ${k}`), noName, imgs: imgs.length, noAltAttr, emptyAlt, bgOnly, lowContrast: low.slice(0, 14), h1s: [...document.querySelectorAll('h1')].filter(vis).length, viewport: (document.querySelector('meta[name=viewport]') || {}).content }
}

async function audit(page, name) {
  const r = await page.evaluate(AUDIT)
  note(`audit_${name}`, r)
}

;(async () => {
  for (const theme of ['dark', 'light']) {
    const s = await L.open({ lang: 'en', theme })
    const { page } = s
    await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor(); await page.waitForTimeout(2500)
    await audit(page, `home_${theme}`)
    await page.getByRole('tab').nth(1).click(); await page.waitForTimeout(900); await audit(page, `friends_signedout_${theme}`)
    await page.getByRole('tab').nth(2).click(); await page.waitForTimeout(2500); await audit(page, `discover_${theme}`)
    await page.goto(L.BASE + '/restaurant/brew-and-books', { waitUntil: 'load' }); await page.waitForTimeout(2500); await audit(page, `restaurant_${theme}`)
    if (theme === 'dark') {
      // the dish sheet opens from the ?dish= deep link (the photo-grid tiles are gone since the restaurant page redesign)
      await page.goto(L.BASE + '/restaurant/bella-roma?dish=80000001-0000-0000-0000-000000000020', { waitUntil: 'load' }); await page.waitForTimeout(3000); await audit(page, 'dish_sheet_dark')
    }
    await s.close()
  }
  // signed-in extras
  {
    const s = await L.open({ as: 'Fərid Məlikov', lang: 'en', theme: 'dark' })
    const { page } = s
    await page.goto(L.BASE + '/friends?tab=find', { waitUntil: 'load' }); await page.waitForTimeout(2000)
    await page.getByPlaceholder('Search by name').fill('Aysel'); await page.waitForTimeout(1800); await audit(page, 'find_people')
    await page.goto(L.BASE + '/profile', { waitUntil: 'load' }); await page.waitForTimeout(2000); await audit(page, 'profile')
    await page.goto(L.BASE + '/post/new', { waitUntil: 'load' }); await page.waitForTimeout(1500); await audit(page, 'composer')
    await s.close()
  }
  // focus order of the tab bar + keyboard behaviour (signed out, dark)
  {
    const s = await L.open({ lang: 'en', theme: 'dark' })
    const { page } = s
    await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor(); await page.waitForTimeout(1500)
    const stops = []
    for (let i = 0; i < 14; i++) {
      await page.keyboard.press('Tab')
      stops.push(await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return 'body'; const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return `${e.tagName.toLowerCase()}${e.getAttribute('role') ? '[' + e.getAttribute('role') + ']' : ''}|${(e.getAttribute('aria-label') || e.innerText || '').replace(/\s+/g, ' ').slice(0, 22)}|tabindex=${e.getAttribute('tabindex')}|outline=${cs.outlineStyle} ${cs.outlineWidth}|y=${Math.round(r.top)}` }))
    }
    note('focus_order_first14', stops)
    const tl = await page.evaluate(() => { const t = document.querySelector('[role=tablist]'); return t ? [...t.querySelectorAll('[role=tab]')].map(b => ({ txt: b.innerText, sel: b.getAttribute('aria-selected'), tabindex: b.getAttribute('tabindex'), controls: b.getAttribute('aria-controls'), id: b.id })) : null })
    note('tablist', tl)
    // arrow keys inside the tablist
    await page.getByRole('tab').nth(0).focus(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(400)
    note('arrowright_moves_selection', await page.evaluate(() => [...document.querySelectorAll('[role=tab]')].map(b => b.getAttribute('aria-selected'))))
    note('tabpanel_roles', await page.evaluate(() => document.querySelectorAll('[role=tabpanel]').length))
    // bottom nav
    note('bottom_nav', await page.evaluate(() => [...document.querySelectorAll('.bottom-nav a, .bottom-nav button')].map(e => `${e.tagName.toLowerCase()}|aria-label=${e.getAttribute('aria-label')}|current=${e.getAttribute('aria-current')}|${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`)))
    await s.close()
  }
  L.save('a11y', out)
})()
