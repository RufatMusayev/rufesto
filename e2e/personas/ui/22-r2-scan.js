'use strict'
// Round 2: the in-app QR scan path end to end. Leyla's /qr-sheet image of the free table -> y4m -> Chromium fake camera
// (--use-fake-device-for-media-stream --use-fake-ui-for-media-stream --use-file-for-fake-video-capture) -> Rauf's "Scan QR" sheet.
// TABLE=T2 node 22-r2-scan.js   (leaves Rauf seated at the table)
const path = require('path')
const { chromium } = require('@playwright/test')
const C = require('./common')
const { qrToY4m, cameraArgs } = require('./qrcam')
const TABLE = process.env.TABLE || 'T2'

;(async () => {
  const sink = []
  const b1 = await C.launch()
  const L = await C.open(b1, 'leyla', { who: 'Leyla', sink })
  const rauf = await C.login('Rauf')
  const rapi = C.makeApi(rauf)
  const [tbl] = await L.api.rows(`tables?restaurant_id=eq.${C.BELLA}&table_number=eq.${TABLE}&select=id,state`)
  console.log('table', TABLE, 'state before:', tbl.state, '| Rauf session before:', JSON.stringify((await rapi.rpc('my_table_session')).data))
  let t0 = Date.now()
  await L.page.goto(C.RESTO + '/qr-sheet')
  const img = L.page.getByRole('img', { name: 'QR code for Table ' + TABLE })
  await img.waitFor({ timeout: 20_000 })
  C.timing('R2 qr-sheet: QR image visible', Date.now() - t0)
  const dataUrl = await img.getAttribute('src')
  const y4m = qrToY4m(dataUrl, path.join(C.SCRATCH, 'cam', `qr-${TABLE}.y4m`))
  await L.close(); await b1.close()

  const b2 = await chromium.launch({ headless: true, args: cameraArgs(y4m) })
  const R = await C.open(b2, 'rauf', { who: 'Rauf', geo: true, camera: true, sink })
  const { page } = R
  const errs = []
  page.on('pageerror', e => errs.push('pageerror: ' + (e.stack || e.message).split('\n').slice(0, 3).join(' <- ')))
  sink.stage = 'scan'
  await page.goto(C.CONSUMER + '/', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: 'Scan QR' }).waitFor({ timeout: 20_000 })
  await page.waitForTimeout(1500)
  await C.shot(page, 'r2-10-rauf-home', { full: false })
  t0 = Date.now()
  await page.getByRole('button', { name: 'Scan QR' }).click()
  await page.getByText(/Scan Table QR|Point your camera/i).first().waitFor({ timeout: 10_000 })
  C.timing('R2 scan: tap Scan QR -> scanner sheet open', Date.now() - t0)
  await page.waitForTimeout(700)
  await C.shot(page, 'r2-11-rauf-scanner-open', { full: false })
  const t1 = Date.now()
  // success = the sheet shows a result / closes, and the app is still alive
  const done = await page.getByText(/You.re seated/i).first().waitFor({ timeout: 25_000 }).then(() => true).catch(() => false)
  C.timing('R2 scan: scanner open -> seated sheet (decode + claim_table)', Date.now() - t1, done ? '' : 'NOT SEATED')
  const t2 = Date.now()
  await page.waitForURL(/\/table$/, { timeout: 15_000 }).catch(() => {})
  C.timing('R2 scan: seated sheet -> on /table', Date.now() - t2)
  await page.waitForTimeout(600)
  await C.shot(page, 'r2-12-rauf-after-scan', { full: false })
  const rootLen = await page.evaluate(() => document.getElementById('root')?.innerHTML.length)
  console.log('root length after scan:', rootLen, '| page errors:', JSON.stringify(errs))
  console.log('screen text:', (await C.text(page)).split('\n').join(' | ').slice(0, 300))
  await page.waitForTimeout(3500)
  await C.shot(page, 'r2-13-rauf-after-scan-3s', { full: false })
  console.log('3 s later url:', page.url(), '| text:', (await C.text(page)).split('\n').join(' | ').slice(0, 260))
  console.log('Rauf session after:', JSON.stringify((await rapi.rpc('my_table_session')).data).slice(0, 160))
  console.log('problems:', JSON.stringify(sink.map(s => `${s.stage} ${s.who} ${s.kind} ${s.text}`).filter(s => !/ERR_ABORTED/.test(s))))
  await b2.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
