'use strict'
// Live service, step 1: Rauf (diner, phone) scans the free table's QR code (the image printed by Leyla's /qr-sheet, fed to the
// phone's fake camera) with the consumer app's own scanner. Stops after "seated" and leaves the table session open.
// TABLE=T2 node 10-scan.js
const fs = require('fs')
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

  // table must be free, Rauf must not sit anywhere
  const [tbl] = await L.api.rows(`tables?restaurant_id=eq.${C.BELLA}&table_number=eq.${TABLE}&select=id,state`)
  console.log('table', TABLE, 'state before:', tbl.state)
  const mine = await rapi.rpc('my_table_session')
  console.log('Rauf session before:', JSON.stringify(mine.data).slice(0, 160))

  // the QR card on the sheet
  sink.stage = 'qr-sheet'
  let t0 = Date.now()
  await L.page.goto(C.RESTO + '/qr-sheet')
  const img = L.page.getByRole('img', { name: 'QR code for Table ' + TABLE })
  await img.waitFor({ timeout: 20_000 })
  C.timing('qr-sheet: first QR image visible', Date.now() - t0)
  const dataUrl = await img.getAttribute('src')
  console.log('qr img src is data url:', dataUrl.startsWith('data:image/png'), 'len', dataUrl.length)
  await img.locator('xpath=ancestor::*[self::div or self::article][2]').screenshot({ path: path.join(C.OUT, `40-qr-card-${TABLE}.png`) })
  const y4m = qrToY4m(dataUrl, path.join(C.SCRATCH, 'cam', `qr-${TABLE}.y4m`))
  await L.close(); await b1.close()

  // Rauf's phone with the fake camera
  const b2 = await chromium.launch({ headless: true, args: cameraArgs(y4m) })
  const R = await C.open(b2, 'rauf', { who: 'Rauf', geo: true, camera: true, sink })
  const { page } = R
  sink.stage = 'scan'
  await page.goto(C.CONSUMER + '/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await C.shot(page, '41-rauf-home', { full: false })
  console.log('bottom nav:', JSON.stringify(await page.locator('nav button, nav a, [role=tablist] button').allInnerTexts()))
  const scanBtn = page.getByRole('button', { name: 'Scan QR' })
  console.log('candidate scan buttons:', JSON.stringify(await page.getByRole('button').evaluateAll(els => els.map(e => (e.getAttribute('aria-label') || e.innerText || '').trim()).filter(Boolean).slice(0, 20))))
  t0 = Date.now()
  await scanBtn.click()
  await page.waitForTimeout(1500)
  await C.shot(page, '42-rauf-scanner-open', { full: false })
  // wait for the scanner to read the QR: URL / sheet text changes
  page.on('pageerror', e => console.log('PAGEERROR stack:', (e.stack || e.message).split('\n').slice(0, 4).join(' <- ')))
  const ok = await page.waitForFunction(() => !document.querySelector('#qr-reader video') || (document.getElementById('root')?.innerHTML.length || 0) < 50, null, { timeout: 25_000 }).then(() => true).catch(() => false)
  C.timing('scan: camera open -> QR decoded & screen changed', Date.now() - t0, ok ? '' : 'NO CHANGE')
  await page.waitForTimeout(1500)
  await C.shot(page, '43-rauf-after-scan', { full: false })
  console.log('root innerHTML length after scan:', await page.evaluate(() => document.getElementById('root')?.innerHTML.length))
  console.log('url:', page.url(), '\ntext:', (await C.text(page)).slice(0, 500).replace(/\n+/g, ' | '))
  console.log('problems:', JSON.stringify(sink.map(s => `${s.stage} ${s.who} ${s.kind} ${s.text}`), null, 1))
  await b2.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
