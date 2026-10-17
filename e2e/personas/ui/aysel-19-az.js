// Azerbaijani walk: dump visible text per screen and flag lines that still look English.
const L = require('./aysel-lib')
const EN = /\b(the|and|your|you|with|for|from|ago|like|likes|reply|replies|comment|comments|view|open|closed|follow|following|followers|reviews?|menu|table|order|orders|bill|pay|share|post|posts|friends?|saved|visits?|settings|sign|search|nearby|restaurants?|dishes|seats|reserve|available|sold out|cancel|send|add|edit|profile|home|explore|map|notifications?|scan|code|join|leave|loading|no |all )\b/i
const SCREENS = [
  ['home', '/', null], ['friends', '/', 'friends'], ['discover', '/', 'discover'], ['explore', '/explore', null], ['map', '/map', null],
  ['restaurant', '/restaurant/bella-roma', null], ['profile', '/profile', null], ['notifications', '/notifications', null],
  ['friends-page', '/friends', null], ['reserve', '/book/bella-roma', null], ['table', '/table', null], ['bill', '/bill', null], ['new-post', '/post/new', null],
]
;(async () => {
  const b = await L.launch()
  for (const [name, path, tab] of SCREENS) {
    const A = await L.phone(b, 'Aysel Məmmədova', { lang: 'az', storage: tab ? { rufesto_home_tab: tab } : {} })
    await A.page.goto(L.CONSUMER + path); await A.page.waitForTimeout(3500)
    const lines = (await A.page.evaluate(() => document.body.innerText)).split('\n').map(s => s.trim()).filter(Boolean)
    const sus = [...new Set(lines.filter(l => EN.test(l) && l.length < 70))]
    L.log(`\n## ${name}  (${lines.length} lines)`)
    L.log(sus.slice(0, 25).join('  ||  '))
    await A.ctx.close()
  }
  // extra: profile tabs + dish sheet + QR sheet
  const A = await L.phone(b, 'Aysel Məmmədova', { lang: 'az' })
  await A.page.goto(L.CONSUMER + '/profile'); await A.page.waitForTimeout(3000)
  const tabs = await A.page.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.offsetParent).map(b => b.innerText.trim()).filter(Boolean))
  L.log('\nprofile buttons AZ:', tabs.join(' | '))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
