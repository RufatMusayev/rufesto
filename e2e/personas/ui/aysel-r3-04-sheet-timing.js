// Round 3, part 3: dish sheet open timing (tap -> first frame / fully open / first review visible) and drag smoothness (fps, long frames).
// node aysel-r3-04-sheet-timing.js [--throttle]   --throttle = CPU 4x, 1.6 Mbit/s, 150 ms RTT
const L = require('./aysel-r3-lib')
const fs = require('fs')
const THROTTLE = process.argv.includes('--throttle')
const N = 5
const sleep = ms => new Promise(r => setTimeout(r, ms))
const med = a => { const s = a.filter(x => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null }
const rnd = x => (x == null ? null : Math.round(x))

;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova')
  const cdp = await A.ctx.newCDPSession(A.page)
  if (THROTTLE) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })
  }
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts })
  const page = A.page
  page.setDefaultTimeout(30000)
  await page.goto(L.CONSUMER + '/restaurant/bella-roma?tab=menu', { timeout: 90000 }); await page.waitForSelector('.mn-row', { timeout: 60000 }); await sleep(THROTTLE ? 4000 : 1500)
  const rows = { first_frame: [], fully_open: [], first_review_visible: [], first_review_with_name: [] }
  const frames = { fps_median: [], long_frames_50ms: [], max_frame_ms: [], p95_frame_ms: [] }
  const dishes = await page.evaluate(() => [...document.querySelectorAll('.mn-row')].map((r, i) => (r.querySelector('.mn-tag--rate') && !r.classList.contains('is-sold') ? i : -1)).filter(i => i >= 0))
  L.log('rows with reviews:', dishes.length)
  for (let i = 0; i < N; i++) {
    const n = dishes[i % dishes.length]
    await page.locator('.mn-row-btn').nth(n).scrollIntoViewIfNeeded(); await sleep(400)
    await page.evaluate(() => {
      window.__m = {}
      document.addEventListener('click', e => { if (e.target.closest('.mn-row-btn')) window.__m.t0 = performance.now() }, { capture: true, once: true })
      const tick = () => {
        const m = window.__m
        const p = document.querySelector('.bs-panel')
        if (p && m.t0) {
          if (!m.panel) { m.panel = performance.now(); requestAnimationFrame(() => { m.first = performance.now() }) }
          const tr = getComputedStyle(p).transform; const ty = tr && tr !== 'none' ? parseFloat(tr.split(',')[5]) : 0
          if (!m.open && m.first && Math.abs(ty) < 1) m.open = performance.now()
          const nm = p.querySelector('.rv-name'); if (nm && !m.review) { const q = nm.getBoundingClientRect(); if (q.height > 0 && q.top < innerHeight - 70) { m.review = performance.now(); m.reviewName = nm.innerText } }
        }
        if (!(m.open && m.review) && performance.now() < (m.t0 || 0) + 15000 || !m.t0) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    await page.locator('.mn-row-btn').nth(n).click()
    await page.waitForSelector('.bs-panel'); for (let w = 0; w < 150; w++) { if (await page.evaluate(() => !!(window.__m && window.__m.review))) break; await sleep(100) }; await sleep(300)
    const m = await page.evaluate(() => window.__m)
    rows.first_frame.push(m.first - m.t0); rows.fully_open.push(m.open ? m.open - m.t0 : null); rows.first_review_visible.push(m.review ? m.review - m.t0 : null)
    L.log('run', i, 'first frame', rnd(m.first - m.t0), '| fully open', m.open ? rnd(m.open - m.t0) : null, '| first review', m.review ? rnd(m.review - m.t0) + ' (' + m.reviewName + ')' : 'NOT visible in 15 s')
    // drag smoothness: down 150 px then back up over ~600 ms, with a frame logger
    const top = await page.evaluate(() => document.querySelector('.bs-panel').getBoundingClientRect().top)
    await page.evaluate(() => {
      window.__f = { t: [], loaf: [] }
      try { new PerformanceObserver(l => { for (const e of l.getEntries()) window.__f.loaf.push(Math.round(e.duration)) }).observe({ type: 'long-animation-frame', buffered: false }) } catch (e) {}
      let go = true; window.__stop = () => { go = false }
      const tick = t => { window.__f.t.push(t); if (go) requestAnimationFrame(tick) }; requestAnimationFrame(tick)
    })
    const y0 = top + 14
    await touch('touchStart', [{ x: 206, y: y0 }])
    for (let k = 1; k <= 24; k++) { const dy = k <= 12 ? k * 12.5 : (24 - k) * 12.5; await touch('touchMove', [{ x: 206, y: y0 + dy }]); await sleep(25) }
    await touch('touchEnd', []); await sleep(500)
    const f = await page.evaluate(() => { window.__stop(); const t = window.__f.t; const d = []; for (let i = 1; i < t.length; i++) d.push(t[i] - t[i - 1]); return { d, loaf: window.__f.loaf } })
    const during = f.d.slice(0, Math.max(10, Math.floor(f.d.length * 0.8)))
    const sorted = [...during].sort((a, c) => a - c)
    const medMs = sorted[Math.floor(sorted.length / 2)]
    frames.fps_median.push(1000 / medMs); frames.long_frames_50ms.push(during.filter(x => x > 50).length); frames.max_frame_ms.push(Math.max(...during)); frames.p95_frame_ms.push(sorted[Math.floor(sorted.length * 0.95)])
    L.log('   drag: frames', during.length, '| median frame', medMs.toFixed(1), 'ms (', (1000 / medMs).toFixed(0), 'fps ) | p95', sorted[Math.floor(sorted.length * 0.95)].toFixed(1), '| max', Math.max(...during).toFixed(1), '| frames >50 ms:', during.filter(x => x > 50).length, '| LoAF >50 ms:', f.loaf.filter(x => x > 50).length)
    await page.keyboard.press('Escape'); await sleep(700)
  }
  const out = { throttle: THROTTLE, sheet_open_ms: Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, { median: rnd(med(v)), all: v.map(rnd) }])), drag: Object.fromEntries(Object.entries(frames).map(([k, v]) => [k, { median: +med(v).toFixed(1), all: v.map(x => +x.toFixed(1)) }])) }
  fs.writeFileSync(L.path.join(L.OUT, THROTTLE ? 'sheet-timing-throttled.json' : 'sheet-timing.json'), JSON.stringify(out, null, 1))
  L.log('\n' + (THROTTLE ? 'PHONE (CPU x4, 1.6 Mbit/s)' : 'THIS PC'), JSON.stringify(out, null, 0))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
