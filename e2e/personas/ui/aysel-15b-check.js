const L = require('./aysel-lib')
;(async () => {
  const b = await L.launch()
  const A = await L.phone(b, 'Aysel Məmmədova', { storage: { rufesto_home_tab: 'friends' } })
  await A.page.goto(L.CONSUMER + '/'); await A.page.waitForSelector('.soc-feed article')
  await A.page.waitForTimeout(1500)
  const rows = await A.page.evaluate(() => {
    const out = []
    for (const e of document.querySelectorAll('.soc-feed h3.soc-day, .soc-feed article')) {
      if (!e.offsetParent) continue
      if (e.tagName === 'H3') out.push('## ' + e.innerText)
      else out.push([e.querySelector('.soc-post-name')?.innerText, e.querySelector('.soc-post-time')?.innerText, e.innerText.includes('Verified') ? 'VERIFIED' : 'unverified', e.querySelector('.soc-chip-text,.soc-post-where')?.innerText].join(' | '))
    }
    return out.slice(0, 8)
  })
  L.log(rows.join('\n'))
  const a = await L.api('Aysel Məmmədova')
  const r = await a.rpc('friends_feed', { p_exclude: [], p_limit: 5 })
  L.log(JSON.stringify((r.items || []).map(i => [i.kind, i.created_at, i.author && i.author.name, i.is_verified])))
  await b.close()
})().catch(e => { console.error(e); process.exit(1) })
