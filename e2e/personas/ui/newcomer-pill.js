// Does the Friends tab "New posts" pill fire for posts of strangers? Passive: open Friends as Mehriban (0 friends), log realtime INSERT frames
// on posts (author id / restaurant) and when the pill shows. node personas/ui/newcomer-pill.js [seconds]
const L = require('./lib')
const SECS = Number(process.argv[2] || 150)
;(async () => {
  const s = await L.open({ as: 'Mehriban Rzayeva' })
  const { page } = s
  const frames = []
  page.on('websocket', ws => ws.on('framereceived', f => {
    const t = String(f.payload)
    if (/"table":"posts"/.test(t) && /INSERT/.test(t)) {
      const uid = (t.match(/"user_id":("[^"]*"|null)/) || [])[1]; const rid = (t.match(/"restaurant_id":("[^"]*"|null)/) || [])[1]
      frames.push({ at: Date.now(), uid, rid, vis: (t.match(/"visibility":"([^"]*)"/) || [])[1] })
    }
  }))
  await page.addInitScript(() => { try { localStorage.setItem('rufesto_home_tab', 'friends') } catch { } })
  await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.waitForTimeout(3000)
  const me = L.account('Mehriban Rzayeva').id
  const t0 = Date.now(); let pillAt = null
  const pill = page.getByRole('button', { name: 'New posts' })
  console.log('pill at load:', await pill.count())
  while (Date.now() - t0 < SECS * 1000) {
    if (!pillAt && await pill.count()) { pillAt = Date.now(); await L.shot(page, 'M30-friends-new-posts-pill'); break }
    await page.waitForTimeout(1000)
  }
  console.log(JSON.stringify({ waitedS: Math.round((Date.now() - t0) / 1000), pillShown: !!pillAt, pillAfterS: pillAt ? Math.round((pillAt - t0) / 1000) : null, insertsSeen: frames.map(f => ({ afterS: Math.round((f.at - t0) / 1000), byMe: f.uid === `"${me}"`, uid: f.uid ? f.uid.slice(0, 10) : null, restaurant: f.rid ? f.rid.slice(0, 12) : null, vis: f.vis })) }))
  if (pillAt) {
    await pill.first().click(); await page.waitForTimeout(2500)
    console.log('cards after tapping the pill:', await page.locator('.soc-feed:visible .soc-feed-slot').count())
  }
  L.save('pill', { pillShown: !!pillAt, frames })
  await s.close()
})()
