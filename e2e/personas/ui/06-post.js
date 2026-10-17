'use strict'
// Leyla publishes a restaurant post (real photo, caption about tonight's special, tagged dish) from /posts. Run ONCE: it is real content.
// A marker file in the scratchpad stops a second publish.  PUBLISH=1 node 06-post.js
const fs = require('fs')
const path = require('path')
const C = require('./common')

const PHOTO = path.join(C.SCRATCH, 'leyla-photo', 'special.jpg')
const MARK = path.join(C.SCRATCH, 'leyla-post.json')
const CAPTION = "Tonight's special: wood-fired Pizza Margherita, straight out of the oven. Fresh basil, fior di latte, San Marzano tomatoes. Terrace tables are open until 23:30."
const DISH = 'Pizza Margherita'

;(async () => {
  if (fs.existsSync(MARK)) { console.log('already published:', fs.readFileSync(MARK, 'utf8')); return }
  const browser = await C.launch()
  const sink = []
  const L = await C.open(browser, 'leyla', { who: 'Leyla', sink })
  const { page } = L
  sink.stage = 'posts'
  let t0 = Date.now()
  await page.goto(C.RESTO + '/posts')
  await page.getByText('New post', { exact: false }).first().waitFor()
  C.timing('posts page ready', Date.now() - t0)
  // empty form: Publish disabled?
  const publish = page.getByRole('button', { name: /^Publish/ })
  console.log('publish disabled when empty:', await publish.isDisabled())
  t0 = Date.now()
  await page.locator('input[type=file]').setInputFiles(PHOTO)
  await page.getByAltText(/preview|photo/i).first().waitFor({ timeout: 30_000 })
  C.timing('photo picked -> preview (resize in browser)', Date.now() - t0)
  await page.getByLabel('Caption').fill(CAPTION)
  const dishSel = page.getByLabel('Tag a dish')
  await dishSel.selectOption({ label: DISH })
  await C.shot(page, '20-post-composer-filled')
  if (process.env.PUBLISH !== '1') { console.log('dry run, not publishing'); await browser.close(); return }
  const posted = page.waitForResponse(r => /create_restaurant_post/.test(r.url()), { timeout: 30_000 })
  t0 = Date.now()
  await publish.click()
  const res = await posted
  C.timing('publish click -> create_restaurant_post answered', Date.now() - t0, 'status ' + res.status())
  await page.getByText(CAPTION.slice(0, 40), { exact: false }).first().waitFor({ timeout: 15_000 })
  C.timing('publish click -> post visible in YOUR POSTS list', Date.now() - t0)
  fs.writeFileSync(MARK, JSON.stringify({ at: new Date().toISOString(), caption: CAPTION, dish: DISH, status: res.status() }))
  await page.waitForTimeout(800)
  await C.shot(page, '21-post-published')
  console.log('banner text:', (await C.text(page, '.v2-banner')).slice(0, 100))
  console.log('problems:', JSON.stringify(sink.map(s => `${s.stage} ${s.kind} ${s.text}`), null, 1))
  await browser.close()
})().catch(e => { console.error('FAIL', e.message); process.exit(1) })
