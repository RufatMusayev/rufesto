const L = require('./aysel-r2-lib')
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova')
  await A.page.goto(L.CONSUMER + '/explore'); await A.page.waitForTimeout(3000)
  const input = A.page.getByPlaceholder(/Dishes|restaurants|Search/i).first()
  const read = () => A.page.evaluate(() => { const m = document.querySelector('main'); const t = (m ? m.innerText : document.body.innerText).split('\n').map(s => s.trim()).filter(Boolean); const i = t.findIndex(x => /Gluten-free|Spicy/.test(x)); const rest = t.slice(i + 1); const dishes = []; for (let k = 0; k < rest.length; k++) if (/^AVAILABLE$|^SOLD OUT$/i.test(rest[k])) dishes.push(rest[k + 1] + ' @ ' + rest[k + 2]); const places = []; const r = rest.indexOf('RESTAURANTS'); if (r >= 0) for (let k = r + 1; k < rest.length && !/^AVAILABLE$|^SOLD OUT$|^DISHES$/i.test(rest[k]); k += 2) places.push(rest[k]); return { nothing: rest.some(x => /Nothing found/.test(x)), dishes, places, n: rest.length } })
  for (const q of ['tiramisu', 'doner', 'sirvan', 'seda ocagi', 'sada ocagi', 'narserab', 'narsarab', 'pasta', 'italian', 'dessert', 'cafe', 'coffee', 'sushi', 'xyzzy']) {
    await input.fill('')
    await A.page.waitForTimeout(1500)
    const t0 = Date.now(); await input.fill(q)
    let r = null, ms = null
    for (let i = 0; i < 80; i++) { await A.page.waitForTimeout(100); const cur = await read(); if (cur.nothing || cur.places.length || cur.dishes.length) { await A.page.waitForTimeout(400); r = await read(); ms = Date.now() - t0 - 400; break } }
    r = r || await read()
    L.log(q.padEnd(11), (ms == null ? 'no change' : ms + 'ms'), r.nothing ? 'NOTHING FOUND' : 'places: [' + r.places.join(', ') + '] dishes(' + r.dishes.length + '): ' + r.dishes.slice(0, 4).join(' ; '))
  }
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
