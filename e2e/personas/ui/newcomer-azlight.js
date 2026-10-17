// Persona A (signed out): theme toggle -> light, language Azerbaijani, every tab + restaurant + dish + sign-in prompt.
// node personas/ui/newcomer-azlight.js   -> A3x-*.png, results/azlight.json
const L = require('./lib')
const out = {}
const note = (k, v) => { out[k] = v; console.log('##', k, typeof v === 'string' ? v : JSON.stringify(v)) }
const lines = t => [...new Set(t.split('\n').map(x => x.trim()).filter(Boolean))]

async function tabs(page, tag) {
  const res = {}
  const names = ['home', 'friends', 'discover']
  note(`${tag}_tab_labels`, await page.getByRole('tab').allInnerTexts())
  for (let i = 0; i < 3; i++) {
    await page.getByRole('tab').nth(i).click(); await page.waitForTimeout(1800)
    await L.shot(page, `A3-${tag}-${names[i]}`)
    res[names[i]] = lines(await page.evaluate(() => document.body.innerText)).slice(0, 80)
  }
  return res
}

;(async () => {
  // 1. theme toggle via the UI, English
  {
    const s = await L.open({ lang: 'en' })
    const { page } = s
    await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor()
    note('theme_before', await page.evaluate(() => document.documentElement.getAttribute('data-theme')))
    await page.getByRole('button', { name: 'Toggle theme' }).click(); await page.waitForTimeout(500)
    note('theme_after_click', await page.evaluate(() => document.documentElement.getAttribute('data-theme')))
    note('theme_stored', await page.evaluate(() => localStorage.getItem('rufesto_theme')))
    await L.shot(page, 'A30-light-home-top')
    await page.evaluate(() => window.scrollTo(0, 2400)); await page.waitForTimeout(600)
    await L.shot(page, 'A31-light-home-scroll')
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.getByRole('tab').nth(1).click(); await page.waitForTimeout(1200); await L.shot(page, 'A32-light-friends')
    await page.getByRole('tab').nth(2).click(); await page.waitForTimeout(2200); await L.shot(page, 'A33-light-discover')
    await page.evaluate(() => window.scrollTo(0, 1500)); await page.waitForTimeout(600); await L.shot(page, 'A34-light-discover-scroll')
    await page.goto(L.BASE + '/restaurant/bella-roma', { waitUntil: 'load' }); await page.waitForTimeout(2500); await L.shot(page, 'A35-light-restaurant')
    await page.goto(L.BASE + '/profile', { waitUntil: 'load' }); await page.waitForTimeout(1500); await L.shot(page, 'A36-light-profile-signedout')
    note('profile_signedout_text', lines(await page.evaluate(() => document.body.innerText)))
    await s.close()
  }
  // 2. Azerbaijani, dark
  for (const theme of ['dark', 'light']) {
    const s = await L.open({ lang: 'az', theme })
    const { page, watch } = s
    try {
      await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor()
      await page.waitForTimeout(1200)
      const r = await tabs(page, `az-${theme}`)
      note(`az_${theme}_home_lines`, r.home); note(`az_${theme}_friends_lines`, r.friends); note(`az_${theme}_discover_lines`, r.discover.slice(0, 60))
      if (theme === 'dark') {
        await page.getByRole('tab').nth(0).click(); await page.waitForTimeout(600)
        await page.locator('.soc-feed-slot').first().locator('button').first().click().catch(() => {})
        await page.waitForTimeout(900); await L.shot(page, 'A37-az-signin-prompt')
        note('az_signin_prompt', lines(await page.evaluate(() => (document.querySelector('[role=dialog]') || document.body).innerText)).slice(0, 14))
        await page.keyboard.press('Escape')
        await page.goto(L.BASE + '/restaurant/bella-roma', { waitUntil: 'load' }); await page.waitForTimeout(2500)
        await L.shot(page, 'A38-az-restaurant')
        note('az_resto_lines', lines(await page.evaluate(() => document.body.innerText)).slice(0, 40))
        await page.goto(L.BASE + '/profile', { waitUntil: 'load' }); await page.waitForTimeout(1500)
        await L.shot(page, 'A39-az-profile-signedout')
        note('az_profile_lines', lines(await page.evaluate(() => document.body.innerText)))
      }
    } catch (e) { note(`az_${theme}_ERROR`, String(e).slice(0, 300)) }
    note(`az_${theme}_console`, watch.console.slice(0, 5))
    await s.close()
  }
  // 3. Azerbaijani browser, nothing stored: is AZ picked automatically?
  {
    const s = await L.open({ locale: 'az-AZ' })
    const { page } = s
    await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor()
    note('az_browser_auto_tabs', await page.getByRole('tab').allInnerTexts())
    await s.close()
  }
  // 4. Russian browser (the data has Russian captions): what language does the UI take?
  {
    const s = await L.open({ locale: 'ru-RU' })
    const { page } = s
    await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor()
    note('ru_browser_tabs', await page.getByRole('tab').allInnerTexts())
    await s.close()
  }
  L.save('azlight', out)
})()
