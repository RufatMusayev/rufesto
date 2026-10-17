// Round 2: Fərid cold start (0 follows) and ranking after following two places, measured with reloads. Restores his original three follows.
const L = require('./lib')
const out = {}
const note = (k, v) => { out[k] = v; console.log('##', k, typeof v === 'string' ? v : JSON.stringify(v)) }
const summary = res => ({ mix: res.mix, promos: (res.items || []).filter(i => i.kind === 'promo').length, items: (res.items || []).slice(0, 14).map(i => `${i.position}:${i.kind === 'promo' ? 'promo' : i.pool}:${i.restaurant?.name || i.author?.name || ''}${i.kind === 'post' && i.author?.type !== 'restaurant' ? '*' : ''}`) })
;(async () => {
  const s = await L.open({ as: 'Fərid Məlikov' }); const { page } = s
  async function load() {
    const p = page.waitForResponse(r => /rpc\/home_feed(\?|$)/.test(r.url()) && r.request().method() === 'POST', { timeout: 30000 })
    await page.goto(L.BASE + '/', { waitUntil: 'load' }); const res = await (await p).json()
    if ((await page.getByRole('tab').nth(0).getAttribute('aria-selected')) !== 'true') await page.getByRole('tab').nth(0).click()
    await page.locator('.soc-feed-slot').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(800); return res
  }
  async function toggle(names, on) {
    await page.getByRole('tab').nth(2).click(); await page.waitForTimeout(2500)
    for (const n of names) { const b = page.getByRole('button', { name: `${on ? 'Follow' : 'Unfollow'} ${n}`, exact: true }).first(); if (await b.count()) { await b.scrollIntoViewIfNeeded(); await b.click(); await page.waitForTimeout(700) } else note(`${on ? 'follow' : 'unfollow'}_${n}`, 'no button') }
  }
  try {
    await load()
    await toggle(['Dönər Bakı Express', 'Burger Qala', 'Şirvan Mətbəxi'], false)
    const cold = await load(); note('cold', summary(cold)); await L.shot(page, 'RF10-ferid-cold-home')
    await toggle(['Şirvan Mətbəxi', 'Burger Qala'], true)
    const two = await load(); note('after_two_follows', summary(two)); await L.shot(page, 'RF11-ferid-two-follows-home')
    await toggle(['Dönər Bakı Express'], true)
    const back = await load(); note('restored', summary(back).mix)
  } catch (e) { note('ERROR', String(e).split(/\r?\n/)[0].slice(0, 300)) }
  L.save('r2-ferid-cold', out); await s.close()
})()
