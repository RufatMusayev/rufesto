const L = require('./aysel-r2-lib')
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova', { perms: ['notifications'] })
  await A.page.goto(L.CONSUMER + '/settings/notifications'); await A.page.waitForTimeout(3000)
  L.log('permission:', await A.page.evaluate(() => Notification.permission), '| row:', (await A.page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(40, 300))
  L.log('vapid key present in bundle?', await A.page.evaluate(async () => { const src = [...document.scripts].map(s => s.src).filter(Boolean); let found = false; for (const u of src) { try { const t = await (await fetch(u)).text(); if (/BN[A-Za-z0-9_-]{80,}/.test(t)) { found = true } } catch (e) {} } return found }))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
