// Round 3 accessibility scan (same checks as rounds 1 and 2: tap targets, accessible names, alt, contrast, h1, tab semantics, focus order).
// Re-uses the AUDIT function of newcomer-a11y.js. ROUND=round3 node personas/ui/r3-a11y.js -> results/round3/r3-a11y.json
const fs = require('fs')
const path = require('path')
const L = require('./lib')
const src = fs.readFileSync(path.join(__dirname, 'newcomer-a11y.js'), 'utf8')
const m = src.match(/const AUDIT = (\(\) => \{[\s\S]*?\r?\n\})\r?\n\r?\nasync function audit/)
if (!m) throw new Error('AUDIT not found')
const AUDIT = '(' + m[1] + ')()'
const out = {}
const note = (k, v) => { out[k] = v; console.log('##', k, typeof v === 'string' ? v : JSON.stringify(v)) }
const audit = async (page, name) => { const r = await page.evaluate(AUDIT); note(`audit_${name}`, r) }
const brief = r => `noName=${JSON.stringify(r.noName)} small=${r.smallGroups.length} low=${r.lowContrast.length} h1=${r.h1s} imgNoAlt=${r.noAltAttr.length}`
;(async () => {
  for (const theme of ['dark', 'light']) {
    const s = await L.open({ lang: 'en', theme }); const { page } = s
    await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor(); await page.waitForTimeout(2500); await audit(page, `home_${theme}`)
    await page.getByRole('tab', { name: 'Friends' }).click(); await page.waitForTimeout(1000); await audit(page, `friends_signedout_${theme}`)
    await page.goto(L.BASE + '/explore', { waitUntil: 'load' }); await page.waitForTimeout(2800); await audit(page, `search_${theme}`)
    await page.getByRole('button', { name: 'Filters' }).click(); await page.waitForTimeout(900); await audit(page, `filters_sheet_${theme}`); await page.keyboard.press('Escape'); await page.waitForTimeout(500)
    await page.goto(L.BASE + '/restaurant/brew-and-books', { waitUntil: 'load' }); await page.waitForTimeout(2800); await audit(page, `restaurant_${theme}`)
    await page.goto(L.BASE + '/explore?dish=80000001-0000-0000-0000-000000000021', { waitUntil: 'load' }); await page.waitForTimeout(3000); await audit(page, `dish_sheet_${theme}`)
    await page.goto(L.BASE + '/profile', { waitUntil: 'load' }); await page.waitForTimeout(1500)
    await s.close()
  }
  {
    const s = await L.open({ as: 'Fərid Məlikov', lang: 'en', theme: 'dark' }); const { page } = s
    await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor(); await page.waitForTimeout(2500); await audit(page, 'home_signed_in_dark')
    await page.getByRole('tab', { name: 'Friends' }).click(); await page.waitForTimeout(2500); await audit(page, 'friends_dark')
    await page.goto(L.BASE + '/friends?tab=find', { waitUntil: 'load' }); await page.waitForTimeout(1500); await page.getByPlaceholder('Search by name').fill('Aysel'); await page.waitForTimeout(2000); await audit(page, 'find_people')
    await page.goto(L.BASE + '/profile', { waitUntil: 'load' }); await page.waitForTimeout(2200); await audit(page, 'profile')
    await page.getByRole('button', { name: 'Settings' }).click(); await page.waitForTimeout(900); await audit(page, 'settings_sheet'); await page.keyboard.press('Escape'); await page.waitForTimeout(500)
    await page.goto(L.BASE + '/notifications', { waitUntil: 'load' }); await page.waitForTimeout(2500); await audit(page, 'notifications')
    await page.goto(L.BASE + '/settings/notifications', { waitUntil: 'load' }); await page.waitForTimeout(2200); await audit(page, 'notification_settings')
    await page.goto(L.BASE + '/post/new', { waitUntil: 'load' }); await page.waitForTimeout(1500); await audit(page, 'composer')
    await s.close()
  }
  // keyboard: focus order, tab semantics
  {
    const s = await L.open({ lang: 'en', theme: 'dark' }); const { page } = s
    await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor(); await page.waitForTimeout(1500)
    const stops = []
    for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); stops.push(await page.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return 'body'; const cs = getComputedStyle(e); return `${e.tagName.toLowerCase()}${e.getAttribute('role') ? '[' + e.getAttribute('role') + ']' : ''}|${(e.getAttribute('aria-label') || e.innerText || '').replace(/\s+/g, ' ').slice(0, 22)}|outline=${cs.outlineStyle} ${cs.outlineWidth}` })) }
    note('focus_order_first12', stops)
    await page.getByRole('tab', { name: 'For you' }).focus(); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(400)
    note('arrowright_moves_selection', await page.evaluate(() => [...document.querySelectorAll('[role=tab]')].map(b => b.getAttribute('aria-selected'))))
    note('tabpanels', await page.locator('[role=tabpanel]').count())
    note('bottom_nav', await page.evaluate(() => [...document.querySelectorAll('.bottom-nav a, .bottom-nav button')].map(e => `${e.getAttribute('aria-label')}|current=${e.getAttribute('aria-current')}|${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`)))
    // dialog semantics + focus handling of the dish sheet
    await page.goto(L.BASE + '/explore', { waitUntil: 'load' }); await page.waitForTimeout(2200)
    const row = page.locator('button').filter({ hasText: /₼/ }).nth(1); await row.click(); await page.locator('[role=dialog][aria-modal=true]').waitFor(); await page.waitForTimeout(800)
    note('dish_dialog', await page.evaluate(() => { const d = document.querySelector('[role=dialog]'); const a = document.activeElement; return { labelledby: d.getAttribute('aria-labelledby'), labelText: (document.getElementById(d.getAttribute('aria-labelledby')) || {}).innerText, focusInside: d.contains(a), focused: a ? (a.getAttribute('aria-label') || a.innerText || a.tagName).slice(0, 24) : null } }))
    for (let i = 0; i < 6; i++) await page.keyboard.press('Tab')
    note('focus_stays_in_dialog_after_6_tabs', await page.evaluate(() => document.querySelector('[role=dialog]').contains(document.activeElement)))
    await page.keyboard.press('Escape'); await page.waitForTimeout(600)
    note('focus_returns_to_row_after_close', await page.evaluate(() => { const a = document.activeElement; return a ? (a.innerText || a.tagName).replace(/\s+/g, ' ').slice(0, 30) : null }))
    await s.close()
  }
  L.save('r3-a11y', out)
  console.log('\nSUMMARY'); for (const [k, v] of Object.entries(out)) if (k.startsWith('audit_')) console.log(k, brief(v))
})()
