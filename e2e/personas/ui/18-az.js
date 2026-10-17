'use strict'
// Leyla's own language is Azerbaijani: dump the visible labels of each page with rufesto_lang=az and flag lines that are still English.
const fs = require('fs')
const path = require('path')
const C = require('./common')
const ENGLISH = /\b(Orders?|Today|Active|Paid|Total|Bills?|Tips?|Posts?|Publish|Caption|Tag a dish|Delete|Cancel|Revenue|Menu|Tables?|Free|Kitchen|Waiter|Settings|Bookings?|Guests?|Upcoming|Past|Pending|Confirmed|This week|This month|Custom|Export|Loading|No \w+|Add Dish|New Campaign|Pause|Sign Out|Light|Dark|Manager|Live|View all|Manage|Recent|Quick actions?|Available|Collected|Still to collect|Average|Unassigned|Tip count|By day|By waiter|Last tip|Role|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/

;(async () => {
  const browser = await C.launch()
  const sink = []
  const L = await C.open(browser, 'leyla', { who: 'Leyla', lang: 'az', sink })
  const { page } = L
  for (const p of ['/', '/orders', '/bookings', '/bills', '/tips', '/menu', '/promos', '/posts', '/tables', '/kds', '/waiter', '/settings']) {
    await page.goto(C.RESTO + p, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => !document.querySelector('.skeleton, .spinner') && (document.querySelector('.dash-content')?.innerText || '').trim().length > 20, null, { timeout: 15_000 }).catch(() => {})
    await page.waitForTimeout(1200)
    const lines = [...new Set((await C.text(page, 'body')).split('\n').map(l => l.trim()).filter(Boolean))]
    const flagged = lines.filter(l => ENGLISH.test(l) && l.length < 60)
    if (p === '/' || p === '/tips' || p === '/posts') await C.shot(page, '97-az' + (p === '/' ? '-home' : p.replace(/\W/g, '-')), { full: false })
    console.log(p.padEnd(10), 'title:', lines[0], '| English-looking:', JSON.stringify(flagged.slice(0, 14)))
  }
  console.log('problems:', JSON.stringify(sink.map(s => `${s.stage} ${s.who} ${s.kind} ${s.text}`).slice(0, 5)))
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
