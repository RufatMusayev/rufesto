// Round 3, final checks: Open now + Italian filter (switch markup), GPS order of "All places" in Search, AZ café header, bytes on the wire (Home cold, Search zero state).
const L = require('./aysel-r3-lib')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const note = (k, v) => L.log('  >>', k, v)
async function wire(page, cdp) {
  const rows = []; const m = {}
  cdp.on('Network.responseReceived', e => { m[e.requestId] = { type: e.type, url: e.response.url.split('?')[0].split('/').slice(-2).join('/') } })
  cdp.on('Network.loadingFinished', e => { if (m[e.requestId]) rows.push({ ...m[e.requestId], bytes: e.encodedDataLength }) })
  return () => { const by = {}; for (const r of rows) by[r.type] = (by[r.type] || 0) + r.bytes; const js = rows.filter(r => r.type === 'Script').sort((a, b) => b.bytes - a.bytes).slice(0, 3).map(r => r.url + ' ' + Math.round(r.bytes / 1024) + ' KB'); return { total_KB: Math.round(rows.reduce((s, r) => s + r.bytes, 0) / 1024), by_type_KB: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, Math.round(v / 1024)])), requests: rows.length, biggest_scripts: js } }
}
;(async () => {
  const b = await L.launch()
  await L.step('Open now + Italian filter, switch markup', async () => {
    const A = await L.phone(b, 'Aysel Məmmədova'); const page = A.page
    await page.goto(L.CONSUMER + '/explore'); await page.waitForSelector('.sr-row'); await sleep(1500)
    await page.locator('button[aria-label="Filters"]').click(); await page.waitForSelector('.bs-panel'); await sleep(800)
    note('Open now row html', await page.evaluate(() => { const p = document.querySelector('.bs-panel'); const t = [...p.querySelectorAll('*')].find(e => e.children.length === 0 && /^Open now$/.test(e.textContent.trim())); const row = t && (t.closest('label, [class*=row], div')); return row ? row.outerHTML.replace(/\s+/g, ' ').slice(0, 520) : '(not found)' }))
    const sw = page.locator('.bs-panel button').filter({ hasNot: page.locator('*') }).first()
    const cand = await page.evaluate(() => [...document.querySelectorAll('.bs-panel button')].map(b => ({ t: (b.getAttribute('aria-label') || b.innerText || '').trim().slice(0, 18), role: b.getAttribute('role'), checked: b.getAttribute('aria-checked') || b.getAttribute('aria-pressed'), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height) })).slice(0, 4))
    note('first buttons in the sheet', JSON.stringify(cand))
    await page.evaluate(() => { const bs = [...document.querySelectorAll('.bs-panel button')]; const s = bs.find(b => /switch|toggle/.test((b.getAttribute('role') || '') + b.className) || (b.getBoundingClientRect().height === 28)); s && s.click() })
    await sleep(300)
    await page.locator('.bs-panel').getByText('Italian', { exact: true }).click(); await sleep(300)
    await L.shot(page, '22-filters-open-italian-sheet')
    await page.locator('.bs-panel').getByRole('button', { name: /Show/ }).click(); await sleep(3000)
    note('Open now + Italian: text', (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 330))
    await L.shot(page, '22-open-italian-result')
    await A.ctx.close()
  })
  await L.step('GPS: Home pin on, then Search "All places" order', async () => {
    const G = await L.phone(b, 'Aysel Məmmədova', { geo: { latitude: 40.386, longitude: 49.818 } }); const page = G.page
    await page.goto(L.CONSUMER + '/'); await page.waitForSelector('article'); await sleep(1500)
    await page.getByRole('button', { name: /Use my location/i }).click(); await sleep(2500)
    await page.goto(L.CONSUMER + '/explore'); await page.waitForSelector('.sr-row'); await sleep(2500)
    note('All places rows (name / second line)', JSON.stringify(await page.evaluate(() => { const h = [...document.querySelectorAll('h2, h3')].find(e => /All places/.test(e.innerText)); const rows = [...document.querySelectorAll('.sr-row')].filter(r => h && (h.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING)); return rows.map(r => r.innerText.replace(/\n+/g, ' / ').slice(0, 70)) })))
    note('headings', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('h2, h3')].map(e => e.innerText.trim()).filter(t => t.length < 24))))
    await L.shot(page, '22-search-gps')
    await G.ctx.close()
  })
  await L.step('AZ: café header + restaurant', async () => {
    const A = await L.phone(b, 'Aysel Məmmədova', { lang: 'az' }); const page = A.page
    await page.goto(L.CONSUMER + '/restaurant/fincan-coffee'); await sleep(3500)
    note('Fincan header (az)', (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 220))
    await A.ctx.close()
  })
  await L.step('bytes on the wire: Home cold, Search zero state', async () => {
    for (const [label, path] of [['Home cold (first screen + 4 s)', '/'], ['Search zero state (+4 s)', '/explore']]) {
      const A = await L.phone(b, 'Aysel Məmmədova'); const page = A.page
      const cdp = await A.ctx.newCDPSession(page); await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
      const sum = await wire(page, cdp)
      await page.goto(L.CONSUMER + path); await sleep(4500)
      note(label, JSON.stringify(sum()))
      await A.ctx.close()
    }
  })
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
