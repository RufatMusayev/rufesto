'use strict'
// Orxan on his phone: /waiter tabs while Rauf sits at T2 with an unserved order.
const fs = require('fs')
const path = require('path')
const C = require('./common')

;(async () => {
  const browser = await C.launch()
  const sink = []
  const O = await C.open(browser, 'orxan', { who: 'Orxan', sink })
  const { page } = O
  let t0 = Date.now()
  await page.goto(C.RESTO + '/waiter', { waitUntil: 'domcontentloaded' })
  await page.getByText(/Calls \(/).first().waitFor({ timeout: 20_000 })
  await page.locator('.skeleton').first().waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {})
  C.timing('orxan phone: /waiter ready (cold)', Date.now() - t0)
  console.log('url', page.url(), 'bottom nav:', JSON.stringify(await page.locator('.mobile-nav a, nav a, .dash-mobile-nav a').allInnerTexts()))
  for (const tab of [/^Calls/, /^My Tables/, /^All Tables/]) {
    await page.getByRole('button', { name: tab }).click(); await page.waitForTimeout(700)
    const name = String(tab).replace(/[^A-Za-z]/g, '')
    await C.shot(page, '60-orxan-waiter-' + name)
    console.log('TAB', name, '->', (await C.text(page, '.dash-content')).replace(/\n+/g, ' | ').slice(0, 700))
  }
  console.log('problems:', JSON.stringify(sink.map(s => `${s.stage} ${s.who} ${s.kind} ${s.text}`), null, 1))
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
