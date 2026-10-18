const L = require('./aysel-r3-lib')
;(async () => {
  const a = await L.api('Aysel Məmmədova')
  const menu = await a.rpc('restaurant_menu', { p_slug: 'bella-roma' })
  const dishes = menu.sections.flatMap(s => s.dishes)
  const cap = dishes.find(d => d.name === 'Cappuccino'); const pap = dishes.find(d => d.name === 'Pappardelle Bolognese')
  for (const d of [cap, pap]) {
    const r = await a.rpc('dish_reviews', { p_dish_id: d.id })
    console.log(d.name, 'menu says', d.avg_rating, d.review_count, '| dish_reviews:', JSON.stringify(r.summary), 'items', (r.items || []).length, (r.items || []).map(i => i.user && i.user.name).join(', '))
  }
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova')
  const reqs = []
  A.page.on('response', async r => { if (/rpc\/dish_reviews/.test(r.url())) reqs.push(r.status() + ' ' + (await r.text().catch(() => '')).slice(0, 80)) })
  for (let i = 0; i < 3; i++) {
    await A.page.goto(L.CONSUMER + '/restaurant/bella-roma?tab=menu&dish=' + cap.id); await A.page.waitForSelector('.bs-panel'); await A.page.waitForTimeout(3500)
    L.log('run', i, 'reviews section:', (await A.page.evaluate(() => document.querySelector('.rv-section')?.innerText || '(none)')).replace(/\n+/g, ' | ').slice(0, 100), '| responses', reqs.length)
  }
  L.log(reqs)
  await L.shot(A.page, '05b-cappuccino-sheet')
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
