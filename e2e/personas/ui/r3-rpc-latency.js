// Round 3: latency of the feed RPCs, 20 sequential calls from one page (anon + Fərid). ROUND=round3 node personas/ui/r3-rpc-latency.js
const L = require('./lib')
async function run(who) {
  const s = await L.open(who ? { as: who } : {}); const { page } = s
  let sb = null; page.on('request', r => { if (!sb && /\/rest\/v1\//.test(r.url()) && r.headers().apikey) sb = { url: new URL(r.url()).origin, key: r.headers().apikey } })
  await page.goto(L.BASE + '/', { waitUntil: 'load' }); await page.locator('.soc-feed-slot').first().waitFor(); await page.waitForTimeout(1200)
  const res = await page.evaluate(async ({ sb, signed }) => {
    const k = Object.keys(localStorage).find(x => /auth-token/.test(x)); const tok = signed && k ? JSON.parse(localStorage.getItem(k)).access_token : null
    const out = {}
    for (const [name, body] of [['home_feed', { p_exclude: [], p_limit: 20 }], ['friends_feed', { p_exclude: [], p_limit: 20 }], ['search', { p_query: 'pasta' }]]) {
      if (name === 'friends_feed' && !signed) continue
      out[name] = []
      for (let i = 0; i < 20; i++) { const t = performance.now(); const r = await fetch(`${sb.url}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: sb.key, ...(tok ? { Authorization: 'Bearer ' + tok } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); await r.text(); out[name].push(r.ok ? Math.round(performance.now() - t) : -r.status) }
    }
    return out
  }, { sb, signed: !!who })
  for (const [k, v] of Object.entries(res)) { const ok = v.filter(x => x > 0).sort((a, b) => a - b); if (!ok.length) { console.log(who || 'anon', k, 'all failed', v.slice(0, 3)); continue } console.log(who || 'anon', k, 'n', ok.length, 'min', ok[0], 'median', ok[Math.floor((ok.length - 1) / 2)], 'p90', ok[Math.min(ok.length - 1, Math.ceil(ok.length * 0.9) - 1)], 'max', ok[ok.length - 1], 'over 1.5 s:', ok.filter(x => x > 1500).length) }
  L.save('r3-rpc-latency-' + (who ? 'ferid' : 'anon'), res); await s.close()
}
;(async () => { await run(null); await run('Fərid Məlikov') })()
