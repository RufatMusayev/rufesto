const L = require('./aysel-r2-lib')
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova')
  await L.step('Reserve a table from the dish sheet', async () => {
    await A.page.goto(L.CONSUMER + '/'); await A.page.waitForSelector('.soc-feed-slot article'); await A.page.waitForTimeout(1200)
    await A.page.getByRole('link', { name: 'Order this' }).first().click(); await A.page.waitForSelector('.sheet'); await A.page.waitForTimeout(1500)
    await A.page.getByRole('button', { name: /Reserve a table/i }).or(A.page.getByRole('link', { name: /Reserve a table/i })).first().click(); await A.page.waitForTimeout(2200)
    L.log('landed:', A.page.url().replace(L.CONSUMER, ''), '|', (await A.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 160))
    await L.shot(A.page, '17b-reserve')
  })
  await L.step('QR sheet manual entry with the printed access code', async () => {
    const mgr = await L.api('Səid Əhmədov')
    const tables = await mgr.get('tables?restaurant_id=eq.' + L.FINCAN + '&select=id,table_number'); const codes = await mgr.get('table_access_codes?restaurant_id=eq.' + L.FINCAN + '&select=table_id,access_code')
    const code = codes.find(c => c.table_id === tables.find(t => t.table_number === 'T3').id).access_code
    await A.page.goto(L.CONSUMER + '/'); await A.page.waitForSelector('.soc-feed-slot article')
    await A.page.getByRole('button', { name: /Scan QR/i }).click(); await A.page.waitForTimeout(1500)
    await A.page.getByRole('button', { name: 'Enter code manually' }).click(); await A.page.waitForTimeout(500)
    const input = A.page.getByPlaceholder(/table token|code/i).first()
    L.log('manual field placeholder:', await input.getAttribute('placeholder'))
    await input.fill(code); await A.page.getByRole('button', { name: 'Find Table' }).click(); await A.page.waitForTimeout(2500)
    L.log('result url:', A.page.url().replace(L.CONSUMER, ''), '|', (await A.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 200))
    await L.shot(A.page, '17b-qr-manual')
    // leave: cancel on the join card if present
    await A.page.getByRole('button', { name: 'Cancel' }).click().catch(() => {})
  })
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
