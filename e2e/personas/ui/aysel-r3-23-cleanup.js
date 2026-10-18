// Round 3 cleanup through the UI: remove the three double-tap test likes, delete Mehriban's pending request, look at how to unfriend Ceyhun.
const L = require('./aysel-r3-lib')
const sleep = ms => new Promise(r => setTimeout(r, ms))
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova'); const page = A.page
  for (const id of ['b81bea07-d8bf-4b3c-b503-8d87f176f2cf', '9158be4f-7850-4c59-ab0a-06ffa7eb78d6', '4922ae38-3321-4e65-b0bb-818006844e6a']) {
    await page.goto(L.CONSUMER + '/post/' + id); await sleep(2500)
    const who = (await page.locator('.soc-post-head').first().innerText().catch(() => '?')).replace(/\n+/g, ' ')
    const rm = page.getByRole('button', { name: 'Remove like', exact: true }).first()
    if (await rm.count()) { await rm.click(); await sleep(900); L.log('unliked', id.slice(0, 8), who, '->', await page.locator('.soc-act-likes').first().innerText().catch(() => '?')) } else L.log('no "Remove like" on', id.slice(0, 8), who)
  }
  await page.goto(L.CONSUMER + '/notifications'); await page.waitForSelector('li.ntf-li'); await sleep(1500)
  const li = page.locator('li.ntf-li').filter({ hasText: /Mehriban Rzayeva sent you a friend request/ }).first()
  if (await li.count()) { await li.getByRole('button', { name: 'Delete' }).click(); await sleep(900); L.log('Mehriban pending request deleted') } else L.log('no Mehriban request in the inbox')
  await page.goto(L.CONSUMER + '/friends'); await sleep(2500)
  L.log('friend row for Ceyhun:', await page.evaluate(() => { const r = [...document.querySelectorAll('li, div')].filter(e => /Ceyhun/.test(e.innerText) && e.innerText.length < 120).sort((a, b) => a.innerText.length - b.innerText.length)[0]; return r ? r.outerHTML.replace(/\s+/g, ' ').slice(0, 600) : '(none)' }))
  await L.shot(page, '23-friends-before-unfriend')
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
