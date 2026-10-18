// Round 3, part 5: People search + "Add friend" by two other diners, then Aysel's inbox: New section, inline Confirm / Delete, timing, outcomes.
const L = require('./aysel-r3-lib')
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function addFriend(b, name) {
  const F = await L.phone(b, name)
  const page = F.page
  await page.goto(L.CONSUMER + '/explore'); await sleep(2500)
  const input = page.getByPlaceholder(/Dishes, places, people/i)
  await input.fill('aysel'); await sleep(2500)
  L.log(name, '| tabs:', await page.evaluate(() => [...document.querySelectorAll('[role=tab]')].map(t => t.innerText.trim() + ':' + t.getAttribute('aria-selected'))))
  await L.shot(page, '08-search-aysel-' + name.split(' ')[0])
  const btn = page.getByRole('button', { name: /Add friend/i }).first()
  L.log(name, '| Add friend buttons visible:', await btn.count(), '| result text:', (await page.evaluate(() => document.body.innerText)).replace(/\n+/g, ' | ').slice(0, 260))
  if (await btn.count()) { const t0 = Date.now(); await btn.click(); await page.waitForFunction(() => /Requested/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {}); L.log(name, '| button -> Requested after', Date.now() - t0, 'ms') }
  await F.ctx.close()
}
;(async () => {
  const b = await L.launch()
  const api = await L.api('Aysel Məmmədova')
  await L.step('two diners send friend requests through People search', async () => {
    await addFriend(b, 'Ceyhun Məmmədli')
    await addFriend(b, 'Mehriban Rzayeva')
  })
  const A = await L.phone(b, 'Aysel Məmmədova')
  const page = A.page
  await L.step('Aysel: bell, inbox New section, Confirm and Delete', async () => {
    await page.goto(L.CONSUMER + '/'); await page.waitForSelector('article'); await sleep(2500)
    L.log('bell:', await page.evaluate(() => (document.querySelector('[aria-label*="otification" i]')?.getAttribute('aria-label') || '') + ' | ' + (document.querySelector('[aria-label*="otification" i]')?.innerText || '').trim()))
    await page.locator('[aria-label*="otification" i]').first().click(); await page.waitForSelector('li.ntf-li'); await sleep(2500)
    await L.shot(page, '08-inbox-new')
    L.log('sections:', await page.evaluate(() => [...document.querySelectorAll('h2, h3, [class*=ntf-sec], [class*=section]')].map(e => e.innerText.trim()).filter(t => t.length < 20)))
    L.log('top 4 rows:', await page.evaluate(() => [...document.querySelectorAll('li.ntf-li')].slice(0, 4).map(li => Math.round(li.getBoundingClientRect().height) + 'px ' + li.innerText.replace(/\n+/g, ' | '))))
    // measure Confirm for Ceyhun
    const row = page.locator('li.ntf-li').filter({ hasText: 'Ceyhun' }).filter({ hasText: 'friend request' }).first()
    L.log('Ceyhun row buttons:', await row.evaluate(r => [...r.querySelectorAll('button')].map(b => b.innerText + ' ' + Math.round(b.getBoundingClientRect().width) + 'x' + Math.round(b.getBoundingClientRect().height))))
    await row.evaluate(r => { window.__c = {}; const mo = new MutationObserver(() => { if (/is now your friend/.test(r.innerText) && !window.__c.done) window.__c.done = performance.now() }); mo.observe(r, { childList: true, subtree: true, characterData: true }); r.querySelector('button').addEventListener('click', () => { window.__c.t0 = performance.now() }, { capture: true }) })
    const url0 = page.url()
    await row.getByRole('button', { name: 'Confirm' }).click(); await sleep(1500)
    const c = await page.evaluate(() => window.__c)
    L.log('Confirm: text changed after', c.done && c.t0 ? Math.round(c.done - c.t0) + ' ms' : 'NO change', '| still on', page.url() === url0 ? 'the inbox' : page.url())
    await L.shot(page, '08-after-confirm')
    L.log('Ceyhun row now:', (await page.locator('li.ntf-li').filter({ hasText: 'Ceyhun' }).first().innerText()).replace(/\n+/g, ' | '))
    // Delete Mehriban
    const row2 = page.locator('li.ntf-li').filter({ hasText: 'Mehriban' }).filter({ hasText: 'friend request' }).first()
    const h0 = await row2.evaluate(r => Math.round(r.getBoundingClientRect().height))
    await row2.getByRole('button', { name: 'Delete' }).click(); await sleep(120)
    const hMid = await row2.evaluate(r => Math.round(r.getBoundingClientRect().height)).catch(() => 'gone')
    await sleep(700)
    L.log('Delete: row height', h0, '->', hMid, 'after 120 ms; present after 0.8 s:', await page.locator('li.ntf-li').filter({ hasText: 'Mehriban' }).filter({ hasText: 'friend request' }).count())
    L.log('friends now:', JSON.stringify((await api.rpc('my_friends')).map(f => f.name)))
    await page.reload(); await page.waitForSelector('li.ntf-li'); await sleep(2500)
    L.log('after reload, Ceyhun row:', (await page.locator('li.ntf-li').filter({ hasText: 'Ceyhun' }).first().innerText().catch(() => '(gone)')).replace(/\n+/g, ' | '), '| Mehriban request still listed:', await page.locator('li.ntf-li').filter({ hasText: 'Mehriban' }).filter({ hasText: 'friend request' }).count())
  })
  await L.step('Ceyhun and Mehriban: what do the requesters see?', async () => {
    for (const name of ['Ceyhun Məmmədli', 'Mehriban Rzayeva']) {
      const F = await L.phone(b, name)
      await F.page.goto(L.CONSUMER + '/notifications'); await F.page.waitForSelector('li.ntf-li', { timeout: 15000 }).catch(() => {}); await sleep(2500)
      L.log(name, 'top 2 notifications:', await F.page.evaluate(() => [...document.querySelectorAll('li.ntf-li')].slice(0, 2).map(li => li.innerText.replace(/\n+/g, ' | '))))
      await F.ctx.close()
    }
  })
  L.log('errors', A.errors.filter(e => !/ERR_ABORTED/.test(e)))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
