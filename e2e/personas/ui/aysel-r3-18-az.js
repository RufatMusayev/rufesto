// Round 3: Azerbaijani on the new screens: untranslated lines, overflow, wrapping of the compact rows, notification wording and bold names.
const L = require('./aysel-r3-lib')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const EN = /\b(the|and|your|you|with|for|from|ago|like|likes|reply|replies|comment|comments|view|open|closed|follow|following|followers|reviews?|menu|table|order|orders|bill|pay|share|post|posts|friends?|saved|visits?|settings|sign|search|nearby|restaurants?|dishes|seats|reserve|available|sold out|cancel|send|add|edit|profile|home|explore|map|notifications?|scan|code|join|leave|loading|no |all |filters?|results?|popular|recent|clear|reset|show|people|places|top|newest|write|confirm|delete)\b/i
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova', { lang: 'az' })
  const page = A.page
  const screens = [['home', '/'], ['search zero', '/explore'], ['notifications', '/notifications'], ['notif settings', '/settings/notifications'], ['profile', '/profile'], ['restaurant', '/restaurant/bella-roma'], ['dish sheet', '/restaurant/bella-roma?tab=menu&dish=80000001-0000-0000-0000-000000000009'], ['friends', '/friends'], ['map', '/map'], ['reserve', '/book/bella-roma']]
  for (const [name, path] of screens) {
    await page.goto(L.CONSUMER + path); await sleep(3200)
    const lines = (await page.evaluate(() => (document.querySelector('.bs-panel') || document.body).innerText)).split('\n').map(s => s.trim()).filter(Boolean)
    const sus = [...new Set(lines.filter(l => EN.test(l) && l.length < 60))]
    const ov = await page.evaluate(() => ({ docOverflow: document.documentElement.scrollWidth > innerWidth, clipped: [...document.querySelectorAll('h1,h2,h3,p,span,a,button,div')].filter(e => e.offsetParent && e.children.length < 3 && e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).textOverflow !== 'ellipsis' && ['hidden', 'clip'].includes(getComputedStyle(e).overflowX) && (e.innerText || '').trim()).length }))
    L.log(('## ' + name).padEnd(18), 'lines', lines.length, '| overflow', JSON.stringify(ov), '| English-looking lines:', sus.slice(0, 8).join('  ||  ') || '-')
    if (['home', 'search zero', 'notifications', 'dish sheet'].includes(name)) await L.shot(page, '18-az-' + name.replace(/\s+/g, '-'))
  }
  // notification wording in az: bold names present?
  await page.goto(L.CONSUMER + '/notifications'); await page.waitForSelector('li.ntf-li'); await sleep(2500)
  L.log('az inbox rows:', await page.evaluate(() => [...document.querySelectorAll('li.ntf-li')].slice(0, 7).map(li => li.innerText.replace(/\n+/g, ' | ') + ' [bold: ' + [...li.querySelectorAll('b, strong')].map(x => x.innerText).join(', ') + ']')))
  L.log('az inbox: section labels', await page.evaluate(() => [...document.querySelectorAll('h2, h3')].map(e => e.innerText.trim()).filter(t => t.length < 20)))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
