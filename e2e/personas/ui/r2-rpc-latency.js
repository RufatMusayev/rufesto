// Latency distribution of the feed RPCs (to explain the slow outliers seen in cold-load runs). ROUND=round2 node personas/ui/r2-rpc-latency.js
const L = require('./lib')
;(async () => {
  const s = await L.open({ as: 'Fərid Məlikov' }); const { page } = s
  let sb = null; page.on('request', r => { if (!sb && /\/rest\/v1\//.test(r.url()) && r.headers().apikey) sb = { url: new URL(r.url()).origin, key: r.headers().apikey } })
  await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor()
  const res = await page.evaluate(async ({ sb }) => {
    const k = Object.keys(localStorage).find(x => /auth-token/.test(x)); const tok = JSON.parse(localStorage.getItem(k)).access_token
    const out = {}
    for (const [name, body] of [['home_feed', { p_exclude: [], p_limit: 20 }], ['friends_feed', { p_exclude: [], p_limit: 20 }], ['discover', {}]]) {
      out[name] = []
      for (let i = 0; i < 20; i++) { const t = performance.now(); const r = await fetch(`${sb.url}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: sb.key, Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); await r.text(); out[name].push(Math.round(performance.now() - t)) }
    }
    return out
  }, { sb })
  for (const [k, v] of Object.entries(res)) { const s2 = [...v].sort((a, b) => a - b); console.log(k, 'min', s2[0], 'median', s2[9], 'p90', s2[17], 'max', s2[19], 'over 1.5 s:', v.filter(x => x > 1500).length, '/20') }
  L.save('r2-rpc-latency', res); await s.close()
})()
