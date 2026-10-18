'use strict'
// Helpers for the round 3 staff panel ("Needs you" / "Earlier", inline "On my way", folded repeats).
const C = require('./common')

const badgeOf = async page => {
  const b = page.getByRole('button', { name: /^Notifications/ }).first()
  if (!(await b.count())) return null
  const m = ((await b.getAttribute('aria-label')) || '').match(/(\d+) new/)
  return m ? Number(m[1]) : 0
}

/** Every row of the open panel: section, title, ×count, detail, short time, inline action label, ack text, unread. */
const readPanel = page => page.locator('.notif-panel .notif-section').evaluateAll(secs => secs.flatMap(sec => {
  const section = sec.getAttribute('aria-label') || ''
  return [...sec.querySelectorAll('li.notif-row')].map(li => ({
    section,
    title: li.querySelector('.notif-item-title')?.innerText.replace(/^Unread:\s*/, '') || '',
    count: li.querySelector('.notif-count')?.innerText || '',
    detail: li.querySelector('.notif-detail')?.innerText || '',
    time: li.querySelector('.notif-time')?.innerText || '',
    action: li.querySelector('.notif-act')?.innerText.trim() || '',
    ack: li.querySelector('.notif-ack')?.innerText.replace(/\s+/g, ' ').trim() || '',
    unread: !!li.querySelector('.notif-item.is-unread'),
  }))
}))

const countRows = async (page, re) => (await readPanel(page)).filter(r => re.test(r.title)).reduce((n, r) => n + (Number((r.count || '').replace(/\D/g, '')) || 1), 0)
const rowsMatching = async (page, re) => (await readPanel(page)).filter(r => re.test(r.title))

async function openPanel(page, settleMs = 2200) {
  await page.getByRole('button', { name: /^Notifications/ }).first().click()
  await page.locator('.notif-panel').waitFor({ timeout: 8000 })
  await page.locator('.notif-skeleton').waitFor({ state: 'detached', timeout: 6000 }).catch(() => {})
  await page.waitForTimeout(settleMs)
}
const closePanel = page => page.locator('.notif-panel .modal-close').click().catch(() => {})

async function until(label, t0, fn, max = 20_000) {
  while (Date.now() - t0 < max) { let v; try { v = await fn() } catch { v = false } if (v) { C.timing(label, Date.now() - t0); return Date.now() - t0 }; await C.sleep(100) }
  C.timing(label, max, 'NOT SEEN in ' + max / 1000 + ' s'); return null
}

const fmt = rows => rows.map(r => `[${r.section}] ${r.title}${r.count ? ' ' + r.count : ''} | ${r.detail} | ${r.time}${r.action ? ' | btn:' + r.action : ''}${r.ack ? ' | ' + r.ack : ''}${r.unread ? ' *' : ''}`)

module.exports = { badgeOf, readPanel, countRows, rowsMatching, openPanel, closePanel, until, fmt }
