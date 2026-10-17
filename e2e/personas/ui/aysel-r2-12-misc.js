const L = require('./aysel-r2-lib')
;(async () => {
  const b = await L.launch()
  await L.step('distance copy with location (All restaurants)', async () => {
    const G = await L.phone(b, 'Aysel Məmmədova', { geo: { latitude: 40.386, longitude: 49.818 }, storage: { rufesto_home_tab: 'discover' } })
    await G.page.goto(L.CONSUMER + '/'); await G.page.waitForSelector('.dsc .dsc-rc'); await G.page.waitForTimeout(1000)
    await G.page.getByRole('button', { name: 'Use my location for nearby' }).click()
    await G.page.waitForFunction(() => /within/.test(document.body.innerText), null, { timeout: 15000 }).catch(() => {})
    await G.page.waitForTimeout(2000)
    L.log(await G.page.evaluate(() => [...document.querySelectorAll('.dsc section')].map(s => (s.querySelector('h2')?.innerText || '?') + ': ' + [...s.querySelectorAll('.dsc-rc')].map(c => c.querySelector('h3')?.innerText + ' [' + (c.querySelector('.dsc-rc-meta')?.innerText || '') + ']').join(', ')).filter(l => /Open now|All restaurants|New places/.test(l)).join('\n')))
    await G.ctx.close()
  })
  await L.step('console noise (raw failed requests) on Home / restaurant / profile', async () => {
    const A = await L.phone(b, 'Aysel Məmmədova')
    const fails = []
    A.page.on('requestfailed', r => fails.push(r.method() + ' ' + new URL(r.url()).pathname.replace(/^\/rest\/v1\//, '') + ' ' + (r.failure() || {}).errorText))
    const cons = []
    A.page.on('console', m => { if (['error', 'warning'].includes(m.type())) cons.push(m.type() + ': ' + m.text().slice(0, 120)) })
    for (const p of ['/', '/restaurant/fincan-coffee', '/profile', '/explore', '/notifications']) { await A.page.goto(L.CONSUMER + p); await A.page.waitForTimeout(3000) }
    L.log('failed requests:', fails.length, [...new Set(fails)].slice(0, 6))
    L.log('console errors/warnings:', cons.length, [...new Set(cons)].slice(0, 6))
    await A.ctx.close()
  })
  await L.step('AZ: cuisine names, Cafe Restaurant label', async () => {
    const Z = await L.phone(b, 'Aysel Məmmədova', { lang: 'az', storage: { rufesto_home_tab: 'discover' } })
    await Z.page.goto(L.CONSUMER + '/'); await Z.page.waitForSelector('.dsc .dsc-rc'); await Z.page.waitForTimeout(1500)
    L.log('chips (az):', await Z.page.evaluate(() => [...document.querySelectorAll('.dsc-chip, .dsc button')].filter(b => b.offsetParent && b.getBoundingClientRect().top < 600).map(b => b.innerText.trim()).filter(Boolean).slice(0, 10)))
    L.log('card meta (az):', await Z.page.evaluate(() => [...document.querySelectorAll('.dsc-rc-meta')].slice(0, 4).map(e => e.innerText)))
    await Z.page.goto(L.CONSUMER + '/restaurant/fincan-coffee'); await Z.page.waitForTimeout(3000)
    L.log('header meta (az):', await Z.page.evaluate(() => document.querySelector('h1')?.nextElementSibling?.innerText.replace(/\n+/g, ' ')))
    await Z.ctx.close()
  })
  await L.step('FAB vs content on Home (phone)', async () => {
    const A = await L.phone(b, 'Aysel Məmmədova', { colorScheme: 'dark' })
    await A.page.goto(L.CONSUMER + '/'); await A.page.waitForSelector('.soc-feed-slot article'); await A.page.waitForTimeout(1500)
    const fab = await A.page.evaluate(() => { const f = document.querySelector('.soc-fab'); if (!f) return null; const r = f.getBoundingClientRect(); const over = [...document.querySelectorAll('.soc-chip, .soc-avail, a, button')].filter(e => e !== f && e.offsetParent).filter(e => { const q = e.getBoundingClientRect(); return q.right > r.left && q.left < r.right && q.bottom > r.top && q.top < r.bottom && !e.closest('.bottom-nav') }).map(e => (e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 24)); return { box: [Math.round(r.left), Math.round(r.top), Math.round(r.width)], overlapping: over.slice(0, 5) } })
    L.log('FAB box + elements under it:', JSON.stringify(fab))
    await L.shot(A.page, '12-home-dark')
    await A.ctx.close()
  })
  await L.step('theme: OS dark / OS light / stored', async () => {
    for (const [scheme, stored] of [['dark', null], ['light', null], ['light', 'dark'], ['dark', 'light']]) {
      const A = await L.phone(b, 'Aysel Məmmədova', { colorScheme: scheme, storage: stored ? { rufesto_theme: stored } : {} })
      await A.page.goto(L.CONSUMER + '/'); await A.page.waitForSelector('.soc-feed-slot article'); await A.page.waitForTimeout(800)
      L.log(`OS=${scheme} stored=${stored || '-'} ->`, await A.page.evaluate(() => document.documentElement.getAttribute('data-theme')), '| theme-color meta:', await A.page.evaluate(() => document.querySelector('meta[name=theme-color]')?.content))
      await A.ctx.close()
    }
  })
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
