// Round 2 signed-out: dish sheet like/save (N01, N22), alt vs caption (N18), theme default, restaurant page names.
const L = require('./lib')
const out = {}
const note = (k, v) => { out[k] = v; console.log('##', k, typeof v === 'string' ? v : JSON.stringify(v)) }
;(async () => {
  const s = await L.open({}); const { page } = s
  await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor(); await page.waitForTimeout(1500)
  note('default_theme_on_light_scheme_device', await page.evaluate(() => document.documentElement.getAttribute('data-theme') + ' / localStorage=' + localStorage.getItem('rufesto_theme') + ' / prefers-dark=' + matchMedia('(prefers-color-scheme: dark)').matches))
  note('alt_equals_caption_count', await page.evaluate(() => [...document.querySelectorAll('.soc-feed-slot')].slice(0, 12).filter(el => { const i = el.querySelector('.soc-photo img'); const c = el.querySelector('.soc-caption'); return i && c && i.alt && c.innerText.includes(i.alt.slice(0, 20)) }).length))
  note('alt_samples', await page.evaluate(() => [...document.querySelectorAll('.soc-feed-slot .soc-photo img')].slice(0, 4).map(i => i.alt)))
  await page.goto(L.BASE + '/restaurant/bella-roma?dish=80000001-0000-0000-0000-000000000020', { waitUntil: 'load' }); await page.waitForTimeout(3000)
  const writes = []; page.on('request', r => { if (r.method() !== 'GET' && /\/rest\/v1\/(likes|saved_dishes)/.test(r.url())) writes.push(r.method()) })
  const like = page.getByRole('button', { name: 'Like this dish' }).first()
  note('dish_like_button_named', await like.count())
  await like.click(); await page.waitForTimeout(1200)
  note('after_like_signin_sheet', await page.getByText('Continue with Google').count())
  note('after_like_shows_1_like', await page.evaluate(() => /\b1 like/.test(document.body.innerText)))
  await L.shot(page, 'RA08-dish-like-signedout')
  await page.keyboard.press('Escape'); await page.waitForTimeout(500)
  const save = page.getByRole('button', { name: 'Save to your list' }).first()
  note('dish_save_button_named', await save.count())
  if (await save.count() && !(await page.getByText('Continue with Google').count())) { await save.click(); await page.waitForTimeout(1200) }
  note('after_save_signin_sheet', await page.getByText('Continue with Google').count())
  note('dish_writes', writes)
  note('dish_sheet_buttons', await page.evaluate(() => [...document.querySelectorAll('button, a[href]')].filter(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.top < 840 && !(b.getAttribute('aria-label') || b.innerText || '').trim() }).map(b => b.tagName + ' ' + Math.round(b.getBoundingClientRect().width) + 'x' + Math.round(b.getBoundingClientRect().height))))
  await page.goto(L.BASE + '/restaurant/bella-roma', { waitUntil: 'load' }); await page.waitForTimeout(3000)
  await L.shot(page, 'RA10-restaurant')
  note('restaurant_unnamed', await page.evaluate(() => [...document.querySelectorAll('button, a[href]')].filter(b => b.getBoundingClientRect().width > 0 && !(b.getAttribute('aria-label') || b.innerText || '').trim()).map(b => b.tagName + ' ' + Math.round(b.getBoundingClientRect().width) + 'x' + Math.round(b.getBoundingClientRect().height))))
  L.save('r2-anon-b', out); await s.close()
})()
