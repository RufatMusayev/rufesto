// Round 2, part 5: three friends react to Aysel's new post and review through their own phones (UI), so her inbox has grouped items.
const L = require('./aysel-r2-lib')
const POST = 'Second round at Fincan'
const REVIEW = 'Silky and strong'
async function asFriend(b, name, fn) {
  const F = await L.phone(b, name, { storage: { rufesto_home_tab: 'friends' } })
  try {
    await F.page.goto(L.CONSUMER + '/'); await F.page.waitForSelector('.soc-feed article', { timeout: 30000 }); await F.page.waitForTimeout(1500)
    await fn(F)
  } catch (e) { L.log(name, 'FAILED', String(e.message).split('\n')[0]) }
  L.log(name, 'errors', F.errors.filter(e => !/ERR_ABORTED/.test(e)))
  await F.ctx.close()
}
const card = (F, text) => F.page.locator('.soc-feed article').filter({ hasText: text }).first()
;(async () => {
  const b = await L.launch()
  await asFriend(b, 'Könül Həsənova', async F => {
    const p = card(F, POST); await p.scrollIntoViewIfNeeded()
    await p.getByRole('button', { name: 'Like', exact: true }).click(); await F.page.waitForTimeout(800)
    L.log('Könül liked post')
    const r = card(F, REVIEW); await r.scrollIntoViewIfNeeded()
    L.log('review card buttons:', await r.evaluate(a => [...a.querySelectorAll('button,a')].map(e => (e.getAttribute('aria-label') || e.innerText || '').trim().replace(/\n+/g, ' ') + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height))))
    await L.shot(F.page, '06-review-card-friend')
    const replyBtn = r.locator('button[aria-expanded], button[aria-controls]').first()
    await replyBtn.click(); await F.page.waitForTimeout(1200)
    await L.shot(F.page, '06-review-replies-open')
    L.log('replies panel:', (await r.innerText()).replace(/\n+/g, ' | ').slice(-200))
    const input = r.locator('input[type=text], textarea').first()
    await input.fill('Agree, best flat white in town!'); await F.page.waitForTimeout(300)
    await r.getByRole('button', { name: /send/i }).click(); await F.page.waitForTimeout(1500)
    L.log('Könül replied; panel tail:', (await r.innerText()).replace(/\n+/g, ' | ').slice(-160))
    await L.shot(F.page, '06-review-replied')
    await r.getByRole('button', { name: 'Like', exact: true }).click(); await F.page.waitForTimeout(700)
    // comment on the post page
    await p.scrollIntoViewIfNeeded()
    await p.locator('a[aria-label="Comments"]').click(); await F.page.waitForSelector('.soc-composer-input')
    await F.page.locator('.soc-composer-input').fill('That croissant looks perfect, I am coming tomorrow!')
    await F.page.getByRole('button', { name: 'Send' }).click(); await F.page.waitForTimeout(1500)
    L.log('Könül commented on the post')
  })
  await asFriend(b, 'Səbinə İbrahimova', async F => {
    const p = card(F, POST); await p.scrollIntoViewIfNeeded()
    await p.getByRole('button', { name: 'Like', exact: true }).click(); await F.page.waitForTimeout(700)
    const r = card(F, REVIEW); await r.scrollIntoViewIfNeeded()
    await r.getByRole('button', { name: 'Like', exact: true }).click(); await F.page.waitForTimeout(700)
    L.log('Səbinə liked post + review')
  })
  await asFriend(b, 'Nicat Əliyev', async F => {
    const p = card(F, POST); await p.scrollIntoViewIfNeeded()
    await p.getByRole('button', { name: 'Like', exact: true }).click(); await F.page.waitForTimeout(700)
    L.log('Nicat liked post')
  })
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
