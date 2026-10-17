'use strict'
// Leyla on her phone (390 x 844): every page, bottom nav, More sheet (Posts, language, theme, Sign Out), overflow + tap-target check.
const fs = require('fs')
const path = require('path')
const C = require('./common')

const PAGES = ['/', '/orders', '/kds', '/tables', '/menu', '/promos', '/bookings', '/waiter', '/bills', '/tips', '/posts', '/settings', '/qr-sheet']

const measure = page => page.evaluate(() => {
  const iw = window.innerWidth, root = document.documentElement
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  const small = []
  for (const el of document.querySelectorAll('.dash-content a, .dash-content button, .dash-content [role=button], .dash-content select, .dash-content input:not([type=hidden])')) {
    if (!vis(el)) continue
    const r = el.getBoundingClientRect()
    if (r.bottom < 0 || r.top > innerHeight * 6) continue
    if (r.height < 32 || r.width < 32) small.push(`${(el.innerText || el.getAttribute('aria-label') || el.title || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 22)} ${Math.round(r.width)}x${Math.round(r.height)}`)
  }
  const wide = []
  if (root.scrollWidth > iw + 1) for (const el of document.body.querySelectorAll('*')) { const r = el.getBoundingClientRect(); if (vis(el) && r.right > iw + 2 && getComputedStyle(el).position !== 'fixed') wide.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} right=${Math.round(r.right)}`) }
  return { scrollW: root.scrollWidth, iw, small: [...new Set(small)].slice(0, 12), wide: wide.slice(0, 6) }
})

;(async () => {
  const browser = await C.launch()
  const sink = []
  const L = await C.open(browser, 'leyla-phone', { who: 'Leyla', sink })
  const { page } = L
  await page.goto(C.RESTO + '/'); await page.getByText('Recent orders', { exact: false }).first().waitFor({ timeout: 20_000 })
  console.log('viewport', JSON.stringify(page.viewportSize()))
  const nav = await page.locator('.dash-mobile-nav-wrap').boundingBox()
  console.log('bottom nav box', JSON.stringify(nav), '| items:', JSON.stringify(await page.locator('.dash-mobile-nav-item').allInnerTexts()))
  for (const p of PAGES) {
    sink.stage = p
    await page.goto(C.RESTO + p, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => !document.querySelector('.skeleton, .spinner') && (document.querySelector('.dash-content')?.innerText || '').trim().length > 20, null, { timeout: 15_000 }).catch(() => {})
    await page.waitForTimeout(900)
    const name = '90-phone' + (p === '/' ? '-home' : p.replace(/\W/g, '-'))
    await C.shot(page, name, { full: false })
    const m = await measure(page)
    console.log(p.padEnd(10), `scrollW ${m.scrollW}/${m.iw}`, m.wide.length ? 'OVERFLOW ' + m.wide.join('; ') : '', m.small.length ? ' small: ' + m.small.join(' | ') : '')
  }
  // More sheet
  sink.stage = 'more'
  await page.goto(C.RESTO + '/')
  await page.getByText('Recent orders', { exact: false }).first().waitFor()
  console.log('On Overview: More button box', JSON.stringify(await page.getByRole('button', { name: 'More' }).boundingBox()), '| order row right edges', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.dash-content [style*="border-radius: 10px"]')].slice(0, 3).map(e => Math.round(e.getBoundingClientRect().right)))))
  await page.goto(C.RESTO + '/orders'); await page.waitForTimeout(1200)
  await page.getByRole('button', { name: 'More' }).click(); await page.waitForTimeout(500)
  await C.shot(page, '91-phone-more-sheet', { full: false })
  const sheet = page.getByRole('dialog')
  console.log('More sheet:', (await sheet.innerText()).replace(/\n+/g, ' | '))
  await sheet.getByRole('link', { name: 'Posts' }).click(); await page.waitForTimeout(1500)
  console.log('after More > Posts, url:', page.url())
  await C.shot(page, '92-phone-posts-via-more', { full: false })
  // scroll the bottom nav: is Promos / Bills / Tips reachable and does the active item scroll into view?
  await page.goto(C.RESTO + '/tips'); await page.waitForTimeout(1500)
  const act = await page.locator('.dash-mobile-nav-item.active').first().boundingBox()
  console.log('active nav item on /tips in view?', JSON.stringify(act))
  console.log('problems:', JSON.stringify(sink.map(s => `${s.stage} ${s.who} ${s.kind} ${s.text}`), null, 1))
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
