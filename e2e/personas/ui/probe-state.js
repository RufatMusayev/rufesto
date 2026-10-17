// probe: a persona's own follows / friends / saved dishes / posts via REST as that user. node personas/ui/probe-state.js "<Name>"
const L = require('./lib')
;(async () => {
  const name = process.argv[2]
  const s = await L.open({ as: name })
  const { page } = s
  let sb = null
  page.on('request', r => { if (!sb && /\/rest\/v1\//.test(r.url()) && r.headers().apikey) sb = { url: new URL(r.url()).origin, key: r.headers().apikey } })
  await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor({ timeout: 20000 })
  const tok = await page.evaluate(() => { const k = Object.keys(localStorage).find(x => /auth-token/.test(x)); return JSON.parse(localStorage.getItem(k)).access_token })
  const id = L.account(name).id
  const get = async p => { const r = await page.request.get(`${sb.url}/rest/v1/${p}`, { headers: { apikey: sb.key, Authorization: 'Bearer ' + tok } }); return r.ok() ? r.json() : { status: r.status(), body: (await r.text()).slice(0, 150) } }
  const f = await get(`user_follows?select=*&user_id=eq.${id}`)
  console.log('follows', JSON.stringify(f).slice(0, 700))
  console.log('saved_dishes', JSON.stringify(await get(`saved_dishes?select=dish_id&user_id=eq.${id}`)).slice(0, 300))
  console.log('friendships', JSON.stringify(await get(`friendships?select=*&or=(requester_id.eq.${id},addressee_id.eq.${id})`)).slice(0, 500))
  console.log('likes', JSON.stringify(await get(`likes?select=restaurant_id&user_id=eq.${id}`)).slice(0, 300))
  console.log('posts', JSON.stringify(await get(`posts?select=id,caption,created_at&user_id=eq.${id}`)).slice(0, 300))
  await s.close()
})()
